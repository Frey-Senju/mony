"""
Transaction endpoints for Mony API.

Provides CRUD operations for financial transactions with filtering, pagination,
plan limits, category persistence (linking TransactionCategory so Budgets,
Reports, and AI Insights work end-to-end), automatic Account balance sync, and
bulk categorization.
"""

import calendar
from datetime import date, datetime
from decimal import Decimal
import re
from typing import Optional
import unicodedata
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, desc, func, or_
from sqlalchemy.orm import Session, joinedload

from database.base import get_db
from database.models import (
    Account,
    Category,
    Transaction,
    TransactionCategory,
    TransactionType,
    User,
    UserPlan,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/transactions", tags=["transactions"])


# ============ Balance & Category Helpers ============


def _balance_delta(tx_type: TransactionType, amount: Decimal) -> Decimal:
    """Return signed delta to apply to Account.balance for a transaction."""
    if tx_type in (TransactionType.INCOME, TransactionType.REFUND):
        return amount
    if tx_type in (TransactionType.EXPENSE, TransactionType.INVESTMENT):
        return -amount
    return Decimal("0.00")


def _resolve_category(
    db: Session,
    user_id: UUID,
    category_id: Optional[str] = None,
    category_name: Optional[str] = None,
) -> Optional[Category]:
    """Find a user's Category by UUID or case-insensitive name."""
    if category_id:
        try:
            cid = UUID(str(category_id))
            cat = (
                db.query(Category)
                .filter(
                    Category.id == cid,
                    Category.user_id == user_id,
                    Category.deleted_at.is_(None),
                )
                .first()
            )
            if cat:
                return cat
        except ValueError:
            # Allow graceful fallback if a legacy local id is passed alongside category_name
            pass

    if category_name:
        return (
            db.query(Category)
            .filter(
                Category.user_id == user_id,
                func.lower(Category.name) == category_name.strip().lower(),
                Category.deleted_at.is_(None),
            )
            .first()
        )
    return None


def _set_transaction_category(
    db: Session,
    transaction: Transaction,
    category: Optional[Category],
) -> None:
    """Replace the primary TransactionCategory link for a transaction."""
    db.query(TransactionCategory).filter(
        TransactionCategory.transaction_id == transaction.id
    ).delete()
    if category is not None:
        db.add(
            TransactionCategory(
                transaction_id=transaction.id,
                category_id=category.id,
                percentage=Decimal("100.00"),
            )
        )


def _serialize_transaction(tx: Transaction) -> "TransactionResponse":
    primary_cat: Optional[Category] = None
    if tx.categories:
        primary_cat = tx.categories[0].category

    return TransactionResponse(
        id=tx.id,
        user_id=tx.user_id,
        account_id=tx.account_id,
        type=tx.type,
        amount=tx.amount,
        currency=tx.currency or "BRL",
        description=tx.description,
        notes=tx.notes,
        transaction_date=tx.transaction_date,
        merchant_name=tx.merchant_name,
        is_recurring=bool(tx.is_recurring),
        recurring_pattern=tx.recurring_pattern,
        is_reconciled=bool(tx.is_reconciled),
        source=tx.source or "manual",
        external_id=tx.external_id,
        payment_method=tx.payment_method,
        installment_number=tx.installment_number,
        installment_total=tx.installment_total,
        statement_month=tx.statement_month,
        original_purchase_date=tx.original_purchase_date,
        category_id=primary_cat.id if primary_cat else None,
        category_name=primary_cat.name if primary_cat else None,
        category_color=primary_cat.color if primary_cat else None,
        category_icon=primary_cat.icon if primary_cat else None,
        user_edited=bool(getattr(tx, "user_edited", False)),
        origin_metadata=getattr(tx, "origin_metadata", None),
        created_at=tx.created_at,
        updated_at=tx.updated_at,
    )


# ============ Request/Response Models ============


class TransactionCreate(BaseModel):
    """Create transaction request."""

    account_id: str
    type: TransactionType
    amount: Decimal = Field(gt=0, decimal_places=2)
    currency: str = "BRL"
    description: str = Field(min_length=1, max_length=255)
    notes: Optional[str] = None
    transaction_date: date
    merchant_name: Optional[str] = None
    is_recurring: bool = False
    recurring_pattern: Optional[str] = None
    payment_method: Optional[str] = None
    installment_number: Optional[int] = Field(default=None, ge=1)
    installment_total: Optional[int] = Field(default=None, ge=1)
    statement_month: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    original_purchase_date: Optional[date] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None


class TransactionUpdate(BaseModel):
    """Update transaction request (100% of user-facing fields editable; origin/dedup fields stay immutable)."""

    account_id: Optional[str] = None
    type: Optional[TransactionType] = None
    amount: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    description: Optional[str] = Field(None, min_length=1, max_length=255)
    notes: Optional[str] = None
    transaction_date: Optional[date] = None
    merchant_name: Optional[str] = None
    is_recurring: Optional[bool] = None
    recurring_pattern: Optional[str] = None
    is_reconciled: Optional[bool] = None
    payment_method: Optional[str] = None
    installment_number: Optional[int] = Field(default=None, ge=1)
    installment_total: Optional[int] = Field(default=None, ge=1)
    statement_month: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    original_purchase_date: Optional[date] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None


class BulkCategorizeRequest(BaseModel):
    """Assign a single category to multiple transactions at once."""

    transaction_ids: list[str] = Field(min_length=1)
    category_id: Optional[str] = None
    category_name: Optional[str] = None


class TransactionResponse(BaseModel):
    """Transaction response model."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID | str
    user_id: UUID | str
    account_id: UUID | str
    type: TransactionType
    amount: Decimal
    currency: str
    description: str
    notes: Optional[str] = None
    transaction_date: date
    merchant_name: Optional[str] = None
    is_recurring: bool = False
    recurring_pattern: Optional[str] = None
    is_reconciled: bool = False
    source: str = "manual"
    external_id: Optional[str] = None
    payment_method: Optional[str] = None
    installment_number: Optional[int] = None
    installment_total: Optional[int] = None
    statement_month: Optional[str] = None
    original_purchase_date: Optional[date] = None
    category_id: Optional[UUID | str] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    category_icon: Optional[str] = None
    user_edited: bool = False
    origin_metadata: Optional[dict] = None
    created_at: datetime
    updated_at: datetime


class TransactionListResponse(BaseModel):
    """Transaction list response with pagination."""

    items: list[TransactionResponse]
    total: int
    offset: int
    limit: int


# ============ Endpoint 1: Create Transaction ============


@router.post("", response_model=TransactionResponse, status_code=201)
async def create_transaction(
    payload: TransactionCreate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Create new financial transaction, link category, and update account balance."""
    uid = parse_uuid(user_id, "user_id")
    aid = parse_uuid(payload.account_id, "account_id")

    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user.plan == UserPlan.BASIC:
        today = date.today()
        month_start = date(today.year, today.month, 1)
        next_month = today.month % 12 + 1
        next_year = today.year + (1 if today.month == 12 else 0)
        month_end = date(next_year, next_month, 1)
        current_month_tx = (
            db.query(Transaction)
            .filter(
                and_(
                    Transaction.user_id == uid,
                    Transaction.transaction_date >= month_start,
                    Transaction.transaction_date < month_end,
                    Transaction.deleted_at.is_(None),
                )
            )
            .count()
        )
        if current_month_tx >= 100:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Transaction limit reached for this month (BASIC: 100/month)",
            )

    account = (
        db.query(Account)
        .filter(
            and_(
                Account.id == aid,
                Account.user_id == uid,
                Account.deleted_at.is_(None),
            )
        )
        .first()
    )
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found or not owned by user",
        )

    transaction = Transaction(
        user_id=uid,
        account_id=aid,
        type=payload.type,
        amount=payload.amount,
        currency=payload.currency,
        description=payload.description,
        notes=payload.notes,
        transaction_date=payload.transaction_date,
        merchant_name=payload.merchant_name,
        is_recurring=payload.is_recurring,
        recurring_pattern=payload.recurring_pattern,
        payment_method=payload.payment_method,
        installment_number=payload.installment_number,
        installment_total=payload.installment_total,
        statement_month=payload.statement_month,
        original_purchase_date=payload.original_purchase_date,
    )
    db.add(transaction)
    db.flush()

    category = _resolve_category(
        db,
        uid,
        category_id=payload.category_id,
        category_name=payload.category_name,
    )
    if category is not None:
        _set_transaction_category(db, transaction, category)

    # Keep account balance synchronized
    current_bal = Decimal(str(account.balance or 0))
    account.balance = current_bal + _balance_delta(payload.type, payload.amount)

    # Proactive AI review on newly registered transactions (Story 5.3)
    try:
        from services.ai_review_engine import run_proactive_review
        run_proactive_review(db, uid, lookback_days=45)
    except Exception:  # noqa: BLE001
        pass

    db.commit()
    db.refresh(transaction)

    tx = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(Transaction.id == transaction.id)
        .first()
    )
    return _serialize_transaction(tx or transaction)


