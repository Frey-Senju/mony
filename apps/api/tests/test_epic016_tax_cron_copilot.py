"""Tests for Tracks 3, 4 & 5 (EPIC-016): Diagnostics, Cron Watchlist Scan, IRPF/DARF B3 & Copilot Agent 2.0."""

from fastapi.testclient import TestClient


def _auth(client: TestClient, email: str = "tax_epic16@example.com") -> dict[str, str]:
    r = client.post(
        "/auth/register",
        json={"email": email, "password": "TaxPass123!", "full_name": "Investidor B3"},
    )
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_security_headers_and_health_diagnostics(client: TestClient):
    res = client.get("/health/diagnostics")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"
    assert "channels" in body
    assert "X-Request-ID" in res.headers
    assert "Strict-Transport-Security" in res.headers
    assert res.headers.get("X-Content-Type-Options") == "nosniff"


def test_darf_simulator_rules_and_irpf_summary(client: TestClient):
    headers = _auth(client, "irpf_user@example.com")

    # 1. Swing Trade Stock sales <= R$ 20k -> EXEMPT
    r1 = client.post(
        "/tax/darf-simulate",
        headers=headers,
        json={"asset_class": "stock", "trade_mode": "swing", "total_sales": 18000, "total_cost": 15000, "fees": 20},
    )
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["is_exempt"] is True
    assert d1["darf_amount"] == 0.0
    assert d1["gross_profit"] == 2980.0

    # 2. Swing Trade Stock sales > R$ 20k with prior loss carryforward -> 15% on net base
    r2 = client.post(
        "/tax/darf-simulate",
        headers=headers,
        json={
            "asset_class": "stock",
            "trade_mode": "swing",
            "total_sales": 30000,
            "total_cost": 22000,
            "fees": 0,
            "prior_accumulated_loss": 2000,
            "irrf_withheld": 1.5,
        },
    )
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["is_exempt"] is False
    assert d2["taxable_base"] == 6000.0
    assert d2["gross_tax"] == 900.0
    assert d2["darf_amount"] == 898.5
    assert d2["darf_code"] == "6015"
    assert d2["must_pay_darf"] is True

    # 3. FIIs -> 20% even below 20k
    r3 = client.post(
        "/tax/darf-simulate",
        headers=headers,
        json={"asset_class": "fii", "trade_mode": "swing", "total_sales": 10000, "total_cost": 9000},
    )
    assert r3.status_code == 200
    assert r3.json()["tax_rate_pct"] == 20.0
    assert r3.json()["darf_amount"] == 200.0

    # 4. Full IRPF summary endpoint
    irpf = client.get("/tax/irpf-summary?year=2026", headers=headers)
    assert irpf.status_code == 200
    data = irpf.json()
    assert "bens_e_direitos" in data
    assert "rendimentos_isentos" in data
    assert "tributacao_exclusiva" in data
    assert "monthly_darf" in data


def test_copilot_agent_watchlist_and_cron_user_scan(client: TestClient):
    headers = _auth(client, "copilot_cron@example.com")

    # 1. Plan & execute adding BBAS3 to Watchlist with high target price (triggers hit immediately)
    plan = client.post(
        "/ai/copilot/plan",
        headers=headers,
        json={"prompt": "Monitorar BBAS3 na watchlist com preço-teto de R$ 99,00"},
    )
    assert plan.status_code == 200
    pdata = plan.json()
    assert pdata["action_type"] == "add_valuer_watchlist"
    assert pdata["payload"]["ticker"] == "BBAS3"

    exec_res = client.post(
        "/ai/copilot/execute",
        headers=headers,
        json={"action_type": pdata["action_type"], "payload": pdata["payload"]},
    )
    assert exec_res.status_code == 200
    assert exec_res.json()["ok"] is True

    # 2. Run user manual Cron Watchlist + Smart Alerts scan
    scan = client.post("/cron/run-my-scan", headers=headers)
    assert scan.status_code == 200
    sdata = scan.json()
    assert sdata["ok"] is True
    assert sdata["watchlist"]["checked"] == 1
    assert len(sdata["watchlist"]["hits"]) == 1
    assert sdata["watchlist"]["hits"][0]["ticker"] == "BBAS3"
