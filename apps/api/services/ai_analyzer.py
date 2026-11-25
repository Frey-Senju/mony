"""
Multimodal AI Financial Assistant & Document/Invoice Analyzer for Mony.

Supports:
  1. Live Multimodal LLMs (auto-selected when configured via env var):
     - GEMINI_API_KEY    -> Gemini 2.5 Flash (native PDF + Image + CSV + TXT)
     - OPENAI_API_KEY    -> GPT-4o-mini (Vision + Text)
     - ANTHROPIC_API_KEY -> Claude 3.5 Sonnet (PDF + Image + Text)
  2. Built-in Smart Brazilian Statement/Invoice Parser (zero-key fallback):
     - Extracts text from PDF (pypdf), CSV, OFX, and TXT.
     - Detects statement/invoice month (e.g., "Fatura de Novembro 2026",
       "Vencimento 10/11/2026", "NOV/2026").
     - Identifies counterparty/merchant (company or person), expense/income type,
       category, payment method (credit_card, pix, boleto, debit_card, transfer, cash),
       and installments (e.g., 03/10, Parc 2 de 6).
     - Books ALL invoice items (including installments purchased in prior months)
       strictly inside the invoice's billing month (`statement_month`), preserving
       `original_purchase_date`, `installment_number`, and `installment_total`.
"""

from __future__ import annotations

import base64
import calendar
import csv
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
import io
import json
import logging
import os
import re
import unicodedata
from typing import Any, Optional

import httpx

from routes.insights import KEYWORD_MAP

logger = logging.getLogger(__name__)

# Extended keyword map for richer Brazilian receipt/statement classification
EXTENDED_KEYWORDS: dict[str, list[str]] = {
    **KEYWORD_MAP,
    "Alimentação": KEYWORD_MAP["Alimentação"] + [
        "assai", "atacadao", "hortifruti", "acougue", "cafe", "starbucks",
        "bk", "burger king", "habibs", "subway", "outback", "madero", "zdelivery",
    ],
    "Transporte": KEYWORD_MAP["Transporte"] + [
        "shell", "ipiranga", "petrobras", "posto", "sem parar", "veloe", "zul",
        "azul", "99 ", "localiza", "movida",
    ],
    "Moradia": KEYWORD_MAP["Moradia"] + [
        "enel", "cpfl", "cemig", "sabesp", "copasa", "comgas", "vivo fibra",
        "claro resid", "net ", "tim live", "quintoandar", "iptu", "leroy merlin",
    ],
    "Lazer": KEYWORD_MAP["Lazer"] + [
        "hbo", "max ", "prime video", "youtube", "steam", "playstation",
        "xbox", "apple.com/bill", "google play", "cinemark", "sympla",
    ],
    "Vestuário": KEYWORD_MAP["Vestuário"] + [
        "centauro", "netshoes", "shein", "arezzo", "hering", "marisa",
    ],
    "Outros": [
        "magazine luiza", "magalu", "mercado livre", "mercadolivre", "shopee",
        "casas bahia", "americanas", "kabum", "amazon.com.br", "aliexpress",
    ],
    "Trabalho": [
        "salario", "folha", "pagamento salario", "pro-labore", "freelance",
        "honorarios", "remuneracao", "ted recebida", "pix recebido", "dividendo",
    ],
}

MONTH_PT: dict[str, int] = {
    "jan": 1, "janeiro": 1,
    "fev": 2, "fevereiro": 2,
    "mar": 3, "marco": 3, "março": 3,
    "abr": 4, "abril": 4,
    "mai": 5, "maio": 5,
    "jun": 6, "junho": 6,
    "jul": 7, "julho": 7,
    "ago": 8, "agosto": 8,
    "set": 9, "setembro": 9,
    "out": 10, "outubro": 10,
    "nov": 11, "novembro": 11,
    "dez": 12, "dezembro": 12,
}

PAYMENT_METHOD_LABELS: dict[str, str] = {
    "credit_card": "Cartão de Crédito",
    "debit_card": "Cartão de Débito",
    "pix": "PIX",
    "boleto": "Boleto",
    "bank_transfer": "Transferência",
    "cash": "Dinheiro",
    "other": "Outro",
}


