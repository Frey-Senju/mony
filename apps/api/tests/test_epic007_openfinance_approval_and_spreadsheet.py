"""
Comprehensive backend tests for EPIC-007 (Stories 7.1, 7.2, 7.3):
- Story 7.1: Open Finance Pluggy sync stages transactions into of_pending_transactions
  (NEVER mutates real transactions before user approval), edit before approve,
  approve into real transactions, reject permanently blocks re-sync.
- Story 7.2: Imported summary + DELETE /open-finance/pluggy/imported-data safely
  erases ONLY Open Finance records and preserves manual/spreadsheet transactions.
- Story 7.3: AI 2026 Spreadsheet Importer parses multi-tab .xlsx matching the real
  Economias e Organizações 2026 layout (January without checkbox + November with ✅,
  Entradas block, Excel serial dates, '8 de 10', '∞' recurrences, Cartão Bradesco/XP/PIX/Boleto),
  auto-creates categories/accounts/recurrences, and skips duplicates on re-import.
"""

from datetime import date
from uuid import uuid4

from fastapi.testclient import TestClient

from services.xlsx_exporter import build_xlsx_workbook


def _register_and_login(client: TestClient) -> str:
    email = f"epic007-{uuid4().hex[:8]}@example.com"
    pw = "Epic007Pass!2026"
    r = client.post("/auth/register", json={"email": email, "password": pw, "full_name": "Cristian Epic007"})
    assert r.status_code in (200, 201), r.text
    login = client.post("/auth/login", json={"email": email, "password": pw})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _build_sample_2026_workbook() -> bytes:
    # Mimics real January (no checkbox col) and November (with ✅ col)
    jan_rows = [
        ["Início"],
        ["", "", "Reserva", "Valor"],
        ["", "", "Reserva imediata", "", "", "Descrição", "Valor", "Categorias", "Data da Compra", "Parcelas", "Pagamento"],
        ["", "", "Aporte", "", "", "APPLE ICLOUD", 19.9, "Diversão (Viagem, Restaurante, etc.)", 45427, "∞", "Cartão Bradesco"],
        ["", "", "Saldo Atual Total", 0, "", "IPLACE", 383.25, "Mercado/ Compras", 45805, "7 de 12", "Cartão Bradesco"],
        [],
        [],
        ["", "", "Entradas", "Valor", "", "CLUBE IFOOD", 5.95, "Diversão (Viagem, Restaurante, etc.)", 45431, "∞", "Cartão XP"],
        ["", "", "Pagamento", 3209.39],
        ["", "", "Maiara", 412.0],
        ["", "", "Janeiro", 3621.39],  # subtotal row — must NOT be imported!
        ["", "Objetivos do Salário"],
        ["", "Economia", 0.1, 362.14],
    ]
    nov_rows = [
        ["Início"],
        ["", "", "Reserva", "Valor"],
        ["", "", "Reserva imediata", "", "", "✅", "Descrição", "Valor", "Categorias", "Data da Compra", "Parcelas", "Pagamento"],
        ["", "", "Aporte", "", "", 1, "CONSÓRCIO CNP", 1048.14, "Carro/Gasolina", 46008, "25 de 77", "Boleto"],
        ["", "", "", "", "", 0, "GILSON", 438.06, "Casa", 46335, "7 de 10", "PIX"],
        [],
        [],
        ["", "", "Entradas", "Valor"],
        ["", "", "Pagamento", 4536.26],
        ["", "", "Novembro", 4536.26],
    ]
    return build_xlsx_workbook([
        ("Índice", [["Planilha 2026"]]),
        ("Janeiro", jan_rows),
        ("Novembro", nov_rows),
    ])


