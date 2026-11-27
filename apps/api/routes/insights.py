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

from calendar import monthrange
from datetime import date, datetime
from decimal import Decimal
import re
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

from database.base import get_db
from database.models import (
    Account,
    Category,
    CreditCard,
    Goal,
    Transaction,
    TransactionCategory,
    TransactionType,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

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


# ============ EPIC-008: Spending X-Ray, Month Comparator, Mony Review & Global Search ============

WEEKDAY_LABELS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
WEEKDAY_FULL_PT = ["segundas", "terças", "quartas", "quintas", "sextas", "sábados", "domingos"]


def _prev_ym(ym: str) -> str:
    try:
        y, m = int(ym[:4]), int(ym[5:7])
    except Exception:
        t = date.today()
        y, m = t.year, t.month
    if m == 1:
        return f"{y - 1}-12"
    return f"{y}-{m - 1:02d}"


def _clean_merchant_key(tx: Transaction) -> str:
    raw = (tx.merchant_name or tx.description or "Outros").strip()
    # Strip trailing installment suffixes like " 3/10" or "(2/6)" so the same merchant groups together
    cleaned = re.sub(r"\s*\(?\d{1,2}\s*/\s*\d{1,2}\)?\s*$", "", raw).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned or raw or "Outros"


def _tx_effective_ym(tx: Transaction) -> str:
    if tx.statement_month and len(tx.statement_month) >= 7:
        return tx.statement_month[:7]
    if tx.transaction_date:
        return tx.transaction_date.strftime("%Y-%m")
    return date.today().strftime("%Y-%m")


def _tx_cat_name(tx: Transaction) -> str:
    if tx.categories:
        c = tx.categories[0].category
        if c and c.name:
            return c.name
    return "Outros"


@router.get("/xray")
async def get_spending_xray(
    month: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    compare_month: Optional[str] = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    EPIC-008 Spending X-Ray, Month A vs Month B Comparator, Weekday/Month-Third
    Heatmap and Mony Review executive snapshot for any two competency months.
    """
    uid = parse_uuid(user_id, "user_id")
    today = date.today()
    ym_a = month or f"{today.year}-{today.month:02d}"
    ym_b = compare_month or _prev_ym(ym_a)

    # Fetch all non-deleted transactions matching either month (by statement_month or transaction_date)
    all_txs = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(Transaction.user_id == uid, Transaction.deleted_at.is_(None))
        .order_by(Transaction.transaction_date.desc())
        .all()
    )

    txs_a = [t for t in all_txs if _tx_effective_ym(t) == ym_a]
    txs_b = [t for t in all_txs if _tx_effective_ym(t) == ym_b]

    def _summarize(tx_list: list[Transaction]) -> tuple[float, float, dict[str, float]]:
        inc = 0.0
        exp = 0.0
        by_cat: dict[str, float] = {}
        for t in tx_list:
            amt = float(t.amount or 0)
            if t.type == TransactionType.INCOME:
                inc += amt
            elif t.type == TransactionType.EXPENSE:
                exp += amt
                cname = _tx_cat_name(t)
                by_cat[cname] = by_cat.get(cname, 0.0) + amt
        return round(inc, 2), round(exp, 2), by_cat

    inc_a, exp_a, cats_a = _summarize(txs_a)
    inc_b, exp_b, cats_b = _summarize(txs_b)
    net_a = round(inc_a - exp_a, 2)
    net_b = round(inc_b - exp_b, 2)
    savings_rate_a = round((net_a / inc_a) * 100, 1) if inc_a > 0 else 0.0

    # Merchant ranking (expenses in month A)
    merchant_buckets: dict[str, dict] = {}
    expenses_a = [t for t in txs_a if t.type == TransactionType.EXPENSE]
    for t in expenses_a:
        m_display = _clean_merchant_key(t)
        m_key = m_display.lower()
        amt = float(t.amount or 0)
        cname = _tx_cat_name(t)
        if m_key not in merchant_buckets:
            merchant_buckets[m_key] = {
                "name": m_display,
                "count": 0,
                "total": 0.0,
                "category_name": cname,
                "items": [],
            }
        b = merchant_buckets[m_key]
        b["count"] += 1
        b["total"] += amt
        if len(b["items"]) < 10:
            b["items"].append(
                {
                    "id": str(t.id),
                    "date": t.transaction_date.isoformat() if t.transaction_date else "",
                    "description": t.description,
                    "amount": round(amt, 2),
                    "category_name": cname,
                }
            )

    merchants = sorted(merchant_buckets.values(), key=lambda x: x["total"], reverse=True)
    for m in merchants:
        m["total"] = round(m["total"], 2)
        m["avg_ticket"] = round(m["total"] / max(1, m["count"]), 2)
        m["share_pct"] = round((m["total"] / exp_a) * 100, 1) if exp_a > 0 else 0.0

    # Weekday heatmap & Month thirds (expenses in month A)
    wd_totals = [0.0] * 7
    wd_counts = [0] * 7
    thirds = [
        {"label": "Dias 1–10", "total": 0.0, "count": 0},
        {"label": "Dias 11–20", "total": 0.0, "count": 0},
        {"label": "Dias 21–31", "total": 0.0, "count": 0},
    ]
    for t in expenses_a:
        if not t.transaction_date:
            continue
        amt = float(t.amount or 0)
        wd = t.transaction_date.weekday()
        wd_totals[wd] += amt
        wd_counts[wd] += 1
        day_num = t.transaction_date.day
        idx = 0 if day_num <= 10 else (1 if day_num <= 20 else 2)
        thirds[idx]["total"] += amt
        thirds[idx]["count"] += 1

    max_wd = max(wd_totals) if wd_totals else 0.0
    avg_wd = (sum(wd_totals) / 7.0) if wd_totals else 0.0
    weekday_heatmap = [
        {
            "day_index": i,
            "label": WEEKDAY_LABELS_PT[i],
            "total": round(wd_totals[i], 2),
            "count": wd_counts[i],
            "avg": round(wd_totals[i] / max(1, wd_counts[i]), 2) if wd_counts[i] else 0.0,
            "pct_of_max": round((wd_totals[i] / max_wd) * 100, 1) if max_wd > 0 else 0.0,
        }
        for i in range(7)
    ]
    peak_wd_idx = max(range(7), key=lambda i: wd_totals[i]) if max_wd > 0 else 0
    peak_above_pct = round(((wd_totals[peak_wd_idx] - avg_wd) / avg_wd) * 100) if avg_wd > 0 else 0
    weekday_insight = (
        f"Você gasta {peak_above_pct}% acima da média às {WEEKDAY_FULL_PT[peak_wd_idx]}"
        if max_wd > 0 and peak_above_pct > 10
        else "Seus gastos estão bem distribuídos ao longo da semana."
    )

    for th in thirds:
        th["total"] = round(th["total"], 2)
        th["share_pct"] = round((th["total"] / exp_a) * 100, 1) if exp_a > 0 else 0.0

    # Biggest single expense
    biggest_tx = max(expenses_a, key=lambda t: float(t.amount or 0), default=None)
    biggest_expense = (
        {
            "id": str(biggest_tx.id),
            "description": biggest_tx.description,
            "amount": round(float(biggest_tx.amount or 0), 2),
            "date": biggest_tx.transaction_date.isoformat() if biggest_tx.transaction_date else "",
            "category_name": _tx_cat_name(biggest_tx),
        }
        if biggest_tx
        else None
    )

    # Month pace projection
    ya, ma = int(ym_a[:4]), int(ym_a[5:7])
    days_in_month = monthrange(ya, ma)[1]
    is_current_month = ya == today.year and ma == today.month
    days_elapsed = today.day if is_current_month else days_in_month
    daily_avg = round(exp_a / max(1, days_elapsed), 2) if exp_a > 0 else 0.0
    projected_spend = round(daily_avg * days_in_month, 2) if is_current_month else exp_a
    projected_net = round(inc_a - projected_spend, 2)

    # Month A vs Month B category comparison
    all_cat_names = sorted(set(cats_a.keys()) | set(cats_b.keys()))
    comparison_rows = []
    for cname in all_cat_names:
        va = round(cats_a.get(cname, 0.0), 2)
        vb = round(cats_b.get(cname, 0.0), 2)
        delta = round(va - vb, 2)
        delta_pct = round(((va - vb) / vb) * 100, 1) if vb > 0 else (100.0 if va > 0 else 0.0)
        comparison_rows.append(
            {
                "category": cname,
                "amount_a": va,
                "amount_b": vb,
                "delta": delta,
                "delta_pct": delta_pct,
            }
        )
    comparison_rows.sort(key=lambda r: abs(r["delta"]), reverse=True)

    savings_cats = [r for r in comparison_rows if r["delta"] < 0]
    increase_cats = [r for r in comparison_rows if r["delta"] > 0]
    biggest_saving = min(savings_cats, key=lambda r: r["delta"]) if savings_cats else None
    biggest_increase = max(increase_cats, key=lambda r: r["delta"]) if increase_cats else None

    if inc_a > 0 and net_a >= 0:
        headline = f"Mês no azul! Você economizou {savings_rate_a:.1f}% da sua renda ({ym_a})."
    elif exp_a > 0 and inc_a > 0:
        headline = f"Atenção: despesas superaram a renda em R$ {abs(net_a):,.2f} neste mês."
    else:
        headline = f"Resumo analítico consolidado para {ym_a}."

    return {
        "month": ym_a,
        "compare_month": ym_b,
        "review": {
            "total_income": inc_a,
            "total_expenses": exp_a,
            "net": net_a,
            "savings_rate_pct": savings_rate_a,
            "tx_count": len(txs_a),
            "expenses_count": len(expenses_a),
            "daily_avg_spend": daily_avg,
            "days_elapsed": days_elapsed,
            "days_in_month": days_in_month,
            "is_current_month": is_current_month,
            "projected_month_end_spend": projected_spend,
            "projected_net": projected_net,
            "biggest_expense": biggest_expense,
            "top_merchants": merchants[:3],
            "biggest_saving_category": biggest_saving,
            "biggest_increase_category": biggest_increase,
            "headline": headline,
        },
        "merchants": merchants[:25],
        "weekday_heatmap": weekday_heatmap,
        "weekday_insight": weekday_insight,
        "month_thirds": thirds,
        "comparison": {
            "month_a": ym_a,
            "month_b": ym_b,
            "income_a": inc_a,
            "income_b": inc_b,
            "expenses_a": exp_a,
            "expenses_b": exp_b,
            "net_a": net_a,
            "net_b": net_b,
            "categories": comparison_rows,
        },
    }


@router.get("/global-search")
async def global_search(
    q: str = Query(..., min_length=1, max_length=120),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    EPIC-008 Ctrl+K 2.0 real-time search across transactions, accounts, goals,
    and credit cards scoped strictly to the authenticated user.
    """
    uid = parse_uuid(user_id, "user_id")
    term = q.strip()
    like = f"%{term}%"

    # Numeric search support (e.g., typing "2731" finds R$ 2.731,91)
    tx_filters = [
        Transaction.description.ilike(like),
        Transaction.merchant_name.ilike(like),
        Transaction.notes.ilike(like),
    ]
    cleaned_num = term.replace("R$", "").replace(".", "").replace(",", ".").strip()
    try:
        num_val = float(cleaned_num)
        if num_val > 0:
            tx_filters.append(
                and_(
                    Transaction.amount >= Decimal(str(max(0, num_val - 1))),
                    Transaction.amount <= Decimal(str(num_val + 1)),
                )
            )
    except ValueError:
        pass

    txs = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            or_(*tx_filters),
        )
        .order_by(Transaction.transaction_date.desc())
        .limit(8)
        .all()
    )

    accounts = (
        db.query(Account)
        .filter(Account.user_id == uid, Account.deleted_at.is_(None), Account.name.ilike(like))
        .limit(4)
        .all()
    )
    goals = (
        db.query(Goal)
        .filter(Goal.user_id == uid, Goal.deleted_at.is_(None), Goal.name.ilike(like))
        .limit(4)
        .all()
    )
    cards = (
        db.query(CreditCard)
        .filter(CreditCard.user_id == uid, CreditCard.name.ilike(like))
        .limit(4)
        .all()
    )

    return {
        "query": term,
        "transactions": [
            {
                "id": str(t.id),
                "description": t.description,
                "amount": float(t.amount or 0),
                "type": t.type.value if hasattr(t.type, "value") else str(t.type),
                "date": t.transaction_date.isoformat() if t.transaction_date else "",
                "statement_month": _tx_effective_ym(t),
                "category_name": _tx_cat_name(t),
            }
            for t in txs
        ],
        "accounts": [
            {"id": str(a.id), "name": a.name, "balance": float(a.balance or 0), "icon": a.icon}
            for a in accounts
        ],
        "goals": [
            {
                "id": str(g.id),
                "name": g.name,
                "current_amount": float(g.current_amount or 0),
                "target_amount": float(g.target_amount or 0),
            }
            for g in goals
        ],
        "cards": [
            {"id": str(c.id), "name": c.name, "brand": c.brand, "last4": c.last4}
            for c in cards
        ],
    }
