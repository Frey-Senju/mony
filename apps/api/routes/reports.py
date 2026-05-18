"""
Reports endpoints for Mony API.

Provides aggregated views of user transactions:
- GET /reports/monthly-summary — total income, expenses, and net balance for a month.
- GET /reports/category-breakdown — expense breakdown per category for a month.

Auth pattern mirrors ``routes/transactions.py`` (JWT via
``get_current_user_from_header``). Queries filter out soft-deleted rows and
scope strictly to the authenticated user's transactions.
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, extract, func
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Category,
    Transaction,
    TransactionCategory,
    TransactionType,
)
from utils.auth import get_current_user_from_header

router = APIRouter(prefix="/reports", tags=["reports"])




# ============ Helpers ============


def month_range(year: int, month: int) -> tuple[date, date]:
    """
    Return ``(start_date, end_date)`` half-open interval for the given month.

    Handles December rollover explicitly: for ``month == 12``, ``end_date`` is
    January 1 of the following year. The interval is inclusive of ``start_date``
    and exclusive of ``end_date`` (use ``>=`` and ``<``).

    Raises ``ValueError`` for out-of-range month values so callers can return
    a 400 instead of crashing.
    """
    if month < 1 or month > 12:
        raise ValueError(f"month must be between 1 and 12 (got {month})")

    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)
    return start_date, end_date


def _validate_year_month(year: int, month: int) -> tuple[date, date]:
    """Wrap ``month_range`` and translate ValueError -> 400."""
    try:
        return month_range(year, month)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )


def _resolve_date_range(
    year: Optional[int],
    month: Optional[int],
    start_date: Optional[date],
    end_date: Optional[date],
) -> tuple[date, date, "ReportPeriod"]:
    """Return (start, exclusive_end, period) from either year/month or date range params."""
    if start_date is not None or end_date is not None:
        if start_date is None or end_date is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="start_date and end_date must both be provided together",
            )
        if start_date > end_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="start_date must be less than or equal to end_date",
            )
        period = ReportPeriod(
            start=start_date.isoformat(),
            end=end_date.isoformat(),
        )
        return start_date, end_date + timedelta(days=1), period

    # Fall back to year/month (required when no date range given)
    if year is None or month is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide either year+month or start_date+end_date",
        )
    start, end = _validate_year_month(year, month)
    period = ReportPeriod(
        start=start.isoformat(),
        end=(end - timedelta(days=1)).isoformat(),
    )
    return start, end, period


# ============ Response Models ============


class ReportPeriod(BaseModel):
    start: str
    end: str


class MonthlySummaryResponse(BaseModel):
    """Monthly income / expense summary for a single user."""

    year: Optional[int] = None
    month: Optional[int] = None
    period: ReportPeriod
    total_income: Decimal = Field(..., description="Sum of income-type transactions")
    total_expenses: Decimal = Field(..., description="Sum of expense-type transactions")
    net_balance: Decimal = Field(..., description="total_income - total_expenses")

    class Config:
        json_schema_extra = {
            "example": {
                "year": 2026,
                "month": 4,
                "total_income": "5000.00",
                "total_expenses": "3200.00",
                "net_balance": "1800.00",
            }
        }


class CategoryBreakdownItem(BaseModel):
    """Single category slice in the breakdown response."""

    category_id: Optional[str] = Field(
        None, description="UUID string, or None for 'Uncategorized' slice"
    )
    category_name: str
    total: Decimal
    percentage: float = Field(..., description="Percentage of total expenses (0-100)")


class CategoryBreakdownResponse(BaseModel):
    """Expense breakdown per category for a single month."""

    year: Optional[int] = None
    month: Optional[int] = None
    period: ReportPeriod
    total_expenses: Decimal
    items: List[CategoryBreakdownItem]

    class Config:
        json_schema_extra = {
            "example": {
                "year": 2026,
                "month": 4,
                "total_expenses": "3200.00",
                "items": [
                    {
                        "category_id": "550e8400-e29b-41d4-a716-446655440000",
                        "category_name": "Food",
                        "total": "800.00",
                        "percentage": 25.0,
                    }
                ],
            }
        }


# ============ Endpoint: Monthly Summary ============


@router.get("/monthly-summary", response_model=MonthlySummaryResponse)
async def monthly_summary(
    year: Optional[int] = Query(default=None, ge=1970, le=9999, description="Target year (e.g., 2026)"),
    month: Optional[int] = Query(default=None, ge=1, le=12, description="Target month (1-12)"),
    start_date: Optional[date] = Query(default=None, description="Range start (inclusive), ISO date"),
    end_date: Optional[date] = Query(default=None, description="Range end (inclusive), ISO date"),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Return total income, total expenses, and net balance for the authenticated
    user within the given period.

    Accepts either ``year``+``month`` (monthly calendar mode) or
    ``start_date``+``end_date`` (custom range). Both params of the chosen mode
    must be present; mixing modes returns 422.
    """
    range_start, range_end, period = _resolve_date_range(year, month, start_date, end_date)

    rows = (
        db.query(Transaction.type, func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            and_(
                Transaction.user_id == UUID(user_id),
                Transaction.transaction_date >= range_start,
                Transaction.transaction_date < range_end,
                Transaction.deleted_at.is_(None),
            )
        )
        .group_by(Transaction.type)
        .all()
    )

    total_income = Decimal("0.00")
    total_expenses = Decimal("0.00")
    for tx_type, total in rows:
        if tx_type == TransactionType.INCOME:
            total_income = Decimal(str(total or 0))
        elif tx_type == TransactionType.EXPENSE:
            total_expenses = Decimal(str(total or 0))

    net_balance = total_income - total_expenses

    return MonthlySummaryResponse(
        year=year,
        month=month,
        period=period,
        total_income=total_income,
        total_expenses=total_expenses,
        net_balance=net_balance,
    )