# ============ Endpoint 2: List Transactions ============


def _month_bounds(ym: str) -> tuple[date, date]:
    """Return inclusive ``(first_day, last_day)`` for a ``YYYY-MM`` string."""
    y_str, m_str = ym.split("-")
    y, m = int(y_str), int(m_str)
    last_day = calendar.monthrange(y, m)[1]
    return date(y, m, 1), date(y, m, last_day)


def _shift_month(ym: str, delta: int) -> str:
    """Shift a ``YYYY-MM`` string by ``delta`` months."""
    y_str, m_str = ym.split("-")
    total = int(y_str) * 12 + (int(m_str) - 1) + delta
    ny, nm = divmod(total, 12)
    return f"{ny:04d}-{nm + 1:02d}"


def _month_filter_clause(ym: str):
    """Match transactions explicitly tagged with ``statement_month`` OR dated inside ``ym``."""
    m_start, m_end = _month_bounds(ym)
    return or_(
        Transaction.statement_month == ym,
        and_(
            Transaction.statement_month.is_(None),
            Transaction.transaction_date >= m_start,
            Transaction.transaction_date <= m_end,
        ),
    )


def _norm_installment_key(text: str) -> str:
    """Normalize merchant/description by stripping accents and installment markers like '(3/10)'."""
    s = re.sub(r"\(\s*\d{1,2}\s*/\s*\d{1,2}\s*\)", "", text or "")
    s = re.sub(r"(?:parcela|parc\.?)\s*\d{1,2}\s*(?:/|de)\s*\d{1,2}", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\b\d{1,2}\s*/\s*\d{1,2}\b", "", s)
    nfkd = unicodedata.normalize("NFKD", s.lower())
    cleaned = "".join(c for c in nfkd if not unicodedata.combining(c))
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned).strip()
    return cleaned[:60] or "parcelamento"


