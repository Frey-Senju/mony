"""
EPIC-013 Integrations & Portals Hub for Mony API:
- Personal API Keys & Native JSON-RPC 2.0 MCP Server (Pierre / Minhas Economias style)
- Subscribable Google Calendar / Apple Calendar .ics Feed (Meu Assessor / Pierre style)
- WhatsApp, Telegram & Email Receipt Inbound Webhooks + Brazilian NL Voice/Chat Parser
- Outgoing Webhooks with HMAC-SHA256 for Zapier / Make / n8n / Slack / Discord (Expensify style)
- Live Multi-Currency FX Rates (BRL, USD, EUR, GBP) & Google Sheets 1-click Export
"""

from __future__ import annotations

import asyncio
import calendar
import csv
from datetime import date, datetime, timedelta
from decimal import Decimal
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import time
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
import httpx
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from database.base import get_db
from database.models import (
    Account,
    ApiKey,
    CategoryRule,
    CreditCard,
    Goal,
    IntegrationChannel,
    OutgoingWebhook,
    RecurringRule,
    Transaction,
    TransactionCategory,
    TransactionType,
)
from routes.transactions import _balance_delta, _resolve_category, _set_transaction_category
from routes.valuer import B3_UNIVERSE, compute_asset_valuation
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/integrations", tags=["integrations"])

_fx_cache: dict[str, Any] = {
    "ts": 0.0,
    "rates": {"BRL": 1.0, "USD": 5.75, "EUR": 6.18, "GBP": 7.25},
}


# ============ Helpers ============


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def _resolve_user_from_api_key_or_jwt(
    db: Session,
    authorization: Optional[str],
    token_param: Optional[str] = None,
) -> tuple[UUID, list[str]]:
    """Authenticate either via personal API key (`mony_live_...`) or standard Bearer JWT."""
    candidate = (token_param or "").strip()
    if not candidate and authorization and authorization.lower().startswith("bearer "):
        candidate = authorization[7:].strip()
    if not candidate:
        raise HTTPException(status_code=401, detail="Token ou API Key ausente.")

    if candidate.startswith("mony_live_"):
        kh = _hash_key(candidate)
        key_row = (
            db.query(ApiKey)
            .filter(ApiKey.key_hash == kh, ApiKey.is_active.is_(True))
            .first()
        )
        if not key_row:
            raise HTTPException(status_code=401, detail="API Key inválida ou revogada.")
        key_row.last_used_at = datetime.utcnow()
        db.commit()
        return key_row.user_id, list(key_row.scopes or ["read"])

    # Fallback: regular JWT token
    from utils.jwt_utils import decode_token

    try:
        payload = decode_token(candidate)
        uid_str = payload.get("sub") or payload.get("user_id")
        if not uid_str:
            raise ValueError("missing sub")
        return parse_uuid(str(uid_str), "user_id"), ["read", "write", "mcp", "calendar_ics"]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="Token inválido ou expirado.") from exc


def _brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


# ============ Natural Language Brazilian Portuguese Parser (Voice / WhatsApp / Telegram) ============

NL_CATEGORY_HINTS: list[tuple[tuple[str, ...], str]] = [
    (("uber", "99", "gasolina", "posto", "combustivel", "combustível", "estacionamento", "pedagio", "pedágio", "metro", "metrô", "onibus", "ônibus"), "Transporte"),
    (("mercado", "supermercado", "ifood", "restaurante", "almoco", "almoço", "jantar", "cafe", "café", "padaria", "lanche", "pizza", "burger", "acougue", "açougue", "hortifruti"), "Alimentação"),
    (("farmacia", "farmácia", "drogaria", "medico", "médico", "dentista", "exame", "consulta", "plano de saude", "academia"), "Saúde"),
    (("aluguel", "condominio", "condomínio", "energia", "luz", "agua", "água", "internet", "iptu", "gas", "gás"), "Moradia"),
    (("netflix", "spotify", "cinema", "show", "viagem", "hotel", "ingresso", "bar", "lazer", "disney", "prime"), "Lazer"),
    (("curso", "livro", "faculdade", "escola", "udemy", "alura"), "Educação"),
    (("salario", "salário", "freela", "freelance", "pagamento recebido", "cliente", "dividendos", "rendimento", "pix recebido"), "Trabalho"),
]