def get_active_ai_provider() -> tuple[str, str]:
    """Return ``(provider_id, model_name)`` based on configured environment keys."""
    if os.getenv("GEMINI_API_KEY", "").strip():
        return ("gemini", os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip())
    if os.getenv("OPENAI_API_KEY", "").strip():
        return ("openai", os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip())
    if os.getenv("ANTHROPIC_API_KEY", "").strip():
        return ("anthropic", os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022").strip())
    return ("smart-parser", "mony-br-statement-v1")


def _norm(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _classify_category(text: str, user_categories: list[str], tx_type: str) -> str:
    if tx_type == "income":
        for candidate in ("Trabalho", "Salário", "Receita"):
            for uc in user_categories:
                if _norm(uc) == _norm(candidate):
                    return uc
        return "Trabalho"

    norm_text = _norm(text)
    for cat_name, keywords in EXTENDED_KEYWORDS.items():
        if cat_name == "Trabalho":
            continue
        for kw in keywords:
            if _norm(kw) in norm_text:
                # Match exact casing from user's DB categories when present
                for uc in user_categories:
                    if _norm(uc) == _norm(cat_name):
                        return uc
                return cat_name

    # Check direct match against user's custom category names
    for uc in user_categories:
        if len(uc) >= 4 and _norm(uc) in norm_text:
            return uc

    for uc in user_categories:
        if _norm(uc) == "outros":
            return uc
    return "Outros"


def _detect_payment_method(text: str, doc_default: str) -> str:
    n = _norm(text)
    if "pix" in n:
        return "pix"
    if "boleto" in n or "titulo" in n or "codigo de barras" in n or "ficha de compensacao" in n:
        return "boleto"
    if "debito" in n or "compra no debito" in n:
        return "debit_card"
    if "ted" in n or "doc " in n or "transferencia" in n:
        return "bank_transfer"
    if "dinheiro" in n or "especie" in n or "saque" in n:
        return "cash"
    if any(k in n for k in ("credito", "cartao", "mastercard", "visa", "elo", "amex", "fatura", "parcela")):
        return "credit_card"
    return doc_default


def _detect_issuer(text: str) -> Optional[str]:
    n = _norm(text)
    issuers = [
        ("nubank", "Nubank"),
        ("nu pagamentos", "Nubank"),
        ("itau", "Itaú"),
        ("bradesco", "Bradesco"),
        ("santander", "Santander"),
        ("banco do brasil", "Banco do Brasil"),
        ("caixa economica", "Caixa"),
        ("banco inter", "Inter"),
        ("inter ", "Inter"),
        ("c6 bank", "C6 Bank"),
        ("btg pactual", "BTG Pactual"),
        ("xp ", "XP"),
        ("mercado pago", "Mercado Pago"),
        ("picpay", "PicPay"),
        ("sicredi", "Sicredi"),
        ("sicoob", "Sicoob"),
    ]
    for needle, label in issuers:
        if needle in n:
            return label
    return None


def _detect_document_context(text: str, filename: str) -> tuple[str, str, Optional[str], Optional[int]]:
    """
    Detect (document_type, default_payment_method, statement_month YYYY-MM, due_day).
    """
    combined = f"{filename}\n{text[:3000]}"
    n = _norm(combined)

    # Document type & default payment method
    if any(k in n for k in ("fatura", "cartao de credito", "limite total", "pagamento minimo", "vencimento da fatura")):
        doc_type = "Fatura de Cartão de Crédito"
        default_pm = "credit_card"
    elif "boleto" in n or "linha digitavel" in n or "cedente" in n:
        doc_type = "Boleto Bancário"
        default_pm = "boleto"
    elif "comprovante" in n and "pix" in n:
        doc_type = "Comprovante PIX"
        default_pm = "pix"
    elif any(k in n for k in ("extrato", "saldo anterior", "movimentacao", "conta corrente")):
        doc_type = "Extrato Bancário"
        default_pm = "bank_transfer"
    else:
        doc_type = "Documento Financeiro"
        default_pm = "credit_card" if "parcela" in n else "other"

    statement_month: Optional[str] = None
    due_day: Optional[int] = None

    # Pattern 1: "Vencimento: 10/11/2026" or "Data de vencimento 10/11/2026"
    m_due = re.search(
        r"(?:vencimento|vcto|pagamento|fechamento|competencia|referencia)[^\d]{0,20}(\d{1,2})[/\-](\d{1,2})[/\-](20\d{2})",
        n,
    )
    if m_due:
        d, mo, y = int(m_due.group(1)), int(m_due.group(2)), int(m_due.group(3))
        if 1 <= mo <= 12:
            statement_month = f"{y:04d}-{mo:02d}"
            due_day = min(max(d, 1), 28)

    # Pattern 2: "Fatura de Novembro 2026" / "Novembro/2026" / "NOV 2026"
    if not statement_month:
        month_names = "|".join(sorted(MONTH_PT.keys(), key=len, reverse=True))
        m_pt = re.search(
            rf"(?:fatura|extrato|mes|referencia|competencia|periodo)?\s*(?:de\s+)?({month_names})[\s/\-]+(de\s+)?(20\d{{2}})",
            n,
        )
        if m_pt:
            mo = MONTH_PT[m_pt.group(1)]
            y = int(m_pt.group(3))
            statement_month = f"{y:04d}-{mo:02d}"

    # Pattern 3: "11/2026" or "2026-11" near header or filename
    if not statement_month:
        m_ym = re.search(r"(20\d{2})[-_/](0[1-9]|1[0-2])", n)
        if m_ym:
            statement_month = f"{m_ym.group(1)}-{m_ym.group(2)}"
        else:
            m_my = re.search(r"(0[1-9]|1[0-2])[/\-](20\d{2})", n)
            if m_my:
                statement_month = f"{m_my.group(2)}-{m_my.group(1)}"

    return doc_type, default_pm, statement_month, due_day


def _book_date_in_statement_month(
    statement_month: str,
    original_date: Optional[date],
    due_day: Optional[int] = None,
) -> date:
    """
    Place a transaction strictly inside ``statement_month`` (YYYY-MM).

    If it's a credit card installment purchased months ago (e.g. purchased 2026-08-15
    appearing on the 2026-11 invoice), the booked ``transaction_date`` is placed
    in 2026-11 (using ``due_day`` or the original day clamped to month length)
    so it counts in the invoice month, while ``original_purchase_date`` preserves
    2026-08-15!
    """
    y_str, m_str = statement_month.split("-")
    y, m = int(y_str), int(m_str)
    max_day = calendar.monthrange(y, m)[1]
    if original_date and original_date.year == y and original_date.month == m:
        return original_date
    chosen_day = due_day or (original_date.day if original_date else 10)
    chosen_day = min(max(1, chosen_day), max_day)
    return date(y, m, chosen_day)


def _parse_br_amount(raw: str) -> Optional[Decimal]:
    cleaned = raw.strip().replace("R$", "").replace(" ", "")
    if not cleaned:
        return None
    # Brazilian format: 1.234,56 or 45,90
    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(",") > cleaned.rfind("."):
            cleaned = cleaned.replace(".", "").replace(",", ".")
        else:
            cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        val = Decimal(cleaned)
        return val
    except Exception:
        return None


def _parse_date_token(token: str, default_year: int) -> Optional[date]:
    token = token.strip().lower()
    # DD/MM/YYYY or DD/MM/YY
    m = re.match(r"^(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{2,4}))?$", token)
    if m:
        d, mo = int(m.group(1)), int(m.group(2))
        y_raw = m.group(3)
        if y_raw:
            y = int(y_raw)
            if y < 100:
                y += 2000
        else:
            y = default_year
        try:
            return date(y, mo, d)
        except ValueError:
            return None

    # ISO YYYY-MM-DD
    m_iso = re.match(r"^(20\d{2})-(\d{2})-(\d{2})$", token)
    if m_iso:
        try:
            return date(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3)))
        except ValueError:
            return None

    # "15 AGO" / "15 NOV 2026"
    month_names = "|".join(sorted(MONTH_PT.keys(), key=len, reverse=True))
    m_pt = re.match(rf"^(\d{{1,2}})\s+(?:de\s+)?({month_names})(?:\s+(20\d{{2}}))?$", _norm(token))
    if m_pt:
        d = int(m_pt.group(1))
        mo = MONTH_PT[m_pt.group(2)]
        y = int(m_pt.group(3)) if m_pt.group(3) else default_year
        try:
            return date(y, mo, d)
        except ValueError:
            return None
    return None


