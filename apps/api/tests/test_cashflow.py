"""Tests for GET /reports/cashflow annual cashflow + category matrix endpoint."""


def test_annual_cashflow_matrix_and_stats(client):
    reg = client.post(
        "/auth/register",
        json={"email": "cashflow@example.com", "password": "SecurePassword123!", "full_name": "CF User"},
    )
    assert reg.status_code == 201
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    account = client.get("/accounts", headers=headers).json()[0]

    # Seed Jan & Feb income + expenses across categories (including statement_month invoice competency)
    txs = [
        {"type": "income", "amount": 5000.0, "description": "Salário Jan", "transaction_date": "2026-01-05", "category_name": "Trabalho"},
        {"type": "expense", "amount": 1500.0, "description": "Aluguel Jan", "transaction_date": "2026-01-10", "category_name": "Moradia"},
        {"type": "expense", "amount": 500.0, "description": "Mercado Jan", "transaction_date": "2026-01-15", "category_name": "Alimentação"},
        {"type": "income", "amount": 7000.0, "description": "Salário Fev", "transaction_date": "2026-02-05", "category_name": "Trabalho"},
        {"type": "expense", "amount": 1500.0, "description": "Aluguel Fev", "transaction_date": "2026-02-10", "category_name": "Moradia"},
        {"type": "expense", "amount": 900.0, "description": "Fatura Fev (Parcela)", "transaction_date": "2026-02-10", "statement_month": "2026-02", "category_name": "Lazer"},
    ]
    for item in txs:
        r = client.post("/transactions", headers=headers, json={"account_id": account["id"], **item})
        assert r.status_code == 201, r.text

    resp = client.get("/reports/cashflow?year=2026", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["year"] == 2026
    assert len(data["months"]) == 12
    assert data["months"][0]["income"] == 5000.0
    assert data["months"][0]["expenses"] == 2000.0
    assert data["months"][0]["net"] == 3000.0
    assert data["months"][0]["by_category"]["Moradia"] == 1500.0
    assert data["months"][1]["income"] == 7000.0
    assert data["months"][1]["expenses"] == 2400.0
    assert data["months"][1]["by_category"]["Lazer"] == 900.0

    stats = data["stats"]
    assert stats["total_income"] == 12000.0
    assert stats["total_expenses"] == 4400.0
    assert stats["total_net"] == 7600.0
    assert stats["avg_income"] == 6000.0
    assert stats["median_income"] == 6000.0
    assert stats["category_total"]["Moradia"] == 3000.0
    assert data["current_reserve_balance"] == 7600.0
