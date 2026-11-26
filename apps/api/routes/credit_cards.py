"""
Dedicated Credit Cards Module (Limits, Closing/Due Day, Best Buy Day & Invoices) for Mony API.

Endpoints:
  GET    /credit-cards                   — list cards with open invoice, limit usage, best buy day & 6m forecast
  POST   /credit-cards                   — create a credit card profile (links or creates credit_card Account)
  PUT    /credit-cards/{card_id}         — update card limit, closing/due day, brand, color
  DELETE /credit-cards/{card_id}         — soft-delete card profile
  POST   /credit-cards/{card_id}/pay     — record invoice payment as internal TRANSFER (zero double-counting!)
"""

from __future__ import annotations

import calendar
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import and_
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Account,
    AccountType,
    CreditCard,
    Transaction,
    TransactionType,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/credit-cards", tags=["credit-cards"])


class CreditCardCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    brand: str = Field(default="mastercard", pattern=r"^(mastercard|visa|elo|amex|hipercard|other)$")
    last4: Optional[str] = Field(default=None, max_length=4)
    credit_limit: Decimal = Field(gt=0)
    closing_day: int = Field(default=10, ge=1, le=31)
    due_day: int = Field(default=17, ge=1, le=31)
    color: str = Field(default="#6366f1", max_length=24)
    account_id: Optional[str] = None


class CreditCardUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    brand: Optional[str] = Field(default=None, pattern=r"^(mastercard|visa|elo|amex|hipercard|other)$")
    last4: Optional[str] = Field(default=None, max_length=4)
    credit_limit: Optional[Decimal] = Field(default=None, gt=0)
    closing_day: Optional[int] = Field(default=None, ge=1, le=31)
    due_day: Optional[int] = Field(default=None, ge=1, le=31)
    color: Optional[str] = Field(default=None, max_length=24)


class PayInvoiceRequest(BaseModel):
    source_account_id: str
    amount: Decimal = Field(gt=0)
    statement_month: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    payment_date: Optional[date] = None


def _add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    total = (year * 12 + (month - 1)) + delta
    return total // 12, (total % 12) + 1


def _clamp_date(year: int, month: int, day: int) -> date:
    return date(year, month, min(max(1, day), calendar.monthrange(year, month)[1]))


def _compute_cycle_info(closing_day: int, due_day: int, today: date) -> dict[str, Any]:
    """
    Determine open invoice month, next closing/due dates, and best buy day.
    Brazilian credit card rule: purchases made on/after closing_day land on next month's invoice.
    """
    if today.day >= closing_day:
        inv_y, inv_m = _add_months(today.year, today.month, 1)
    else:
        inv_y, inv_m = today.year, today.month

    open_ym = f"{inv_y:04d}-{inv_m:02d}"
    next_closing = _clamp_date(inv_y, inv_m, closing_day)

    # If due_day < closing_day, due date falls in the month after closing
    if due_day <= closing_day:
        due_y, due_m = _add_months(inv_y, inv_m, 1)
    else:
        due_y, due_m = inv_y, inv_m
    next_due = _clamp_date(due_y, due_m, due_day)

    best_buy_day = 1 if closing_day >= 31 else closing_day + 1
    days_since_close = (today.day - closing_day) % 31
    is_best_buy_window = 0 <= days_since_close <= 5

    return {
        "open_invoice_month": open_ym,
        "next_closing_date": next_closing.isoformat(),
        "next_due_date": next_due.isoformat(),
        "best_buy_day": best_buy_day,
        "is_best_buy_window": is_best_buy_window,
    }


def _tx_statement_ym(tx: Transaction) -> str:
    if tx.statement_month:
        return tx.statement_month
    return tx.transaction_date.strftime("%Y-%m")