def _extract_installment(text: str) -> tuple[Optional[int], Optional[int], str]:
    """Detect installment markers like '03/10', 'Parc 2/6', 'Parcela 4 de 12'."""
    patterns = [
        r"(?:parcela|parc\.?)\s*(\d{1,2})\s*(?:/|de)\s*(\d{1,2})",
        r"\b(\d{1,2})\s*/\s*(\d{1,2})\b",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.IGNORECASE)
        if m:
            num, tot = int(m.group(1)), int(m.group(2))
            # Avoid matching dates like 15/08 (where num > tot or tot > 48)
            if 1 <= num <= tot and 2 <= tot <= 48:
                cleaned = (text[:m.start()] + text[m.end():]).strip(" -–—|")
                return num, tot, re.sub(r"\s{2,}", " ", cleaned)
    return None, None, text


def _clean_merchant(desc: str) -> str:
    cleaned = re.sub(
        r"^(?:pix\s+(?:enviado|recebido)\s*[-:]?\s*|compra\s+(?:cartao|no\s+debito|no\s+credito)\s*[-:]?\s*|pag\*|mercadopago\*|mp\*|pg\s*\*|boleto\s*[-:]?\s*)",
        "",
        desc.strip(),
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" -–—|")
    return (cleaned or desc.strip())[:120]


def _extract_text_from_file(content: bytes, filename: str, content_type: str) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf") or content_type == "application/pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            parts = [page.extract_text() or "" for page in reader.pages]
            return "\n".join(parts)
        except Exception as exc:  # noqa: BLE001
            logger.warning("pypdf extraction failed for %s: %s", filename, exc)
            return ""
    if lower.endswith((".csv", ".txt", ".ofx", ".qfx", ".tsv")) or content_type.startswith("text/"):
        for enc in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                return content.decode(enc)
            except UnicodeDecodeError:
                continue
    return ""


