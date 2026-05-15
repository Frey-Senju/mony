"""
Insights endpoints for Mony API — Story 2.4.

Rule-based pattern analysis: top categories, month-over-month trend,
anomaly detection (spending > 150% of 3-month average), and keyword-based
auto-categorization.

No migrations required — all insights computed on-the-fly over existing tables.

Endpoints:
  GET /insights/monthly                                    — full insight report
  GET /insights/auto-categorize?description=X&merchant=Y  — category suggestion
"""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import Category, Transaction, TransactionCategory, TransactionType
from utils.auth import get_current_user_from_header

router = APIRouter(prefix="/insights", tags=["insights"])

# ============ Constants ============

ANOMALY_THRESHOLD = Decimal("1.5")  # 150% of 3-month average
STABLE_BAND = Decimal("5")          # ±5% = stable trend

KEYWORD_MAP: dict[str, list[str]] = {
    "Alimentação": [
        "mcdonalds", "ifood", "rappi", "burger", "restaurante", "padaria",
        "mercado", "supermercado", "carrefour", "extra", "pao de acucar",
        "walmart", "lanchonete", "pizzaria", "sushi", "churrascaria",
    ],
    "Transporte": [
        "uber", "99pop", "cabify", "combustivel", "gasolina", "onibus",
        "metro", "estacionamento", "pedagio", "taxi", "brt", "vlt",
    ],
    "Saúde": [
        "farmacia", "drogaria", "medico", "clinica", "hospital", "exame",
        "laboratorio", "dentista", "plano de saude", "psicologia", "academia",
    ],
    "Lazer": [
        "netflix", "spotify", "amazon prime", "disney", "cinema", "teatro",
        "show", "bar", "balada", "ingresso", "parque", "viagem",
    ],
    "Educação": [
        "udemy", "coursera", "escola", "faculdade", "curso", "livro",
        "amazon kindle", "alura", "rocketseat", "descomplica",
    ],
    "Moradia": [
        "aluguel", "condominio", "energia", "agua", "gas", "internet",
        "telefone", "celular", "claro", "vivo", "tim", "oi",
    ],
    "Vestuário": [
        "zara", "hm", "renner", "riachuelo", "c&a", "shopping",
        "roupa", "calcado", "tenis", "adidas", "nike",
    ],
    "Viagem": [
        "airbnb", "booking", "hotel", "passagem", "aeroporto",
        "latam", "gol", "azul", "avianca", "trip",
    ],
}


# ============ Helpers ============


def _month_range(y: int, m: int) -> tuple[date, date]:
    start = date(y, m, 1)
    end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
    return start, end


def _total_expenses(db: Session, uid: UUID, start: date, end: date) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            and_(
                Transaction.user_id == uid,
                Transaction.type == TransactionType.EXPENSE,
                Transaction.transaction_date >= start,
                Transaction.transaction_date < end,
                Transaction.deleted_at.is_(None),
            )
        )
        .scalar()
    )
    return Decimal(str(total or 0))


