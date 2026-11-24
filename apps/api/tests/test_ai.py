"""
Tests for Mony AI document analyzer, invoice installment month allocation,
batch import, and financial chat endpoints.
"""


def _register_and_headers(client, email="aiuser@example.com"):
    r = client.post(
        "/auth/register",
        json={"email": email, "password": "SecurePassword123!", "full_name": "Ana Lima"},
    )
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_ai_status_endpoint(client):
    headers = _register_and_headers(client, "aistatus@example.com")
    resp = client.get("/ai/status", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "provider" in data
    assert "PDF" in data["supported_formats"]


def test_analyze_credit_card_invoice_places_installments_in_invoice_month(client):
    """
    Purchase made on 15/08/2026 (Parcela 03/10) appearing on the November 2026 invoice
    MUST be booked in 2026-11 (invoice month), NOT 2026-08 (purchase month), while
    preserving original_purchase_date=2026-08-15 and installment 3/10!
    """
    headers = _register_and_headers(client, "invoice@example.com")
    invoice_text = """
    Nubank - Fatura de Novembro 2026
    Vencimento: 10/11/2026
    15/08/2026 Magazine Luiza Parc 03/10 R$ 199,90
    02/11/2026 iFood Restaurante R$ 64,50
    05/11/2026 Uber *Trip 02/03 R$ 28,00
    Total da fatura R$ 292,40
    """.strip().encode("utf-8")

    resp = client.post(
        "/ai/analyze-document",
        headers=headers,
        files={"file": ("fatura_nubank_nov2026.txt", invoice_text, "text/plain")},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["statement_month"] == "2026-11"
    assert data["issuer"] == "Nubank"
    assert data["document_type"] == "Fatura de Cartão de Crédito"
    assert len(data["items"]) == 3

    magalu = data["items"][0]
    assert "Magazine Luiza" in magalu["merchant_name"]
    assert magalu["amount"] == 199.90
    assert magalu["payment_method"] == "credit_card"
    assert magalu["installment_number"] == 3
    assert magalu["installment_total"] == 10
    assert magalu["original_purchase_date"] == "2026-08-15"
    # Booked inside the invoice month (2026-11), NOT purchase month (2026-08)!
    assert magalu["transaction_date"].startswith("2026-11-")

    ifood = data["items"][1]
    assert ifood["category_name"] == "Alimentação"
    assert ifood["transaction_date"] == "2026-11-02"

    # Import reviewed items into the database
    account = client.get("/accounts", headers=headers).json()[0]
    imp = client.post(
        "/ai/import-transactions",
        headers=headers,
        json={
            "account_id": account["id"],
            "statement_month": data["statement_month"],
            "filename": data["filename"],
            "document_type": data["document_type"],
            "items": data["items"],
        },
    )
    assert imp.status_code == 201, imp.text
    assert imp.json()["imported"] == 3

    # Verify November 2026 monthly report includes ALL 3 items (including the Aug purchase installment!)
    rep = client.get("/reports/monthly-summary?year=2026&month=11", headers=headers)
    assert rep.status_code == 200
    assert round(float(rep.json()["total_expenses"]), 2) == 292.40

    # Verify August 2026 has 0 expenses (the installment was NOT misbooked in purchase month!)
    rep_aug = client.get("/reports/monthly-summary?year=2026&month=8", headers=headers)
    assert rep_aug.status_code == 200
    assert float(rep_aug.json()["total_expenses"]) == 0.0

    # Verify transaction metadata returned on GET /transactions
    txs = client.get("/transactions", headers=headers).json()["items"]
    magalu_tx = next(t for t in txs if "Magazine Luiza" in t["description"])
    assert magalu_tx["payment_method"] == "credit_card"
    assert magalu_tx["installment_number"] == 3
    assert magalu_tx["installment_total"] == 10
    assert magalu_tx["statement_month"] == "2026-11"
    assert magalu_tx["original_purchase_date"] == "2026-08-15"


def test_analyze_pix_and_boleto_csv_statement(client):
    headers = _register_and_headers(client, "csv@example.com")
    csv_bytes = (
        "Data;Descricao;Valor\n"
        "04/10/2026;PIX ENVIADO - Padaria Central;32,50\n"
        "08/10/2026;Boleto Enel Energia;185,00\n"
    ).encode("utf-8")

    resp = client.post(
        "/ai/analyze-document",
        headers=headers,
        data={"override_month": "2026-10"},
        files={"file": ("extrato_outubro.csv", csv_bytes, "text/csv")},
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 2
    assert items[0]["payment_method"] == "pix"
    assert items[0]["category_name"] == "Alimentação"
    assert items[1]["payment_method"] == "boleto"
    assert items[1]["category_name"] == "Moradia"


def test_ai_chat_returns_real_financial_summary(client):
    headers = _register_and_headers(client, "aichat@example.com")
    resp = client.post(
        "/ai/chat",
        headers=headers,
        json={"message": "Qual meu saldo atual nas contas?"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "Conta Principal" in data["reply"]
    assert "R$" in data["reply"]


def test_duplicate_detection_on_reanalyze_and_reimport(client):
    """Re-uploading the same statement must flag duplicates and skip them on re-import."""
    headers = _register_and_headers(client, "dup@example.com")
    invoice_text = (
        "Nubank - Fatura de Novembro 2026\n"
        "Vencimento: 10/11/2026\n"
        "15/08/2026 Magazine Luiza Parc 03/10 R$ 199,90\n"
        "02/11/2026 iFood Restaurante R$ 64,50\n"
    ).encode("utf-8")

    first = client.post(
        "/ai/analyze-document",
        headers=headers,
        files={"file": ("fatura_nov.txt", invoice_text, "text/plain")},
    ).json()
    assert first["duplicates_detected"] == 0
    assert all(not i["is_duplicate"] for i in first["items"])

    account = client.get("/accounts", headers=headers).json()[0]
    imp1 = client.post(
        "/ai/import-transactions",
        headers=headers,
        json={
            "account_id": account["id"],
            "statement_month": "2026-11",
            "items": first["items"],
        },
    )
    assert imp1.status_code == 201
    assert imp1.json()["imported"] == 2
    assert imp1.json()["skipped_duplicates"] == 0

    # Re-analyze same file -> both items flagged as duplicates
    second = client.post(
        "/ai/analyze-document",
        headers=headers,
        files={"file": ("fatura_nov.txt", invoice_text, "text/plain")},
    ).json()
    assert second["duplicates_detected"] == 2
    assert all(i["is_duplicate"] is True for i in second["items"])
    assert all(i["duplicate_reason"] for i in second["items"])

    # Re-importing with skip_duplicates=True (default) skips both without duplicating balance
    imp2 = client.post(
        "/ai/import-transactions",
        headers=headers,
        json={
            "account_id": account["id"],
            "statement_month": "2026-11",
            "items": second["items"],
        },
    )
    assert imp2.status_code == 201
    assert imp2.json()["imported"] == 0
    assert imp2.json()["skipped_duplicates"] == 2


def test_month_summary_payment_filter_and_installment_projection(client):
    """Verify statement_month/payment_method filtering, exact month summary, and 6-month installment forecast."""
    headers = _register_and_headers(client, "proj@example.com")
    account = client.get("/accounts", headers=headers).json()[0]

    # Import November invoice with a 3/10 installment + PIX + Boleto
    imp = client.post(
        "/ai/import-transactions",
        headers=headers,
        json={
            "account_id": account["id"],
            "statement_month": "2026-11",
            "items": [
                {
                    "description": "Magazine Luiza (3/10)",
                    "merchant_name": "Magazine Luiza",
                    "type": "expense",
                    "category_name": "Outros",
                    "payment_method": "credit_card",
                    "amount": 200.00,
                    "transaction_date": "2026-11-10",
                    "original_purchase_date": "2026-08-15",
                    "statement_month": "2026-11",
                    "installment_number": 3,
                    "installment_total": 10,
                },
                {
                    "description": "Padaria Central",
                    "merchant_name": "Padaria Central",
                    "type": "expense",
                    "category_name": "Alimentação",
                    "payment_method": "pix",
                    "amount": 50.00,
                    "transaction_date": "2026-11-05",
                    "statement_month": "2026-11",
                },
            ],
        },
    )
    assert imp.status_code == 201

    # Filter by statement_month + payment_method
    only_pix = client.get(
        "/transactions?statement_month=2026-11&payment_method=pix",
        headers=headers,
    ).json()
    assert only_pix["total"] == 1
    assert only_pix["items"][0]["merchant_name"] == "Padaria Central"

    # Month summary endpoint
    summary = client.get("/transactions/summary/month?month=2026-11", headers=headers).json()
    assert summary["total_expenses"] == 250.0
    assert summary["installment_expenses"] == 200.0
    assert summary["installment_count"] == 1
    pm_map = {row["payment_method"]: row["total"] for row in summary["by_payment_method"]}
    assert pm_map == {"credit_card": 200.0, "pix": 50.0}

    # Installment projection from 2026-11 across 6 months (Nov..Apr -> 3/10 recorded + 4/10..8/10 projected)
    proj = client.get(
        "/transactions/installments/projection?start_month=2026-11&months=6",
        headers=headers,
    ).json()
    assert proj["active_chains_count"] == 1
    assert proj["total_future_committed"] == 1200.0
    assert len(proj["months"]) == 6
    assert proj["months"][0]["month"] == "2026-11"
    assert proj["months"][0]["recorded_total"] == 200.0
    assert proj["months"][0]["projected_total"] == 0.0
    assert proj["months"][1]["month"] == "2026-12"
    assert proj["months"][1]["projected_total"] == 200.0
    assert proj["months"][1]["items"][0]["installment_number"] == 4
    assert proj["months"][5]["month"] == "2027-04"
    assert proj["months"][5]["items"][0]["installment_number"] == 8
