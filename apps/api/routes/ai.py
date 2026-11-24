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

        cat = _resolve_category(db, uid, category_name=item.category_name or "Outros")
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

    context = {
        "current_month": today.strftime("%m/%Y"),
        "total_balance": round(total_balance, 2),
        "month_income": round(month_income, 2),
        "month_expenses": round(month_expenses, 2),
        "accounts": [{"name": a.name, "type": a.type.value if hasattr(a.type, "value") else str(a.type), "balance": float(a.balance or 0)} for a in accounts],
        "top_categories": top_categories,
        "budgets": budget_summaries,
        "goals": goal_summaries,
    }

    return await chat_with_financial_context(
        message=payload.message,
        context=context,
        history=[m.model_dump() for m in payload.history],
    )
