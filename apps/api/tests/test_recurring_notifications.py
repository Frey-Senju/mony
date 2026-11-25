"""
Tests for Recurring Rules CRUD + monthly idempotent generation,
Smart Notifications (budget alerts, upcoming bills, goals), and password change.
"""

from datetime import date


def _register_and_headers(client, email="recur@example.com"):
    r = client.post(
        "/auth/register",
        json={"email": email, "password": "SecurePassword123!", "full_name": "Carlos Silva"},
    )
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_recurring_crud_and_idempotent_monthly_generation(client):
    headers = _register_and_headers(client, "recurring_crud@example.com")
    account = client.get("/accounts", headers=headers).json()[0]

    # Create fixed expense + fixed income
    r1 = client.post(
        "/recurring",
        headers=headers,
        json={
            "account_id": account["id"],
            "type": "expense",
            "amount": 1800.00,
            "description": "Aluguel Apartamento",
            "category_name": "Moradia",
            "payment_method": "boleto",
            "frequency": "monthly",
            "day_of_month": 10,
        },
    )
    assert r1.status_code == 201, r1.text
    rule_id = r1.json()["id"]

    r2 = client.post(
        "/recurring",
        headers=headers,
        json={
            "account_id": account["id"],
            "type": "income",
            "amount": 6500.00,
            "description": "Salário Mensal",
            "category_name": "Trabalho",
            "payment_method": "bank_transfer",
            "frequency": "monthly",
            "day_of_month": 5,
        },
    )
    assert r2.status_code == 201

    # List summary
    listing = client.get("/recurring?month=2026-11", headers=headers).json()
    assert len(listing["items"]) == 2
    assert listing["summary"]["monthly_fixed_income"] == 6500.0
    assert listing["summary"]["monthly_fixed_expenses"] == 1800.0
    assert listing["summary"]["monthly_fixed_net"] == 4700.0
    assert listing["summary"]["pending_this_month_count"] == 2

    # Generate for 2026-11 -> creates 2 transactions & updates balance (+6500 - 1800 = +4700)
    gen1 = client.post("/recurring/generate", headers=headers, json={"month": "2026-11"})
    assert gen1.status_code == 200
    assert gen1.json()["generated"] == 2

    # Re-running generate for the same month is idempotent -> 0 generated, 2 skipped
    gen2 = client.post("/recurring/generate", headers=headers, json={"month": "2026-11"})
    assert gen2.status_code == 200
    assert gen2.json()["generated"] == 0
    assert gen2.json()["skipped"] == 2

    # Verify account balance updated accurately
    acct_after = client.get("/accounts", headers=headers).json()[0]
    assert round(float(acct_after["balance"]), 2) == 4700.0

    # Update & delete rule
    upd = client.put(f"/recurring/{rule_id}", headers=headers, json={"amount": 1950.00, "is_active": False})
    assert upd.status_code == 200
    assert upd.json()["amount"] == 1950.0
    assert upd.json()["is_active"] is False

    dele = client.delete(f"/recurring/{rule_id}", headers=headers)
    assert dele.status_code == 204


def test_smart_notifications_budget_and_upcoming_bill(client):
    headers = _register_and_headers(client, "notifs@example.com")
    account = client.get("/accounts", headers=headers).json()[0]
    today = date.today()

    # 1. Create a budget of R$ 200 for Alimentação and spend R$ 250 -> triggers LIMIT_EXCEEDED
    b = client.post(
        "/budgets",
        headers=headers,
        json={"category": "Alimentação", "limit_amount": 200.0},
    )
    assert b.status_code == 201

    tx = client.post(
        "/transactions",
        headers=headers,
        json={
            "account_id": account["id"],
            "type": "expense",
            "amount": 250.0,
            "description": "Supermercado Mensal",
            "category_name": "Alimentação",
            "transaction_date": today.isoformat(),
        },
    )
    assert tx.status_code == 201

    # 2. Create an upcoming recurring bill due today -> triggers reminder notification
    rec = client.post(
        "/recurring",
        headers=headers,
        json={
            "account_id": account["id"],
            "type": "expense",
            "amount": 120.0,
            "description": "Internet Fibra",
            "category_name": "Moradia",
            "day_of_month": today.day,
        },
    )
    assert rec.status_code == 201

    # Fetch notifications -> both alerts synthesized automatically
    res = client.get("/notifications", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["unread_count"] >= 2
    titles = [n["title"] for n in data["items"]]
    assert any("Budget ultrapassado" in t for t in titles)
    assert any("Internet Fibra" in t for t in titles)

    # Mark single notification read
    first_id = data["items"][0]["id"]
    m1 = client.patch(f"/notifications/{first_id}/read", headers=headers)
    assert m1.status_code == 200
    assert m1.json()["is_read"] is True

    # Mark all read
    mall = client.post("/notifications/mark-all-read", headers=headers)
    assert mall.status_code == 200
    after = client.get("/notifications", headers=headers).json()
    assert after["unread_count"] == 0


def test_change_password_endpoint(client):
    headers = _register_and_headers(client, "chgpw@example.com")

    # Wrong current password rejected
    bad = client.post(
        "/auth/change-password",
        headers=headers,
        json={"current_password": "WrongPassword!", "new_password": "NewSecurePassword456!"},
    )
    assert bad.status_code == 400

    # Valid current password succeeds
    ok = client.post(
        "/auth/change-password",
        headers=headers,
        json={"current_password": "SecurePassword123!", "new_password": "NewSecurePassword456!"},
    )
    assert ok.status_code == 200

    # Login with new password works
    login = client.post(
        "/auth/login",
        json={"email": "chgpw@example.com", "password": "NewSecurePassword456!"},
    )
    assert login.status_code == 200
