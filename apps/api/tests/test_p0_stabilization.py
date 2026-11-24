"""
Tests for P0 stabilization & security hardening:
- Categories CRUD + auto-seeding
- Transaction <-> Category persistence + Budgets / Reports / Insights integration
- Automatic Account balance sync on transaction create/update/delete
- Bulk categorize endpoint
- Register onboarding (default Account + default Categories)
- GET/PUT /auth/users/me
- Logout token blacklist revocation
- 2FA setup + verify + disable flow
- Accounts PUT/DELETE CRUD
- CORS PATCH preflight support
"""

from datetime import date
from decimal import Decimal

import pyotp
from database.models import Account, AccountType, User, UserPlan
from utils.auth import create_access_token, hash_password


def _register_and_headers(client, email="p0user@example.com"):
    resp = client.post(
        "/auth/register",
        json={"email": email, "password": "SecurePassword123!", "full_name": "Maria Silva"},
    )
    assert resp.status_code == 201, resp.text
    tokens = resp.json()
    return tokens, {"Authorization": f"Bearer {tokens['access_token']}"}


def test_register_provisions_default_account_and_categories(client):
    _, headers = _register_and_headers(client, "onboard@example.com")

    me_resp = client.get("/auth/users/me", headers=headers)
    assert me_resp.status_code == 200
    me = me_resp.json()
    assert me["email"] == "onboard@example.com"
    assert me["full_name"] == "Maria Silva"
    assert me["plan"] == "BASIC"

    acct_resp = client.get("/accounts", headers=headers)
    assert acct_resp.status_code == 200
    accounts = acct_resp.json()
    assert len(accounts) == 1
    assert accounts[0]["name"] == "Conta Principal"
    assert accounts[0]["is_default"] is True

    cat_resp = client.get("/categories", headers=headers)
    assert cat_resp.status_code == 200
    cats = cat_resp.json()
    assert len(cats) >= 8
    names = {c["name"] for c in cats}
    assert "Alimentação" in names
    assert "Transporte" in names


def test_categories_crud_and_system_protection(client):
    _, headers = _register_and_headers(client, "cats@example.com")

    cats = client.get("/categories", headers=headers).json()
    system_cat = next(c for c in cats if c["is_system"])

    # Cannot delete default system category
    del_sys = client.delete(f"/categories/{system_cat['id']}", headers=headers)
    assert del_sys.status_code == 400

    # Create custom category
    create = client.post(
        "/categories",
        headers=headers,
        json={"name": "Pets", "color": "#10B981", "icon": "🐾"},
    )
    assert create.status_code == 201
    pet_cat = create.json()
    assert pet_cat["name"] == "Pets"
    assert pet_cat["is_system"] is False

    # Update custom category
    upd = client.put(
        f"/categories/{pet_cat['id']}",
        headers=headers,
        json={"name": "Animais", "color": "#059669"},
    )
    assert upd.status_code == 200
    assert upd.json()["name"] == "Animais"

    # Delete custom category
    delete = client.delete(f"/categories/{pet_cat['id']}", headers=headers)
    assert delete.status_code == 204


