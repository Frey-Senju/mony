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