def _parse_csv_transactions(
    text: str,
    user_categories: list[str],
    statement_month: str,
    default_pm: str,
    due_day: Optional[int],
) -> list[dict[str, Any]]:
    """Parse standard Brazilian bank/card CSV exports (Nubank, Itaú, Inter, C6, generic)."""
    items: list[dict[str, Any]] = []
    sample = text[:2048]
    delimiter = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        return []

    fields_norm = {f: _norm(f or "") for f in reader.fieldnames}
    date_col = next((f for f, n in fields_norm.items() if any(k in n for k in ("data", "date"))), None)
    desc_col = next((f for f, n in fields_norm.items() if any(k in n for k in ("desc", "title", "estabelecimento", "historico", "lancamento", "nome", "merchant"))), None)
    amt_col = next((f for f, n in fields_norm.items() if any(k in n for k in ("valor", "amount", "total", "quantia"))), None)

    if not (desc_col and amt_col):
        return []

    default_year = int(statement_month.split("-")[0])
    for row in reader:
        raw_desc = (row.get(desc_col) or "").strip()
        raw_amt = (row.get(amt_col) or "").strip()
        if not raw_desc or not raw_amt:
            continue
        val = _parse_br_amount(raw_amt)
        if val is None or val == 0:
            continue

        orig_date = _parse_date_token(row.get(date_col) or "", default_year) if date_col else None
        inst_num, inst_tot, clean_desc = _extract_installment(raw_desc)
        merchant = _clean_merchant(clean_desc)

        n_desc = _norm(raw_desc)
        if any(k in n_desc for k in ("pagamento recebido", "pagamento fatura", "fatura paga")):
            continue
        if val < 0 and default_pm == "credit_card":
            tx_type = "refund"
        elif any(k in n_desc for k in ("estorno", "reembolso", "cashback")):
            tx_type = "refund"
        elif any(k in n_desc for k in ("salario", "pix recebido", "ted recebida", "deposito", "rendimento")):
            tx_type = "income"
        elif default_pm != "credit_card" and val > 0 and "debito" not in n_desc and "saida" not in n_desc and "pagamento" not in n_desc and "compra" not in n_desc:
            tx_type = "expense"
        else:
            tx_type = "expense"

        pm = _detect_payment_method(raw_desc, default_pm)
        booked = _book_date_in_statement_month(statement_month, orig_date, due_day)
        cat = _classify_category(f"{clean_desc} {merchant}", user_categories, tx_type)

        items.append({
            "description": f"{clean_desc} ({inst_num}/{inst_tot})" if inst_num and inst_tot else clean_desc,
            "merchant_name": merchant,
            "type": tx_type,
            "category_name": cat,
            "payment_method": pm,
            "amount": float(abs(val)),
            "transaction_date": booked.isoformat(),
            "original_purchase_date": orig_date.isoformat() if orig_date else None,
            "statement_month": statement_month,
            "installment_number": inst_num,
            "installment_total": inst_tot,
            "confidence": "high" if inst_num or orig_date else "medium",
        })
    return items


def _parse_text_transactions(
    text: str,
    user_categories: list[str],
    statement_month: str,
    default_pm: str,
    due_day: Optional[int],
) -> list[dict[str, Any]]:
    """Parse unstructured PDF/TXT statements & credit card invoices line by line."""
    items: list[dict[str, Any]] = []
    default_year = int(statement_month.split("-")[0])
    month_names = "|".join(sorted(MONTH_PT.keys(), key=len, reverse=True))

    # Match lines containing a date + description + currency amount
    date_re = rf"(\d{{1,2}}[/\-]\d{{1,2}}(?:[/\-]\d{{2,4}})?|\d{{1,2}}\s+(?:{month_names})(?:\s+20\d{{2}})?)"
    amount_re = r"(-?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}|-?\s*R\$\s*\d+(?:\.\d{2})?)"
    line_pattern = re.compile(rf"^\s*{date_re}\s+(.+?)\s+{amount_re}\s*$", re.IGNORECASE)

    ignore_phrases = (
        "saldo anterior", "total da fatura", "total a pagar", "valor total",
        "pagamento minimo", "limite disponivel", "limite total", "subtotal",
        "pagamento efetuado", "pagamento recebido", "encargos rotativos",
    )

    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if len(line) < 8:
            continue
        n_line = _norm(line)
        if any(p in n_line for p in ignore_phrases):
            continue

        m = line_pattern.match(line)
        if not m:
            continue

        orig_date = _parse_date_token(m.group(1), default_year)
        raw_desc = m.group(2).strip(" -–—|")
        val = _parse_br_amount(m.group(3))
        if not raw_desc or val is None or val == 0:
            continue

        inst_num, inst_tot, clean_desc = _extract_installment(raw_desc)
        merchant = _clean_merchant(clean_desc)
        n_desc = _norm(raw_desc)

        if any(k in n_desc for k in ("estorno", "reembolso", "credito de", "cashback")):
            tx_type = "refund"
        elif any(k in n_desc for k in ("salario", "pix recebido", "ted recebida", "deposito recebido", "pro-labore")):
            tx_type = "income"
        elif val < 0 and default_pm == "credit_card":
            tx_type = "refund"
        else:
            tx_type = "expense"

        pm = _detect_payment_method(raw_desc, default_pm)
        booked = _book_date_in_statement_month(statement_month, orig_date, due_day)
        cat = _classify_category(f"{clean_desc} {merchant}", user_categories, tx_type)

        items.append({
            "description": f"{clean_desc} ({inst_num}/{inst_tot})" if inst_num and inst_tot else clean_desc,
            "merchant_name": merchant,
            "type": tx_type,
            "category_name": cat,
            "payment_method": pm,
            "amount": float(abs(val)),
            "transaction_date": booked.isoformat(),
            "original_purchase_date": orig_date.isoformat() if orig_date else None,
            "statement_month": statement_month,
            "installment_number": inst_num,
            "installment_total": inst_tot,
            "confidence": "high",
        })

    # Single-receipt fallback (e.g., PIX receipt or Boleto with labeled fields)
    if not items:
        m_val = re.search(r"(?:valor|total|quantia)[^\d]{0,18}R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2})", text, re.IGNORECASE)
        if m_val:
            val = _parse_br_amount(m_val.group(1))
            if val and val > 0:
                m_dest = re.search(
                    r"(?:beneficiario|destinatario|favorecido|para|cedente|estabelecimento|empresa|pagador)\s*[:\-]\s*([^\n\r]{2,80})",
                    text,
                    re.IGNORECASE,
                )
                merchant = _clean_merchant(m_dest.group(1)) if m_dest else "Comprovante Anexado"
                m_dt = re.search(r"(\d{1,2}/\d{1,2}/20\d{2})", text)
                orig_date = _parse_date_token(m_dt.group(1), default_year) if m_dt else None
                inst_num, inst_tot, _ = _extract_installment(text)
                pm = _detect_payment_method(text, default_pm)
                booked = _book_date_in_statement_month(statement_month, orig_date, due_day)
                tx_type = "income" if "pix recebido" in _norm(text) else "expense"
                cat = _classify_category(f"{merchant} {text[:300]}", user_categories, tx_type)
                items.append({
                    "description": f"{merchant} ({inst_num}/{inst_tot})" if inst_num and inst_tot else merchant,
                    "merchant_name": merchant,
                    "type": tx_type,
                    "category_name": cat,
                    "payment_method": pm,
                    "amount": float(abs(val)),
                    "transaction_date": booked.isoformat(),
                    "original_purchase_date": orig_date.isoformat() if orig_date else None,
                    "statement_month": statement_month,
                    "installment_number": inst_num,
                    "installment_total": inst_tot,
                    "confidence": "medium",
                })

    return items


