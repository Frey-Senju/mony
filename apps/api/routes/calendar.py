"""
Financial Calendar, 90-Day Cash Projection, Subscriptions Radar & Financial Health Score (EPIC-006).

Endpoints:
- GET /calendar/projection?days=90&year=YYYY&month=MM
- GET /insights/subscriptions-radar
- GET /insights/health-score
"""

from __future__ import annotations

import calendar
import re
from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from database.base import get_db
from database.models import (
    AISuggestion,
    Account,
    AccountType,
    Budget,
    CreditCard,
    Debt,
    Goal,
    InvestmentAsset,
    InvestmentDividend,
    RecurringRule,
    Transaction,
    TransactionCategory,
    TransactionType,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(tags=["calendar-and-health"])


def _normalize_merchant(text: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9\s]", " ", (text or "").lower())
    clean = re.sub(r"\b(parcela|parc|pag|pix|compra|debito|credito|br|ltda|sa)\b", " ", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean[:32] or "outro"


def _clamp_day(year: int, month: int, day: int) -> date:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(max(1, day), last_day))


@router.get("/calendar/projection")
async def get_calendar_projection(
    days: int = Query(default=90, ge=14, le=180),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    month: Optional[int] = Query(default=None, ge=1, le=12),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Projects daily liquid balance for the next ``days`` days and builds a
    monthly financial calendar combining:
    - Liquid account balances (checking, savings, cash)
    - Active recurring rules (income & expenses)
    - Future credit card invoice dues
    - Upcoming scheduled/installment transactions
    - Upcoming B3 dividends (if any)
    """
    uid = parse_uuid(user_id, "user_id")
    today = date.today()
    sel_year = year or today.year
    sel_month = month or today.month
    end_horizon = today + timedelta(days=days)

    accounts = (
        db.query(Account)
        .filter(Account.user_id == uid, Account.deleted_at.is_(None))
        .all()
    )
    liquid_types = {AccountType.CHECKING, AccountType.SAVINGS, AccountType.CASH}
    current_liquid_balance = round(
        sum(float(a.balance or 0) for a in accounts if a.type in liquid_types), 2
    )

    events_by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)

    # 1. Active recurring rules projected across the horizon + selected month
    rules = (
        db.query(RecurringRule)
        .filter(
            RecurringRule.user_id == uid,
            RecurringRule.is_active.is_(True),
            RecurringRule.deleted_at.is_(None),
        )
        .all()
    )

    # Collect (y, m) pairs covering selected month and [today..end_horizon]
    month_pairs: set[tuple[int, int]] = {(sel_year, sel_month)}
    cur_d = date(today.year, today.month, 1)
    while cur_d <= end_horizon:
        month_pairs.add((cur_d.year, cur_d.month))
        if cur_d.month == 12:
            cur_d = date(cur_d.year + 1, 1, 1)
        else:
            cur_d = date(cur_d.year, cur_d.month + 1, 1)

    for rule in rules:
        amt = float(rule.amount or 0)
        is_inc = rule.type == TransactionType.INCOME
        for y, m in sorted(month_pairs):
            d = _clamp_day(y, m, int(rule.day_of_month or 1))
            if d < today and (y, m) != (sel_year, sel_month):
                continue
            if d > end_horizon and (y, m) != (sel_year, sel_month):
                continue
            events_by_day[d.isoformat()].append({
                "kind": "recurring",
                "title": rule.description,
                "category": rule.category_name or "Outros",
                "amount": round(amt, 2),
                "direction": "in" if is_inc else "out",
                "source": rule.source or "manual",
            })

    # 2. Active credit cards: add due-day reminders for open / projected balance
    cards = (
        db.query(CreditCard)
        .filter(
            CreditCard.user_id == uid,
            CreditCard.is_active.is_(True),
            CreditCard.deleted_at.is_(None),
        )
        .all()
    )
    for card in cards:
        due_day = int(card.due_day or 10)
        est_invoice = float(card.pluggy_balance or 0)
        if est_invoice <= 0:
            # Estimate from current month credit_card expenses on linked account
            ym_now = today.strftime("%Y-%m")
            q = db.query(Transaction).filter(
                Transaction.user_id == uid,
                Transaction.deleted_at.is_(None),
                Transaction.type == TransactionType.EXPENSE,
                Transaction.payment_method == "credit_card",
                Transaction.statement_month == ym_now,
            )
            if card.account_id:
                q = q.filter(Transaction.account_id == card.account_id)
            est_invoice = sum(float(t.amount or 0) for t in q.all())

        if est_invoice > 0:
            d = _clamp_day(today.year, today.month, due_day)
            if d < today:
                ny = today.year + (1 if today.month == 12 else 0)
                nm = 1 if today.month == 12 else today.month + 1
                d = _clamp_day(ny, nm, due_day)
            events_by_day[d.isoformat()].append({
                "kind": "card_due",
                "title": f"Fatura {card.name}",
                "category": "Cartão de Crédito",
                "amount": round(est_invoice, 2),
                "direction": "out",
                "source": "credit_card",
            })

    # 3. Active debts monthly due dates
    debts = (
        db.query(Debt)
        .filter(Debt.user_id == uid, Debt.is_active.is_(True), Debt.deleted_at.is_(None))
        .all()
    )
    for debt in debts:
        pmt = float(debt.monthly_payment or 0)
        if pmt <= 0:
            continue
        for y, m in sorted(month_pairs):
            d = _clamp_day(y, m, int(debt.due_day or 10))
            if (d < today or d > end_horizon) and (y, m) != (sel_year, sel_month):
                continue
            events_by_day[d.isoformat()].append({
                "kind": "debt",
                "title": f"Parcela {debt.name}",
                "category": "Dívidas",
                "amount": round(pmt, 2),
                "direction": "out",
                "source": "debt",
            })

    # 4. Upcoming / selected-month B3 Dividends
    divs = (
        db.query(InvestmentDividend)
        .options(joinedload(InvestmentDividend.asset))
        .filter(
            InvestmentDividend.user_id == uid,
            InvestmentDividend.payment_date >= date(sel_year, sel_month, 1) - timedelta(days=31),
        )
        .all()
    )
    for div in divs:
        if not div.payment_date:
            continue
        ticker = div.asset.ticker if div.asset else "B3"
        events_by_day[div.payment_date.isoformat()].append({
            "kind": "dividend",
            "title": f"Provento {ticker}",
            "category": "Investimentos",
            "amount": round(float(div.total_amount or 0), 2),
            "direction": "in",
            "source": "b3",
        })

    # 5. Selected-month actual transactions (for calendar visibility)
    m_start = date(sel_year, sel_month, 1)
    m_end = date(sel_year + (1 if sel_month == 12 else 0), 1 if sel_month == 12 else sel_month + 1, 1)
    actual_txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            Transaction.transaction_date >= m_start,
            Transaction.transaction_date < m_end,
            Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]),
        )
        .all()
    )
    month_actuals_by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for tx in actual_txs:
        month_actuals_by_day[tx.transaction_date.isoformat()].append({
            "kind": "transaction",
            "title": tx.description,
            "category": tx.payment_method or "Lançamento",
            "amount": round(float(tx.amount or 0), 2),
            "direction": "in" if tx.type == TransactionType.INCOME else "out",
            "source": tx.source or "manual",
        })

    # Build daily projection curve from today -> today + days
    running = current_liquid_balance
    daily_curve: list[dict[str, Any]] = []
    min_balance = running
    min_balance_date = today.isoformat()
    first_negative_date: Optional[str] = None

    for offset in range(days + 1):
        d = today + timedelta(days=offset)
        iso = d.isoformat()
        day_evts = events_by_day.get(iso, [])
        delta = 0.0
        for ev in day_evts:
            delta += ev["amount"] if ev["direction"] == "in" else -ev["amount"]
        running = round(running + delta, 2)
        if running < min_balance:
            min_balance = running
            min_balance_date = iso
        if running < 0 and first_negative_date is None:
            first_negative_date = iso
        daily_curve.append({
            "date": iso,
            "label": d.strftime("%d/%m"),
            "balance": running,
            "delta": round(delta, 2),
            "events_count": len(day_evts),
        })

    # Build calendar days map for selected month
    days_in_month = calendar.monthrange(sel_year, sel_month)[1]
    calendar_days: list[dict[str, Any]] = []
    for day_num in range(1, days_in_month + 1):
        d = date(sel_year, sel_month, day_num)
        iso = d.isoformat()
        combined = list(events_by_day.get(iso, [])) + list(month_actuals_by_day.get(iso, []))
        total_in = round(sum(e["amount"] for e in combined if e["direction"] == "in"), 2)
        total_out = round(sum(e["amount"] for e in combined if e["direction"] == "out"), 2)
        calendar_days.append({
            "date": iso,
            "day": day_num,
            "weekday": d.weekday(),
            "is_today": d == today,
            "total_in": total_in,
            "total_out": total_out,
            "events": combined,
        })

    alerts: list[dict[str, Any]] = []
    if first_negative_date:
        alerts.append({
            "severity": "high",
            "date": first_negative_date,
            "min_balance": min_balance,
            "message": (
                f"Alerta de Fluxo: seu saldo projetado pode ficar negativo em {first_negative_date} "
                f"(menor saldo previsto: R$ {min_balance:,.2f}). Considere reforçar o caixa ou ajustar vencimentos."
            ).replace(",", "X").replace(".", ",").replace("X", "."),
        })

    return {
        "year": sel_year,
        "month": sel_month,
        "days": days,
        "current_liquid_balance": current_liquid_balance,
        "projected_end_balance": running,
        "min_projected_balance": min_balance,
        "min_projected_date": min_balance_date,
        "first_negative_date": first_negative_date,
        "alerts": alerts,
        "daily_curve": daily_curve,
        "calendar_days": calendar_days,
    }


@router.get("/insights/subscriptions-radar")
async def get_subscriptions_radar(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Radar de Assinaturas & Vazamentos Silenciosos (Story 6.3):
    Detects recurring subscriptions, calculates annualized costs, and flags
    silent price increases (>5% jump between billing cycles).
    """
    uid = parse_uuid(user_id, "user_id")
    cutoff = date.today() - timedelta(days=200)

    txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            Transaction.type == TransactionType.EXPENSE,
            Transaction.transaction_date >= cutoff,
        )
        .order_by(Transaction.transaction_date.asc())
        .all()
    )

    by_merchant: dict[str, list[Transaction]] = defaultdict(list)
    for tx in txs:
        key = _normalize_merchant(tx.merchant_name or tx.description)
        by_merchant[key].append(tx)

    subscriptions: list[dict[str, Any]] = []
    price_hikes: list[dict[str, Any]] = []

    for key, items in by_merchant.items():
        months = sorted({t.transaction_date.strftime("%Y-%m") for t in items})
        if len(months) < 2:
            continue
        # Monthly totals for this merchant
        month_vals: list[tuple[str, float]] = []
        for ym in months:
            val = sum(float(t.amount or 0) for t in items if t.transaction_date.strftime("%Y-%m") == ym)
            month_vals.append((ym, round(val, 2)))

        latest_ym, latest_amt = month_vals[-1]
        prev_ym, prev_amt = month_vals[-2]
        avg_amt = round(sum(v for _, v in month_vals) / len(month_vals), 2)

        # Keep subscriptions/fixed-like merchants (not super erratic supermarket spend)
        spread_ratio = (max(v for _, v in month_vals) - min(v for _, v in month_vals)) / max(avg_amt, 1.0)
        if spread_ratio > 0.45:
            continue

        pct_change = round(((latest_amt - prev_amt) / prev_amt) * 100.0, 1) if prev_amt > 0 else 0.0
        display_name = items[-1].merchant_name or items[-1].description
        sub_entry = {
            "merchant": display_name,
            "months_active": len(months),
            "latest_amount": latest_amt,
            "previous_amount": prev_amt,
            "avg_monthly": avg_amt,
            "annualized_cost": round(latest_amt * 12.0, 2),
            "pct_change": pct_change,
            "last_charge_date": items[-1].transaction_date.isoformat(),
            "has_price_hike": pct_change >= 5.0 and (latest_amt - prev_amt) >= 3.0,
        }
        subscriptions.append(sub_entry)
        if sub_entry["has_price_hike"]:
            price_hikes.append(sub_entry)

    # Include active manual/AI recurring expense rules not already listed
    seen_norm = {_normalize_merchant(s["merchant"]) for s in subscriptions}
    rules = (
        db.query(RecurringRule)
        .filter(
            RecurringRule.user_id == uid,
            RecurringRule.is_active.is_(True),
            RecurringRule.deleted_at.is_(None),
            RecurringRule.type == TransactionType.EXPENSE,
        )
        .all()
    )
    for r in rules:
        rk = _normalize_merchant(r.merchant_name or r.description)
        if rk in seen_norm:
            continue
        amt = round(float(r.amount or 0), 2)
        subscriptions.append({
            "merchant": r.description,
            "months_active": 1,
            "latest_amount": amt,
            "previous_amount": amt,
            "avg_monthly": amt,
            "annualized_cost": round(amt * 12.0, 2),
            "pct_change": 0.0,
            "last_charge_date": None,
            "has_price_hike": False,
        })

    subscriptions.sort(key=lambda x: x["annualized_cost"], reverse=True)
    total_monthly = round(sum(s["latest_amount"] for s in subscriptions), 2)
    total_annual = round(sum(s["annualized_cost"] for s in subscriptions), 2)

    return {
        "subscriptions": subscriptions,
        "count": len(subscriptions),
        "total_monthly": total_monthly,
        "total_annual": total_annual,
        "price_hikes": price_hikes,
        "price_hikes_count": len(price_hikes),
    }


