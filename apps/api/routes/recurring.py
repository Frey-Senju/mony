"""
Recurring Transactions Rules & Monthly Generation endpoints for Mony API.

Endpoints:
  GET    /recurring                     — list active recurring rules + fixed monthly summary
  POST   /recurring                     — create a recurring income/expense rule
  PUT    /recurring/{rule_id}           — update a recurring rule (amount, day, active, etc.)
  DELETE /recurring/{rule_id}           — soft-delete a recurring rule
  POST   /recurring/generate            — idempotently generate pending transactions for YYYY-MM
  POST   /recurring/{rule_id}/generate  — generate a single rule immediately for YYYY-MM
"""

import calendar
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Account,
    Notification,
    NotificationType,
    RecurringRule,
    Transaction,
    TransactionType,
)
from routes.categories import ensure_default_categories
from routes.transactions import _balance_delta, _resolve_category, _set_transaction_category
from services.recurrence_detector import detect_and_register_recurrences
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/recurring", tags=["recurring"])


# ============ Schemas ============


class RecurringRuleCreate(BaseModel):
    account_id: str
    type: TransactionType = TransactionType.EXPENSE
    amount: Decimal = Field(gt=0, decimal_places=2)
    description: str = Field(min_length=1, max_length=255)
    merchant_name: Optional[str] = Field(default=None, max_length=255)
    category_name: Optional[str] = Field(default="Outros", max_length=100)
    payment_method: Optional[str] = Field(default="boleto", max_length=30)
    frequency: str = Field(default="monthly", pattern=r"^(monthly|weekly|yearly)$")
    day_of_month: int = Field(default=5, ge=1, le=31)
    is_active: bool = True
    auto_create: bool = True


class RecurringRuleUpdate(BaseModel):
    account_id: Optional[str] = None
    type: Optional[TransactionType] = None
    amount: Optional[Decimal] = Field(default=None, gt=0, decimal_places=2)
    description: Optional[str] = Field(default=None, min_length=1, max_length=255)
    merchant_name: Optional[str] = Field(default=None, max_length=255)
    category_name: Optional[str] = Field(default=None, max_length=100)
    payment_method: Optional[str] = Field(default=None, max_length=30)
    frequency: Optional[str] = Field(default=None, pattern=r"^(monthly|weekly|yearly)$")
    day_of_month: Optional[int] = Field(default=None, ge=1, le=31)
    is_active: Optional[bool] = None
    auto_create: Optional[bool] = None


class GenerateRequest(BaseModel):
    month: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}$")


def _due_date_for_month(ym: str, day_of_month: int) -> date:
    y_str, m_str = ym.split("-")
    y, m = int(y_str), int(m_str)
    clamped = min(max(1, day_of_month), calendar.monthrange(y, m)[1])
    return date(y, m, clamped)


def _serialize_rule(rule: RecurringRule, current_ym: str, account_name: Optional[str] = None) -> dict:
    generated_this_month = rule.last_generated_month == current_ym
    due = _due_date_for_month(current_ym, rule.day_of_month)
    return {
        "id": str(rule.id),
        "user_id": str(rule.user_id),
        "account_id": str(rule.account_id),
        "account_name": account_name,
        "type": rule.type.value if hasattr(rule.type, "value") else str(rule.type),
        "amount": float(rule.amount),
        "currency": rule.currency or "BRL",
        "description": rule.description,
        "merchant_name": rule.merchant_name,
        "category_name": rule.category_name or "Outros",
        "payment_method": rule.payment_method or "boleto",
        "frequency": rule.frequency or "monthly",
        "day_of_month": rule.day_of_month,
        "is_active": bool(rule.is_active),
        "auto_create": bool(rule.auto_create),
        "source": getattr(rule, "source", "manual") or "manual",
        "last_generated_month": rule.last_generated_month,
        "generated_this_month": generated_this_month,
        "next_due_date": due.isoformat(),
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
    }