# ============ Endpoint: Category Breakdown ============


@router.get("/category-breakdown", response_model=CategoryBreakdownResponse)
async def category_breakdown(
    year: Optional[int] = Query(default=None, ge=1970, le=9999, description="Target year (e.g., 2026)"),
    month: Optional[int] = Query(default=None, ge=1, le=12, description="Target month (1-12)"),
    start_date: Optional[date] = Query(default=None, description="Range start (inclusive), ISO date"),
    end_date: Optional[date] = Query(default=None, description="Range end (inclusive), ISO date"),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Return the expense breakdown for the authenticated user in the given period.

    Accepts either ``year``+``month`` or ``start_date``+``end_date``.
    Transactions not associated with a category appear as "Uncategorized".
    """
    range_start, range_end, period = _resolve_date_range(year, month, start_date, end_date)

    # LEFT JOIN transactions -> transaction_categories -> categories
    # so transactions with no category row still appear (as "Uncategorized").
    rows = (
        db.query(
            Category.id,
            Category.name,
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .select_from(Transaction)
        .outerjoin(
            TransactionCategory,
            TransactionCategory.transaction_id == Transaction.id,
        )
        .outerjoin(Category, Category.id == TransactionCategory.category_id)
        .filter(
            and_(
                Transaction.user_id == UUID(user_id),
                Transaction.type == TransactionType.EXPENSE,
                Transaction.transaction_date >= range_start,
                Transaction.transaction_date < range_end,
                Transaction.deleted_at.is_(None),
            )
        )
        .group_by(Category.id, Category.name)
        .all()
    )

    # Build raw items (Decimal totals, no percentages yet).
    raw_items: list[tuple[Optional[str], str, Decimal]] = []
    total_expenses = Decimal("0.00")
    for cat_id, cat_name, total in rows:
        amount = Decimal(str(total or 0))
        if amount <= 0:
            # COALESCE ensures sum is numeric; defensively skip 0-rows.
            continue
        total_expenses += amount
        raw_items.append(
            (
                str(cat_id) if cat_id is not None else None,
                cat_name or "Uncategorized",
                amount,
            )
        )

    # Sort descending by total so the biggest slice renders first.
    raw_items.sort(key=lambda it: it[2], reverse=True)

    items: list[CategoryBreakdownItem] = []
    if total_expenses > 0 and raw_items:
        # Compute percentages with rounding. Last slice absorbs drift so the
        # sum is exactly 100.0 (prevents 99.9% / 100.1% legend artifacts).
        running_sum = 0.0
        n = len(raw_items)
        for idx, (cat_id, cat_name, amount) in enumerate(raw_items):
            if idx == n - 1:
                pct = round(100.0 - running_sum, 1)
            else:
                pct = round(float(amount / total_expenses) * 100.0, 1)
                running_sum += pct
            items.append(
                CategoryBreakdownItem(
                    category_id=cat_id,
                    category_name=cat_name,
                    total=amount,
                    percentage=pct,
                )
            )

    return CategoryBreakdownResponse(
        year=year,
        month=month,
        period=period,
        total_expenses=total_expenses,
        items=items,
    )


# ============ Endpoint: Annual Summary ============


class AnnualMonthItem(BaseModel):
    month: int
    income: Decimal
    expenses: Decimal
    net: Decimal


class AnnualSummaryResponse(BaseModel):
    year: int
    months: List[AnnualMonthItem]
    totals: AnnualMonthItem


@router.get("/annual-summary", response_model=AnnualSummaryResponse)
async def annual_summary(
    year: int = Query(..., ge=1970, le=9999, description="Target year (e.g., 2026)"),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Return a 12-month breakdown for the given year.

    Months with no transactions appear with zeros. The ``totals`` item
    (month=0) is the yearly aggregate.
    """
    year_start = date(year, 1, 1)
    year_end = date(year + 1, 1, 1)

    rows = (
        db.query(
            extract("month", Transaction.transaction_date).label("m"),
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .filter(
            and_(
                Transaction.user_id == UUID(user_id),
                Transaction.transaction_date >= year_start,
                Transaction.transaction_date < year_end,
                Transaction.deleted_at.is_(None),
            )
        )
        .group_by("m", Transaction.type)
        .all()
    )

    # Build a lookup: month -> {income, expenses}
    data: dict[int, dict[str, Decimal]] = {
        m: {"income": Decimal("0.00"), "expenses": Decimal("0.00")}
        for m in range(1, 13)
    }
    for m, tx_type, total in rows:
        m_int = int(m)
        amount = Decimal(str(total or 0))
        if tx_type == TransactionType.INCOME:
            data[m_int]["income"] += amount
        elif tx_type == TransactionType.EXPENSE:
            data[m_int]["expenses"] += amount

    months = [
        AnnualMonthItem(
            month=m,
            income=data[m]["income"],
            expenses=data[m]["expenses"],
            net=data[m]["income"] - data[m]["expenses"],
        )
        for m in range(1, 13)
    ]

    total_income = sum(it.income for it in months)
    total_expenses = sum(it.expenses for it in months)
    totals = AnnualMonthItem(
        month=0,
        income=total_income,
        expenses=total_expenses,
        net=total_income - total_expenses,
    )

    return AnnualSummaryResponse(year=year, months=months, totals=totals)