@router.get("/insights/health-score")
async def get_financial_health_score(
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    month: Optional[int] = Query(default=None, ge=1, le=12),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Score de Saúde Financeira Mony (0–100) + Fechamento do Mês ('Mony Review') — Story 6.5.
    """
    uid = parse_uuid(user_id, "user_id")
    today = date.today()
    sel_year = year or today.year
    sel_month = month or today.month
    sel_ym = f"{sel_year:04d}-{sel_month:02d}"
    pt_months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]

    cutoff = date(sel_year, sel_month, 1) - timedelta(days=95)
    txs = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            Transaction.transaction_date >= cutoff,
            Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]),
        )
        .all()
    )

    cur_inc = 0.0
    cur_exp = 0.0
    cat_spend: dict[str, float] = defaultdict(float)
    monthly_exp: dict[str, float] = defaultdict(float)

    for tx in txs:
        ym = tx.statement_month or tx.transaction_date.strftime("%Y-%m")
        amt = float(tx.amount or 0)
        if tx.type == TransactionType.EXPENSE:
            monthly_exp[ym] += amt
        if ym == sel_ym:
            if tx.type == TransactionType.INCOME:
                cur_inc += amt
            elif tx.type == TransactionType.EXPENSE:
                cur_exp += amt
                cname = tx.categories[0].category.name if tx.categories and tx.categories[0].category else "Outros"
                cat_spend[cname.lower()] += amt

    avg_monthly_exp = (sum(monthly_exp.values()) / max(1, len(monthly_exp))) if monthly_exp else cur_exp
    savings_rate = ((cur_inc - cur_exp) / cur_inc * 100.0) if cur_inc > 0 else 0.0

    # Accounts, Investments, Debts, Budgets, Goals, AI Pending
    accounts = db.query(Account).filter(Account.user_id == uid, Account.deleted_at.is_(None)).all()
    liquid_reserve = sum(float(a.balance or 0) for a in accounts if a.type in {AccountType.CHECKING, AccountType.SAVINGS, AccountType.CASH})
    holdings = db.query(InvestmentAsset).filter(InvestmentAsset.user_id == uid, InvestmentAsset.deleted_at.is_(None)).all()
    invested_total = sum(float(h.quantity or 0) * float(h.average_price or 0) for h in holdings)
    debts = db.query(Debt).filter(Debt.user_id == uid, Debt.is_active.is_(True), Debt.deleted_at.is_(None)).all()
    debt_total = sum(float(d.current_balance or 0) for d in debts)
    debt_monthly = sum(float(d.monthly_payment or 0) for d in debts)
    budgets = db.query(Budget).filter(Budget.user_id == uid).all()
    pending_ai = db.query(AISuggestion).filter(AISuggestion.user_id == uid, AISuggestion.status == "pending").count()
    goals_count = db.query(Goal).filter(Goal.user_id == uid).count()

    # Pillar 1: Savings rate (0-20)
    if cur_inc <= 0 and cur_exp == 0:
        p1 = 12
    elif savings_rate >= 25:
        p1 = 20
    elif savings_rate >= 15:
        p1 = 16
    elif savings_rate >= 5:
        p1 = 11
    elif savings_rate >= 0:
        p1 = 7
    else:
        p1 = 3

    # Pillar 2: Emergency Reserve (months covered, 0-20)
    reserve_months = round((liquid_reserve + invested_total * 0.3) / avg_monthly_exp, 1) if avg_monthly_exp > 0 else 0.0
    p2 = min(20, int(round((reserve_months / 6.0) * 20))) if avg_monthly_exp > 0 else (15 if liquid_reserve > 0 else 8)

    # Pillar 3: Budget discipline (0-20)
    if not budgets:
        p3 = 10
        within_budgets = 0
    else:
        within_budgets = sum(1 for b in budgets if cat_spend.get(b.category.lower(), 0.0) <= float(b.limit_amount or 0))
        p3 = int(round((within_budgets / len(budgets)) * 20))

    # Pillar 4: Debt-to-Income / Leverage (0-20)
    dti_pct = (debt_monthly / cur_inc * 100.0) if cur_inc > 0 else 0.0
    if debt_total <= 0:
        p4 = 20
    elif dti_pct <= 15:
        p4 = 16
    elif dti_pct <= 30:
        p4 = 11
    else:
        p4 = 5

    # Pillar 5: Investing & Organization (0-20)
    p5 = 6
    if invested_total > 0:
        p5 += 6
    if goals_count > 0:
        p5 += 4
    if pending_ai == 0:
        p5 += 4
    p5 = min(20, p5)

    total_score = max(0, min(100, p1 + p2 + p3 + p4 + p5))
    grade = (
        "A+" if total_score >= 90 else
        "A" if total_score >= 80 else
        "B" if total_score >= 68 else
        "C" if total_score >= 52 else
        "D"
    )

    wins: list[str] = []
    alerts: list[str] = []
    actions: list[str] = []

    if savings_rate >= 15:
        wins.append(f"Taxa de poupança saudável de {savings_rate:.1f}% neste mês.")
    elif cur_inc > 0:
        alerts.append(f"Taxa de poupança em {savings_rate:.1f}% (meta recomendada: ≥ 20%).")
        actions.append("Revise os top 3 gastos variáveis e ajuste seus budgets com a Mony IA.")

    if reserve_months >= 6:
        wins.append(f"Reserva de emergência sólida ({reserve_months:.1f} meses de custo de vida).")
    elif avg_monthly_exp > 0:
        alerts.append(f"Reserva cobre {reserve_months:.1f} meses (ideal: 6 meses).")
        actions.append("Direcione parte da sobra mensal para uma meta de Reserva de Emergência em liquidez diária.")

    if budgets and within_budgets == len(budgets):
        wins.append(f"100% dos seus {len(budgets)} budgets estão dentro do limite!")
    elif not budgets:
        actions.append("Ative os Budgets Proativos da IA em /dashboard/budgets para monitorar limites automaticamente.")

    if pending_ai > 0:
        alerts.append(f"Existem {pending_ai} sugestões pendentes na Revisão Proativa da IA.")
        actions.append("Acesse /dashboard/ai-review e aprove as correções de faturas e transferências em 1 clique.")
    else:
        wins.append("Revisão Proativa da IA 100% em dia (zero divergências pendentes).")

    if debt_total > 0:
        alerts.append(f"Passivos/dívidas ativos somam R$ {debt_total:,.2f}.".replace(",", "X").replace(".", ",").replace("X", "."))
        actions.append("Simule o plano Avalanche vs Bola de Neve em /dashboard/debts para economizar juros.")

    if not actions:
        actions.append("Mantenha os aportes mensais em /dashboard/investments para acelerar sua independência financeira.")

    net_worth = round(liquid_reserve + invested_total - debt_total, 2)

    return {
        "period": sel_ym,
        "month_label": f"{pt_months[sel_month - 1]} de {sel_year}",
        "score": total_score,
        "grade": grade,
        "savings_rate_pct": round(savings_rate, 1),
        "reserve_months": reserve_months,
        "net_worth": net_worth,
        "income": round(cur_inc, 2),
        "expenses": round(cur_exp, 2),
        "pillars": [
            {"id": "savings", "label": "Taxa de Poupança", "score": p1, "max": 20},
            {"id": "reserve", "label": "Reserva de Emergência", "score": p2, "max": 20},
            {"id": "budgets", "label": "Disciplina de Budgets", "score": p3, "max": 20},
            {"id": "debt", "label": "Controle de Dívidas", "score": p4, "max": 20},
            {"id": "organization", "label": "Investimentos & IA", "score": p5, "max": 20},
        ],
        "review": {
            "wins": wins[:4],
            "alerts": alerts[:4],
            "action_plan": actions[:3],
        },
    }