def _generate_rule_tx(
    db: Session,
    uid: UUID,
    rule: RecurringRule,
    target_month: str,
) -> Optional[Transaction]:
    """Create one transaction for ``rule`` inside ``target_month`` if not already generated."""
    if rule.last_generated_month == target_month:
        return None

    account = (
        db.query(Account)
        .filter(Account.id == rule.account_id, Account.user_id == uid, Account.deleted_at.is_(None))
        .first()
    )
    if not account:
        return None

    due_dt = _due_date_for_month(target_month, rule.day_of_month)
    tx = Transaction(
        user_id=uid,
        account_id=account.id,
        type=rule.type,
        amount=rule.amount,
        currency=rule.currency or account.currency or "BRL",
        description=rule.description,
        merchant_name=rule.merchant_name or rule.description,
        notes=f"Lançamento recorrente ({rule.frequency}) · vencimento dia {rule.day_of_month}",
        transaction_date=due_dt,
        is_recurring=True,
        recurring_pattern=rule.frequency,
        is_reconciled=False,
        source="manual",
        payment_method=rule.payment_method,
        statement_month=target_month,
    )
    db.add(tx)
    db.flush()

    cat = _resolve_category(db, uid, category_name=rule.category_name or "Outros")
    if cat is not None:
        _set_transaction_category(db, tx, cat)

    account.balance = Decimal(str(account.balance or 0)) + _balance_delta(rule.type, Decimal(str(rule.amount)))
    rule.last_generated_month = target_month
    rule.updated_at = datetime.utcnow()
    return tx


# ============ Endpoints ============


