"""Tests for EPIC-013 Integrations Hub: API Keys, MCP Server, .ics Calendar, Voice/WhatsApp NL, Webhooks & FX."""

from fastapi.testclient import TestClient


def _auth(client: TestClient, email: str = "integ@example.com") -> dict[str, str]:
    r = client.post(
        "/auth/register",
        json={"email": email, "password": "IntegPass123!", "full_name": "Integ User"},
    )
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_api_keys_mcp_and_calendar_ics(client: TestClient):
    headers = _auth(client, "integ_mcp@example.com")
    # Create an account first
    acc = client.post("/accounts", headers=headers, json={"name": "Nubank", "type": "checking", "balance": 2500.0})
    assert acc.status_code == 201

    # 1. Create Personal API Key
    k_res = client.post(
        "/integrations/api-keys",
        headers=headers,
        json={"name": "Claude Desktop MCP", "scopes": ["read", "write", "mcp", "calendar_ics"]},
    )
    assert k_res.status_code == 201
    api_key = k_res.json()["api_key"]
    assert api_key.startswith("mony_live_")

    # 2. Call Native JSON-RPC 2.0 MCP Server using API Key!
    mcp_headers = {"Authorization": f"Bearer {api_key}"}
    init = client.post("/integrations/mcp", headers=mcp_headers, json={"jsonrpc": "2.0", "id": 1, "method": "initialize"})
    assert init.status_code == 200
    assert init.json()["result"]["serverInfo"]["name"] == "mony-finance-mcp"

    tools = client.post("/integrations/mcp", headers=mcp_headers, json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    assert len(tools.json()["result"]["tools"]) >= 5

    bal = client.post(
        "/integrations/mcp",
        headers=mcp_headers,
        json={"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "get_balance", "arguments": {}}},
    )
    assert bal.status_code == 200
    assert "2500" in bal.json()["result"]["content"][0]["text"]

    # 3. Subscribable iCalendar .ics feed authenticated via API key query token
    ics = client.get(f"/integrations/calendar.ics?token={api_key}")
    assert ics.status_code == 200
    assert "BEGIN:VCALENDAR" in ics.text


def test_voice_nl_whatsapp_webhook_outgoing_and_fx(client: TestClient):
    headers = _auth(client, "integ_voice@example.com")
    client.post("/accounts", headers=headers, json={"name": "Nubank Principal", "type": "checking", "balance": 1000.0})
    client.post("/accounts", headers=headers, json={"name": "Nomad USD", "type": "checking", "balance": 100.0, "currency": "USD"})

    # 1. Voice NL entry
    nl = client.post(
        "/integrations/nl-entry",
        headers=headers,
        json={"text": "Gastei 48,90 no Uber no pix", "source_tag": "#voz"},
    )
    assert nl.status_code == 200
    assert nl.json()["intent"] == "create_tx"
    assert nl.json()["transaction"]["amount"] == 48.9
    assert nl.json()["transaction"]["payment_method"] == "pix"

    # 2. WhatsApp channel + inbound webhook
    ch = client.post("/integrations/channels", headers=headers, json={"provider": "whatsapp", "identifier": "+5511999999999"})
    assert ch.status_code == 201
    ch_tok = ch.json()["webhook_token"]
    wh_in = client.post("/integrations/webhook/inbound/whatsapp", json={"token": ch_tok, "text": "/saldo"})
    assert wh_in.status_code == 200
    assert wh_in.json()["intent"] == "query_balance"

    # 3. Outgoing webhook CRUD + test
    wh_out = client.post("/integrations/webhooks", headers=headers, json={"name": "n8n Alerts", "url": "https://hooks.example.com/mony"})
    assert wh_out.status_code == 201
    wid = wh_out.json()["id"]
    t_res = client.post(f"/integrations/webhooks/{wid}/test", headers=headers)
    assert t_res.status_code == 200
    assert t_res.json()["delivered"] is True

    # 4. Live Multi-Currency FX & Google Sheets Export
    fx = client.get("/integrations/fx-rates", headers=headers)
    assert fx.status_code == 200
    assert fx.json()["consolidated_brl"] > 1400
    assert "USD" in fx.json()["rates_to_brl"]

    csv_res = client.get("/integrations/sheets-export", headers=headers)
    assert csv_res.status_code == 200
    assert "SignedAmount" in csv_res.text