_PT_MONTH_SHORT = [
    "", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    user_id: str = Depends(get_current_user_from_header),
    account_id: Optional[str] = Query(None, description="Filter by account ID"),
    category_id: Optional[str] = Query(None, description="Filter by category ID"),
    type: Optional[TransactionType] = Query(None, description="Filter by transaction type"),
    payment_method: Optional[str] = Query(None, description="Filter by payment method (credit_card, pix, boleto, etc.)"),
    statement_month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$", description="Filter by billing/competency month (YYYY-MM)"),
    start_date: Optional[date] = Query(None, description="Filter transactions from this date"),
    end_date: Optional[date] = Query(None, description="Filter transactions until this date"),
    search: Optional[str] = Query(None, description="Search in description or merchant_name"),
    is_reconciled: Optional[bool] = Query(None, description="Filter by reconciliation status"),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    order_by: str = Query("-transaction_date", description="Field to sort by (desc: -field)"),
    db: Session = Depends(get_db),
):
    """List active user transactions with filtering, sorting, and pagination."""
    uid = parse_uuid(user_id, "user_id")
    query = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(Transaction.user_id == uid, Transaction.deleted_at.is_(None))
    )

    if account_id:
        query = query.filter(Transaction.account_id == parse_uuid(account_id, "account_id"))

    if category_id:
        cid = parse_uuid(category_id, "category_id")
        query = query.join(TransactionCategory).filter(TransactionCategory.category_id == cid)

    if type:
        query = query.filter(Transaction.type == type)

    if payment_method:
        query = query.filter(Transaction.payment_method == payment_method)

    if statement_month:
        query = query.filter(_month_filter_clause(statement_month))

    if start_date:
        query = query.filter(Transaction.transaction_date >= start_date)

    if end_date:
        query = query.filter(Transaction.transaction_date <= end_date)

    if search:
        query = query.filter(
            or_(
                Transaction.description.ilike(f"%{search}%"),
                Transaction.merchant_name.ilike(f"%{search}%"),
            )
        )

    if is_reconciled is not None:
        query = query.filter(Transaction.is_reconciled == is_reconciled)

    total = query.count()

    if order_by.startswith("-"):
        field_name = order_by[1:]
        query = query.order_by(desc(getattr(Transaction, field_name, Transaction.transaction_date)))
    else:
        query = query.order_by(getattr(Transaction, order_by, Transaction.transaction_date))

    transactions = query.offset(offset).limit(limit).all()

    return TransactionListResponse(
        items=[_serialize_transaction(tx) for tx in transactions],
        total=total,
        offset=offset,
        limit=limit,
    )