@router.get("")
async def list_recurring_rules(
    month: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """List user's recurring rules along with fixed monthly income/expense totals."""
    uid = parse_uuid(user_id, "user_id")
    current_ym = month or date.today().strftime("%Y-%m")

    rules = (
        db.query(RecurringRule)
        .filter(RecurringRule.user_id == uid, RecurringRule.deleted_at.is_(None))
        .order_by(RecurringRule.is_active.desc(), RecurringRule.day_of_month.asc(), RecurringRule.created_at.desc())
        .all()
    )

    accounts = (
        db.query(Account)
        .filter(Account.user_id == uid, Account.deleted_at.is_(None))
        .all()
    )
    acct_map = {a.id: a.name for a in accounts}

    items = [_serialize_rule(r, current_ym, acct_map.get(r.account_id)) for r in rules]

    active_rules = [r for r in rules if r.is_active]
    fixed_income = round(sum(float(r.amount) for r in active_rules if r.type == TransactionType.INCOME), 2)
    fixed_expenses = round(sum(float(r.amount) for r in active_rules if r.type == TransactionType.EXPENSE), 2)
    pending_count = sum(1 for r in active_rules if r.last_generated_month != current_ym)

    return {
        "month": current_ym,
        "items": items,
        "summary": {
            "monthly_fixed_income": fixed_income,
            "monthly_fixed_expenses": fixed_expenses,
            "monthly_fixed_net": round(fixed_income - fixed_expenses, 2),
            "active_count": len(active_rules),
            "pending_this_month_count": pending_count,
        },
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_recurring_rule(
    payload: RecurringRuleCreate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Create a new recurring income/expense rule."""
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

    rule = RecurringRule(
        user_id=uid,
        account_id=aid,
        type=payload.type,
        amount=payload.amount,
        currency=account.currency or "BRL",
        description=payload.description.strip(),
        merchant_name=(payload.merchant_name or "").strip() or None,
        category_name=(payload.category_name or "Outros").strip(),
        payment_method=payload.payment_method,
        frequency=payload.frequency,
        day_of_month=payload.day_of_month,
        is_active=payload.is_active,
        auto_create=payload.auto_create,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _serialize_rule(rule, date.today().strftime("%Y-%m"), account.name)


@router.put("/{rule_id}")
async def update_recurring_rule(
    rule_id: str,
    payload: RecurringRuleUpdate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Update fields on an existing recurring rule."""
    uid = parse_uuid(user_id, "user_id")
    rid = parse_uuid(rule_id, "rule_id")

    rule = (
        db.query(RecurringRule)
        .filter(RecurringRule.id == rid, RecurringRule.user_id == uid, RecurringRule.deleted_at.is_(None))
        .first()
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regra recorrente não encontrada.")

    data = payload.model_dump(exclude_unset=True)
    if "account_id" in data and data["account_id"]:
        aid = parse_uuid(data["account_id"], "account_id")
        acct = db.query(Account).filter(Account.id == aid, Account.user_id == uid, Account.deleted_at.is_(None)).first()
        if not acct:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta não encontrada.")
        data["account_id"] = aid

    for field, val in data.items():
        setattr(rule, field, val)
    rule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)

    acct = db.query(Account).filter(Account.id == rule.account_id).first()
    return _serialize_rule(rule, date.today().strftime("%Y-%m"), acct.name if acct else None)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recurring_rule(
    rule_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Soft-delete a recurring rule."""
    uid = parse_uuid(user_id, "user_id")
    rid = parse_uuid(rule_id, "rule_id")

    rule = (
        db.query(RecurringRule)
        .filter(RecurringRule.id == rid, RecurringRule.user_id == uid, RecurringRule.deleted_at.is_(None))
        .first()
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regra recorrente não encontrada.")

    rule.deleted_at = datetime.utcnow()
    rule.is_active = False
    db.commit()
    return None


@router.post("/generate")
async def generate_monthly_recurring(
    payload: Optional[GenerateRequest] = None,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Idempotently generate transactions for all active pending rules in target month."""
    uid = parse_uuid(user_id, "user_id")
    target_month = (payload.month if payload and payload.month else None) or date.today().strftime("%Y-%m")
    ensure_default_categories(db, uid)

    rules = (
        db.query(RecurringRule)
        .filter(
            RecurringRule.user_id == uid,
            RecurringRule.deleted_at.is_(None),
            RecurringRule.is_active.is_(True),
        )
        .all()
    )

    created_ids: list[str] = []
    skipped = 0
    for rule in rules:
        tx = _generate_rule_tx(db, uid, rule, target_month)
        if tx is not None:
            created_ids.append(str(tx.id))
        else:
            skipped += 1

    if created_ids:
        db.add(
            Notification(
                user_id=uid,
                type=NotificationType.CUSTOM,
                title="Recorrências lançadas automaticamente",
                message=f"{len(created_ids)} lançamento(s) fixo(s) gerado(s) para {target_month}.",
                related_entity_type="recurring_batch",
            )
        )

    db.commit()
    return {
        "month": target_month,
        "generated": len(created_ids),
        "skipped": skipped,
        "transaction_ids": created_ids,
    }


@router.post("/{rule_id}/generate", status_code=status.HTTP_201_CREATED)
async def generate_single_recurring(
    rule_id: str,
    payload: Optional[GenerateRequest] = None,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Generate a single recurring rule transaction for the target month."""
    uid = parse_uuid(user_id, "user_id")
    rid = parse_uuid(rule_id, "rule_id")
    target_month = (payload.month if payload and payload.month else None) or date.today().strftime("%Y-%m")

    rule = (
        db.query(RecurringRule)
        .filter(RecurringRule.id == rid, RecurringRule.user_id == uid, RecurringRule.deleted_at.is_(None))
        .first()
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regra recorrente não encontrada.")

    ensure_default_categories(db, uid)
    tx = _generate_rule_tx(db, uid, rule, target_month)
    if tx is None:
        return {"month": target_month, "generated": 0, "already_generated": True, "transaction_id": None}

    db.commit()
    return {"month": target_month, "generated": 1, "already_generated": False, "transaction_id": str(tx.id)}


@router.post("/detect")
async def detect_recurrences_endpoint(
    lookback_days: int = Query(default=180, ge=30, le=365),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Scan transaction history and automatically register detected recurring bills/subscriptions."""
    uid = parse_uuid(user_id, "user_id")
    stats = detect_and_register_recurrences(db, uid, lookback_days=lookback_days)
    db.commit()
    return stats
