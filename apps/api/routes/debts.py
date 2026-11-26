"""
Debts, Loans & Financing Management + Payoff Strategist (Avalanche vs Snowball)
+ SAC vs Price Amortization Simulator + Consolidated Net Worth Timeline (EPIC-006 Stories 6.6 & 6.7).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Account,
    AccountType,
    CreditCard,
    Debt,
    InvestmentAsset,
    Transaction,
    TransactionType,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(tags=["debts-and-net-worth"])


class DebtCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    debt_type: str = Field(default="other", max_length=40)
    creditor: Optional[str] = Field(default=None, max_length=255)
    original_amount: float = Field(..., gt=0)
    current_balance: float = Field(..., ge=0)
    interest_rate_monthly: float = Field(default=0.0, ge=0, le=50)
    monthly_payment: float = Field(default=0.0, ge=0)
    remaining_installments: Optional[int] = Field(default=None, ge=0, le=600)
    due_day: int = Field(default=10, ge=1, le=31)
    amortization_system: str = Field(default="price", max_length=20)
    notes: Optional[str] = Field(default=None, max_length=1000)


class DebtUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    debt_type: Optional[str] = Field(default=None, max_length=40)
    creditor: Optional[str] = Field(default=None, max_length=255)
    original_amount: Optional[float] = Field(default=None, gt=0)
    current_balance: Optional[float] = Field(default=None, ge=0)
    interest_rate_monthly: Optional[float] = Field(default=None, ge=0, le=50)
    monthly_payment: Optional[float] = Field(default=None, ge=0)
    remaining_installments: Optional[int] = Field(default=None, ge=0, le=600)
    due_day: Optional[int] = Field(default=None, ge=1, le=31)
    amortization_system: Optional[str] = Field(default=None, max_length=20)
    is_active: Optional[bool] = None
    notes: Optional[str] = Field(default=None, max_length=1000)


class StrategyRequest(BaseModel):
    extra_monthly_payment: float = Field(default=0.0, ge=0, le=1_000_000)


class AmortizationRequest(BaseModel):
    balance: float = Field(..., gt=0)
    annual_rate_pct: float = Field(..., ge=0, le=300)
    months: int = Field(..., ge=1, le=480)
    extra_amortization: float = Field(default=0.0, ge=0)


def _serialize_debt(d: Debt) -> dict[str, Any]:
    orig = float(d.original_amount or 0)
    bal = float(d.current_balance or 0)
    paid_pct = round(((orig - bal) / orig) * 100.0, 1) if orig > 0 else 0.0
    return {
        "id": str(d.id),
        "name": d.name,
        "debt_type": d.debt_type,
        "creditor": d.creditor,
        "original_amount": round(orig, 2),
        "current_balance": round(bal, 2),
        "paid_pct": max(0.0, min(100.0, paid_pct)),
        "interest_rate_monthly": float(d.interest_rate_monthly or 0),
        "monthly_payment": round(float(d.monthly_payment or 0), 2),
        "remaining_installments": d.remaining_installments,
        "due_day": d.due_day,
        "amortization_system": d.amortization_system,
        "is_active": d.is_active,
        "notes": d.notes,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


def _simulate_payoff(debts_list: list[dict[str, Any]], extra: float, mode: str) -> dict[str, Any]:
    """
    Simulate Avalanche (highest interest rate first) or Snowball (smallest balance first).
    Caps at 360 months to stay bounded.
    """
    items = [
        {
            "id": d["id"],
            "name": d["name"],
            "balance": float(d["current_balance"]),
            "rate": float(d["interest_rate_monthly"]) / 100.0,
            "min_pmt": max(float(d["monthly_payment"]), float(d["current_balance"]) * (float(d["interest_rate_monthly"]) / 100.0) + 10.0),
        }
        for d in debts_list
        if float(d["current_balance"]) > 0
    ]
    if not items:
        return {"months": 0, "total_interest": 0.0, "total_paid": 0.0, "payoff_order": []}

    if mode == "avalanche":
        items.sort(key=lambda x: (-x["rate"], x["balance"]))
    else:
        items.sort(key=lambda x: (x["balance"], -x["rate"]))

    payoff_order: list[dict[str, Any]] = []
    total_interest = 0.0
    total_paid = 0.0
    month = 0

    while any(i["balance"] > 0.01 for i in items) and month < 360:
        month += 1
        freed_extra = extra
        # 1. Accrue interest and apply minimum payment
        for item in items:
            if item["balance"] <= 0.01:
                freed_extra += item["min_pmt"]
                continue
            interest = item["balance"] * item["rate"]
            total_interest += interest
            item["balance"] += interest
            pmt = min(item["balance"], item["min_pmt"])
            item["balance"] -= pmt
            total_paid += pmt
            if item["balance"] <= 0.01:
                item["balance"] = 0.0
                payoff_order.append({"name": item["name"], "paid_off_month": month})

        # 2. Snowball/Avalanche roll extra cash to target priority debt
        rem_extra = freed_extra
        for item in items:
            if rem_extra <= 0.01:
                break
            if item["balance"] <= 0.01:
                continue
            pmt = min(item["balance"], rem_extra)
            item["balance"] -= pmt
            rem_extra -= pmt
            total_paid += pmt
            if item["balance"] <= 0.01:
                item["balance"] = 0.0
                payoff_order.append({"name": item["name"], "paid_off_month": month})

    return {
        "months": month,
        "total_interest": round(total_interest, 2),
        "total_paid": round(total_paid, 2),
        "payoff_order": payoff_order,
    }


@router.get("/debts")
async def list_debts(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    debts = (
        db.query(Debt)
        .filter(Debt.user_id == uid, Debt.deleted_at.is_(None))
        .order_by(Debt.is_active.desc(), Debt.current_balance.desc())
        .all()
    )
    items = [_serialize_debt(d) for d in debts]
    active = [i for i in items if i["is_active"]]
    return {
        "items": items,
        "summary": {
            "total_balance": round(sum(i["current_balance"] for i in active), 2),
            "total_original": round(sum(i["original_amount"] for i in active), 2),
            "total_monthly_payment": round(sum(i["monthly_payment"] for i in active), 2),
            "weighted_monthly_rate": round(
                (
                    sum(i["current_balance"] * i["interest_rate_monthly"] for i in active)
                    / max(1.0, sum(i["current_balance"] for i in active))
                ),
                2,
            )
            if active
            else 0.0,
            "active_count": len(active),
        },
    }


@router.post("/debts", status_code=status.HTTP_201_CREATED)
async def create_debt(
    payload: DebtCreate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    debt = Debt(
        id=uuid4(),
        user_id=uid,
        name=payload.name.strip(),
        debt_type=payload.debt_type,
        creditor=payload.creditor.strip() if payload.creditor else None,
        original_amount=Decimal(str(payload.original_amount)),
        current_balance=Decimal(str(payload.current_balance)),
        interest_rate_monthly=Decimal(str(payload.interest_rate_monthly)),
        monthly_payment=Decimal(str(payload.monthly_payment)),
        remaining_installments=payload.remaining_installments,
        due_day=payload.due_day,
        amortization_system=payload.amortization_system,
        notes=payload.notes,
        is_active=payload.current_balance > 0,
    )
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return _serialize_debt(debt)


@router.put("/debts/{debt_id}")
async def update_debt(
    debt_id: str,
    payload: DebtUpdate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    did = parse_uuid(debt_id, "debt_id")
    debt = db.query(Debt).filter(Debt.id == did, Debt.user_id == uid, Debt.deleted_at.is_(None)).first()
    if not debt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dívida não encontrada.")
    for field, val in payload.model_dump(exclude_unset=True).items():
        if field in ("original_amount", "current_balance", "interest_rate_monthly", "monthly_payment") and val is not None:
            setattr(debt, field, Decimal(str(val)))
        else:
            setattr(debt, field, val)
    debt.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(debt)
    return _serialize_debt(debt)


@router.delete("/debts/{debt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_debt(
    debt_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    did = parse_uuid(debt_id, "debt_id")
    debt = db.query(Debt).filter(Debt.id == did, Debt.user_id == uid, Debt.deleted_at.is_(None)).first()
    if not debt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dívida não encontrada.")
    debt.deleted_at = datetime.utcnow()
    db.commit()
    return None


@router.post("/debts/strategy")
async def compare_debt_strategies(
    payload: StrategyRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    debts = (
        db.query(Debt)
        .filter(Debt.user_id == uid, Debt.is_active.is_(True), Debt.deleted_at.is_(None))
        .all()
    )
    serialized = [_serialize_debt(d) for d in debts]
    baseline = _simulate_payoff(serialized, 0.0, "avalanche")
    avalanche = _simulate_payoff(serialized, payload.extra_monthly_payment, "avalanche")
    snowball = _simulate_payoff(serialized, payload.extra_monthly_payment, "snowball")
    recommended = "avalanche" if avalanche["total_interest"] <= snowball["total_interest"] else "snowball"
    return {
        "extra_monthly_payment": payload.extra_monthly_payment,
        "baseline_without_extra": baseline,
        "avalanche": avalanche,
        "snowball": snowball,
        "recommended": recommended,
        "interest_saved_vs_snowball": round(max(0.0, snowball["total_interest"] - avalanche["total_interest"]), 2),
        "interest_saved_with_extra": round(max(0.0, baseline["total_interest"] - avalanche["total_interest"]), 2),
        "months_saved_with_extra": max(0, baseline["months"] - avalanche["months"]),
    }


@router.post("/debts/amortization")
async def simulate_sac_vs_price(
    payload: AmortizationRequest,
    user_id: str = Depends(get_current_user_from_header),
):
    """Compare SAC vs Price financing and extra amortization savings (Story 6.6)."""
    _ = parse_uuid(user_id, "user_id")
    r_m = (1.0 + payload.annual_rate_pct / 100.0) ** (1.0 / 12.0) - 1.0
    n = payload.months
    bal0 = payload.balance
    extra = min(payload.extra_amortization, bal0)

    def calc_price(principal: float, months: int) -> dict[str, Any]:
        if principal <= 0:
            return {"first_installment": 0.0, "last_installment": 0.0, "total_interest": 0.0, "total_paid": 0.0, "months": 0}
        if r_m <= 0:
            pmt = principal / months
            return {"first_installment": round(pmt, 2), "last_installment": round(pmt, 2), "total_interest": 0.0, "total_paid": round(principal, 2), "months": months}
        pmt = principal * (r_m * (1 + r_m) ** months) / ((1 + r_m) ** months - 1)
        total_paid = pmt * months
        return {
            "first_installment": round(pmt, 2),
            "last_installment": round(pmt, 2),
            "total_interest": round(total_paid - principal, 2),
            "total_paid": round(total_paid, 2),
            "months": months,
        }

    def calc_sac(principal: float, months: int) -> dict[str, Any]:
        if principal <= 0:
            return {"first_installment": 0.0, "last_installment": 0.0, "total_interest": 0.0, "total_paid": 0.0, "months": 0}
        amort = principal / months
        first = amort + principal * r_m
        last = amort + amort * r_m
        total_interest = principal * r_m * (months + 1) / 2.0
        return {
            "first_installment": round(first, 2),
            "last_installment": round(last, 2),
            "total_interest": round(total_interest, 2),
            "total_paid": round(principal + total_interest, 2),
            "months": months,
        }

    price_base = calc_price(bal0, n)
    sac_base = calc_sac(bal0, n)

    # Extra amortization keeping the same installment (reduces term!)
    new_bal = max(0.0, bal0 - extra)
    if new_bal > 0 and extra > 0:
        # SAC term reduction keeping amort constant
        sac_amort = bal0 / n
        sac_new_months = max(1, int(round(new_bal / sac_amort)))
        sac_after = calc_sac(new_bal, sac_new_months)
        # Price term reduction keeping pmt constant
        if r_m > 0 and price_base["first_installment"] > new_bal * r_m:
            import math
            p = price_base["first_installment"]
            price_new_months = max(1, int(math.ceil(-math.log(1 - (new_bal * r_m) / p) / math.log(1 + r_m))))
        else:
            price_new_months = max(1, int(round(n * (new_bal / bal0))))
        price_after = calc_price(new_bal, price_new_months)
    else:
        sac_after = sac_base
        price_after = price_base

    return {
        "monthly_rate_pct": round(r_m * 100.0, 4),
        "price": {
            **price_base,
            "after_extra_months": price_after["months"],
            "months_saved": max(0, n - price_after["months"]),
            "interest_saved": round(max(0.0, price_base["total_interest"] - price_after["total_interest"]), 2),
        },
        "sac": {
            **sac_base,
            "after_extra_months": sac_after["months"],
            "months_saved": max(0, n - sac_after["months"]),
            "interest_saved": round(max(0.0, sac_base["total_interest"] - sac_after["total_interest"]), 2),
        },
        "sac_savings_vs_price": round(max(0.0, price_base["total_interest"] - sac_base["total_interest"]), 2),
    }


@router.get("/reports/net-worth")
async def get_net_worth_timeline(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Consolidated Net Worth (Assets - Liabilities) + 6-month historical trajectory (Story 6.7).
    """
    uid = parse_uuid(user_id, "user_id")
    accounts = db.query(Account).filter(Account.user_id == uid, Account.deleted_at.is_(None)).all()
    holdings = db.query(InvestmentAsset).filter(InvestmentAsset.user_id == uid, InvestmentAsset.deleted_at.is_(None)).all()
    debts = db.query(Debt).filter(Debt.user_id == uid, Debt.is_active.is_(True), Debt.deleted_at.is_(None)).all()
    cards = db.query(CreditCard).filter(CreditCard.user_id == uid, CreditCard.is_active.is_(True), CreditCard.deleted_at.is_(None)).all()

    liquid_cash = round(
        sum(float(a.balance or 0) for a in accounts if a.type in {AccountType.CHECKING, AccountType.SAVINGS, AccountType.CASH}),
        2,
    )
    investment_accts = round(
        sum(float(a.balance or 0) for a in accounts if a.type == AccountType.INVESTMENT),
        2,
    )
    b3_portfolio = round(
        sum(float(h.quantity or 0) * float(h.average_price or 0) for h in holdings),
        2,
    )
    assets_total = round(liquid_cash + investment_accts + b3_portfolio, 2)

    debts_total = round(sum(float(d.current_balance or 0) for d in debts), 2)
    cards_balance = round(sum(max(0.0, float(c.pluggy_balance or 0)) for c in cards), 2)
    liabilities_total = round(debts_total + cards_balance, 2)
    current_nw = round(assets_total - liabilities_total, 2)

    # Reconstruct trailing 6 months net worth by rolling back monthly net cashflow
    today = date.today()
    pt_months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    months_6: list[tuple[str, str]] = []
    y, m = today.year, today.month
    for _ in range(6):
        months_6.append((f"{y:04d}-{m:02d}", f"{pt_months[m - 1]}/{str(y)[-2:]}"))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months_6.reverse()

    cutoff = date(int(months_6[0][0][:4]), int(months_6[0][0][5:7]), 1) - timedelta(days=32)
    txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            Transaction.transaction_date >= cutoff,
            Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]),
        )
        .all()
    )
    net_by_ym: dict[str, float] = {ym: 0.0 for ym, _ in months_6}
    for tx in txs:
        ym = tx.statement_month or tx.transaction_date.strftime("%Y-%m")
        if ym in net_by_ym:
            amt = float(tx.amount or 0)
            net_by_ym[ym] += amt if tx.type == TransactionType.INCOME else -amt

    # Roll backward from current month to get historical trajectory
    history_rev: list[dict[str, Any]] = []
    cursor_nw = current_nw
    for idx in range(len(months_6) - 1, -1, -1):
        ym, label = months_6[idx]
        history_rev.append({
            "ym": ym,
            "label": label,
            "net_worth": round(cursor_nw, 2),
            "monthly_delta": round(net_by_ym[ym], 2),
        })
        cursor_nw = round(cursor_nw - net_by_ym[ym], 2)
    history_rev.reverse()

    return {
        "assets_total": assets_total,
        "liabilities_total": liabilities_total,
        "net_worth": current_nw,
        "breakdown": {
            "liquid_cash": liquid_cash,
            "investment_accounts": investment_accts,
            "b3_portfolio": b3_portfolio,
            "debts": debts_total,
            "credit_cards": cards_balance,
        },
        "history_6m": history_rev,
    }