def _build_card_payload(db: Session, uid: UUID, card: CreditCard, today: date) -> dict[str, Any]:
    cycle = _compute_cycle_info(card.closing_day, card.due_day, today)
    open_ym = cycle["open_invoice_month"]
    y0, m0 = int(open_ym[:4]), int(open_ym[5:7])
    pt_months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

    upcoming_yms = []
    for i in range(6):
        yi, mi = _add_months(y0, m0, i)
        upcoming_yms.append((f"{yi:04d}-{mi:02d}", f"{pt_months[mi - 1]}/{str(yi)[-2:]}"))
    ym_set = {ym for ym, _ in upcoming_yms}

    txs: list[Transaction] = []
    if card.account_id:
        txs = (
            db.query(Transaction)
            .filter(
                and_(
                    Transaction.user_id == uid,
                    Transaction.account_id == card.account_id,
                    Transaction.deleted_at.is_(None),
                    Transaction.type.in_([TransactionType.EXPENSE, TransactionType.REFUND]),
                )
            )
            .order_by(Transaction.transaction_date.desc())
            .all()
        )

    by_ym: dict[str, float] = {ym: 0.0 for ym, _ in upcoming_yms}
    open_items = []
    future_installments_total = 0.0

    for tx in txs:
        ym = _tx_statement_ym(tx)
        signed = float(tx.amount or 0) * (-1.0 if tx.type == TransactionType.REFUND else 1.0)
        if ym in ym_set:
            by_ym[ym] = round(by_ym[ym] + signed, 2)
        if ym == open_ym:
            open_items.append({
                "id": str(tx.id),
                "description": tx.description,
                "merchant_name": tx.merchant_name,
                "amount": round(signed, 2),
                "transaction_date": tx.transaction_date.isoformat(),
                "installment": f"{tx.installment_number}/{tx.installment_total}"
                if tx.installment_number and tx.installment_total
                else None,
            })
        elif ym > open_ym:
            future_installments_total += max(0.0, signed)

        # Also project remaining installments from open_ym when only current installment is stored
        if (
            ym == open_ym
            and tx.installment_number
            and tx.installment_total
            and tx.installment_number < tx.installment_total
            and signed > 0
        ):
            remaining = tx.installment_total - tx.installment_number
            for step in range(1, min(remaining + 1, 6)):
                ys, ms = _add_months(y0, m0, step)
                f_ym = f"{ys:04d}-{ms:02d}"
                # Avoid double counting if user already imported that future installment
                already_booked = any(
                    _tx_statement_ym(o) == f_ym
                    and o.installment_number == (tx.installment_number + step)
                    and round(float(o.amount or 0), 2) == round(signed, 2)
                    for o in txs
                )
                if not already_booked and f_ym in by_ym:
                    by_ym[f_ym] = round(by_ym[f_ym] + signed, 2)
                    future_installments_total += signed

    open_total = max(0.0, round(by_ym.get(open_ym, 0.0), 2))
    limit_val = float(card.credit_limit or 0)
    committed = round(open_total + future_installments_total, 2)
    available = round(max(0.0, limit_val - committed), 2)
    usage_pct = round((committed / limit_val) * 100.0, 1) if limit_val > 0 else 0.0

    return {
        "id": str(card.id),
        "account_id": str(card.account_id) if card.account_id else None,
        "name": card.name,
        "brand": card.brand,
        "last4": card.last4,
        "credit_limit": round(limit_val, 2),
        "closing_day": card.closing_day,
        "due_day": card.due_day,
        "color": card.color,
        "user_edited": bool(getattr(card, "user_edited", False)),
        "external_account_id": getattr(card, "external_account_id", None),
        "pluggy_balance": float(card.pluggy_balance) if getattr(card, "pluggy_balance", None) is not None else None,
        "balance_divergence": round(
            open_total - abs(float(card.pluggy_balance)), 2
        )
        if getattr(card, "pluggy_balance", None) is not None
        else None,
        "open_invoice_month": open_ym,
        "open_invoice_total": open_total,
        "future_installments_total": round(future_installments_total, 2),
        "total_committed": committed,
        "available_limit": available,
        "usage_pct": usage_pct,
        "best_buy_day": cycle["best_buy_day"],
        "is_best_buy_window": cycle["is_best_buy_window"],
        "next_closing_date": cycle["next_closing_date"],
        "next_due_date": cycle["next_due_date"],
        "upcoming_invoices": [
            {"ym": ym, "label": label, "total": max(0.0, round(by_ym[ym], 2))}
            for ym, label in upcoming_yms
        ],
        "open_invoice_items": open_items[:20],
    }