def test_story_71_72_openfinance_approval_queue_and_safe_clean(client: TestClient):
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Seed one manual transaction that MUST survive Open Finance cleanup
    accts = client.get("/accounts", headers=headers).json()
    default_acct_id = (accts[0] if isinstance(accts, list) else accts["items"][0])["id"]
    manual = client.post(
        "/transactions",
        json={
            "account_id": default_acct_id,
            "type": "expense",
            "amount": 120.0,
            "description": "Compra Manual Protegida",
            "transaction_date": date.today().isoformat(),
            "payment_method": "pix",
        },
        headers=headers,
    )
    assert manual.status_code == 201, manual.text

    # 1. Link sandbox Pluggy item -> transactions go to PENDING queue, NOT directly into /transactions!
    link_r = client.post(
        "/open-finance/pluggy/items",
        json={"item_id": "sandbox-nubank-approval-test", "institution_name": "Nubank"},
        headers=headers,
    )
    assert link_r.status_code in (200, 201), link_r.text
    assert link_r.json()["transactions_inserted"] > 0

    # Real transactions must still ONLY have the 1 manual transaction!
    txs_before = client.get("/transactions", headers=headers).json()["items"]
    assert len(txs_before) == 1
    assert txs_before[0]["description"] == "Compra Manual Protegida"

    # Pending queue must hold the Open Finance items
    pend_r = client.get("/open-finance/pluggy/pending", headers=headers)
    assert pend_r.status_code == 200, pend_r.text
    pend = pend_r.json()
    assert pend["pending_count"] >= 2
    first_id = pend["items"][0]["id"]
    second_id = pend["items"][1]["id"]

    # 2. Edit first pending item before approving
    edit_r = client.patch(
        f"/open-finance/pluggy/pending/{first_id}",
        json={"description": "Editada Antes de Aprovar", "suggested_category_name": "Lazer"},
        headers=headers,
    )
    assert edit_r.status_code == 200, edit_r.text
    assert edit_r.json()["description"] == "Editada Antes de Aprovar"

    # 3. Approve first item -> now enters /transactions
    app_r = client.post(
        "/open-finance/pluggy/pending/approve",
        json={"ids": [first_id]},
        headers=headers,
    )
    assert app_r.status_code == 200, app_r.text
    assert app_r.json()["approved"] == 1

    # 4. Reject second item -> never re-appears on re-sync
    rej_r = client.post(
        "/open-finance/pluggy/pending/reject",
        json={"ids": [second_id]},
        headers=headers,
    )
    assert rej_r.status_code == 200, rej_r.text
    assert rej_r.json()["rejected"] == 1

    # Re-sync same item -> rejected item must NOT come back!
    resync = client.post(
        "/open-finance/pluggy/items",
        json={"item_id": "sandbox-nubank-approval-test", "institution_name": "Nubank"},
        headers=headers,
    )
    assert resync.status_code in (200, 201)
    assert resync.json()["transactions_inserted"] == 0

    # 5. Story 7.2: Check summary & clean all Open Finance imported data
    sum_r = client.get("/open-finance/pluggy/imported-summary", headers=headers)
    assert sum_r.status_code == 200
    assert sum_r.json()["transactions_open_finance"] == 1

    clean_r = client.delete("/open-finance/pluggy/imported-data?clear_pending=true", headers=headers)
    assert clean_r.status_code == 200, clean_r.text
    assert clean_r.json()["deleted_transactions"] == 1
    assert clean_r.json()["manual_and_spreadsheet_preserved"] is True

    # Confirm manual transaction is still untouched!
    txs_after = client.get("/transactions", headers=headers).json()["items"]
    assert len(txs_after) == 1
    assert txs_after[0]["description"] == "Compra Manual Protegida"


def test_story_73_spreadsheet_2026_analyze_and_import(client: TestClient):
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    accts = client.get("/accounts", headers=headers).json()
    default_acct_id = (accts[0] if isinstance(accts, list) else accts["items"][0])["id"]

    xlsx_bytes = _build_sample_2026_workbook()
    an_r = client.post(
        "/ai/analyze-spreadsheet",
        data={"year": "2026"},
        files={"file": ("economias-2026.xlsx", xlsx_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=headers,
    )
    assert an_r.status_code == 200, an_r.text
    an = an_r.json()
    # 5 expenses (3 Jan + 2 Nov) + 3 incomes (2 Jan + 1 Nov; subtotals ignored!)
    assert an["counts"]["expenses"] == 5, an
    assert an["counts"]["incomes"] == 3, an
    assert an["counts"]["recurrences"] == 2, an
    assert an["counts"]["installments"] == 3, an
    assert "Cartão Bradesco" in an["detected_payment_accounts"]
    assert "Carro/Gasolina" in an["detected_categories"]

    # Import all items
    imp_r = client.post(
        "/ai/import-spreadsheet",
        json={
            "account_id": default_acct_id,
            "auto_create_categories": True,
            "auto_create_accounts": True,
            "auto_register_recurring": True,
            "skip_duplicates": True,
            "items": an["items"],
        },
        headers=headers,
    )
    assert imp_r.status_code == 201, imp_r.text
    imp = imp_r.json()
    assert imp["imported"] == 8
    assert imp["created_categories"] >= 3
    assert imp["created_accounts"] >= 2  # Cartão Bradesco + Cartão XP
    assert imp["created_recurrences"] >= 2

    # Re-importing the exact same items must skip 100% as duplicates
    imp2 = client.post(
        "/ai/import-spreadsheet",
        json={
            "account_id": default_acct_id,
            "items": an["items"],
        },
        headers=headers,
    )
    assert imp2.status_code == 201
    assert imp2.json()["imported"] == 0
    assert imp2.json()["skipped_duplicates"] == 8
