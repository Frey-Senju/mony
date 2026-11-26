"""
AI Financial Assistant & Invoice/Document Import endpoints for Mony API.

Endpoints:
  GET  /ai/status               — active AI engine (gemini/openai/anthropic/smart-parser)
  POST /ai/analyze-document     — upload PDF/image/CSV/OFX/TXT and extract structured transactions
  POST /ai/import-transactions  — batch-save reviewed items into transactions + categories + receipts
  POST /ai/chat                 — conversational assistant with real user financial context
"""

from datetime import date, datetime
from decimal import Decimal
import re
from typing import List, Optional
import unicodedata
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Account,
    Budget,
    Category,
    Goal,
    InvestmentAsset,
    InvestmentDividend,
    MarketQuoteCache,
    OFLinkedAccount,
    Receipt,
    Transaction,
    TransactionCategory,
    TransactionType,
)
from routes.categories import ensure_default_categories
from routes.transactions import (
    _balance_delta,
    _month_filter_clause,
    _resolve_category,
    _set_transaction_category,
)
from services.ai_analyzer import (
    analyze_document,
    chat_with_financial_context,
    get_active_ai_provider,
    parse_voice_transaction,
)
from services.ai_review_engine import run_proactive_review
from services.rules_engine import (
    is_internal_transfer_text,
    load_active_rules,
    match_user_rule,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/ai", tags=["ai"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


# ============ Schemas ============


class AIStatusResponse(BaseModel):
    provider: str
    model: str
    llm_connected: bool
    supported_formats: list[str]


class ExtractedTransactionItem(BaseModel):
    description: str = Field(min_length=1, max_length=255)
    merchant_name: Optional[str] = None
    type: str = "expense"
    category_name: Optional[str] = None
    payment_method: Optional[str] = None
    amount: Decimal = Field(gt=0)
    transaction_date: date
    original_purchase_date: Optional[date] = None
    statement_month: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    installment_number: Optional[int] = Field(default=None, ge=1)
    installment_total: Optional[int] = Field(default=None, ge=1)
    confidence: str = "high"


class ImportTransactionsRequest(BaseModel):
    account_id: str
    statement_month: str = Field(pattern=r"^\d{4}-\d{2}$")
    filename: Optional[str] = None
    document_type: Optional[str] = None
    skip_duplicates: bool = True
    items: List[ExtractedTransactionItem] = Field(min_length=1)


def _norm_fp_text(text: str) -> str:
    s = re.sub(r"\(\s*\d{1,2}\s*/\s*\d{1,2}\s*\)", "", text or "")
    s = re.sub(r"(?:parcela|parc\.?)\s*\d{1,2}\s*(?:/|de)\s*\d{1,2}", "", s, flags=re.IGNORECASE)
    nfkd = unicodedata.normalize("NFKD", s.lower())
    cleaned = "".join(c for c in nfkd if not unicodedata.combining(c))
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned).strip()
    return cleaned[:48]


def _tx_fingerprints(
    description: str,
    merchant: Optional[str],
    amount: float | Decimal,
    installment_number: Optional[int],
    tx_date: Optional[str | date] = None,
) -> set[tuple]:
    amt = round(abs(float(amount)), 2)
    desc_key = _norm_fp_text(description)
    merch_key = _norm_fp_text(merchant or "")
    fps: set[tuple] = set()
    if desc_key:
        fps.add(("d", desc_key, amt, installment_number))
    if merch_key:
        fps.add(("m", merch_key, amt, installment_number))
    if tx_date and desc_key:
        first_tok = desc_key.split(" ")[0]
        fps.add(("dt", first_tok, amt, str(tx_date)))
    return fps


def _existing_month_fingerprints(db: Session, uid: UUID, stmt_month: str) -> set[tuple]:
    existing = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            _month_filter_clause(stmt_month),
        )
        .all()
    )
    fps: set[tuple] = set()
    for tx in existing:
        fps |= _tx_fingerprints(
            tx.description,
            tx.merchant_name,
            tx.amount,
            tx.installment_number,
            tx.transaction_date.isoformat() if tx.transaction_date else None,
        )
    return fps