# ============ Endpoint 2a: Month Summary & Payment Breakdown ============


@router.get("/summary/month")
async def get_month_summary(
    month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$", description="Competency month YYYY-MM"),
    account_id: Optional[str] = Query(None, description="Optional account filter"),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Exact monthly summary (independent of list pagination) + payment method breakdown."""
    uid = parse_uuid(user_id, "user_id")
    target_month = month or date.today().strftime("%Y-%m")
    prev_month = _shift_month(target_month, -1)

    def _fetch_month_txs(ym: str) -> list[Transaction]:
        q = db.query(Transaction).filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            _month_filter_clause(ym),
        )
        if account_id:
            q = q.filter(Transaction.account_id == parse_uuid(account_id, "account_id"))
        return q.all()

    cur_txs = _fetch_month_txs(target_month)
    prev_txs = _fetch_month_txs(prev_month)

    total_income = sum(float(t.amount) for t in cur_txs if t.type == TransactionType.INCOME)
    total_expenses = sum(float(t.amount) for t in cur_txs if t.type == TransactionType.EXPENSE)
    total_refunds = sum(float(t.amount) for t in cur_txs if t.type == TransactionType.REFUND)
    prev_income = sum(float(t.amount) for t in prev_txs if t.type == TransactionType.INCOME)
    prev_expenses = sum(float(t.amount) for t in prev_txs if t.type == TransactionType.EXPENSE)

    pm_totals: dict[str, dict[str, float | int]] = {}
    installment_total = 0.0
    installment_count = 0
    for t in cur_txs:
        if t.type == TransactionType.EXPENSE:
            pm = t.payment_method or "other"
            if pm not in pm_totals:
                pm_totals[pm] = {"total": 0.0, "count": 0}
            pm_totals[pm]["total"] = round(float(pm_totals[pm]["total"]) + float(t.amount), 2)
            pm_totals[pm]["count"] = int(pm_totals[pm]["count"]) + 1
            if t.installment_number and t.installment_total and t.installment_total > 1:
                installment_total += float(t.amount)
                installment_count += 1

    by_payment_method = [
        {"payment_method": pm, "total": vals["total"], "count": vals["count"]}
        for pm, vals in sorted(pm_totals.items(), key=lambda kv: float(kv[1]["total"]), reverse=True)
    ]

    return {
        "month": target_month,
        "previous_month": prev_month,
        "total_income": round(total_income, 2),
        "total_expenses": round(total_expenses, 2),
        "total_refunds": round(total_refunds, 2),
        "net": round(total_income - total_expenses + total_refunds, 2),
        "transaction_count": len(cur_txs),
        "previous_month_income": round(prev_income, 2),
        "previous_month_expenses": round(prev_expenses, 2),
        "previous_month_count": len(prev_txs),
        "installment_expenses": round(installment_total, 2),
        "installment_count": installment_count,
        "by_payment_method": by_payment_method,
    }


# ============ Endpoint 2b: Installments Future Projection ============


@router.get("/installments/projection")
async def get_installments_projection(
    start_month: Optional[str] = Query(None, pattern=r"^\d{4}-\d{2}$"),
    months: int = Query(6, ge=1, le=24),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Project future credit-card / installment commitments based on active
    installment transactions (e.g., 3/10 in Nov projects 4/10..10/10 ahead).
    """
    uid = parse_uuid(user_id, "user_id")
    base_month = start_month or date.today().strftime("%Y-%m")
    window = [_shift_month(base_month, i) for i in range(months)]
    window_set = set(window)

    txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            Transaction.type == TransactionType.EXPENSE,
            Transaction.installment_number.isnot(None),
            Transaction.installment_total.isnot(None),
            Transaction.installment_total > 1,
        )
        .all()
    )

    # Group into unique installment chains to avoid double-counting when multiple
    # monthly statements for the same purchase have already been imported.
    chains: dict[tuple[str, float, int], list[tuple[str, Transaction]]] = {}
    for tx in txs:
        ym = tx.statement_month or tx.transaction_date.strftime("%Y-%m")
        base_label = tx.merchant_name or tx.description
        key = (_norm_installment_key(base_label), round(float(tx.amount), 2), int(tx.installment_total or 1))
        chains.setdefault(key, []).append((ym, tx))

    bucket_items: dict[str, list[dict]] = {m: [] for m in window}
    active_chains_count = 0

    for (_norm_key, amt, total_inst), entries in chains.items():
        # Sort by (statement_month, installment_number)
        entries.sort(key=lambda pair: (pair[0], int(pair[1].installment_number or 0)))
        recorded_months: set[str] = set()
        chain_active_in_window = False

        for ym, tx in entries:
            recorded_months.add(ym)
            if ym in window_set:
                chain_active_in_window = True
                clean_desc = re.sub(r"\s*\(\d{1,2}/\d{1,2}\)\s*", "", tx.description or "").strip() or tx.description
                bucket_items[ym].append({
                    "description": clean_desc,
                    "merchant_name": tx.merchant_name,
                    "amount": amt,
                    "installment_number": int(tx.installment_number or 1),
                    "installment_total": total_inst,
                    "status": "recorded",
                    "payment_method": tx.payment_method or "credit_card",
                    "original_purchase_date": tx.original_purchase_date.isoformat() if tx.original_purchase_date else None,
                })

        # Project remaining installments forward from the latest recorded installment
        latest_ym, latest_tx = entries[-1]
        latest_num = int(latest_tx.installment_number or 1)
        clean_desc = re.sub(r"\s*\(\d{1,2}/\d{1,2}\)\s*", "", latest_tx.description or "").strip() or latest_tx.description

        for next_num in range(latest_num + 1, total_inst + 1):
            proj_ym = _shift_month(latest_ym, next_num - latest_num)
            if proj_ym in window_set and proj_ym not in recorded_months:
                chain_active_in_window = True
                bucket_items[proj_ym].append({
                    "description": clean_desc,
                    "merchant_name": latest_tx.merchant_name,
                    "amount": amt,
                    "installment_number": next_num,
                    "installment_total": total_inst,
                    "status": "projected",
                    "payment_method": latest_tx.payment_method or "credit_card",
                    "original_purchase_date": latest_tx.original_purchase_date.isoformat() if latest_tx.original_purchase_date else None,
                })

        if chain_active_in_window:
            active_chains_count += 1

    months_out = []
    total_future_committed = 0.0
    for ym in window:
        y_str, m_str = ym.split("-")
        label = f"{_PT_MONTH_SHORT[int(m_str)]}/{y_str}"
        items = sorted(bucket_items[ym], key=lambda i: float(i["amount"]), reverse=True)
        rec_total = round(sum(float(i["amount"]) for i in items if i["status"] == "recorded"), 2)
        proj_total = round(sum(float(i["amount"]) for i in items if i["status"] == "projected"), 2)
        tot = round(rec_total + proj_total, 2)
        total_future_committed = round(total_future_committed + tot, 2)
        months_out.append({
            "month": ym,
            "label": label,
            "recorded_total": rec_total,
            "projected_total": proj_total,
            "total_committed": tot,
            "installments_count": len(items),
            "items": items,
        })

    return {
        "base_month": base_month,
        "total_future_committed": total_future_committed,
        "active_chains_count": active_chains_count,
        "months": months_out,
    }