@router.get("")
async def list_credit_cards(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    today = date.today()

    cards = (
        db.query(CreditCard)
        .filter(
            CreditCard.user_id == uid,
            CreditCard.deleted_at.is_(None),
            CreditCard.is_active.is_(True),
        )
        .order_by(CreditCard.created_at.asc())
        .all()
    )
    enriched = [_build_card_payload(db, uid, c, today) for c in cards]

    # Also return credit_card accounts (e.g. from Pluggy Open Finance) not yet attached to a CreditCard profile
    linked_acct_ids = {c.account_id for c in cards if c.account_id}
    unlinked_cc_accounts = (
        db.query(Account)
        .filter(
            Account.user_id == uid,
            Account.deleted_at.is_(None),
            Account.type == AccountType.CREDIT_CARD,
        )
        .all()
    )
    suggestions = [
        {"account_id": str(a.id), "name": a.name, "balance": float(a.balance or 0)}
        for a in unlinked_cc_accounts
        if a.id not in linked_acct_ids
    ]

    total_limit = round(sum(c["credit_limit"] for c in enriched), 2)
    total_open = round(sum(c["open_invoice_total"] for c in enriched), 2)
    total_committed = round(sum(c["total_committed"] for c in enriched), 2)
    total_available = round(sum(c["available_limit"] for c in enriched), 2)

    return {
        "cards": enriched,
        "unlinked_credit_accounts": suggestions,
        "summary": {
            "cards_count": len(enriched),
            "total_limit": total_limit,
            "total_open_invoices": total_open,
            "total_committed": total_committed,
            "total_available": total_available,
            "overall_usage_pct": round((total_committed / total_limit) * 100.0, 1) if total_limit > 0 else 0.0,
        },
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_credit_card(
    payload: CreditCardCreateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    account_uuid: Optional[UUID] = None

    if payload.account_id:
        aid = parse_uuid(payload.account_id, "account_id")
        acct = db.query(Account).filter(Account.id == aid, Account.user_id == uid, Account.deleted_at.is_(None)).first()
        if not acct:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta de cartão não encontrada.")
        account_uuid = acct.id
    else:
        # Auto-create or reuse matching credit_card Account so transactions attach seamlessly
        cand_name = payload.name.strip()[:100]
        existing_acct = (
            db.query(Account)
            .filter(Account.user_id == uid, Account.name == cand_name, Account.deleted_at.is_(None))
            .first()
        )
        if existing_acct is not None:
            account_uuid = existing_acct.id
        else:
            new_acct = Account(
                user_id=uid,
                name=cand_name,
                type=AccountType.CREDIT_CARD,
                balance=Decimal("0.00"),
                currency="BRL",
                color=payload.color[:7] if payload.color.startswith("#") else "#6366f1",
            )
            db.add(new_acct)
            db.flush()
            account_uuid = new_acct.id

    card = CreditCard(
        user_id=uid,
        account_id=account_uuid,
        name=payload.name.strip(),
        brand=payload.brand,
        last4=(payload.last4 or "").strip()[:4] or None,
        credit_limit=payload.credit_limit,
        closing_day=payload.closing_day,
        due_day=payload.due_day,
        color=payload.color,
        is_active=True,
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return _build_card_payload(db, uid, card, date.today())


@router.put("/{card_id}")
async def update_credit_card(
    card_id: str,
    payload: CreditCardUpdateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    cid = parse_uuid(card_id, "card_id")
    card = (
        db.query(CreditCard)
        .filter(CreditCard.id == cid, CreditCard.user_id == uid, CreditCard.deleted_at.is_(None))
        .first()
    )
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cartão não encontrado.")

    if payload.name is not None:
        card.name = payload.name.strip()
    if payload.brand is not None:
        card.brand = payload.brand
    if payload.last4 is not None:
        card.last4 = payload.last4.strip()[:4] or None
    if payload.credit_limit is not None:
        card.credit_limit = payload.credit_limit
    if payload.closing_day is not None:
        card.closing_day = payload.closing_day
    if payload.due_day is not None:
        card.due_day = payload.due_day
    if payload.color is not None:
        card.color = payload.color
    card.user_edited = True
    card.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(card)
    return _build_card_payload(db, uid, card, date.today())


@router.delete("/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credit_card(
    card_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    cid = parse_uuid(card_id, "card_id")
    card = (
        db.query(CreditCard)
        .filter(CreditCard.id == cid, CreditCard.user_id == uid, CreditCard.deleted_at.is_(None))
        .first()
    )
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cartão não encontrado.")
    card.is_active = False
    card.deleted_at = datetime.utcnow()
    db.commit()


@router.post("/{card_id}/pay")
async def pay_credit_card_invoice(
    card_id: str,
    payload: PayInvoiceRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Record invoice payment as an internal TRANSFER from checking account (never inflates expenses!)."""
    uid = parse_uuid(user_id, "user_id")
    cid = parse_uuid(card_id, "card_id")
    src_aid = parse_uuid(payload.source_account_id, "source_account_id")

    card = (
        db.query(CreditCard)
        .filter(CreditCard.id == cid, CreditCard.user_id == uid, CreditCard.deleted_at.is_(None))
        .first()
    )
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cartão não encontrado.")

    src_acct = (
        db.query(Account)
        .filter(Account.id == src_aid, Account.user_id == uid, Account.deleted_at.is_(None))
        .first()
    )
    if not src_acct:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta de pagamento não encontrada.")

    pay_dt = payload.payment_date or date.today()
    stmt_month = payload.statement_month or pay_dt.strftime("%Y-%m")

    tx = Transaction(
        user_id=uid,
        account_id=src_acct.id,
        type=TransactionType.TRANSFER,
        amount=payload.amount,
        currency=src_acct.currency or "BRL",
        description=f"Pagamento Fatura {card.name} ({stmt_month})",
        merchant_name=card.name,
        transaction_date=pay_dt,
        statement_month=stmt_month,
        payment_method="bank_transfer",
        source="manual",
        is_reconciled=True,
    )
    db.add(tx)
    src_acct.balance = Decimal(str(src_acct.balance or 0)) - payload.amount
    db.commit()

    return {
        "paid": True,
        "transaction_id": str(tx.id),
        "new_source_balance": float(src_acct.balance),
    }