def _build_extraction_prompt(user_categories: list[str], override_month: Optional[str]) -> str:
    cats = ", ".join(user_categories) if user_categories else "Alimentação, Transporte, Moradia, Saúde, Lazer, Educação, Vestuário, Viagem, Trabalho, Outros"
    override_note = f"O usuário informou que o mês de referência é {override_month}." if override_month else ""
    return f"""Você é a Mony IA, especialista em análise de faturas de cartão de crédito, extratos bancários, boletos e comprovantes PIX brasileiros.
Analise o documento anexado e retorne APENAS um JSON válido (sem markdown) no formato:
{{
  "document_type": "Fatura de Cartão de Crédito | Extrato Bancário | Comprovante PIX | Boleto Bancário | Recibo",
  "issuer": "Nome do banco/emissor ou null",
  "statement_month": "YYYY-MM",
  "summary": "Resumo em 1 frase em português",
  "items": [
    {{
      "description": "Descrição limpa do gasto (se parcelado, incluir ex: '(3/10)')",
      "merchant_name": "Empresa ou pessoa",
      "type": "expense | income | transfer | investment | refund",
      "category_name": "Uma de: {cats}",
      "payment_method": "credit_card | debit_card | pix | boleto | bank_transfer | cash | other",
      "amount": 123.45,
      "transaction_date": "YYYY-MM-DD",
      "original_purchase_date": "YYYY-MM-DD ou null",
      "installment_number": 3,
      "installment_total": 10,
      "confidence": "high | medium | low"
    }}
  ]
}}

REGRAS OBRIGATÓRIAS:
1. Identifique o mês da fatura/documento em `statement_month` (YYYY-MM). {override_note}
2. REGRA CRÍTICA DE PARCELAMENTO: Se um item for parcelado (ex.: compra feita em 15/08/2026 aparecendo como Parcela 03/10 na fatura de Novembro/2026), NÃO coloque `transaction_date` no mês da compra! Coloque `transaction_date` DENTRO do `statement_month` (ex.: `2026-11-10`), guarde `2026-08-15` em `original_purchase_date`, e preencha `installment_number: 3` e `installment_total: 10`.
3. Ignore linhas de "Total da fatura", "Pagamento recebido da fatura anterior", "Saldo anterior" e "Limite".
4. `amount` deve ser número positivo (float). Use `type: "refund"` para estornos e `type: "income"` para salários/recebimentos.
5. Identifique corretamente `payment_method`: `credit_card`, `pix`, `boleto`, `debit_card`, `bank_transfer`, `cash` ou `other`."""


def _extract_json_block(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start : end + 1]
    return json.loads(raw)


async def _post_gemini_generate(
    api_key: str,
    model: str,
    payload: dict[str, Any],
    timeout: float = 45.0,
) -> tuple[dict[str, Any], str]:
    """Call Gemini generateContent, auto-falling back to ``gemini-flash-latest`` on 404."""
    candidates = [model]
    if model != "gemini-flash-latest":
        candidates.append("gemini-flash-latest")

    last_exc: Optional[Exception] = None
    async with httpx.AsyncClient(timeout=timeout) as client:
        for candidate in candidates:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{candidate}:generateContent?key={api_key}"
            resp = await client.post(url, json=payload)
            if resp.status_code == 404 and candidate != candidates[-1]:
                logger.warning("Gemini model %s returned 404; retrying with %s", candidate, candidates[-1])
                continue
            try:
                resp.raise_for_status()
                return resp.json(), candidate
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                break
    raise last_exc or RuntimeError("Gemini request failed")