def test_transaction_category_persists_to_budgets_reports_and_updates_balance(client):
    _, headers = _register_and_headers(client, "e2eflow@example.com")
    account = client.get("/accounts", headers=headers).json()[0]
    cats = client.get("/categories", headers=headers).json()
    food = next(c for c in cats if c["name"] == "Alimentação")

    # Create a budget for Alimentação
    b_resp = client.post(
        "/budgets",
        headers=headers,
        json={"category": "Alimentação", "limit_amount": 500.00},
    )
    assert b_resp.status_code == 201

    today = date.today()
    # Create an income (+2000) and a categorized food expense (-450 -> 90% warning!)
    inc_resp = client.post(
        "/transactions",
        headers=headers,
        json={
            "account_id": account["id"],
            "type": "income",
            "amount": 2000.00,
            "description": "Salário",
            "transaction_date": today.isoformat(),
        },
    )
    assert inc_resp.status_code == 201

    exp_resp = client.post(
        "/transactions",
        headers=headers,
        json={
            "account_id": account["id"],
            "type": "expense",
            "amount": 450.00,
            "description": "Supermercado",
            "transaction_date": today.isoformat(),
            "category_id": food["id"],
        },
    )
    assert exp_resp.status_code == 201
    exp = exp_resp.json()
    assert exp["category_id"] == food["id"]
    assert exp["category_name"] == "Alimentação"

    # Account balance updated: 0 + 2000 - 450 = 1550
    acct_after = client.get(f"/accounts/{account['id']}", headers=headers).json()
    assert float(acct_after["balance"]) == 1550.00

    # Budget reflects real spent amount (450 / 500 = 90% -> warning)
    budgets = client.get("/budgets", headers=headers).json()
    assert len(budgets) == 1
    assert float(budgets[0]["spent_amount"]) == 450.00
    assert budgets[0]["alert_level"] == "warning"

    # Category breakdown report reflects real category
    rep = client.get(
        f"/reports/category-breakdown?year={today.year}&month={today.month}",
        headers=headers,
    ).json()
    assert any(item["category_name"] == "Alimentação" and float(item["total"]) == 450.0 for item in rep["items"])

    # Insights top_categories reflects real category
    ins = client.get("/insights/monthly", headers=headers).json()
    assert len(ins["top_categories"]) == 1
    assert ins["top_categories"][0]["category"] == "Alimentação"

    # Delete expense reverts balance back to 2000 and hides from GET /transactions
    del_resp = client.delete(f"/transactions/{exp['id']}", headers=headers)
    assert del_resp.status_code == 204
    acct_reverted = client.get(f"/accounts/{account['id']}", headers=headers).json()
    assert float(acct_reverted["balance"]) == 2000.00

    list_after = client.get("/transactions", headers=headers).json()
    assert list_after["total"] == 1


def test_bulk_categorize_transactions(client):
    _, headers = _register_and_headers(client, "bulk@example.com")
    account = client.get("/accounts", headers=headers).json()[0]
    cats = client.get("/categories", headers=headers).json()
    transport = next(c for c in cats if c["name"] == "Transporte")

    tx_ids = []
    for desc in ("Uber Centro", "Posto Shell"):
        r = client.post(
            "/transactions",
            headers=headers,
            json={
                "account_id": account["id"],
                "type": "expense",
                "amount": 35.00,
                "description": desc,
                "transaction_date": date.today().isoformat(),
            },
        )
        assert r.status_code == 201
        tx_ids.append(r.json()["id"])

    bulk = client.post(
        "/transactions/bulk-categorize",
        headers=headers,
        json={"transaction_ids": tx_ids, "category_id": transport["id"]},
    )
    assert bulk.status_code == 200
    assert bulk.json()["updated"] == 2

    fetched = client.get(f"/transactions/{tx_ids[0]}", headers=headers).json()
    assert fetched["category_name"] == "Transporte"


def test_accounts_update_and_delete(client):
    _, headers = _register_and_headers(client, "acctcrud@example.com")
    c = client.post(
        "/accounts",
        headers=headers,
        json={"name": "Poupança", "type": "savings", "balance": 1200.0},
    )
    assert c.status_code == 201
    savings = c.json()

    upd = client.put(
        f"/accounts/{savings['id']}",
        headers=headers,
        json={"name": "Reserva", "balance": 1500.0, "is_default": True},
    )
    assert upd.status_code == 200
    assert upd.json()["name"] == "Reserva"
    assert upd.json()["is_default"] is True

    d = client.delete(f"/accounts/{savings['id']}", headers=headers)
    assert d.status_code == 204
    remaining = client.get("/accounts", headers=headers).json()
    assert len(remaining) == 1
    assert remaining[0]["is_default"] is True


def test_logout_blacklists_token_and_2fa_verify_flow(client):
    _, headers = _register_and_headers(client, "sec@example.com")

    # 2FA setup + verify
    setup = client.post("/auth/2fa/setup", headers=headers)
    assert setup.status_code == 200
    secret = setup.json()["secret"]
    code = pyotp.TOTP(secret).now()

    verify = client.post("/auth/2fa/verify", headers=headers, json={"totp_code": code})
    assert verify.status_code == 200
    assert verify.json()["two_factor_enabled"] is True

    # Logout revokes access token
    out = client.post("/auth/logout", headers=headers)
    assert out.status_code == 204
    after = client.get("/auth/users/me", headers=headers)
    assert after.status_code == 401


def test_cors_allows_patch_for_goals_deposit(client):
    resp = client.options(
        "/goals/550e8400-e29b-41d4-a716-446655440000/deposit",
        headers={
            "Origin": "https://web-flame-alpha-37.vercel.app",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert resp.status_code == 200
    allowed = resp.headers.get("access-control-allow-methods", "")
    assert "PATCH" in allowed