# ============ Endpoint 2b: Bulk Categorize ============


@router.post("/bulk-categorize", status_code=200)
async def bulk_categorize_transactions(
    payload: BulkCategorizeRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Assign a category to a batch of transactions owned by the authenticated user."""
    uid = parse_uuid(user_id, "user_id")
    category = _resolve_category(
        db,
        uid,
        category_id=payload.category_id,
        category_name=payload.category_name,
    )
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    tx_uuids = [parse_uuid(tid, "transaction_id") for tid in payload.transaction_ids]
    txs = (
        db.query(Transaction)
        .filter(
            Transaction.id.in_(tx_uuids),
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
        )
        .all()
    )

    for tx in txs:
        _set_transaction_category(db, tx, category)

    db.commit()
    return {"updated": len(txs), "category_id": str(category.id), "category_name": category.name}


# ============ Endpoint 3: Get Transaction ============


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(
    transaction_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Get single active transaction by ID."""
    uid = parse_uuid(user_id, "user_id")
    tid = parse_uuid(transaction_id, "transaction_id")

    transaction = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(
            and_(
                Transaction.id == tid,
                Transaction.user_id == uid,
                Transaction.deleted_at.is_(None),
            )
        )
        .first()
    )

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )

    return _serialize_transaction(transaction)