async def _analyze_with_gemini(
    content: bytes,
    filename: str,
    content_type: str,
    prompt: str,
    model: str,
) -> dict[str, Any]:
    api_key = os.environ["GEMINI_API_KEY"].strip()

    parts: list[dict[str, Any]] = [{"text": prompt}]
    if content_type.startswith("image/") or content_type == "application/pdf" or filename.lower().endswith(".pdf"):
        mime = content_type if content_type and content_type != "application/octet-stream" else "application/pdf"
        parts.append({
            "inline_data": {
                "mime_type": mime,
                "data": base64.b64encode(content).decode("ascii"),
            }
        })
    else:
        text = _extract_text_from_file(content, filename, content_type)
        parts.append({"text": f"Conteúdo do arquivo ({filename}):\n{text[:30000]}"})

    body, _used_model = await _post_gemini_generate(
        api_key=api_key,
        model=model,
        payload={
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
        },
        timeout=55.0,
    )
    text_out = body["candidates"][0]["content"]["parts"][0]["text"]
    return _extract_json_block(text_out)


async def _analyze_with_openai(
    content: bytes,
    filename: str,
    content_type: str,
    prompt: str,
    model: str,
) -> dict[str, Any]:
    api_key = os.environ["OPENAI_API_KEY"].strip()
    user_content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    if content_type.startswith("image/"):
        b64 = base64.b64encode(content).decode("ascii")
        user_content.append({"type": "image_url", "image_url": {"url": f"data:{content_type};base64,{b64}"}})
    else:
        text = _extract_text_from_file(content, filename, content_type)
        user_content.append({"type": "text", "text": f"Arquivo ({filename}):\n{text[:30000]}"})

    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "user", "content": user_content}],
            },
        )
        resp.raise_for_status()
        body = resp.json()
        return _extract_json_block(body["choices"][0]["message"]["content"])


async def analyze_document(
    *,
    content: bytes,
    filename: str,
    content_type: str,
    user_categories: list[str],
    override_month: Optional[str] = None,
) -> dict[str, Any]:
    """Analyze an uploaded invoice/statement/receipt and return structured transactions."""
    provider, model = get_active_ai_provider()
    today_month = date.today().strftime("%Y-%m")
    fallback_month = override_month or today_month

    # Try live multimodal LLM if API key is configured
    if provider in ("gemini", "openai"):
        prompt = _build_extraction_prompt(user_categories, override_month)
        try:
            raw = (
                await _analyze_with_gemini(content, filename, content_type, prompt, model)
                if provider == "gemini"
                else await _analyze_with_openai(content, filename, content_type, prompt, model)
            )
            stmt_month = override_month or raw.get("statement_month") or fallback_month
            if not re.match(r"^\d{4}-\d{2}$", str(stmt_month)):
                stmt_month = fallback_month

            normalized_items = []
            for item in raw.get("items") or []:
                amt = item.get("amount")
                if not amt or float(amt) <= 0:
                    continue
                orig_raw = item.get("original_purchase_date")
                orig_dt = _parse_date_token(str(orig_raw), int(stmt_month[:4])) if orig_raw else None
                tx_raw = item.get("transaction_date")
                tx_dt = _parse_date_token(str(tx_raw), int(stmt_month[:4])) if tx_raw else None
                # Enforce billing-month booking rule!
                booked = _book_date_in_statement_month(stmt_month, tx_dt or orig_dt)
                normalized_items.append({
                    "description": str(item.get("description") or item.get("merchant_name") or "Lançamento")[:255],
                    "merchant_name": str(item.get("merchant_name") or item.get("description") or "")[:120] or None,
                    "type": item.get("type") if item.get("type") in ("expense", "income", "transfer", "investment", "refund") else "expense",
                    "category_name": item.get("category_name") or _classify_category(str(item.get("description", "")), user_categories, "expense"),
                    "payment_method": item.get("payment_method") if item.get("payment_method") in PAYMENT_METHOD_LABELS else "other",
                    "amount": round(abs(float(amt)), 2),
                    "transaction_date": booked.isoformat(),
                    "original_purchase_date": orig_dt.isoformat() if orig_dt else None,
                    "statement_month": stmt_month,
                    "installment_number": item.get("installment_number"),
                    "installment_total": item.get("installment_total"),
                    "confidence": item.get("confidence", "high"),
                })

            return {
                "engine": f"{provider}:{model}",
                "llm_connected": True,
                "filename": filename,
                "document_type": raw.get("document_type") or "Documento Financeiro",
                "issuer": raw.get("issuer"),
                "statement_month": stmt_month,
                "summary": raw.get("summary") or f"{len(normalized_items)} lançamento(s) identificado(s) para {stmt_month}.",
                "items": normalized_items,
            }
        except Exception as exc:  # noqa: BLE001
            logger.warning("LLM document analysis failed (%s), falling back to smart parser: %s", provider, exc)

    # Smart built-in Brazilian parser fallback
    text = _extract_text_from_file(content, filename, content_type)
    if not text.strip():
        is_image = content_type.startswith("image/") or filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
        return {
            "engine": "smart-parser",
            "llm_connected": False,
            "filename": filename,
            "document_type": "Imagem / Scan" if is_image else "Documento sem texto selecionável",
            "issuer": None,
            "statement_month": fallback_month,
            "summary": (
                "Esta imagem/PDF escaneado requer OCR multimodal. Configure GEMINI_API_KEY ou OPENAI_API_KEY na Vercel "
                "para leitura automática de fotos e PDFs escaneados, ou envie um PDF com texto / CSV / TXT."
            ),
            "items": [],
        }

    doc_type, default_pm, detected_month, due_day = _detect_document_context(text, filename)
    stmt_month = override_month or detected_month or fallback_month
    issuer = _detect_issuer(text)

    if filename.lower().endswith(".csv") or ("," in text[:400] and "\n" in text[:400] and any(k in _norm(text.splitlines()[0]) for k in ("data", "date", "valor", "amount"))):
        items = _parse_csv_transactions(text, user_categories, stmt_month, default_pm, due_day)
    else:
        items = _parse_text_transactions(text, user_categories, stmt_month, default_pm, due_day)

    total_exp = sum(i["amount"] for i in items if i["type"] == "expense")
    inst_count = sum(1 for i in items if i.get("installment_number"))
    issuer_txt = f" ({issuer})" if issuer else ""
    summary = (
        f"{doc_type}{issuer_txt} · Mês {stmt_month}: {len(items)} lançamento(s) identificado(s), "
        f"total de despesas R$ {total_exp:,.2f}"
        + (f", incluindo {inst_count} parcelamento(s) alocado(s) no mês da fatura." if inst_count else ".")
    ).replace(",", "X").replace(".", ",").replace("X", ".")

    return {
        "engine": "smart-parser",
        "llm_connected": False,
        "filename": filename,
        "document_type": doc_type,
        "issuer": issuer,
        "statement_month": stmt_month,
        "summary": summary,
        "items": items,
    }