def _parse_pt_nl_entry(text: str, db: Session, uid: UUID) -> dict[str, Any]:
    raw = (text or "").strip()
    low = raw.lower()

    # Check quick query commands
    if low in ("/saldo", "saldo", "meu saldo", "qual meu saldo"):
        return {"intent": "query_balance"}
    if low in ("/resumo", "resumo", "resumo do mes", "resumo do mês"):
        return {"intent": "query_summary"}

    # Detect transaction type
    income_kw = ("recebi", "ganhei", "entrou", "salario", "salário", "freela", "reembolso", "dividendo", "venda", "pix recebido")
    tx_type = "income" if any(k in low for k in income_kw) else "expense"

    # Extract amount (supports "R$ 48,90", "48,90", "1.250,00", "50 reais", "50")
    m_amt = re.search(r"(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+[,.]\d{1,2}|\d+)", low)
    if not m_amt:
        return {"intent": "unknown", "error": "Não encontrei um valor numérico. Ex.: 'Gastei 48,90 no Uber no pix'."}
    amt_str = m_amt.group(1)
    if "," in amt_str and "." in amt_str:
        amt_val = float(amt_str.replace(".", "").replace(",", "."))
    elif "," in amt_str:
        amt_val = float(amt_str.replace(",", "."))
    else:
        amt_val = float(amt_str)
    if amt_val <= 0:
        return {"intent": "unknown", "error": "O valor precisa ser maior que zero."}

    # Detect payment method
    pm = "other"
    if "pix" in low:
        pm = "pix"
    elif any(k in low for k in ("credito", "crédito", "cartao", "cartão", "nubank", "inter", "itau")):
        pm = "credit_card"
    elif any(k in low for k in ("debito", "débito")):
        pm = "debit_card"
    elif "boleto" in low:
        pm = "boleto"
    elif "dinheiro" in low:
        pm = "cash"

    # Clean description
    cleaned = re.sub(r"(?i)\b(gastei|paguei|comprei|recebi|ganhei|lancei|lançar|reais|real|r\$|no pix|via pix|no credito|no crédito|no cartão|no cartao|no debito|no débito|hoje|ontem)\b", " ", raw)
    cleaned = re.sub(r"\d{1,3}(?:\.\d{3})+,\d{1,2}|\d+[,.]\d{1,2}|\b\d+\b", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -.,deemnoa")
    desc = cleaned[:1].upper() + cleaned[1:] if cleaned else ("Receita rápida" if tx_type == "income" else "Despesa rápida")

    # Category resolution: user's active CategoryRules first, then built-in hints
    cat_name = "Trabalho" if tx_type == "income" else "Outros"
    rules = (
        db.query(CategoryRule)
        .filter(CategoryRule.user_id == uid, CategoryRule.is_active.is_(True))
        .order_by(CategoryRule.priority.desc())
        .all()
    )
    matched_rule = False
    for r in rules:
        pat = (r.pattern or "").strip().lower()
        if pat and pat in low:
            cat_name = r.category_name or cat_name
            matched_rule = True
            break
    if not matched_rule:
        for kws, cname in NL_CATEGORY_HINTS:
            if any(k in low for k in kws):
                cat_name = cname
                break

    tx_date = date.today() - timedelta(days=1) if "ontem" in low else date.today()

    return {
        "intent": "create_tx",
        "type": tx_type,
        "amount": round(amt_val, 2),
        "description": desc[:200],
        "category_name": cat_name,
        "payment_method": pm,
        "transaction_date": tx_date,
    }


def _execute_nl_command(db: Session, uid: UUID, text: str, source_tag: str = "#voz") -> dict[str, Any]:
    parsed = _parse_pt_nl_entry(text, db, uid)
    intent = parsed.get("intent")

    if intent == "query_balance":
        accts = db.query(Account).filter(Account.user_id == uid, Account.deleted_at.is_(None)).all()
        tot = sum(float(a.balance or 0) for a in accts)
        lines = [f"• {a.name}: {_brl(float(a.balance or 0))}" for a in accts[:6]]
        return {
            "intent": "query_balance",
            "reply": f"💰 Seu saldo consolidado é {_brl(tot)} ({len(accts)} conta(s)):\n" + "\n".join(lines),
            "total_balance": round(tot, 2),
        }

    if intent == "query_summary":
        ym = date.today().strftime("%Y-%m")
        txs = (
            db.query(Transaction)
            .filter(Transaction.user_id == uid, Transaction.deleted_at.is_(None), Transaction.statement_month == ym)
            .all()
        )
        inc = sum(float(t.amount or 0) for t in txs if t.type == TransactionType.INCOME)
        exp = sum(float(t.amount or 0) for t in txs if t.type == TransactionType.EXPENSE)
        return {
            "intent": "query_summary",
            "reply": f"📊 Resumo de {ym}: Entradas {_brl(inc)} · Saídas {_brl(exp)} · Saldo {_brl(inc - exp)} ({len(txs)} lançamentos).",
            "income": round(inc, 2),
            "expenses": round(exp, 2),
        }

    if intent != "create_tx":
        return {"intent": "unknown", "reply": parsed.get("error") or "Não entendi o comando."}

    acct = (
        db.query(Account)
        .filter(Account.user_id == uid, Account.deleted_at.is_(None))
        .order_by(Account.is_default.desc(), Account.created_at.asc())
        .first()
    )
    if not acct:
        raise HTTPException(status_code=400, detail="Cadastre ao menos uma conta antes de lançar.")

    t_enum = TransactionType.INCOME if parsed["type"] == "income" else TransactionType.EXPENSE
    amt_dec = Decimal(f"{parsed['amount']:.2f}")
    tx_date: date = parsed["transaction_date"]
    tx = Transaction(
        user_id=uid,
        account_id=acct.id,
        type=t_enum,
        amount=amt_dec,
        currency=acct.currency or "BRL",
        description=parsed["description"],
        merchant_name=parsed["description"],
        transaction_date=tx_date,
        statement_month=tx_date.strftime("%Y-%m"),
        payment_method=parsed["payment_method"],
        source="manual",
        tags=[source_tag],
        is_reconciled=False,
    )
    db.add(tx)
    db.flush()

    cat = _resolve_category(db, uid, None, parsed["category_name"])
    if cat:
        _set_transaction_category(db, tx, cat)

    acct.balance = Decimal(str(acct.balance or 0)) + _balance_delta(t_enum, amt_dec)
    acct.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(tx)

    sign = "+" if t_enum == TransactionType.INCOME else "-"
    return {
        "intent": "create_tx",
        "reply": f"✅ Lançado: {parsed['description']} ({sign}{_brl(parsed['amount'])}) em {parsed['category_name']} · Conta {acct.name}.",
        "transaction": {
            "id": str(tx.id),
            "description": tx.description,
            "amount": float(tx.amount),
            "type": t_enum.value,
            "category_name": parsed["category_name"],
            "payment_method": tx.payment_method,
            "transaction_date": tx_date.isoformat(),
            "account_name": acct.name,
        },
    }


# ============ 1. Personal API Keys ============


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    scopes: list[str] = Field(default_factory=lambda: ["read", "write", "mcp", "calendar_ics"])


@router.get("/api-keys")
async def list_api_keys(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    rows = (
        db.query(ApiKey)
        .filter(ApiKey.user_id == uid, ApiKey.is_active.is_(True))
        .order_by(ApiKey.created_at.desc())
        .all()
    )
    return {
        "items": [
            {
                "id": str(r.id),
                "name": r.name,
                "key_prefix": r.key_prefix,
                "scopes": list(r.scopes or []),
                "last_used_at": r.last_used_at.isoformat() if r.last_used_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


@router.post("/api-keys", status_code=status.HTTP_201_CREATED)
async def create_api_key(
    payload: ApiKeyCreateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    plaintext = f"mony_live_{secrets.token_urlsafe(24)}"
    row = ApiKey(
        user_id=uid,
        name=payload.name.strip(),
        key_prefix=plaintext[:18] + "...",
        key_hash=_hash_key(plaintext),
        scopes=payload.scopes,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": str(row.id),
        "name": row.name,
        "key_prefix": row.key_prefix,
        "api_key": plaintext,  # Shown ONCE
        "scopes": list(row.scopes or []),
        "created_at": row.created_at.isoformat(),
    }


@router.delete("/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_api_key(
    key_id: UUID,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    row = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == uid).first()
    if row:
        row.is_active = False
        db.commit()
    return None


# ============ 2. Native JSON-RPC 2.0 MCP Server (Pierre / Minhas Economias style) ============


class McpRpcRequest(BaseModel):
    jsonrpc: str = "2.0"
    id: Optional[Any] = 1
    method: str
    params: Optional[dict[str, Any]] = None


MCP_TOOLS_SPEC = [
    {
        "name": "get_balance",
        "description": "Retorna o saldo consolidado e detalhamento de todas as contas ativas do usuário no Mony.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_monthly_summary",
        "description": "Retorna receitas, despesas, saldo líquido e top categorias de um mês (YYYY-MM).",
        "inputSchema": {
            "type": "object",
            "properties": {"month": {"type": "string", "description": "Mês no formato YYYY-MM (padrão: mês atual)"}},
        },
    },
    {
        "name": "list_transactions",
        "description": "Lista os últimos lançamentos financeiros do usuário com filtro opcional por termo ou mês.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "month": {"type": "string"},
                "search": {"type": "string"},
                "limit": {"type": "integer", "default": 15},
            },
        },
    },
    {
        "name": "create_transaction",
        "description": "Cria um lançamento de receita ou despesa via linguagem natural (ex: 'Gastei 48,90 no Uber pix').",
        "inputSchema": {
            "type": "object",
            "properties": {"text": {"type": "string", "description": "Comando em linguagem natural pt-BR"}},
            "required": ["text"],
        },
    },
    {
        "name": "get_valuer_radar",
        "description": "Consulta os melhores ativos descontados do Radar Mony Valuer B3 (barganha, dividendos, previdenciario, fiis, internacional).",
        "inputSchema": {
            "type": "object",
            "properties": {"preset": {"type": "string", "default": "barganha"}},
        },
    },
]


@router.post("/mcp")
async def mony_mcp_server(
    rpc: McpRpcRequest,
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """
    Native Model Context Protocol (MCP) JSON-RPC 2.0 endpoint.
    Connect Claude Desktop, ChatGPT, Cursor, Windsurf or Antigravity directly to your Mony account!
    """
    uid, scopes = _resolve_user_from_api_key_or_jwt(db, authorization)

    if rpc.method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": rpc.id,
            "result": {
                "protocolVersion": "2024-11-05",
                "serverInfo": {"name": "mony-finance-mcp", "version": "1.0.0"},
                "capabilities": {"tools": {}},
            },
        }

    if rpc.method == "tools/list":
        return {"jsonrpc": "2.0", "id": rpc.id, "result": {"tools": MCP_TOOLS_SPEC}}

    if rpc.method == "tools/call":
        params = rpc.params or {}
        tool_name = params.get("name")
        args = params.get("arguments") or {}

        if tool_name == "get_balance":
            accts = db.query(Account).filter(Account.user_id == uid, Account.deleted_at.is_(None)).all()
            data = {
                "total_balance": round(sum(float(a.balance or 0) for a in accts), 2),
                "accounts": [
                    {"name": a.name, "type": a.type.value if hasattr(a.type, "value") else str(a.type), "balance": float(a.balance or 0), "currency": a.currency or "BRL"}
                    for a in accts
                ],
            }
            return {"jsonrpc": "2.0", "id": rpc.id, "result": {"content": [{"type": "text", "text": json.dumps(data, ensure_ascii=False)}]}}

        if tool_name == "get_monthly_summary":
            ym = str(args.get("month") or date.today().strftime("%Y-%m"))
            txs = (
                db.query(Transaction)
                .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
                .filter(Transaction.user_id == uid, Transaction.deleted_at.is_(None), Transaction.statement_month == ym)
                .all()
            )
            inc = sum(float(t.amount or 0) for t in txs if t.type == TransactionType.INCOME)
            exp = sum(float(t.amount or 0) for t in txs if t.type == TransactionType.EXPENSE)
            by_cat: dict[str, float] = {}
            for t in txs:
                if t.type == TransactionType.EXPENSE:
                    cn = t.categories[0].category.name if t.categories and t.categories[0].category else "Outros"
                    by_cat[cn] = round(by_cat.get(cn, 0.0) + float(t.amount or 0), 2)
            data = {
                "month": ym,
                "income": round(inc, 2),
                "expenses": round(exp, 2),
                "net": round(inc - exp, 2),
                "top_categories": sorted(by_cat.items(), key=lambda kv: kv[1], reverse=True)[:6],
            }
            return {"jsonrpc": "2.0", "id": rpc.id, "result": {"content": [{"type": "text", "text": json.dumps(data, ensure_ascii=False)}]}}

        if tool_name == "list_transactions":
            q = (
                db.query(Transaction)
                .filter(Transaction.user_id == uid, Transaction.deleted_at.is_(None))
            )
            if args.get("month"):
                q = q.filter(Transaction.statement_month == str(args["month"]))
            if args.get("search"):
                q = q.filter(Transaction.description.ilike(f"%{args['search']}%"))
            lim = min(50, max(1, int(args.get("limit") or 15)))
            rows = q.order_by(Transaction.transaction_date.desc()).limit(lim).all()
            data = [
                {
                    "date": r.transaction_date.isoformat(),
                    "description": r.description,
                    "amount": float(r.amount or 0),
                    "type": r.type.value if hasattr(r.type, "value") else str(r.type),
                }
                for r in rows
            ]
            return {"jsonrpc": "2.0", "id": rpc.id, "result": {"content": [{"type": "text", "text": json.dumps(data, ensure_ascii=False)}]}}

        if tool_name == "create_transaction":
            if "write" not in scopes:
                return {"jsonrpc": "2.0", "id": rpc.id, "error": {"code": -32001, "message": "Esta API Key não tem escopo 'write'."}}
            res = _execute_nl_command(db, uid, str(args.get("text") or ""), source_tag="#mcp")
            return {"jsonrpc": "2.0", "id": rpc.id, "result": {"content": [{"type": "text", "text": json.dumps(res, ensure_ascii=False)}]}}

        if tool_name == "get_valuer_radar":
            evaluated = [compute_asset_valuation(u) for u in B3_UNIVERSE]
            preset = str(args.get("preset") or "barganha").lower()
            if preset == "fiis":
                evaluated = [x for x in evaluated if x["asset_class"] == "fii"]
            elif preset == "internacional":
                evaluated = [x for x in evaluated if x["asset_class"] in ("bdr", "etf")]
            evaluated.sort(key=lambda x: (x["margin_of_safety_pct"], x["score"]), reverse=True)
            top = [
                {"ticker": x["ticker"], "price": x["price"], "consensus": x["consensus_price"], "mos_pct": x["margin_of_safety_pct"], "dy_12m": x["dy_12m"], "score": x["score"]}
                for x in evaluated[:8]
            ]
            return {"jsonrpc": "2.0", "id": rpc.id, "result": {"content": [{"type": "text", "text": json.dumps(top, ensure_ascii=False)}]}}

        return {"jsonrpc": "2.0", "id": rpc.id, "error": {"code": -32601, "message": f"Tool '{tool_name}' não encontrada."}}

    return {"jsonrpc": "2.0", "id": rpc.id, "error": {"code": -32601, "message": f"Método '{rpc.method}' não suportado."}}


# ============ 3. Subscribable Google / Apple Calendar .ics Feed ============


@router.get("/calendar.ics")
async def export_calendar_ics_feed(
    token: Optional[str] = Query(default=None, description="Personal API Key or JWT"),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    """
    EPIC-013 RFC 5545 iCalendar feed for Google Agenda, Apple Calendar & Outlook.
    Syncs recurring bills (next 3 months), credit card closing/due dates, and goal deadlines.
    """
    uid, _ = _resolve_user_from_api_key_or_jwt(db, authorization, token_param=token)
    today = date.today()
    now_stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Mony Finance//Financial Calendar//PT",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:Mony · Vencimentos & Faturas",
        "X-WR-TIMEZONE:America/Sao_Paulo",
    ]

    def _add_event(uid_str: str, ev_date: date, summary: str, desc: str) -> None:
        dt = ev_date.strftime("%Y%m%d")
        nxt = (ev_date + timedelta(days=1)).strftime("%Y%m%d")
        clean_sum = summary.replace("\n", " ").replace(",", "\\,")
        clean_desc = desc.replace("\n", "\\n").replace(",", "\\,")
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{uid_str}@mony.app",
                f"DTSTAMP:{now_stamp}",
                f"DTSTART;VALUE=DATE:{dt}",
                f"DTEND;VALUE=DATE:{nxt}",
                f"SUMMARY:{clean_sum}",
                f"DESCRIPTION:{clean_desc}",
                "END:VEVENT",
            ]
        )

    # Next 3 months for recurring & cards
    target_months: list[tuple[int, int]] = []
    cy, cm = today.year, today.month
    for _ in range(3):
        target_months.append((cy, cm))
        if cm == 12:
            cy, cm = cy + 1, 1
        else:
            cm += 1

    rules = (
        db.query(RecurringRule)
        .filter(RecurringRule.user_id == uid, RecurringRule.deleted_at.is_(None), RecurringRule.is_active.is_(True))
        .all()
    )
    for r in rules:
        emoji = "💰" if r.type == TransactionType.INCOME else "📌"
        for y, m in target_months:
            d_clamped = min(max(1, int(r.day_of_month or 5)), calendar.monthrange(y, m)[1])
            ev_d = date(y, m, d_clamped)
            _add_event(
                f"rec-{r.id}-{y}{m:02d}",
                ev_d,
                f"{emoji} {r.description} ({_brl(float(r.amount or 0))})",
                f"Conta fixa Mony · Categoria: {r.category_name or 'Outros'}",
            )

    cards = db.query(CreditCard).filter(CreditCard.user_id == uid, CreditCard.deleted_at.is_(None)).all()
    for c in cards:
        for y, m in target_months:
            due_d = date(y, m, min(max(1, int(c.due_day or 10)), calendar.monthrange(y, m)[1]))
            close_d = date(y, m, min(max(1, int(c.closing_day or 3)), calendar.monthrange(y, m)[1]))
            _add_event(f"card-due-{c.id}-{y}{m:02d}", due_d, f"💳 Vencimento Fatura {c.name}", f"Dia de vencimento do cartão {c.name}.")
            _add_event(f"card-close-{c.id}-{y}{m:02d}", close_d, f"🗓️ Melhor dia / Fechamento {c.name}", f"Fechamento da fatura do cartão {c.name}.")

    goals = db.query(Goal).filter(Goal.user_id == uid, Goal.is_active.is_(True)).all()
    for g in goals:
        if g.target_date:
            _add_event(
                f"goal-{g.id}",
                g.target_date,
                f"🎯 Meta Mony: {g.name}",
                f"Alvo: {_brl(float(g.target_amount or 0))} · Atual: {_brl(float(g.current_amount or 0))}",
            )

    lines.append("END:VCALENDAR")
    return Response(
        content="\r\n".join(lines) + "\r\n",
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'inline; filename="mony-agenda.ics"'},
    )


# ============ 4. WhatsApp, Telegram, Email Inbound & Voice NL Entry ============


class ChannelUpsertRequest(BaseModel):
    provider: str = Field(pattern=r"^(whatsapp|telegram|email_receipt)$")
    identifier: str = Field(min_length=2, max_length=180)


class NlEntryRequest(BaseModel):
    text: str = Field(min_length=2, max_length=500)
    source_tag: str = Field(default="#voz", max_length=32)


class InboundWebhookPayload(BaseModel):
    token: str
    text: str = Field(min_length=1, max_length=1000)
    sender: Optional[str] = None


@router.get("/channels")
async def list_integration_channels(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    rows = db.query(IntegrationChannel).filter(IntegrationChannel.user_id == uid).all()
    return {
        "items": [
            {
                "id": str(r.id),
                "provider": r.provider,
                "identifier": r.identifier,
                "webhook_token": r.webhook_token,
                "is_active": bool(r.is_active),
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


@router.post("/channels", status_code=status.HTTP_201_CREATED)
async def upsert_integration_channel(
    payload: ChannelUpsertRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    existing = (
        db.query(IntegrationChannel)
        .filter(IntegrationChannel.user_id == uid, IntegrationChannel.provider == payload.provider)
        .first()
    )
    if existing:
        existing.identifier = payload.identifier.strip()
        existing.is_active = True
        row = existing
    else:
        row = IntegrationChannel(
            user_id=uid,
            provider=payload.provider,
            identifier=payload.identifier.strip(),
            webhook_token=f"ch_{secrets.token_urlsafe(18)}",
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": str(row.id),
        "provider": row.provider,
        "identifier": row.identifier,
        "webhook_token": row.webhook_token,
        "is_active": bool(row.is_active),
    }


@router.delete("/channels/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_integration_channel(
    provider: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    row = (
        db.query(IntegrationChannel)
        .filter(IntegrationChannel.user_id == uid, IntegrationChannel.provider == provider)
        .first()
    )
    if row:
        db.delete(row)
        db.commit()
    return None


@router.post("/nl-entry")
async def natural_language_voice_or_chat_entry(
    payload: NlEntryRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Authenticated endpoint for Voice Quick-Entry (pt-BR) and in-app WhatsApp/Chat Simulator."""
    uid = parse_uuid(user_id, "user_id")
    return _execute_nl_command(db, uid, payload.text, source_tag=payload.source_tag)


@router.post("/webhook/inbound/{provider}")
async def inbound_messaging_webhook(
    provider: str,
    payload: InboundWebhookPayload,
    db: Session = Depends(get_db),
):
    """
    Universal inbound webhook for WhatsApp Cloud API / Evolution API / Telegram Bot / Email Receipts.
    Authenticates via per-user unique `webhook_token`.
    """
    ch = (
        db.query(IntegrationChannel)
        .filter(
            IntegrationChannel.provider == provider,
            IntegrationChannel.webhook_token == payload.token,
            IntegrationChannel.is_active.is_(True),
        )
        .first()
    )
    if not ch:
        raise HTTPException(status_code=401, detail="Token do canal inválido ou inativo.")
    tag = "#whatsapp" if provider == "whatsapp" else ("#telegram" if provider == "telegram" else "#email-recibo")
    return _execute_nl_command(db, ch.user_id, payload.text, source_tag=tag)


# ============ 5. Outgoing Webhooks (Zapier / Make / n8n / Slack / Discord) ============


class OutgoingWebhookCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    url: str = Field(min_length=8, max_length=500)
    events: list[str] = Field(default_factory=lambda: ["transaction.created", "budget.alert", "valuer.target_hit"])


@router.get("/webhooks")
async def list_outgoing_webhooks(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    rows = db.query(OutgoingWebhook).filter(OutgoingWebhook.user_id == uid).order_by(OutgoingWebhook.created_at.desc()).all()
    return {
        "items": [
            {
                "id": str(r.id),
                "name": r.name,
                "url": r.url,
                "secret_preview": r.secret[:10] + "...",
                "events": list(r.events or []),
                "is_active": bool(r.is_active),
                "last_status_code": r.last_status_code,
                "last_triggered_at": r.last_triggered_at.isoformat() if r.last_triggered_at else None,
            }
            for r in rows
        ]
    }


@router.post("/webhooks", status_code=status.HTTP_201_CREATED)
async def create_outgoing_webhook(
    payload: OutgoingWebhookCreate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    if not payload.url.startswith(("https://", "http://")):
        raise HTTPException(status_code=400, detail="A URL do webhook deve começar com https:// ou http://")
    uid = parse_uuid(user_id, "user_id")
    sec = f"whsec_{secrets.token_hex(16)}"
    row = OutgoingWebhook(
        user_id=uid,
        name=payload.name.strip(),
        url=payload.url.strip(),
        secret=sec,
        events=payload.events,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": str(row.id),
        "name": row.name,
        "url": row.url,
        "secret": sec,
        "events": list(row.events or []),
    }


@router.post("/webhooks/{webhook_id}/test")
async def test_outgoing_webhook(
    webhook_id: UUID,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    row = db.query(OutgoingWebhook).filter(OutgoingWebhook.id == webhook_id, OutgoingWebhook.user_id == uid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Webhook não encontrado.")

    body = json.dumps(
        {
            "event": "mony.test",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "text": "✅ Teste de integração Mony recebido com sucesso!",
            "data": {"webhook_name": row.name, "status": "ok"},
        }
    ).encode("utf-8")
    sig = hmac.new(row.secret.encode("utf-8"), body, hashlib.sha256).hexdigest()

    status_code = 200
    if not os.getenv("PYTEST_CURRENT_TEST"):
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.post(
                    row.url,
                    content=body,
                    headers={"Content-Type": "application/json", "X-Mony-Signature": f"sha256={sig}"},
                )
                status_code = r.status_code
        except Exception as exc:  # noqa: BLE001
            status_code = 0
            row.last_status_code = 0
            row.last_triggered_at = datetime.utcnow()
            db.commit()
            return {"delivered": False, "status_code": 0, "error": str(exc)[:180]}

    row.last_status_code = status_code
    row.last_triggered_at = datetime.utcnow()
    db.commit()
    return {"delivered": 200 <= status_code < 300, "status_code": status_code}


@router.delete("/webhooks/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_outgoing_webhook(
    webhook_id: UUID,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    row = db.query(OutgoingWebhook).filter(OutgoingWebhook.id == webhook_id, OutgoingWebhook.user_id == uid).first()
    if row:
        db.delete(row)
        db.commit()
    return None


# ============ 6. Live Multi-Currency FX Rates + Google Sheets / Accounting Export ============


async def _fetch_fx_pair(symbol: str, fallback: float) -> float:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return fallback
    try:
        async with httpx.AsyncClient(timeout=6.0, headers={"User-Agent": "Mozilla/5.0 (compatible; MonyFX/1.0)"}) as client:
            r = await client.get(f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}", params={"range": "5d", "interval": "1d"})
            if r.status_code == 200:
                res = ((r.json().get("chart") or {}).get("result") or [])
                if res:
                    px = (res[0].get("meta") or {}).get("regularMarketPrice")
                    if px and float(px) > 0:
                        return round(float(px), 4)
    except Exception:  # noqa: BLE001
        pass
    return fallback


@router.get("/fx-rates")
async def get_live_fx_rates(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Live BRL exchange rates (USD, EUR, GBP) + multi-currency consolidated accounts total in BRL."""
    uid = parse_uuid(user_id, "user_id")
    now = time.time()
    if now - _fx_cache["ts"] > 600:
        usd, eur, gbp = await asyncio.gather(
            _fetch_fx_pair("USDBRL=X", 5.75),
            _fetch_fx_pair("EURBRL=X", 6.18),
            _fetch_fx_pair("GBPBRL=X", 7.25),
        )
        _fx_cache["rates"] = {"BRL": 1.0, "USD": usd, "EUR": eur, "GBP": gbp}
        _fx_cache["ts"] = now

    rates = _fx_cache["rates"]
    accounts = db.query(Account).filter(Account.user_id == uid, Account.deleted_at.is_(None)).all()
    consolidated_brl = 0.0
    by_currency: dict[str, float] = {}
    for a in accounts:
        cur = (a.currency or "BRL").upper()
        bal = float(a.balance or 0)
        by_currency[cur] = round(by_currency.get(cur, 0.0) + bal, 2)
        consolidated_brl += bal * float(rates.get(cur, 1.0))

    return {
        "base": "BRL",
        "rates_to_brl": rates,
        "by_currency": by_currency,
        "consolidated_brl": round(consolidated_brl, 2),
        "updated_at": datetime.utcnow().isoformat(),
    }


@router.get("/sheets-export")
async def export_google_sheets_csv(
    year: Optional[int] = Query(default=None, ge=2020, le=2035),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Google Sheets / Accounting-ready UTF-8 BOM CSV export (QuickBooks / Xero / Planilhas compatible)."""
    uid = parse_uuid(user_id, "user_id")
    sel_year = year or date.today().year
    y_start, y_end = date(sel_year, 1, 1), date(sel_year + 1, 1, 1)

    txs = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            Transaction.transaction_date >= y_start,
            Transaction.transaction_date < y_end,
        )
        .order_by(Transaction.transaction_date.desc())
        .all()
    )
    accts = {a.id: a.name for a in db.query(Account).filter(Account.user_id == uid).all()}

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "StatementMonth", "Description", "Category", "Account", "Type", "PaymentMethod", "Currency", "Amount", "SignedAmount", "Tags"])
    for t in txs:
        cname = t.categories[0].category.name if t.categories and t.categories[0].category else "Outros"
        amt = float(t.amount or 0)
        signed = amt if t.type in (TransactionType.INCOME, TransactionType.REFUND) else -amt
        writer.writerow([
            t.transaction_date.isoformat(),
            t.statement_month or t.transaction_date.strftime("%Y-%m"),
            t.description,
            cname,
            accts.get(t.account_id, ""),
            t.type.value if hasattr(t.type, "value") else str(t.type),
            t.payment_method or "",
            t.currency or "BRL",
            f"{amt:.2f}",
            f"{signed:.2f}",
            " ".join(t.tags or []) if isinstance(t.tags, list) else "",
        ])

    return Response(
        content="\ufeff" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="mony-google-sheets-{sel_year}.csv"'},
    )
