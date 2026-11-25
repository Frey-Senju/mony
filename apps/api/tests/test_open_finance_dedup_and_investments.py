"""
Tests for:
  1. Pluggy Real Open Finance + 3-Layer Reconnect-Safe Deduplication Engine
     (proves disconnecting & re-linking a bank with brand-new itemId/transactionIds
      reuses the existing account and creates ZERO duplicate transactions, AND
      reconciles matching manual transactions instead of duplicating!)
  2. Investidor10-style Investments Portfolio API:
     (weighted average price on buys, partial sell preserving average price,
      dividends & YoC, B3 CSV import deduplication, and Pluggy investments sync)
"""

from datetime import date, timedelta


def _register_headers(client, email: str):
    r = client.post(
        "/auth/register",
        json={"email": email, "password": "SecurePassword123!", "full_name": "Invest User"},
    )
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_pluggy_reconnect_3layer_deduplication_and_manual_reconcile(client):
    headers = _register_headers(client, "pluggy_dedup@example.com")

    # 1. User already registered a manual transaction matching one of the bank's upcoming PIX expenses
    acct = client.get("/accounts", headers=headers).json()[0]
    d1 = (date.today() - timedelta(days=2)).isoformat()
    man = client.post(
        "/transactions",
        headers=headers,
        json={
            "account_id": acct["id"],
            "type": "expense",
            "amount": 245.60,
            "description": "Supermercado Central",
            "merchant_name": "Supermercado Central",
            "transaction_date": d1,
            "payment_method": "pix",
        },
    )
    assert man.status_code == 201

    # 2. First Pluggy Open Finance connection (item #1)
    first = client.post(
        "/open-finance/pluggy/items",
        headers=headers,
        json={"item_id": "sandbox-nubank-item-1", "institution_name": "Nubank"},
    )
    assert first.status_code == 201, first.text
    f_data = first.json()
    assert f_data["accounts_linked"] == 2
    assert f_data["accounts_reused"] == 0
    # 4 sandbox txs total: 1 matched & reconciled with manual Supermercado Central -> 3 inserted + 1 reconciled!
    assert f_data["transactions_reconciled"] == 1
    assert f_data["transactions_inserted"] == 3
    assert f_data["transactions_skipped_dedup"] == 0

    # 3. Simulate disconnecting & RE-REGISTERING Open Finance with a BRAND NEW Pluggy itemId
    #    (which creates brand new accountIds and brand new transactionIds!)
    reconnect = client.post(
        "/open-finance/pluggy/items",
        headers=headers,
        json={"item_id": "sandbox-nubank-item-999-reconnected", "institution_name": "Nubank"},
    )
    assert reconnect.status_code == 201, reconnect.text
    r_data = reconnect.json()
    # MUST reuse the 2 existing accounts & create ZERO duplicate transactions!
    assert r_data["accounts_linked"] == 0
    assert r_data["accounts_reused"] == 2
    assert r_data["transactions_inserted"] == 0
    assert r_data["transactions_skipped_dedup"] == 4


def test_investments_weighted_avg_price_dividends_and_b3_import_dedup(client):
    headers = _register_headers(client, "investidor10@example.com")

    # Buy 100 PETR4 @ R$ 30.00 + R$ 10 fees -> avg = 30.10
    t1 = client.post(
        "/investments/trades",
        headers=headers,
        json={
            "ticker": "PETR4",
            "name": "Petrobras PN",
            "operation": "buy",
            "trade_date": "2026-01-10",
            "quantity": 100,
            "unit_price": 30.00,
            "fees": 10.00,
            "broker": "XP",
        },
    )
    assert t1.status_code == 201, t1.text
    assert round(t1.json()["new_average_price"], 2) == 30.10

    # Buy 100 PETR4 @ R$ 40.00 + R$ 0 fees -> total cost = 3010 + 4000 = 7010 / 200 = 35.05
    t2 = client.post(
        "/investments/trades",
        headers=headers,
        json={
            "ticker": "PETR4",
            "operation": "buy",
            "trade_date": "2026-03-10",
            "quantity": 100,
            "unit_price": 40.00,
        },
    )
    assert t2.status_code == 201
    assert round(t2.json()["new_position_quantity"], 2) == 200.0
    assert round(t2.json()["new_average_price"], 2) == 35.05

    # Sell 50 PETR4 @ R$ 45.00 -> qty = 150, avg price stays 35.05!
    t3 = client.post(
        "/investments/trades",
        headers=headers,
        json={
            "ticker": "PETR4",
            "operation": "sell",
            "trade_date": "2026-06-10",
            "quantity": 50,
            "unit_price": 45.00,
        },
    )
    assert t3.status_code == 201
    assert round(t3.json()["new_position_quantity"], 2) == 150.0
    assert round(t3.json()["new_average_price"], 2) == 35.05

    # Register Dividend -> YoC calculated cleanly
    div = client.post(
        "/investments/dividends",
        headers=headers,
        json={
            "ticker": "PETR4",
            "dividend_type": "dividend",
            "payment_date": date.today().isoformat(),
            "total_amount": 525.75,
        },
    )
    assert div.status_code == 201
    assert div.json()["duplicate_skipped"] is False

    # Re-importing B3 CSV twice deduplicates cleanly
    b3_csv = (
        "Data;Movimentacao;Produto;Instituicao;Quantidade;Preco unitario;Valor da Operacao\n"
        "15/02/2026;Compra;MXRF11 - MAXI RENDA FII;XP;100;10,00;1000,00\n"
        f"{date.today().strftime('%d/%m/%Y')};Rendimento;MXRF11 - MAXI RENDA FII;XP;100;0,10;10,00\n"
    ).encode("utf-8")

    imp1 = client.post(
        "/investments/import-b3",
        headers=headers,
        files={"file": ("movimentacao_b3.csv", b3_csv, "text/csv")},
    )
    assert imp1.status_code == 201, imp1.text
    assert imp1.json()["trades_imported"] == 1
    assert imp1.json()["dividends_imported"] == 1
    assert imp1.json()["duplicates_skipped"] == 0

    imp2 = client.post(
        "/investments/import-b3",
        headers=headers,
        files={"file": ("movimentacao_b3.csv", b3_csv, "text/csv")},
    )
    assert imp2.status_code == 201
    assert imp2.json()["trades_imported"] == 0
    assert imp2.json()["dividends_imported"] == 0
    assert imp2.json()["duplicates_skipped"] == 2

    # Check portfolio consolidation
    port = client.get("/investments/portfolio", headers=headers)
    assert port.status_code == 200, port.text
    pdata = port.json()
    assert pdata["summary"]["assets_count"] == 2
    assert pdata["summary"]["dividends_12m"] == 535.75
    tickers = {a["ticker"] for a in pdata["assets"]}
    assert tickers == {"PETR4", "MXRF11"}

    # Sync Pluggy sandbox investments
    sp = client.post("/investments/sync-pluggy", headers=headers, json={})
    assert sp.status_code == 200
    assert sp.json()["positions_synced"] >= 3
