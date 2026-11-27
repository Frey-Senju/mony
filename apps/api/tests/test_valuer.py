"""Tests for EPIC-011 Mony Valuer endpoints (/valuer/*)."""

from fastapi.testclient import TestClient


def _auth_header(client: TestClient, email: str = "valuer@example.com") -> dict[str, str]:
    res = client.post(
        "/auth/register",
        json={"email": email, "password": "ValuerPass123!", "full_name": "Valuer Tester"},
    )
    assert res.status_code == 201
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_valuer_radars_and_presets(client: TestClient):
    headers = _auth_header(client, "valuer_radar@example.com")
    for preset in ("all", "barganha", "dividendos", "previdenciario", "fiis"):
        res = client.get(f"/valuer/radar?preset={preset}", headers=headers)
        assert res.status_code == 200
        body = res.json()
        assert body["preset"] == preset
        assert body["universe_count"] >= 30
        assert isinstance(body["items"], list)
        if body["items"]:
            first = body["items"][0]
            assert "bazin_price" in first
            assert "graham_price" in first
            assert "gordon_price" in first
            assert "consensus_price" in first
            assert "score" in first


def test_valuer_matamata_compare(client: TestClient):
    headers = _auth_header(client, "valuer_cmp@example.com")
    res = client.get("/valuer/compare?tickers=BBAS3,ITUB4,TAEE11,HGLG11", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["count"] == 4
    assert body["champion_ticker"] in {"BBAS3", "ITUB4", "TAEE11", "HGLG11"}
    assert "row_winners" in body


def test_valuer_asset_dossier_markets_and_portfolio(client: TestClient):
    headers = _auth_header(client, "valuer_dossier@example.com")

    dossier = client.get("/valuer/asset/BBAS3?min_dy_bazin=7", headers=headers)
    assert dossier.status_code == 200
    d_body = dossier.json()
    assert d_body["valuation"]["ticker"] == "BBAS3"
    assert d_body["valuation"]["bazin_price"] > 0
    assert "technicals" in d_body

    markets = client.get("/valuer/markets", headers=headers)
    assert markets.status_code == 200
    m_body = markets.json()
    assert len(m_body["indices"]) >= 6
    assert "real_interest_pct" in m_body["macro"]

    pv = client.get("/valuer/portfolio-valuation", headers=headers)
    assert pv.status_code == 200
    assert "by_ticker" in pv.json()


def test_valuer_v2_magic_income_backtest_heatmap_watchlist(client: TestClient):
    headers = _auth_header(client, "valuer_v2@example.com")

    # International radar
    intl = client.get("/valuer/radar?preset=internacional", headers=headers)
    assert intl.status_code == 200
    assert intl.json()["matched_count"] >= 8

    # Magic Number snowball
    magic = client.get("/valuer/magic-number?monthly_contribution=1500", headers=headers)
    assert magic.status_code == 200
    assert len(magic.json()["items"]) >= 10
    assert magic.json()["items"][0]["magic_shares"] > 0

    # Previdenciário income builder
    inc = client.get("/valuer/income-builder?target_monthly_income=3000&stocks_pct=40&fiis_pct=40&fixed_pct=20", headers=headers)
    assert inc.status_code == 200
    assert inc.json()["required_capital"] > 0
    assert len(inc.json()["allocations"]) >= 6

    # 12m Backtest vs IBOV & CDI
    bt = client.post(
        "/valuer/backtest",
        headers=headers,
        json={
            "initial_amount": 10000,
            "holdings": [
                {"ticker": "BBAS3", "weight": 40},
                {"ticker": "TAEE11", "weight": 30},
                {"ticker": "HGLG11", "weight": 30},
            ],
        },
    )
    assert bt.status_code == 200
    assert len(bt.json()["series"]) == 12
    assert bt.json()["final_portfolio"] > 0

    # Sector Heatmap
    hm = client.get("/valuer/sector-heatmap", headers=headers)
    assert hm.status_code == 200
    assert hm.json()["sectors_count"] >= 8

    # DB-persisted Watchlist CRUD + Bell Notification Alert
    w_add = client.post(
        "/valuer/watchlist",
        headers=headers,
        json={"ticker": "BBAS3", "target_price": 99.00, "notes": "Aporte previdenciário"},
    )
    assert w_add.status_code == 201
    assert w_add.json()["hit"] is True

    w_list = client.get("/valuer/watchlist", headers=headers)
    assert w_list.status_code == 200
    assert w_list.json()["count"] == 1
    assert w_list.json()["hits_count"] == 1

    # Notification bell should have received the ceiling-hit alert
    notifs = client.get("/notifications", headers=headers)
    assert notifs.status_code == 200
    assert any("BBAS3" in n["title"] for n in notifs.json()["items"])

    w_del = client.delete("/valuer/watchlist/BBAS3", headers=headers)
    assert w_del.status_code == 204
    assert client.get("/valuer/watchlist", headers=headers).json()["count"] == 0