class ChatMessage(BaseModel):
    role: str = Field(pattern=r"^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: List[ChatMessage] = Field(default_factory=list)


# ============ Endpoints ============


@router.get("/status", response_model=AIStatusResponse)
async def ai_status(user_id: str = Depends(get_current_user_from_header)):
    """Report which AI provider/model is active."""
    provider, model = get_active_ai_provider()
    return AIStatusResponse(
        provider=provider,
        model=model,
        llm_connected=provider != "smart-parser",
        supported_formats=["PDF", "CSV", "TXT", "OFX", "PNG", "JPG", "WEBP"],
    )


@router.post("/analyze-document")
async def analyze_uploaded_document(
    file: UploadFile = File(...),
    override_month: Optional[str] = Form(default=None),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Analyze an attached bank statement, credit card invoice, boleto, or PIX receipt."""
    uid = parse_uuid(user_id, "user_id")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo vazio.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Arquivo excede o limite de 10 MB.",
        )

    if override_month:
        override_month = override_month.strip()
        if len(override_month) != 7 or override_month[4] != "-":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="override_month deve estar no formato YYYY-MM",
            )

    categories = ensure_default_categories(db, uid)
    cat_names = [c.name for c in categories]

    result = await analyze_document(
        content=content,
        filename=file.filename or "documento",
        content_type=file.content_type or "application/octet-stream",
        user_categories=cat_names,
        override_month=override_month,
    )

    # Annotate potential duplicates already stored in this billing month
    stmt_month = result.get("statement_month") or date.today().strftime("%Y-%m")
    existing_fps = _existing_month_fingerprints(db, uid, stmt_month)
    duplicates_detected = 0
    for item in result.get("items") or []:
        item_fps = _tx_fingerprints(
            str(item.get("description") or ""),
            item.get("merchant_name"),
            item.get("amount") or 0,
            item.get("installment_number"),
            item.get("transaction_date"),
        )
        is_dup = bool(item_fps & existing_fps)
        item["is_duplicate"] = is_dup
        if is_dup:
            duplicates_detected += 1
            inst_note = (
                f" · Parcela {item['installment_number']}/{item['installment_total']}"
                if item.get("installment_number") and item.get("installment_total")
                else ""
            )
            amt_brl = f"R$ {float(item.get('amount') or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            item["duplicate_reason"] = f"Já existe em {stmt_month} ({amt_brl}{inst_note})"
        else:
            item["duplicate_reason"] = None

    result["duplicates_detected"] = duplicates_detected
    return result


@router.post("/import-transactions", status_code=status.HTTP_201_CREATED)
async def import_analyzed_transactions(
    payload: ImportTransactionsRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Persist reviewed AI-extracted transactions in batch, linked to categories & billing month."""
    uid = parse_uuid(user_id, "user_id")
    aid = parse_uuid(payload.account_id, "account_id")

    account = (
        db.query(Account)
        .filter(Account.id == aid, Account.user_id == uid, Account.deleted_at.is_(None))
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta não encontrada.")

    ensure_default_categories(db, uid)
    active_rules = load_active_rules(db, uid)

    imported_ids: list[str] = []
    skipped_duplicates = 0
    balance_change = Decimal("0.00")
    existing_fps = (
        _existing_month_fingerprints(db, uid, payload.statement_month)
        if payload.skip_duplicates
        else set()
    )

    for item in payload.items:
        item_fps = _tx_fingerprints(
            item.description,
            item.merchant_name,
            item.amount,
            item.installment_number,
            item.transaction_date.isoformat(),
        )
        if payload.skip_duplicates and (item_fps & existing_fps):
            skipped_duplicates += 1
            continue
        existing_fps |= item_fps

        try:
            tx_type = TransactionType(item.type)
        except ValueError:
            tx_type = TransactionType.EXPENSE

        chosen_category = item.category_name or "Outros"
        matched_rule = match_user_rule(active_rules, item.description, item.merchant_name)
        if matched_rule is not None:
            matched_rule.matches_count = int(matched_rule.matches_count or 0) + 1
            if matched_rule.action == "mark_transfer":
                tx_type = TransactionType.TRANSFER
            elif matched_rule.action == "categorize" and matched_rule.category_name:
                chosen_category = matched_rule.category_name
        elif tx_type in (TransactionType.EXPENSE, TransactionType.INCOME) and is_internal_transfer_text(
            item.description, item.merchant_name
        ):
            tx_type = TransactionType.TRANSFER

        notes_parts = []
        if item.installment_number and item.installment_total:
            notes_parts.append(f"Parcela {item.installment_number}/{item.installment_total}")
        if item.original_purchase_date and item.original_purchase_date != item.transaction_date:
            notes_parts.append(f"Compra original: {item.original_purchase_date.strftime('%d/%m/%Y')}")
        if payload.document_type:
            notes_parts.append(f"Importado via Mony IA ({payload.document_type})")

        tx = Transaction(
            user_id=uid,
            account_id=aid,
            type=tx_type,
            amount=item.amount,
            currency=account.currency or "BRL",
            description=item.description[:255],
            merchant_name=(item.merchant_name or "")[:255] or None,
            notes=" · ".join(notes_parts) or None,
            transaction_date=item.transaction_date,
            is_reconciled=False,
            source="manual",
            payment_method=item.payment_method,
            installment_number=item.installment_number,
            installment_total=item.installment_total,
            statement_month=item.statement_month or payload.statement_month,
            original_purchase_date=item.original_purchase_date,
        )
        db.add(tx)
        db.flush()

        cat = _resolve_category(db, uid, category_name=chosen_category)
        if cat is not None:
            _set_transaction_category(db, tx, cat)

        balance_change += _balance_delta(tx_type, item.amount)
        imported_ids.append(str(tx.id))

    # Update account balance atomically
    account.balance = Decimal(str(account.balance or 0)) + balance_change

    # Store receipt audit record
    if imported_ids:
        receipt = Receipt(
            user_id=uid,
            transaction_id=UUID(imported_ids[0]),
            file_path=(payload.filename or "documento")[:255],
            mime_type="application/json",
            extracted_data={
                "document_type": payload.document_type,
                "statement_month": payload.statement_month,
                "imported_count": len(imported_ids),
                "skipped_duplicates": skipped_duplicates,
            },
        )
        db.add(receipt)
        run_proactive_review(db, uid, lookback_days=60)
    db.commit()

    return {
        "imported": len(imported_ids),
        "skipped_duplicates": skipped_duplicates,
        "statement_month": payload.statement_month,
        "transaction_ids": imported_ids,
        "new_account_balance": float(account.balance),
    }


@router.post("/chat")
async def ai_chat(
    payload: ChatRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Conversational AI assistant grounded in the user's real financial data."""
    uid = parse_uuid(user_id, "user_id")
    today = date.today()
    month_start = date(today.year, today.month, 1)
    next_month = date(today.year + 1, 1, 1) if today.month == 12 else date(today.year, today.month + 1, 1)

    accounts = (
        db.query(Account)
        .filter(Account.user_id == uid, Account.deleted_at.is_(None))
        .all()
    )
    total_balance = sum(float(a.balance or 0) for a in accounts)

    month_txs = (
        db.query(Transaction)
        .filter(
            and_(
                Transaction.user_id == uid,
                Transaction.deleted_at.is_(None),
                Transaction.transaction_date >= month_start,
                Transaction.transaction_date < next_month,
            )
        )
        .all()
    )
    month_income = sum(float(t.amount) for t in month_txs if t.type == TransactionType.INCOME)
    month_expenses = sum(float(t.amount) for t in month_txs if t.type == TransactionType.EXPENSE)

    cat_rows = (
        db.query(Category.name, func.coalesce(func.sum(Transaction.amount), 0))
        .select_from(Transaction)
        .join(TransactionCategory, TransactionCategory.transaction_id == Transaction.id)
        .join(Category, Category.id == TransactionCategory.category_id)
        .filter(
            and_(
                Transaction.user_id == uid,
                Transaction.type == TransactionType.EXPENSE,
                Transaction.deleted_at.is_(None),
                Transaction.transaction_date >= month_start,
                Transaction.transaction_date < next_month,
            )
        )
        .group_by(Category.name)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(5)
        .all()
    )
    top_categories = [{"category": name, "total": float(tot)} for name, tot in cat_rows]

    budgets = db.query(Budget).filter(Budget.user_id == uid, Budget.is_active.is_(True)).all()
    cat_spent_map = {c["category"].lower(): c["total"] for c in top_categories}
    budget_summaries = []
    for b in budgets:
        spent = cat_spent_map.get(b.category.lower(), 0.0)
        limit_val = float(b.limit_amount)
        pct = round((spent / limit_val * 100), 1) if limit_val > 0 else 0.0
        level = "exceeded" if pct >= 100 else ("warning" if pct >= 80 else "ok")
        budget_summaries.append({
            "category": b.category,
            "spent": spent,
            "limit": limit_val,
            "pct": pct,
            "alert_level": level,
        })

    goals = db.query(Goal).filter(Goal.user_id == uid, Goal.is_active.is_(True)).all()
    goal_summaries = [
        {
            "name": g.name,
            "current": float(g.current_amount or 0),
            "target": float(g.target_amount),
            "pct": round(float(g.current_amount or 0) / float(g.target_amount) * 100, 1) if float(g.target_amount) > 0 else 0.0,
        }
        for g in goals
    ]

    # Enrich with B3 Investments Portfolio + Dividends 12m
    inv_assets = (
        db.query(InvestmentAsset)
        .filter(
            InvestmentAsset.user_id == uid,
            InvestmentAsset.deleted_at.is_(None),
            InvestmentAsset.quantity > 0,
        )
        .all()
    )
    tickers = [a.ticker for a in inv_assets]
    quote_map: dict[str, MarketQuoteCache] = {}
    if tickers:
        cached_quotes = (
            db.query(MarketQuoteCache)
            .filter(MarketQuoteCache.ticker.in_(tickers))
            .all()
        )
        quote_map = {q.ticker: q for q in cached_quotes}

    cutoff_12m = date(today.year - 1, today.month, min(today.day, 28))
    inv_divs_12m = (
        db.query(InvestmentDividend)
        .filter(
            InvestmentDividend.user_id == uid,
            InvestmentDividend.payment_date >= cutoff_12m,
        )
        .all()
    )
    div_by_asset: dict[UUID, float] = {}
    for d in inv_divs_12m:
        div_by_asset[d.asset_id] = div_by_asset.get(d.asset_id, 0.0) + float(d.total_amount or 0)

    inv_total_value = 0.0
    inv_total_cost = 0.0
    inv_by_class: dict[str, float] = {}
    inv_positions = []
    for a in inv_assets:
        qty = float(a.quantity or 0)
        avg = float(a.average_price or 0)
        q = quote_map.get(a.ticker)
        curr = float(q.price) if (q and float(q.price or 0) > 0 and a.asset_class != "fixed_income") else avg
        val = qty * curr
        cost = qty * avg
        gain_pct = round(((val - cost) / cost * 100), 2) if cost > 0 else 0.0
        inv_total_value += val
        inv_total_cost += cost
        inv_by_class[a.asset_class] = inv_by_class.get(a.asset_class, 0.0) + val
        inv_positions.append({
            "ticker": a.ticker,
            "class": a.asset_class,
            "qty": round(qty, 4),
            "avg_price": round(avg, 2),
            "current_price": round(curr, 2),
            "value": round(val, 2),
            "gain_pct": gain_pct,
            "dy_12m": float(q.dy_12m) if (q and q.dy_12m is not None) else None,
            "dividends_12m": round(div_by_asset.get(a.id, 0.0), 2),
        })
    inv_positions.sort(key=lambda x: x["value"], reverse=True)
    total_dividends_12m = round(sum(div_by_asset.values()), 2)

    # Annual Cashflow + Emergency Reserve context (YTD)
    year_start = date(today.year, 1, 1)
    ytd_txs = (
        db.query(Transaction.type, func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            and_(
                Transaction.user_id == uid,
                Transaction.deleted_at.is_(None),
                Transaction.transaction_date >= year_start,
                Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]),
            )
        )
        .group_by(Transaction.type)
        .all()
    )
    ytd_map = {t.value if hasattr(t, "value") else str(t): float(s) for t, s in ytd_txs}
    ytd_income = ytd_map.get("income", 0.0)
    ytd_expenses = ytd_map.get("expense", 0.0)
    avg_monthly_exp = round(ytd_expenses / max(today.month, 1), 2)
    savings_rate_ytd = round(((ytd_income - ytd_expenses) / ytd_income * 100), 1) if ytd_income > 0 else 0.0
    emergency_months = round((total_balance + inv_by_class.get("fixed_income", 0.0)) / avg_monthly_exp, 1) if avg_monthly_exp > 0 else 0.0

    pluggy_linked_count = (
        db.query(OFLinkedAccount)
        .filter(OFLinkedAccount.user_id == uid, OFLinkedAccount.provider == "pluggy", OFLinkedAccount.is_active.is_(True))
        .count()
    )

    context = {
        "current_month": today.strftime("%m/%Y"),
        "total_balance": round(total_balance, 2),
        "net_worth_total": round(total_balance + inv_total_value, 2),
        "month_income": round(month_income, 2),
        "month_expenses": round(month_expenses, 2),
        "cashflow_ytd": {
            "year": today.year,
            "ytd_income": round(ytd_income, 2),
            "ytd_expenses": round(ytd_expenses, 2),
            "avg_monthly_expense": avg_monthly_exp,
            "savings_rate_pct": savings_rate_ytd,
            "emergency_reserve_months": emergency_months,
        },
        "accounts": [{"name": a.name, "type": a.type.value if hasattr(a.type, "value") else str(a.type), "balance": float(a.balance or 0)} for a in accounts],
        "open_finance_pluggy_accounts": pluggy_linked_count,
        "top_categories": top_categories,
        "budgets": budget_summaries,
        "goals": goal_summaries,
        "investments": {
            "total_value": round(inv_total_value, 2),
            "total_cost": round(inv_total_cost, 2),
            "total_gain_pct": round(((inv_total_value - inv_total_cost) / inv_total_cost * 100), 2) if inv_total_cost > 0 else 0.0,
            "dividends_12m": total_dividends_12m,
            "monthly_avg_dividends": round(total_dividends_12m / 12.0, 2),
            "yoc_pct": round((total_dividends_12m / inv_total_cost * 100), 2) if inv_total_cost > 0 else 0.0,
            "allocation_by_class": {k: round(v, 2) for k, v in inv_by_class.items()},
            "top_assets": inv_positions[:12],
        },
    }

    return await chat_with_financial_context(
        message=payload.message,
        context=context,
        history=[m.model_dump() for m in payload.history],
    )


@router.post("/voice-transaction")
async def voice_transaction(
    audio: Optional[UploadFile] = File(default=None),
    transcript: Optional[str] = Form(default=None),
    account_id: Optional[str] = Form(default=None),
    auto_save: bool = Form(default=False),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Parse a spoken Portuguese expense/income (audio file or transcript) and optionally save immediately."""
    uid = parse_uuid(user_id, "user_id")
    audio_bytes = await audio.read() if audio is not None else None
    if audio_bytes and len(audio_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Áudio excede 10 MB.")
    if not audio_bytes and not (transcript or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Envie um áudio ou transcrição de voz.")

    categories = ensure_default_categories(db, uid)
    cat_names = [c.name for c in categories]
    accounts = (
        db.query(Account)
        .filter(Account.user_id == uid, Account.deleted_at.is_(None))
        .order_by(Account.is_default.desc(), Account.created_at.asc())
        .all()
    )

    try:
        parsed = await parse_voice_transaction(
            audio_bytes=audio_bytes,
            mime_type=audio.content_type if audio else None,
            transcript_text=transcript,
            user_categories=cat_names,
            user_accounts=[a.name for a in accounts],
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    # Apply user's auto-categorization & internal-transfer rules
    active_rules = load_active_rules(db, uid)
    matched_rule = match_user_rule(active_rules, parsed["description"], parsed.get("merchant_name"))
    if matched_rule is not None:
        if matched_rule.action == "mark_transfer":
            parsed["type"] = "transfer"
        elif matched_rule.action == "categorize" and matched_rule.category_name:
            parsed["category_name"] = matched_rule.category_name
    elif parsed["type"] in ("expense", "income") and is_internal_transfer_text(
        parsed["description"], parsed.get("merchant_name")
    ):
        parsed["type"] = "transfer"

    # Resolve target account (explicit -> hint match -> default account)
    target_acct: Optional[Account] = None
    if account_id:
        aid = parse_uuid(account_id, "account_id")
        target_acct = next((a for a in accounts if a.id == aid), None)
    if target_acct is None and parsed.get("account_hint"):
        hint = parsed["account_hint"].lower()
        target_acct = next((a for a in accounts if hint in a.name.lower() or a.name.lower() in hint), None)
    if target_acct is None and accounts:
        target_acct = accounts[0]

    parsed["account_id"] = str(target_acct.id) if target_acct else None
    parsed["account_name"] = target_acct.name if target_acct else None

    saved_id = None
    if auto_save:
        if target_acct is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Crie uma conta antes de lançar por voz.")
        try:
            tx_type = TransactionType(parsed["type"])
        except ValueError:
            tx_type = TransactionType.EXPENSE
        try:
            tx_date = date.fromisoformat(parsed["transaction_date"])
        except ValueError:
            tx_date = date.today()
        amt_dec = Decimal(f"{float(parsed['amount']):.2f}")
        inst_tot = parsed.get("installment_total")
        tx = Transaction(
            user_id=uid,
            account_id=target_acct.id,
            type=tx_type,
            amount=amt_dec,
            currency=target_acct.currency or "BRL",
            description=parsed["description"][:255],
            merchant_name=(parsed.get("merchant_name") or "")[:255] or None,
            notes="Lançado por Voz · Mony IA",
            transaction_date=tx_date,
            statement_month=tx_date.strftime("%Y-%m"),
            payment_method=parsed.get("payment_method") or "other",
            installment_number=1 if inst_tot else None,
            installment_total=inst_tot,
            source="manual",
        )
        db.add(tx)
        db.flush()
        cat = _resolve_category(db, uid, category_name=parsed["category_name"])
        if cat is not None:
            _set_transaction_category(db, tx, cat)
        target_acct.balance = Decimal(str(target_acct.balance or 0)) + _balance_delta(tx_type, amt_dec)
        if matched_rule is not None:
            matched_rule.matches_count = int(matched_rule.matches_count or 0) + 1
        db.commit()
        saved_id = str(tx.id)

    return {
        "parsed": parsed,
        "saved": bool(saved_id),
        "transaction_id": saved_id,
    }


# ============ Story 7.3: AI 2026 Financial Spreadsheet Importer (Google Sheets / .xlsx) ============


class SpreadsheetItemInput(BaseModel):
    description: str = Field(min_length=1, max_length=255)
    merchant_name: Optional[str] = None
    type: str = "expense"
    amount: Decimal = Field(gt=0)
    category_name: str = "Outros"
    payment_method: Optional[str] = "other"
    payment_account_label: Optional[str] = None
    transaction_date: date
    original_purchase_date: Optional[date] = None
    statement_month: str = Field(pattern=r"^\d{4}-\d{2}$")
    installment_number: Optional[int] = Field(default=None, ge=1)
    installment_total: Optional[int] = Field(default=None, ge=1)
    is_recurring: bool = False
    is_reconciled: bool = True


class SpreadsheetImportRequest(BaseModel):
    account_id: str
    auto_create_categories: bool = True
    auto_create_accounts: bool = True
    auto_register_recurring: bool = True
    skip_duplicates: bool = True
    items: List[SpreadsheetItemInput] = Field(min_length=1)


@router.post("/analyze-spreadsheet")
async def analyze_spreadsheet_endpoint(
    sheets_url: Optional[str] = Form(default=None),
    year: int = Form(default=2026),
    months: Optional[str] = Form(default=None),
    file: Optional[UploadFile] = File(default=None),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Analyze a multi-month 2026 financial spreadsheet via public Google Sheets URL
    or uploaded .xlsx file (EPIC-007 Story 7.3).
    """
    from services.spreadsheet_importer import download_google_sheet_xlsx, parse_2026_spreadsheet

    uid = parse_uuid(user_id, "user_id")
    xlsx_bytes: Optional[bytes] = None
    source_name = "planilha-2026.xlsx"

    if file is not None:
        raw = await file.read()
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Arquivo excede o limite de 10 MB.")
        if not raw.startswith(b"PK"):
            raise HTTPException(status_code=400, detail="Envie um arquivo Excel (.xlsx) válido ou cole o link do Google Sheets.")
        xlsx_bytes = raw
        source_name = file.filename or source_name
    elif sheets_url and sheets_url.strip():
        try:
            xlsx_bytes = download_google_sheet_xlsx(sheets_url.strip())
            source_name = "Google Sheets"
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    else:
        raise HTTPException(status_code=400, detail="Informe o link do Google Sheets ou envie um arquivo .xlsx.")

    selected_months: Optional[list[int]] = None
    if months and months.strip():
        try:
            selected_months = [int(x.strip()) for x in months.split(",") if x.strip() and 1 <= int(x.strip()) <= 12]
        except ValueError:
            selected_months = None

    try:
        parsed = parse_2026_spreadsheet(xlsx_bytes, year=year, selected_months=selected_months)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Não foi possível ler a planilha: {exc}") from exc

    # Annotate potential duplicates per statement_month
    fps_by_month: dict[str, set[tuple]] = {}
    dup_count = 0
    for item in parsed["items"]:
        sm = item["statement_month"]
        if sm not in fps_by_month:
            fps_by_month[sm] = _existing_month_fingerprints(db, uid, sm)
        item_fps = _tx_fingerprints(
            item["description"],
            item.get("merchant_name"),
            item["amount"],
            item.get("installment_number"),
            item.get("transaction_date"),
        )
        is_dup = bool(item_fps & fps_by_month[sm])
        item["is_duplicate"] = is_dup
        if is_dup:
            dup_count += 1

    parsed["source_name"] = source_name
    parsed["duplicates_detected"] = dup_count
    return parsed


@router.post("/import-spreadsheet", status_code=status.HTTP_201_CREATED)
async def import_spreadsheet_endpoint(
    payload: SpreadsheetImportRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Batch-import reviewed spreadsheet entries (incomes + expenses) across multiple
    months, optionally auto-creating missing categories, payment accounts, and
    infinite (∞) recurring rules (EPIC-007 Story 7.3).
    """
    from uuid import uuid4
    from database.models import AccountType, RecurringRule

    uid = parse_uuid(user_id, "user_id")
    default_aid = parse_uuid(payload.account_id, "account_id")
    default_acct = (
        db.query(Account)
        .filter(Account.id == default_aid, Account.user_id == uid, Account.deleted_at.is_(None))
        .first()
    )
    if not default_acct:
        raise HTTPException(status_code=404, detail="Conta padrão não encontrada.")

    ensure_default_categories(db, uid)
    cat_cache: dict[str, Category] = {
        c.name.lower(): c
        for c in db.query(Category).filter(Category.user_id == uid, Category.deleted_at.is_(None)).all()
    }
    acct_cache: dict[str, Account] = {
        a.name.lower(): a
        for a in db.query(Account).filter(Account.user_id == uid, Account.deleted_at.is_(None)).all()
    }
    existing_rec_sigs: set[str] = {
        (r.detection_signature or "").lower()
        for r in db.query(RecurringRule).filter(RecurringRule.user_id == uid, RecurringRule.deleted_at.is_(None)).all()
    }

    CAT_COLORS = ["#0072B2", "#009E73", "#E69F00", "#CC79A7", "#56B4E9", "#D55E00", "#6366F1", "#10B981"]
    fps_by_month: dict[str, set[tuple]] = {}
    imported = 0
    skipped = 0
    created_categories = 0
    created_accounts = 0
    created_recurrences = 0

    for item in payload.items:
        sm = item.statement_month
        if sm not in fps_by_month:
            fps_by_month[sm] = _existing_month_fingerprints(db, uid, sm)

        item_fps = _tx_fingerprints(
            item.description,
            item.merchant_name,
            item.amount,
            item.installment_number,
            item.transaction_date,
        )
        if payload.skip_duplicates and (item_fps & fps_by_month[sm]):
            skipped += 1
            continue

        # Resolve or create target account from payment_account_label (e.g. 'Cartão Bradesco', 'Cartão XP', 'Sofisa')
        target_acct = default_acct
        if payload.auto_create_accounts and item.payment_account_label:
            label = re.sub(r"\s+", " ", item.payment_account_label).strip()
            low_label = label.lower()
            if low_label not in ("pix", "boleto", "dinheiro", "transferência", "transferencia", "débito", "debito"):
                matched_acct = acct_cache.get(low_label)
                if matched_acct is None:
                    matched_acct = next((a for k, a in acct_cache.items() if low_label in k or k in low_label), None)
                if matched_acct is None:
                    is_cc = "cart" in low_label or "xp" in low_label or "bradesco" in low_label or "sofisa" in low_label
                    matched_acct = Account(
                        id=uuid4(),
                        user_id=uid,
                        name=label[:100],
                        type=AccountType.CREDIT_CARD if is_cc else AccountType.CHECKING,
                        balance=Decimal("0.00"),
                        currency="BRL",
                        icon="💳" if is_cc else "🏦",
                        color="#6366F1" if is_cc else "#0071E3",
                        is_default=False,
                    )
                    db.add(matched_acct)
                    db.flush()
                    acct_cache[low_label] = matched_acct
                    created_accounts += 1
                target_acct = matched_acct

        # Resolve or create category
        cat_name = (item.category_name or "Outros").strip()[:100]
        cat_obj = cat_cache.get(cat_name.lower())
        if cat_obj is None and payload.auto_create_categories:
            slug = re.sub(r"[^a-z0-9]+", "-", cat_name.lower()).strip("-")[:80] or f"cat-{len(cat_cache)+1}"
            # Avoid slug collision
            if any((c.slug or "") == slug for c in cat_cache.values()):
                slug = f"{slug}-{len(cat_cache)+1}"
            cat_obj = Category(
                id=uuid4(),
                user_id=uid,
                name=cat_name,
                slug=slug,
                color=CAT_COLORS[len(cat_cache) % len(CAT_COLORS)],
                icon="🏷️",
                is_system=False,
            )
            db.add(cat_obj)
            db.flush()
            cat_cache[cat_name.lower()] = cat_obj
            created_categories += 1
        if cat_obj is None:
            cat_obj = cat_cache.get("outros")

        try:
            tx_type = TransactionType(item.type)
        except ValueError:
            tx_type = TransactionType.EXPENSE

        amt_dec = Decimal(f"{float(item.amount):.2f}")
        tx = Transaction(
            id=uuid4(),
            user_id=uid,
            account_id=target_acct.id,
            type=tx_type,
            amount=amt_dec,
            currency=target_acct.currency or "BRL",
            description=item.description.strip()[:255],
            merchant_name=(item.merchant_name or item.description).strip()[:255],
            notes=f"Importado da Planilha 2026 ({item.payment_account_label})" if item.payment_account_label else "Importado da Planilha 2026",
            transaction_date=item.transaction_date,
            original_purchase_date=item.original_purchase_date or item.transaction_date,
            statement_month=sm,
            payment_method=item.payment_method or "other",
            installment_number=item.installment_number,
            installment_total=item.installment_total,
            is_recurring=item.is_recurring,
            is_reconciled=item.is_reconciled,
            source="spreadsheet",
            origin_metadata={
                "provider": "spreadsheet_2026",
                "payment_account_label": item.payment_account_label,
                "statement_month": sm,
            },
        )
        db.add(tx)
        db.flush()
        if cat_obj is not None:
            _set_transaction_category(db, tx, cat_obj)

        target_acct.balance = Decimal(str(target_acct.balance or 0)) + _balance_delta(tx_type, amt_dec)
        fps_by_month[sm].update(item_fps)
        imported += 1

        # Auto-register infinite (∞) recurring items once
        if payload.auto_register_recurring and item.is_recurring:
            sig = f"sheet:{tx_type.value}:{_norm_fp_text(item.description)[:40]}"
            if sig not in existing_rec_sigs:
                existing_rec_sigs.add(sig)
                db.add(
                    RecurringRule(
                        id=uuid4(),
                        user_id=uid,
                        account_id=target_acct.id,
                        type=tx_type,
                        amount=amt_dec,
                        description=item.description.strip()[:255],
                        merchant_name=(item.merchant_name or item.description).strip()[:255],
                        category_name=cat_obj.name if cat_obj else cat_name,
                        payment_method=item.payment_method or "other",
                        frequency="monthly",
                        day_of_month=min(28, max(1, item.transaction_date.day)),
                        is_active=True,
                        auto_create=False,
                        source="spreadsheet",
                        detection_signature=sig,
                    )
                )
                created_recurrences += 1

    if imported > 0:
        run_proactive_review(db, uid, lookback_days=120)

    db.commit()
    return {
        "imported": imported,
        "skipped_duplicates": skipped,
        "created_categories": created_categories,
        "created_accounts": created_accounts,
        "created_recurrences": created_recurrences,
    }
