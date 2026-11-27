"""Tests for EPIC-014 Wave 2: Couple/Family Workspaces, PJ/MEI DRE & Expensify Reimbursements/KM."""

from fastapi.testclient import TestClient


def _auth(client: TestClient, email: str = "ws@example.com") -> dict[str, str]:
    r = client.post(
        "/auth/register",
        json={"email": email, "password": "WsPass123!", "full_name": "João"},
    )
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_couple_workspace_split_dre_and_reimbursements(client: TestClient):
    headers = _auth(client, "ws_full@example.com")

    # 1. Couple Workspace with Proportional Split (6000 vs 4000 -> 60% / 40%)
    ws_res = client.post(
        "/workspaces",
        headers=headers,
        json={"name": "Casa João & Maria", "split_mode": "proportional", "owner_monthly_income": 6000},
    )
    assert ws_res.status_code == 201
    ws = ws_res.json()
    ws_id = ws["id"]
    owner_mid = ws["members"][0]["id"]

    m_res = client.post(
        f"/workspaces/{ws_id}/members",
        headers=headers,
        json={"member_name": "Maria", "member_email": "maria@example.com", "role": "editor", "monthly_income": 4000},
    )
    assert m_res.status_code == 201

    # Owner pays R$ 1000 rent -> Maria owes 40% = R$ 400
    exp_res = client.post(
        f"/workspaces/{ws_id}/expenses",
        headers=headers,
        json={"paid_by_member_id": owner_mid, "description": "Aluguel", "category": "Moradia", "amount": 1000},
    )
    assert exp_res.status_code == 201
    transfers = exp_res.json()["settlement"]["transfers"]
    assert len(transfers) == 1
    assert transfers[0]["from"] == "Maria"
    assert transfers[0]["amount"] == 400.0

    # Settle all
    settle = client.post(f"/workspaces/{ws_id}/settle", headers=headers)
    assert settle.status_code == 200
    assert settle.json()["settled_count"] == 1

    # 2. PJ/MEI DRE
    dre = client.get("/workspaces/business/dre?tax_rate_pct=6", headers=headers)
    assert dre.status_code == 200
    assert "net_profit" in dre.json()["dre"]
    assert len(dre.json()["monthly_series"]) == 12

    # 3. Expensify Reimbursements & Mileage (KM)
    rep = client.post(
        "/workspaces/reimbursements",
        headers=headers,
        json={"title": "Viagem São Paulo", "client_or_company": "Acme Corp", "km_rate": 2.0},
    )
    assert rep.status_code == 201
    rep_id = rep.json()["id"]

    # Add 120 km mileage (120 * 2.0 = R$ 240) + Hotel R$ 450
    i1 = client.post(
        f"/workspaces/reimbursements/{rep_id}/items",
        headers=headers,
        json={"description": "Deslocamento carro SP", "is_mileage": True, "km_distance": 120},
    )
    assert i1.status_code == 201
    i2 = client.post(
        f"/workspaces/reimbursements/{rep_id}/items",
        headers=headers,
        json={"description": "Hotel Paulista", "category": "Hospedagem", "amount": 450},
    )
    assert i2.status_code == 201
    assert i2.json()["total_amount"] == 690.0
    assert i2.json()["total_km"] == 120.0

    st = client.patch(f"/workspaces/reimbursements/{rep_id}/status", headers=headers, json={"status": "reimbursed"})
    assert st.status_code == 200
    assert st.json()["status"] == "reimbursed"

    # 4. EPIC-015 Wave 3: Gamification & Debt-Free Date
    gam = client.get("/insights/gamification", headers=headers)
    assert gam.status_code == 200
    gdata = gam.json()
    assert gdata["level"] >= 1
    assert len(gdata["badges"]) == 10
    assert "debt_free" in gdata
    assert gdata["debt_free"]["is_debt_free"] is True
