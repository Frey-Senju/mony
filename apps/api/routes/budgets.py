"""
Budget endpoints for Mony API — Story 2.3.

Provides per-category monthly spending limits with real-time progress calculation.

Endpoints:
  POST   /budgets              — create budget
  GET    /budgets              — list with current-month progress
  PUT    /budgets/{id}         — update limit_amount
  DELETE /budgets/{id}         — remove budget
"""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Budget,
    Category,
    Transaction,
    TransactionCategory,
    TransactionType,
    User,
    UserPlan,
)
from utils.auth import get_current_user_from_header

router = APIRouter(prefix="/budgets", tags=["budgets"])

BUDGET_PLAN_LIMITS: dict[UserPlan, Optional[int]] = {
    UserPlan.BASIC: 3,
    UserPlan.PRO: 10,
    UserPlan.PREMIUM: None,
}


# ============ Helpers ============


def _month_range(today: date) -> tuple[date, date]:
    start = date(today.year, today.month, 1)
    if today.month == 12:
        end = date(today.year + 1, 1, 1)
    else:
        end = date(today.year, today.month + 1, 1)
    return start, end


def _calculate_spent(db: Session, user_id: UUID, category: str, start: date, end: date) -> Decimal:
    """Sum expenses for the given category and month range."""
    total = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .join(TransactionCategory, TransactionCategory.transaction_id == Transaction.id)
        .join(Category, Category.id == TransactionCategory.category_id)
        .filter(
            and_(
                Transaction.user_id == user_id,
                Transaction.type == TransactionType.EXPENSE,
                Transaction.transaction_date >= start,
                Transaction.transaction_date < end,
                Transaction.deleted_at.is_(None),
                func.lower(Category.name) == category.lower(),
            )
        )
        .scalar()
    )
    return Decimal(str(total or 0))


def _alert_level(percentage: Decimal) -> str:
    if percentage >= 100:
        return "exceeded"
    if percentage >= 80:
        return "warning"
    return "ok"


def _get_budget_or_404(db: Session, budget_id: str, user_id: UUID) -> Budget:
    budget = (
        db.query(Budget)
        .filter(Budget.id == UUID(budget_id), Budget.user_id == user_id, Budget.is_active.is_(True))
        .first()
    )
    if not budget:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found")
    return budget


# ============ Request / Response Models ============


class BudgetCreate(BaseModel):
    category: str = Field(min_length=1, max_length=100)
    limit_amount: Decimal = Field(gt=0, decimal_places=2)
    currency: str = Field(default="BRL", min_length=3, max_length=3)


class BudgetUpdate(BaseModel):
    limit_amount: Decimal = Field(gt=0, decimal_places=2)


class BudgetPeriod(BaseModel):
    month: int
    year: int


class BudgetResponse(BaseModel):
    id: str
    category: str
    limit_amount: Decimal
    currency: str
    spent_amount: Decimal
    percentage: Decimal
    alert_level: str
    period: BudgetPeriod
    created_at: str
    updated_at: str

    class Config:
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "category": "Alimentação",
                "limit_amount": "500.00",
                "currency": "BRL",
                "spent_amount": "423.50",
                "percentage": "84.70",
                "alert_level": "warning",
                "period": {"month": 5, "year": 2026},
            }
        }


# ============ Endpoints ============


@router.post("", status_code=status.HTTP_201_CREATED, response_model=BudgetResponse)
async def create_budget(
    body: BudgetCreate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = UUID(user_id)

    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    plan_limit = BUDGET_PLAN_LIMITS.get(user.plan)
    if plan_limit is not None:
        active_count = db.query(func.count(Budget.id)).filter(
            Budget.user_id == uid, Budget.is_active.is_(True)
        ).scalar() or 0
        if active_count >= plan_limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Budget limit reached for your plan",
            )

    existing = (
        db.query(Budget)
        .filter(
            Budget.user_id == uid,
            func.lower(Budget.category) == body.category.lower(),
            Budget.is_active.is_(True),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Budget for category '{body.category}' already exists",
        )

    now = datetime.utcnow()
    budget = Budget(
        user_id=uid,
        category=body.category,
        limit_amount=body.limit_amount,
        currency=body.currency,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)

    today = date.today()
    start, end = _month_range(today)
    spent = _calculate_spent(db, uid, budget.category, start, end)
    pct = (spent / budget.limit_amount * 100).quantize(Decimal("0.01")) if budget.limit_amount else Decimal("0")

    return BudgetResponse(
        id=str(budget.id),
        category=budget.category,
        limit_amount=budget.limit_amount,
        currency=budget.currency,
        spent_amount=spent,
        percentage=pct,
        alert_level=_alert_level(pct),
        period=BudgetPeriod(month=today.month, year=today.year),
        created_at=budget.created_at.isoformat(),
        updated_at=budget.updated_at.isoformat(),
    )


@router.get("", response_model=List[BudgetResponse])
async def list_budgets(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = UUID(user_id)
    budgets = (
        db.query(Budget)
        .filter(Budget.user_id == uid, Budget.is_active.is_(True))
        .order_by(Budget.created_at)
        .all()
    )

    today = date.today()
    start, end = _month_range(today)
    result = []
    for b in budgets:
        spent = _calculate_spent(db, uid, b.category, start, end)
        pct = (spent / b.limit_amount * 100).quantize(Decimal("0.01")) if b.limit_amount else Decimal("0")
        result.append(
            BudgetResponse(
                id=str(b.id),
                category=b.category,
                limit_amount=b.limit_amount,
                currency=b.currency,
                spent_amount=spent,
                percentage=pct,
                alert_level=_alert_level(pct),
                period=BudgetPeriod(month=today.month, year=today.year),
                created_at=b.created_at.isoformat(),
                updated_at=b.updated_at.isoformat(),
            )
        )
    return result


@router.put("/{budget_id}", response_model=BudgetResponse)
async def update_budget(
    budget_id: str,
    body: BudgetUpdate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = UUID(user_id)
    budget = _get_budget_or_404(db, budget_id, uid)

    budget.limit_amount = body.limit_amount
    budget.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(budget)

    today = date.today()
    start, end = _month_range(today)
    spent = _calculate_spent(db, uid, budget.category, start, end)
    pct = (spent / budget.limit_amount * 100).quantize(Decimal("0.01")) if budget.limit_amount else Decimal("0")

    return BudgetResponse(
        id=str(budget.id),
        category=budget.category,
        limit_amount=budget.limit_amount,
        currency=budget.currency,
        spent_amount=spent,
        percentage=pct,
        alert_level=_alert_level(pct),
        period=BudgetPeriod(month=today.month, year=today.year),
        created_at=budget.created_at.isoformat(),
        updated_at=budget.updated_at.isoformat(),
    )


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(
    budget_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = UUID(user_id)
    budget = _get_budget_or_404(db, budget_id, uid)
    budget.is_active = False
    budget.updated_at = datetime.utcnow()
    db.commit()
