"""
Comprehensive backend tests for EPIC-006 (Stories 6.3, 6.4, 6.5, 6.6, 6.7, 6.8):
- Calendar 90-day cash projection & negative-balance alert
- Subscriptions radar & silent price-hike detection
- Financial Health Score (0-100) & Mony Review
- AI Copilot plan + execute (1-click confirmed actions)
- Real-data "What-If" simulator
- Debts CRUD + Avalanche vs Snowball strategy + SAC vs Price amortization
- Consolidated Net Worth timeline (Assets - Liabilities)
- Multi-sheet Excel (.xlsx) workbook export + Transaction Split & Tags
"""

import io
import zipfile
from datetime import date, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient


def _register_and_login(client: TestClient) -> str:
    email = f"epic006-{uuid4().hex[:8]}@example.com"
    pw = "Epic006Pass!2026"
    r = client.post("/auth/register", json={"email": email, "password": pw, "full_name": "Cristian Epic006"})
    assert r.status_code in (200, 201), r.text
    login = client.post("/auth/login", json={"email": email, "password": pw})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def test_epic006_calendar_radar_health_copilot_debts_networth_xlsx_split(client: TestClient):
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create account
    acct_r = client.post(
        "/accounts",
        json={"name": "Conta Corrente Epic006", "type": "checking", "balance": 2000.0, "is_default": True},
        headers=headers,
    )
    assert acct_r.status_code in (200, 201), acct_r.text
    acct_id = acct_r.json()["id"]

    # 2. Seed recurring expense high enough to trigger negative projection alert within 90d
    rec_r = client.post(
        "/recurring",
        json={
            "account_id": acct_id,
            "type": "expense",
            "description": "Aluguel Apartamento",
            "amount": 3500.0,
            "category_name": "Moradia",
            "payment_method": "boleto",
            "frequency": "monthly",
            "day_of_month": 15,
        },
        headers=headers,
    )
    assert rec_r.status_code in (200, 201), rec_r.text

    # 3. Seed two months of streaming subscription with a +20% silent price hike
    today = date.today()
    prev_month = today - timedelta(days=35)
    t1 = client.post(
        "/transactions",
        json={
            "account_id": acct_id,
            "type": "expense",
            "amount": 50.0,
            "description": "Netflix Assinatura",
            "merchant_name": "Netflix",
            "transaction_date": prev_month.isoformat(),
            "payment_method": "credit_card",
        },
        headers=headers,
    )
    assert t1.status_code == 201, t1.text
    t2 = client.post(
        "/transactions",
        json={
            "account_id": acct_id,
            "type": "expense",
            "amount": 65.0,
            "description": "Netflix Assinatura",
            "merchant_name": "Netflix",
            "transaction_date": today.isoformat(),
            "payment_method": "credit_card",
        },
        headers=headers,
    )
    assert t2.status_code == 201, t2.text

    # 4. Story 6.3: Calendar Projection 90d
    cal_r = client.get("/calendar/projection?days=90", headers=headers)
    assert cal_r.status_code == 200, cal_r.text
    cal = cal_r.json()
    assert len(cal["daily_curve"]) == 91
    assert cal["first_negative_date"] is not None
    assert len(cal["alerts"]) >= 1

    # 5. Story 6.3: Subscriptions Radar detects price hike
    rad_r = client.get("/insights/subscriptions-radar", headers=headers)
    assert rad_r.status_code == 200, rad_r.text
    rad = rad_r.json()
    assert rad["price_hikes_count"] >= 1
    assert any("netflix" in s["merchant"].lower() and s["has_price_hike"] for s in rad["subscriptions"])

    # 6. Story 6.4: AI Copilot Plan + Execute (budget & goal)
    plan_r = client.post(
        "/ai/copilot/plan",
        json={"prompt": "Criar budget de R$ 950 para Alimentação"},
        headers=headers,
    )
    assert plan_r.status_code == 200, plan_r.text
    plan = plan_r.json()
    assert plan["action_type"] == "create_budget"
    assert plan["requires_confirmation"] is True
    assert plan["payload"]["limit_amount"] == 950.0

    exec_r = client.post(
        "/ai/copilot/execute",
        json={"action_type": plan["action_type"], "payload": plan["payload"]},
        headers=headers,
    )
    assert exec_r.status_code == 200, exec_r.text
    assert exec_r.json()["ok"] is True

    # 7. Story 6.5: What-If Simulator & Health Score
    wi_r = client.post(
        "/ai/what-if",
        json={"scenario_type": "finance_purchase", "amount": 60000, "months": 48, "annual_rate_pct": 14.0},
        headers=headers,
    )
    assert wi_r.status_code == 200, wi_r.text
    wi = wi_r.json()
    assert wi["verdict"] in ("viable", "caution", "risky")
    assert len(wi["timeline"]) >= 5

    hs_r = client.get("/insights/health-score", headers=headers)
    assert hs_r.status_code == 200, hs_r.text
    hs = hs_r.json()
    assert 0 <= hs["score"] <= 100
    assert len(hs["pillars"]) == 5

    # 8. Story 6.6: Debts CRUD + Avalanche vs Snowball + SAC vs Price
    d1 = client.post(
        "/debts",
        json={
            "name": "Financiamento Carro",
            "debt_type": "vehicle",
            "creditor": "Banco X",
            "original_amount": 50000,
            "current_balance": 20000,
            "interest_rate_monthly": 1.6,
            "monthly_payment": 950,
            "due_day": 12,
        },
        headers=headers,
    )
    assert d1.status_code == 201, d1.text
    d2 = client.post(
        "/debts",
        json={
            "name": "Empréstimo Pessoal",
            "debt_type": "personal_loan",
            "original_amount": 8000,
            "current_balance": 5000,
            "interest_rate_monthly": 3.5,
            "monthly_payment": 400,
            "due_day": 20,
        },
        headers=headers,
    )
    assert d2.status_code == 201, d2.text

    strat_r = client.post("/debts/strategy", json={"extra_monthly_payment": 500}, headers=headers)
    assert strat_r.status_code == 200, strat_r.text
    strat = strat_r.json()
    assert strat["avalanche"]["total_interest"] <= strat["snowball"]["total_interest"]

    amort_r = client.post(
        "/debts/amortization",
        json={"balance": 200000, "annual_rate_pct": 10.5, "months": 240, "extra_amortization": 20000},
        headers=headers,
    )
    assert amort_r.status_code == 200, amort_r.text
    amort = amort_r.json()
    assert amort["sac"]["interest_saved"] > 0
    assert amort["sac"]["months_saved"] > 0

    # 9. Story 6.7: Net Worth Timeline
    nw_r = client.get("/reports/net-worth", headers=headers)
    assert nw_r.status_code == 200, nw_r.text
    nw = nw_r.json()
    assert nw["liabilities_total"] >= 25000.0
    assert len(nw["history_6m"]) == 6

    # 10. Story 6.8: Transaction Split + Tags + Excel .xlsx Multi-Sheet Export
    big_tx = client.post(
        "/transactions",
        json={
            "account_id": acct_id,
            "type": "expense",
            "amount": 300.0,
            "description": "Compra Supermercado + Farmácia",
            "transaction_date": today.isoformat(),
            "payment_method": "debit_card",
        },
        headers=headers,
    )
    assert big_tx.status_code == 201
    big_id = big_tx.json()["id"]

    split_r = client.post(
        f"/transactions/{big_id}/split",
        json={
            "parts": [
                {"description": "Supermercado", "amount": 220.0, "category_name": "Alimentação", "tags": ["#casa"]},
                {"description": "Farmácia", "amount": 80.0, "category_name": "Saúde", "tags": ["#reembolsavel"]},
            ]
        },
        headers=headers,
    )
    assert split_r.status_code == 201, split_r.text
    assert split_r.json()["split_count"] == 2

    xlsx_r = client.get(f"/reports/export-xlsx?year={today.year}", headers=headers)
    assert xlsx_r.status_code == 200, xlsx_r.text
    assert "spreadsheetml" in xlsx_r.headers["content-type"]
    zf = zipfile.ZipFile(io.BytesIO(xlsx_r.content))
    names = zf.namelist()
    assert "xl/workbook.xml" in names
    assert "xl/worksheets/sheet6.xml" in names