# ============ Endpoint 4: Update Transaction ============


@router.put("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: str,
    payload: TransactionUpdate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Update transaction fields, category link, and reconcile account balance delta."""
    uid = parse_uuid(user_id, "user_id")
    tid = parse_uuid(transaction_id, "transaction_id")

    transaction = (
        db.query(Transaction)
        .filter(
            and_(
                Transaction.id == tid,
                Transaction.user_id == uid,
                Transaction.deleted_at.is_(None),
            )
        )
        .first()
    )
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )

    old_type = transaction.type
    old_amount = Decimal(str(transaction.amount))
    old_account_id = transaction.account_id

    update_data = payload.model_dump(exclude_unset=True)
    cat_id_provided = "category_id" in update_data
    cat_name_provided = "category_name" in update_data
    raw_cat_id = update_data.pop("category_id", None)
    raw_cat_name = update_data.pop("category_name", None)
    raw_account_id = update_data.pop("account_id", None)

    if raw_account_id is not None:
        new_aid = parse_uuid(raw_account_id, "account_id")
        target_acct = (
            db.query(Account)
            .filter(Account.id == new_aid, Account.user_id == uid, Account.deleted_at.is_(None))
            .first()
        )
        if not target_acct:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target account not found")
        transaction.account_id = target_acct.id

    # Guard immutable origin / anti-dedup columns against accidental overwrite
    for immutable in ("source", "external_id", "dedup_hash", "origin_metadata"):
        update_data.pop(immutable, None)

    for field, value in update_data.items():
        setattr(transaction, field, value)

    if cat_id_provided or cat_name_provided:
        if raw_cat_id is None and raw_cat_name is None:
            _set_transaction_category(db, transaction, None)
        else:
            category = _resolve_category(db, uid, category_id=raw_cat_id, category_name=raw_cat_name)
            if category is not None:
                _set_transaction_category(db, transaction, category)

    # Reconcile account balance(s) atomically if account, amount, or type changed
    new_type = transaction.type
    new_amount = Decimal(str(transaction.amount))
    new_account_id = transaction.account_id
    if old_account_id != new_account_id:
        old_acct = db.query(Account).filter(Account.id == old_account_id).first()
        if old_acct is not None:
            old_acct.balance = Decimal(str(old_acct.balance or 0)) - _balance_delta(old_type, old_amount)
        new_acct = db.query(Account).filter(Account.id == new_account_id).first()
        if new_acct is not None:
            new_acct.balance = Decimal(str(new_acct.balance or 0)) + _balance_delta(new_type, new_amount)
    elif old_type != new_type or old_amount != new_amount:
        account = db.query(Account).filter(Account.id == transaction.account_id).first()
        if account is not None:
            delta_diff = _balance_delta(new_type, new_amount) - _balance_delta(old_type, old_amount)
            account.balance = Decimal(str(account.balance or 0)) + delta_diff

    transaction.user_edited = True
    transaction.updated_at = datetime.utcnow()
    db.commit()

    tx = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(Transaction.id == tid)
        .first()
    )
    return _serialize_transaction(tx or transaction)


# ============ Endpoint 5: Delete Transaction ============


@router.delete("/{transaction_id}", status_code=204)
async def delete_transaction(
    transaction_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Soft-delete transaction by ID and revert its effect on Account.balance."""
    uid = parse_uuid(user_id, "user_id")
    tid = parse_uuid(transaction_id, "transaction_id")

    transaction = (
        db.query(Transaction)
        .filter(
            and_(
                Transaction.id == tid,
                Transaction.user_id == uid,
                Transaction.deleted_at.is_(None),
            )
        )
        .first()
    )
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )

    account = db.query(Account).filter(Account.id == transaction.account_id).first()
    if account is not None:
        account.balance = Decimal(str(account.balance or 0)) - _balance_delta(
            transaction.type, Decimal(str(transaction.amount))
        )

    transaction.deleted_at = datetime.utcnow()
    db.commit()
    return None
