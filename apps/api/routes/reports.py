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
from statistics import median as _median
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, extract, func, or_
from sqlalchemy.orm import Session, joinedload

from database.base import get_db
from database.models import (
    Account,
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


# ============ Endpoint: Cashflow + Month-by-Month Category Matrix ============

_PT_MONTH_NAMES = [
    "",
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]
_PT_MONTH_SHORT = [
    "",
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
]


def _nonzero_avg(vals: list[float]) -> float:
    nz = [v for v in vals if v > 0]
    return round(sum(nz) / len(nz), 2) if nz else 0.0


def _nonzero_median(vals: list[float]) -> float:
    nz = [v for v in vals if v != 0]
    return round(float(_median(nz)), 2) if nz else 0.0


@router.get("/cashflow")
async def get_annual_cashflow(
    year: int = Query(default=None, ge=1970, le=9999),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Full annual Cashflow & Month-by-Month Category Expense Matrix.

    Computes monthly gains, expenses, % committed, surplus, cumulative balance,
    per-category 12-month matrix, averages, medians, totals, and live account
    reserves — honoring `statement_month` when set for invoice competency.
    """
    uid = UUID(user_id)
    target_year = year or date.today().year
    year_prefix = f"{target_year:04d}-"
    year_start = date(target_year, 1, 1)
    year_end = date(target_year + 1, 1, 1)

    txs = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            or_(
                Transaction.statement_month.like(f"{year_prefix}%"),
                and_(
                    Transaction.statement_month.is_(None),
                    Transaction.transaction_date >= year_start,
                    Transaction.transaction_date < year_end,
                ),
            ),
        )
        .all()
    )

    monthly_income: dict[int, float] = {m: 0.0 for m in range(1, 13)}
    monthly_expenses: dict[int, float] = {m: 0.0 for m in range(1, 13)}
    monthly_cat: dict[int, dict[str, float]] = {m: {} for m in range(1, 13)}
    category_totals: dict[str, float] = {}

    for tx in txs:
        if tx.statement_month and tx.statement_month.startswith(year_prefix):
            try:
                m_idx = int(tx.statement_month.split("-")[1])
            except (ValueError, IndexError):
                m_idx = tx.transaction_date.month
        else:
            m_idx = tx.transaction_date.month

        if not (1 <= m_idx <= 12):
            continue

        amt = float(tx.amount or 0)
        if tx.type == TransactionType.INCOME:
            monthly_income[m_idx] += amt
        elif tx.type == TransactionType.EXPENSE:
            monthly_expenses[m_idx] += amt
            cat_name = tx.categories[0].category.name if tx.categories and tx.categories[0].category else "Sem Categoria"
            monthly_cat[m_idx][cat_name] = monthly_cat[m_idx].get(cat_name, 0.0) + amt
            category_totals[cat_name] = category_totals.get(cat_name, 0.0) + amt

    # Sort categories by descending yearly expense total
    ordered_categories = [
        name for name, _ in sorted(category_totals.items(), key=lambda kv: kv[1], reverse=True)
    ]

    months_payload = []
    cumulative = 0.0
    for m in range(1, 13):
        inc = round(monthly_income[m], 2)
        exp = round(monthly_expenses[m], 2)
        net = round(inc - exp, 2)
        cumulative = round(cumulative + net, 2)
        ratio = round((exp / inc) * 100, 1) if inc > 0 else (100.0 if exp > 0 else 0.0)
        by_cat = {cat: round(monthly_cat[m].get(cat, 0.0), 2) for cat in ordered_categories}
        months_payload.append({
            "month": m,
            "ym": f"{target_year:04d}-{m:02d}",
            "label": _PT_MONTH_NAMES[m],
            "short_label": _PT_MONTH_SHORT[m],
            "income": inc,
            "expenses": exp,
            "expense_ratio_pct": ratio,
            "net": net,
            "cumulative_net": cumulative,
            "by_category": by_cat,
        })

    incomes = [m["income"] for m in months_payload]
    expenses = [m["expenses"] for m in months_payload]
    nets = [m["net"] for m in months_payload]

    avg_inc = _nonzero_avg(incomes)
    avg_exp = _nonzero_avg(expenses)
    avg_net_nz = [n for n in nets if n != 0]
    avg_net = round(sum(avg_net_nz) / len(avg_net_nz), 2) if avg_net_nz else 0.0

    med_inc = _nonzero_median(incomes)
    med_exp = _nonzero_median(expenses)
    med_net = _nonzero_median(nets)

    tot_inc = round(sum(incomes), 2)
    tot_exp = round(sum(expenses), 2)
    tot_net = round(tot_inc - tot_exp, 2)

    cat_avg: dict[str, float] = {}
    cat_med: dict[str, float] = {}
    cat_tot: dict[str, float] = {}
    cat_pct_med_inc: dict[str, float] = {}
    cat_pct_tot_inc: dict[str, float] = {}

    for cat in ordered_categories:
        series = [m["by_category"][cat] for m in months_payload]
        c_avg = _nonzero_avg(series)
        c_med = _nonzero_median(series)
        c_tot = round(sum(series), 2)
        cat_avg[cat] = c_avg
        cat_med[cat] = c_med
        cat_tot[cat] = c_tot
        cat_pct_med_inc[cat] = round((c_med / med_inc) * 100, 1) if med_inc > 0 else 0.0
        cat_pct_tot_inc[cat] = round((c_tot / tot_inc) * 100, 1) if tot_inc > 0 else 0.0

    # Current total liquid reserve from user's active accounts
    accounts = (
        db.query(Account)
        .filter(Account.user_id == uid, Account.deleted_at.is_(None))
        .all()
    )
    current_reserve = round(sum(max(0.0, float(a.balance or 0)) for a in accounts), 2)

    return {
        "year": target_year,
        "categories": ordered_categories,
        "months": months_payload,
        "stats": {
            "avg_income": avg_inc,
            "avg_expenses": avg_exp,
            "avg_net": avg_net,
            "avg_expense_ratio_pct": round((avg_exp / avg_inc) * 100, 1) if avg_inc > 0 else 0.0,
            "median_income": med_inc,
            "median_expenses": med_exp,
            "median_net": med_net,
            "median_expense_ratio_pct": round((med_exp / med_inc) * 100, 1) if med_inc > 0 else 0.0,
            "total_income": tot_inc,
            "total_expenses": tot_exp,
            "total_net": tot_net,
            "total_expense_ratio_pct": round((tot_exp / tot_inc) * 100, 1) if tot_inc > 0 else 0.0,
            "category_avg": cat_avg,
            "category_median": cat_med,
            "category_total": cat_tot,
            "category_pct_of_median_income": cat_pct_med_inc,
            "category_pct_of_total_income": cat_pct_tot_inc,
        },
        "current_reserve_balance": current_reserve,
    }


@router.get("/analytics")
async def get_reports_analytics(
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    month: Optional[int] = Query(default=None, ge=1, le=12),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Rich analytics dataset for Reports 2.0 (Story 5.8):
      1. 12-month cashflow (income vs expenses vs net)
      2. 6-month category evolution (stacked area)
      3. Payment method & Account breakdown for selected month
      4. Day-of-week spending heatmap (Mon-Sun)
      5. Top 10 merchants
      6. Month-over-Month & 3-month average delta per category
      7. Crisp Portuguese AI executive summary
    """
    from collections import defaultdict
    from sqlalchemy.orm import joinedload
    from database.models import TransactionCategory

    uid = UUID(user_id)
    today = date.today()
    sel_year = year or today.year
    sel_month = month or today.month
    sel_ym = f"{sel_year:04d}-{sel_month:02d}"

    # Build trailing 12-month window ending at (sel_year, sel_month)
    pt_months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    months_12: list[tuple[str, str]] = []
    y, m = sel_year, sel_month
    for _ in range(12):
        months_12.append((f"{y:04d}-{m:02d}", f"{pt_months[m - 1]}/{str(y)[-2:]}"))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months_12.reverse()
    ym_set_12 = {ym for ym, _ in months_12}
    months_6 = months_12[-6:]
    prev_ym = months_12[-2][0] if len(months_12) >= 2 else sel_ym
    prev3_yms = {ym for ym, _ in months_12[-4:-1]}

    oldest_ym = months_12[0][0]
    cutoff = date(int(oldest_ym[:4]), int(oldest_ym[5:7]), 1) - timedelta(days=32)

    txs = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            Transaction.transaction_date >= cutoff,
            Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE, TransactionType.REFUND]),
        )
        .all()
    )
    accts = db.query(Account).filter(Account.user_id == uid, Account.deleted_at.is_(None)).all()
    acct_names = {a.id: a.name for a in accts}

    m_inc: dict[str, float] = defaultdict(float)
    m_exp: dict[str, float] = defaultdict(float)
    cat_by_ym: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    cat_total_6m: dict[str, float] = defaultdict(float)

    pm_map: dict[str, dict[str, float | int]] = defaultdict(lambda: {"total": 0.0, "count": 0})
    acct_map: dict[str, float] = defaultdict(float)
    weekday_map: dict[int, dict[str, float | int]] = {i: {"total": 0.0, "count": 0} for i in range(7)}
    merchant_map: dict[str, dict[str, float | int]] = defaultdict(lambda: {"total": 0.0, "count": 0})

    for tx in txs:
        ym = tx.statement_month or tx.transaction_date.strftime("%Y-%m")
        if ym not in ym_set_12:
            continue
        amt = float(tx.amount or 0)
        if tx.type == TransactionType.INCOME:
            m_inc[ym] += amt
        elif tx.type == TransactionType.EXPENSE:
            m_exp[ym] += amt
            cname = tx.categories[0].category.name if tx.categories and tx.categories[0].category else "Outros"
            cat_by_ym[ym][cname] += amt
            if any(ym == x[0] for x in months_6):
                cat_total_6m[cname] += amt
            if ym == sel_ym:
                pm = tx.payment_method or "other"
                pm_map[pm]["total"] = round(float(pm_map[pm]["total"]) + amt, 2)
                pm_map[pm]["count"] = int(pm_map[pm]["count"]) + 1
                acct_map[acct_names.get(tx.account_id, "Conta")] += amt
                wd = tx.transaction_date.weekday()
                weekday_map[wd]["total"] = round(float(weekday_map[wd]["total"]) + amt, 2)
                weekday_map[wd]["count"] = int(weekday_map[wd]["count"]) + 1
                merch = (tx.merchant_name or tx.description or "Outro").strip()[:45]
                merchant_map[merch]["total"] = round(float(merchant_map[merch]["total"]) + amt, 2)
                merchant_map[merch]["count"] = int(merchant_map[merch]["count"]) + 1

    monthly_cashflow_12m = [
        {
            "ym": ym,
            "label": label,
            "income": round(m_inc[ym], 2),
            "expenses": round(m_exp[ym], 2),
            "net": round(m_inc[ym] - m_exp[ym], 2),
        }
        for ym, label in months_12
    ]

    top6_cats = [k for k, _ in sorted(cat_total_6m.items(), key=lambda kv: kv[1], reverse=True)[:6]]
    category_evolution_6m = []
    for ym, label in months_6:
        row: dict[str, object] = {"ym": ym, "label": label}
        for c in top6_cats:
            row[c] = round(cat_by_ym[ym].get(c, 0.0), 2)
        category_evolution_6m.append(row)

    PM_LABELS = {
        "credit_card": "Cartão de Crédito",
        "debit_card": "Cartão de Débito",
        "pix": "PIX",
        "boleto": "Boleto",
        "bank_transfer": "Transferência",
        "cash": "Dinheiro",
        "other": "Outros",
    }
    by_payment_method = [
        {"method": k, "label": PM_LABELS.get(k, k), "total": round(float(v["total"]), 2), "count": int(v["count"])}
        for k, v in sorted(pm_map.items(), key=lambda kv: float(kv[1]["total"]), reverse=True)
    ]

    by_account = [
        {"account": k, "total": round(v, 2)}
        for k, v in sorted(acct_map.items(), key=lambda kv: kv[1], reverse=True)
    ]

    WD_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
    weekday_heatmap = [
        {
            "day_index": i,
            "label": WD_LABELS[i],
            "total": round(float(weekday_map[i]["total"]), 2),
            "count": int(weekday_map[i]["count"]),
        }
        for i in range(7)
    ]

    top_merchants = [
        {"merchant": k, "total": round(float(v["total"]), 2), "count": int(v["count"])}
        for k, v in sorted(merchant_map.items(), key=lambda kv: float(kv[1]["total"]), reverse=True)[:10]
    ]

    all_sel_cats = set(cat_by_ym[sel_ym].keys()) | set(cat_by_ym[prev_ym].keys())
    category_delta_mom = []
    for c in all_sel_cats:
        cur_v = round(cat_by_ym[sel_ym].get(c, 0.0), 2)
        prev_v = round(cat_by_ym[prev_ym].get(c, 0.0), 2)
        avg3 = round(sum(cat_by_ym[p].get(c, 0.0) for p in prev3_yms) / max(1, len(prev3_yms)), 2)
        delta_val = round(cur_v - prev_v, 2)
        delta_pct = round((delta_val / prev_v) * 100.0, 1) if prev_v > 0 else (100.0 if cur_v > 0 else 0.0)
        category_delta_mom.append({
            "category": c,
            "current": cur_v,
            "previous": prev_v,
            "avg_3m": avg3,
            "delta_value": delta_val,
            "delta_pct": delta_pct,
        })
    category_delta_mom.sort(key=lambda x: x["current"], reverse=True)

    cur_inc = round(m_inc[sel_ym], 2)
    cur_exp = round(m_exp[sel_ym], 2)
    prev_exp = round(m_exp[prev_ym], 2)
    savings_rate = round(((cur_inc - cur_exp) / cur_inc) * 100.0, 1) if cur_inc > 0 else 0.0
    exp_diff_pct = round(((cur_exp - prev_exp) / prev_exp) * 100.0, 1) if prev_exp > 0 else 0.0
    top_cat = category_delta_mom[0]["category"] if category_delta_mom else "Nenhuma"
    busiest_day = max(weekday_heatmap, key=lambda d: d["total"])

    summary_parts = [
        f"Em {pt_months[sel_month - 1]}/{sel_year}, suas receitas somaram R$ {cur_inc:,.2f} e despesas R$ {cur_exp:,.2f} (taxa de poupança de {savings_rate}%)."
    ]
    if prev_exp > 0:
        trend = "acima" if exp_diff_pct > 0 else "abaixo"
        summary_parts.append(f"Os gastos ficaram {abs(exp_diff_pct)}% {trend} do mês anterior.")
    if category_delta_mom:
        summary_parts.append(f"Maior categoria: {top_cat} (R$ {category_delta_mom[0]['current']:,.2f}).")
    if busiest_day["total"] > 0:
        summary_parts.append(f"Dia com maior volume de gastos: {busiest_day['label']} (R$ {busiest_day['total']:,.2f}).")

    ai_summary = " ".join(summary_parts).replace(",", "X").replace(".", ",").replace("X", ".")

    return {
        "period": sel_ym,
        "monthly_cashflow_12m": monthly_cashflow_12m,
        "top_categories_6m": top6_cats,
        "category_evolution_6m": category_evolution_6m,
        "by_payment_method": by_payment_method,
        "by_account": by_account,
        "weekday_heatmap": weekday_heatmap,
        "top_merchants": top_merchants,
        "category_delta_mom": category_delta_mom,
        "savings_rate_pct": savings_rate,
        "ai_executive_summary": ai_summary,
    }