async def chat_with_financial_context(
    *,
    message: str,
    context: dict[str, Any],
    history: list[dict[str, str]],
) -> dict[str, Any]:
    """Answer user financial questions using live DB context + configured LLM or smart engine."""
    provider, model = get_active_ai_provider()

    system_prompt = (
        "Você é a Mony IA, assistente financeira pessoal inteligente integrada ao app Mony. "
        "Responda sempre em português do Brasil, de forma objetiva, clara, amigável e prática. "
        "Use os dados reais abaixo do usuário para embasar suas respostas (nunca invente valores):\n"
        f"{json.dumps(context, ensure_ascii=False)}"
    )

    if provider == "gemini":
        try:
            api_key = os.environ["GEMINI_API_KEY"].strip()
            contents = [
                {"role": "user" if h.get("role") == "user" else "model", "parts": [{"text": h.get("content", "")}]}
                for h in history[-6:]
                if (h.get("content") or "").strip()
            ]
            # Avoid duplicating the latest user message if caller already appended it to history
            if not (contents and contents[-1]["role"] == "user" and contents[-1]["parts"][0]["text"] == message):
                contents.append({"role": "user", "parts": [{"text": message}]})
            # Gemini expects conversation to start with a user turn
            while contents and contents[0]["role"] != "user":
                contents.pop(0)
            if not contents:
                contents = [{"role": "user", "parts": [{"text": message}]}]

            body, used_model = await _post_gemini_generate(
                api_key=api_key,
                model=model,
                payload={
                    "system_instruction": {"parts": [{"text": system_prompt}]},
                    "contents": contents,
                    "generationConfig": {"temperature": 0.4},
                },
                timeout=35.0,
            )
            reply = body["candidates"][0]["content"]["parts"][0]["text"]
            return {"reply": reply, "engine": f"gemini:{used_model}", "llm_connected": True}
        except Exception as exc:  # noqa: BLE001
            logger.warning("Gemini chat failed, using built-in financial assistant: %s", exc)

    if provider == "openai":
        try:
            api_key = os.environ["OPENAI_API_KEY"].strip()
            msgs = [{"role": "system", "content": system_prompt}]
            msgs.extend({"role": h.get("role", "user"), "content": h.get("content", "")} for h in history[-6:])
            msgs.append({"role": "user", "content": message})
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"model": model, "temperature": 0.4, "messages": msgs},
                )
                resp.raise_for_status()
                reply = resp.json()["choices"][0]["message"]["content"]
                return {"reply": reply, "engine": f"openai:{model}", "llm_connected": True}
        except Exception as exc:  # noqa: BLE001
            logger.warning("OpenAI chat failed, using built-in financial assistant: %s", exc)

    # Smart built-in financial assistant (uses live Supabase data!)
    n = _norm(message)
    bal = context.get("total_balance", 0.0)
    inc = context.get("month_income", 0.0)
    exp = context.get("month_expenses", 0.0)
    net = inc - exp
    top_cats = context.get("top_categories", [])
    budgets = context.get("budgets", [])
    goals = context.get("goals", [])

    def brl(v: float) -> str:
        return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    if any(k in n for k in ("carteira", "investimento", "acao", "acoes", "fii", "dividendo", "provento", "b3", "ticker", "yoc")):
        inv = context.get("investments") or {}
        inv_val = inv.get("total_value", 0.0)
        inv_cost = inv.get("total_cost", 0.0)
        inv_pct = inv.get("total_gain_pct", 0.0)
        divs_12m = inv.get("dividends_12m", 0.0)
        top_assets = inv.get("top_assets") or []
        if not top_assets:
            reply = "Você ainda não cadastrou ativos na carteira B3. Acesse **Investimentos** no menu lateral para lançar ordens, importar da B3 (.xlsx/.csv) ou sincronizar via Pluggy!"
        else:
            lines = [
                f"**Resumo da sua Carteira B3:**",
                f"- Patrimônio investido: **{brl(inv_val)}** (custo {brl(inv_cost)} · **{inv_pct:+.2f}%**)",
                f"- Proventos (12 meses): **{brl(divs_12m)}** (média {brl(inv.get('monthly_avg_dividends', 0))}/mês · YoC **{inv.get('yoc_pct', 0):.2f}%**)",
                "\n**Principais ativos:**",
            ]
            for a in top_assets[:5]:
                lines.append(f"- **{a['ticker']}**: {brl(a['value'])} ({a['gain_pct']:+.2f}%)")
            reply = "\n".join(lines)
    elif any(k in n for k in ("reserva", "cashflow", "poupanca", "emergencia")):
        cf = context.get("cashflow_ytd") or {}
        reply = (
            f"**Cashflow {cf.get('year', '')} & Reserva de Emergência:**\n"
            f"- Receitas acumuladas no ano: **{brl(cf.get('ytd_income', 0))}**\n"
            f"- Despesas acumuladas no ano: **{brl(cf.get('ytd_expenses', 0))}** (média {brl(cf.get('avg_monthly_expense', 0))}/mês)\n"
            f"- Taxa de poupança YTD: **{cf.get('savings_rate_pct', 0)}%**\n"
            f"- Reserva estimada (contas + renda fixa): **{cf.get('emergency_reserve_months', 0)} meses** de custo de vida."
        )
    elif any(k in n for k in ("saldo", "conta", "quanto tenho", "patrimonio")):
        accts = context.get("accounts", [])
        net_worth = context.get("net_worth_total", bal)
        lines = [
            f"Seu saldo em contas é **{brl(bal)}** e seu patrimônio total (contas + carteira B3) é **{brl(net_worth)}**:"
        ]
        for a in accts:
            lines.append(f"- **{a['name']}**: {brl(a['balance'])}")
        reply = "\n".join(lines)
    elif any(k in n for k in ("budget", "limite", "alerta", "orcamento")):
        if not budgets:
            reply = "Você ainda não criou nenhum budget mensal. Vá em **Budgets** no menu lateral para definir limites por categoria!"
        else:
            lines = ["Resumo dos seus **Budgets** neste mês:"]
            for b in budgets:
                badge = "🔴 Ultrapassado" if b["alert_level"] == "exceeded" else ("🟡 Atenção" if b["alert_level"] == "warning" else "🟢 OK")
                lines.append(f"- **{b['category']}**: {brl(b['spent'])} / {brl(b['limit'])} ({b['pct']}%) — {badge}")
            reply = "\n".join(lines)
    elif any(k in n for k in ("meta", "objetivo", "poupar", "economizar")):
        if not goals:
            reply = "Você ainda não cadastrou metas financeiras. Abra **Metas** no menu lateral para criar sua primeira reserva!"
        else:
            lines = ["Progresso das suas **Metas Financeiras**:"]
            for g in goals:
                lines.append(f"- **{g['name']}**: {brl(g['current'])} de {brl(g['target'])} ({g['pct']}%)")
            reply = "\n".join(lines)
    elif any(k in n for k in ("fatura", "arquivo", "anexar", "pdf", "csv", "importar", "parcela")):
        reply = (
            "Você pode clicar na aba **Importar Arquivo / Fatura** logo acima aqui no painel da Mony IA e anexar um "
            "**PDF, CSV, TXT ou imagem** da sua fatura ou extrato. Eu identifico o **mês da fatura**, empresa/pessoa, "
            "forma de pagamento (Cartão, PIX, Boleto), categoria e **aloco cada parcela exatamente no mês da fatura correspondente**!"
        )
    elif any(k in n for k in ("gasto", "despesa", "categoria", "onde gastei", "resumo", "mes")):
        lines = [
            f"**Resumo de {context.get('current_month', 'este mês')}:**",
            f"- Receitas: **{brl(inc)}**",
            f"- Despesas: **{brl(exp)}**",
            f"- Saldo do mês: **{brl(net)}**",
        ]
        if top_cats:
            lines.append("\n**Maiores categorias de despesa:**")
            for c in top_cats[:3]:
                lines.append(f"- **{c['category']}**: {brl(c['total'])}")
        reply = "\n".join(lines)
    else:
        lines = [
            f"Olá! Analisei seus dados reais de **{context.get('current_month', 'este mês')}**:",
            f"- Saldo total em contas: **{brl(bal)}**",
            f"- Receitas do mês: **{brl(inc)}** | Despesas: **{brl(exp)}**",
        ]
        if top_cats:
            lines.append(f"- Maior categoria de gasto: **{top_cats[0]['category']}** ({brl(top_cats[0]['total'])})")
        lines.append("\nPosso responder sobre **seu saldo, gastos por categoria, budgets, metas** ou **analisar faturas/extratos anexados** na aba *Importar Arquivo*!")
        reply = "\n".join(lines)

    return {"reply": reply, "engine": "smart-parser", "llm_connected": False}