def _expenses_by_category(
    db: Session, uid: UUID, start: date, end: date
) -> list[tuple[str, Decimal]]:
    rows = (
        db.query(
            Category.name,
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .select_from(Transaction)
        .join(TransactionCategory, TransactionCategory.transaction_id == Transaction.id)
        .join(Category, Category.id == TransactionCategory.category_id)
        .filter(
            and_(
                Transaction.user_id == uid,
                Transaction.type == TransactionType.EXPENSE,
                Transaction.transaction_date >= start,
                Transaction.transaction_date < end,
                Transaction.deleted_at.is_(None),
            )
        )
        .group_by(Category.name)
        .order_by(func.sum(Transaction.amount).desc())
        .all()
    )
    return [(name, Decimal(str(total or 0))) for name, total in rows]


def _normalize(text: str) -> str:
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


# ============ Response Models ============


class TopCategory(BaseModel):
    category: str
    total: Decimal
    percentage_of_expenses: Decimal


class Trend(BaseModel):
    current_month_expenses: Decimal
    previous_month_expenses: Decimal
    pct_change: Decimal
    trend_direction: str


class Anomaly(BaseModel):
    category: str
    current_month: Decimal
    avg_3m: Decimal
    ratio: Decimal


class InsightPeriod(BaseModel):
    month: int
    year: int


class MonthlyInsightsResponse(BaseModel):
    period: InsightPeriod
    top_categories: List[TopCategory]
    trend: Trend
    anomalies: List[Anomaly]


class AutoCategorizeResponse(BaseModel):
    category: Optional[str]
    confidence: str


# ============ Endpoints ============


@router.get("/monthly", response_model=MonthlyInsightsResponse)
async def monthly_insights(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = UUID(user_id)
    today = date.today()

    # Current month
    cur_start, cur_end = _month_range(today.year, today.month)
    cur_total = _total_expenses(db, uid, cur_start, cur_end)
    cur_cats = _expenses_by_category(db, uid, cur_start, cur_end)

    # Top 3 categories
    top: list[TopCategory] = []
    for name, total in cur_cats[:3]:
        pct = (total / cur_total * 100).quantize(Decimal("0.1")) if cur_total else Decimal("0")
        top.append(TopCategory(category=name, total=total, percentage_of_expenses=pct))

    # Month-over-month trend
    prev_month = today.month - 1 if today.month > 1 else 12
    prev_year = today.year if today.month > 1 else today.year - 1
    prev_start, prev_end = _month_range(prev_year, prev_month)
    prev_total = _total_expenses(db, uid, prev_start, prev_end)

    if prev_total == 0:
        pct_change = Decimal("100") if cur_total > 0 else Decimal("0")
    else:
        pct_change = ((cur_total - prev_total) / prev_total * 100).quantize(Decimal("0.1"))

    if abs(pct_change) <= STABLE_BAND:
        direction = "stable"
    elif pct_change > 0:
        direction = "up"
    else:
        direction = "down"

    trend = Trend(
        current_month_expenses=cur_total,
        previous_month_expenses=prev_total,
        pct_change=pct_change,
        trend_direction=direction,
    )

    # Anomaly detection — need ≥2 previous months of data
    anomalies: list[Anomaly] = []
    months_back = []
    for delta in range(1, 4):
        m = today.month - delta
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        months_back.append((y, m))

    # Collect per-category totals for the last 3 months
    cat_history: dict[str, list[Decimal]] = {}
    for y, m in months_back:
        s, e = _month_range(y, m)
        for name, total in _expenses_by_category(db, uid, s, e):
            cat_history.setdefault(name, []).append(total)

    # Flag if insufficient history (less than 2 months with data)
    months_with_data = sum(
        1 for y, m in months_back
        if _total_expenses(db, uid, *_month_range(y, m)) > 0
    )
    if months_with_data >= 2:
        cur_cat_map = dict(cur_cats)
        for cat, history in cat_history.items():
            if len(history) < 2:
                continue
            avg = sum(history) / len(history)
            current = cur_cat_map.get(cat, Decimal("0"))
            if avg > 0 and current / avg > ANOMALY_THRESHOLD:
                ratio = (current / avg).quantize(Decimal("0.01"))
                anomalies.append(
                    Anomaly(
                        category=cat,
                        current_month=current,
                        avg_3m=avg.quantize(Decimal("0.01")),
                        ratio=ratio,
                    )
                )

    return MonthlyInsightsResponse(
        period=InsightPeriod(month=today.month, year=today.year),
        top_categories=top,
        trend=trend,
        anomalies=sorted(anomalies, key=lambda a: a.ratio, reverse=True),
    )


@router.get("/auto-categorize", response_model=AutoCategorizeResponse)
async def auto_categorize(
    description: str = Query(default="", max_length=500),
    merchant: str = Query(default="", max_length=255),
    user_id: str = Depends(get_current_user_from_header),
):
    combined = _normalize(f"{description} {merchant}")

    for category, keywords in KEYWORD_MAP.items():
        for kw in keywords:
            if _normalize(kw) in combined:
                return AutoCategorizeResponse(category=category, confidence="high")

    # Partial match: any single word from description matches a keyword prefix
    words = [w for w in combined.split() if len(w) >= 4]
    for category, keywords in KEYWORD_MAP.items():
        for kw in keywords:
            kw_norm = _normalize(kw)
            if any(w in kw_norm or kw_norm.startswith(w) for w in words):
                return AutoCategorizeResponse(category=category, confidence="low")

    return AutoCategorizeResponse(category=None, confidence="none")
