"""
Proactive AI Review & Audit Engine for Mony (EPIC-005 · Stories 5.3, 5.5, 5.6, 5.7).

Audits user data after Open Finance sync, AI imports, manual entry, or on-demand:
  1. Transaction divergences & smart category suggestions (tx_divergence)
  2. Credit card invoice month mismatch vs closing_day (invoice_month)
  3. Same-owner / cross-account transfers (e.g. Bradesco -> XP, user's own name/accounts) (self_transfer)
  4. Credit card inconsistencies (open invoice vs Pluggy balance, high usage, cycle mismatch) (card_inconsistency)
  5. Accounts & Categories completeness vs Open Finance (account_audit, category_missing)
  6. Proactive Budget recommendations based on avg monthly income & spending (budget_recommendation)
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
import re
from statistics import mean
from typing import Any, Optional
import unicodedata
from uuid import UUID

from sqlalchemy import and_
from sqlalchemy.orm import Session, joinedload

from database.models import (
    Account,
    AccountType,
    AISuggestion,
    Budget,
    Category,
    CreditCard,
    OFLinkedAccount,
    Transaction,
    TransactionCategory,
    TransactionType,
    User,
)
from routes.categories import _slugify, ensure_default_categories
from routes.credit_cards import _build_card_payload
from routes.transactions import _balance_delta, _resolve_category, _set_transaction_category
from services.ai_analyzer import _classify_category


MISSING_CATEGORY_THEMES: dict[str, tuple[str, str, tuple[str, ...]]] = {
    "Assinaturas": ("🎬", "#8B5CF6", ("netflix", "spotify", "disney", "hbo", "icloud", "google one", "amazon prime", "youtube", "chatgpt", "openai", "adobe", "globoplay", "meli+")),
    "Pets": ("🐾", "#F97316", ("petz", "cobasi", "veterinar", "pet shop", "petshop", "racao")),
    "Impostos & Taxas": ("🏛️", "#64748B", ("darf", "ipva", "iptu", "iof", "anuidade", "tarifa bancaria", "taxa", "receita federal")),
    "Investimentos": ("📈", "#10B981", ("xp investimentos", "rico", "clear corretora", "btg", "nuinvest", "tesouro direto", "b3", "aporte", "corretora")),
    "Delivery": ("🛵", "#EF4444", ("ifood", "rappi", "uber eats", "aiqfome", "ze delivery")),
}

TRANSFER_VERBS: tuple[str, ...] = (
    "pix",
    "ted",
    "doc",
    "transf",
    "transferencia",
    "resgate",
    "aplicacao",
    "fatura",
    "enviado",
    "recebido",
)

BROKER_AND_BANK_HINTS: tuple[str, ...] = (
    "xp",
    "rico",
    "clear",
    "btg",
    "nuinvest",
    "inter",
    "nubank",
    "itau",
    "bradesco",
    "santander",
    "bb ",
    "banco do brasil",
    "caixa",
    "c6",
    "nomad",
    "avenue",
    "mercadopago",
    "mercado pago",
    "picpay",
)


def _norm(s: Optional[str]) -> str:
    if not s:
        return ""
    nfkd = unicodedata.normalize("NFKD", s.lower())
    cleaned = "".join(c for c in nfkd if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", cleaned).strip()


def _add_months(year: int, month: int, delta: int) -> tuple[int, int]:
    total = (year * 12 + (month - 1)) + delta
    return total // 12, (total % 12) + 1


def _upsert_suggestion(
    db: Session,
    *,
    user_id: UUID,
    suggestion_type: str,
    module: str,
    target_entity_type: Optional[str],
    target_entity_id: Optional[UUID],
    title: str,
    reason: str,
    current_snapshot: dict[str, Any],
    proposed_patch: dict[str, Any],
    confidence: float,
    dedup_key: str,
) -> Optional[AISuggestion]:
    """Insert a new suggestion if not already pending/applied/dismissed for this dedup_key."""
    existing = (
        db.query(AISuggestion)
        .filter(AISuggestion.user_id == user_id, AISuggestion.dedup_key == dedup_key)
        .first()
    )
    if existing is not None:
        return None
    sug = AISuggestion(
        user_id=user_id,
        suggestion_type=suggestion_type,
        module=module,
        target_entity_type=target_entity_type,
        target_entity_id=target_entity_id,
        title=title[:200],
        reason=reason,
        current_snapshot=current_snapshot,
        proposed_patch=proposed_patch,
        confidence=Decimal(f"{min(0.99, max(0.5, confidence)):.2f}"),
        status="pending",
        dedup_key=dedup_key[:140],
    )
    db.add(sug)
    return sug


def compute_budget_recommendations(db: Session, user_id: UUID) -> dict[str, Any]:
    """
    Compute proactive budget suggestions grounded in the user's real average monthly
    income and category spending over the last 3–6 months.
    """
    today = date.today()
    cutoff = date(today.year, today.month, 1) - timedelta(days=150)
    txs = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(
            and_(
                Transaction.user_id == user_id,
                Transaction.deleted_at.is_(None),
                Transaction.transaction_date >= cutoff,
                Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]),
            )
        )
        .all()
    )

    monthly_income: dict[str, float] = defaultdict(float)
    cat_monthly: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    active_months: set[str] = set()

    for tx in txs:
        ym = tx.statement_month or tx.transaction_date.strftime("%Y-%m")
        active_months.add(ym)
        amt = float(tx.amount or 0)
        if tx.type == TransactionType.INCOME:
            monthly_income[ym] += amt
        elif tx.type == TransactionType.EXPENSE:
            cname = (
                tx.categories[0].category.name
                if tx.categories and tx.categories[0].category
                else "Outros"
            )
            cat_monthly[cname][ym] += amt

    n_months = max(1, len(active_months))
    avg_income = round(sum(monthly_income.values()) / max(1, len(monthly_income)), 2) if monthly_income else 0.0

    existing_budgets = (
        db.query(Budget)
        .filter(Budget.user_id == user_id, Budget.is_active.is_(True))
        .all()
    )
    budget_by_cat = {b.category.lower(): b for b in existing_budgets}
    total_budgeted = round(sum(float(b.limit_amount or 0) for b in existing_budgets), 2)

    recommendations: list[dict[str, Any]] = []
    for cat_name, ym_map in sorted(
        cat_monthly.items(), key=lambda kv: sum(kv[1].values()), reverse=True
    ):
        avg_spend = round(sum(ym_map.values()) / n_months, 2)
        if avg_spend < 30.0:
            continue
        pct_of_income = round((avg_spend / avg_income) * 100.0, 1) if avg_income > 0 else 0.0
        # Target slightly tighter limit (-8%) to promote savings, rounded to nearest R$ 10
        raw_target = avg_spend * 0.92 if avg_spend >= 150 else avg_spend
        suggested_limit = max(50.0, round(raw_target / 10.0) * 10.0)
        if avg_income > 0 and suggested_limit > avg_income * 0.35 and cat_name.lower() != "moradia":
            suggested_limit = round((avg_income * 0.25) / 10.0) * 10.0

        existing = budget_by_cat.get(cat_name.lower())
        if existing is None:
            recommendations.append({
                "action": "create",
                "budget_id": None,
                "category": cat_name,
                "current_limit": None,
                "avg_monthly_spend": avg_spend,
                "suggested_limit": suggested_limit,
                "pct_of_income": pct_of_income,
                "reason": (
                    f"Você gasta em média R$ {avg_spend:,.2f}/mês em {cat_name}"
                    + (f" ({pct_of_income}% da sua renda média)" if avg_income > 0 else "")
                    + f" e ainda não tem um limite configurado."
                ).replace(",", "X").replace(".", ",").replace("X", "."),
            })
        else:
            curr_lim = float(existing.limit_amount or 0)
            if curr_lim > 0:
                ratio = avg_spend / curr_lim
                if ratio >= 1.15:
                    new_lim = round((avg_spend * 0.95) / 10.0) * 10.0
                    recommendations.append({
                        "action": "adjust",
                        "budget_id": str(existing.id),
                        "category": cat_name,
                        "current_limit": curr_lim,
                        "avg_monthly_spend": avg_spend,
                        "suggested_limit": new_lim,
                        "pct_of_income": pct_of_income,
                        "reason": (
                            f"Seu gasto médio em {cat_name} (R$ {avg_spend:,.2f}) supera o limite atual "
                            f"(R$ {curr_lim:,.2f}) em {round((ratio - 1) * 100)}%. Ajuste realista ou meta de corte sugerida."
                        ).replace(",", "X").replace(".", ",").replace("X", "."),
                    })
                elif ratio <= 0.45 and curr_lim - avg_spend >= 150:
                    new_lim = max(50.0, round((avg_spend * 1.15) / 10.0) * 10.0)
                    recommendations.append({
                        "action": "adjust",
                        "budget_id": str(existing.id),
                        "category": cat_name,
                        "current_limit": curr_lim,
                        "avg_monthly_spend": avg_spend,
                        "suggested_limit": new_lim,
                        "pct_of_income": pct_of_income,
                        "reason": (
                            f"Seu limite em {cat_name} (R$ {curr_lim:,.2f}) está muito acima do gasto médio "
                            f"(R$ {avg_spend:,.2f}). Reduzir para R$ {new_lim:,.2f} libera folga para metas."
                        ).replace(",", "X").replace(".", ",").replace("X", "."),
                    })

    return {
        "avg_monthly_income": avg_income,
        "months_analyzed": n_months,
        "total_budgeted": total_budgeted,
        "budgeted_pct_of_income": round((total_budgeted / avg_income) * 100.0, 1) if avg_income > 0 else 0.0,
        "recommended_essential_cap": round(avg_income * 0.60, 2),
        "recommended_lifestyle_cap": round(avg_income * 0.30, 2),
        "recommended_invest_target": round(avg_income * 0.10, 2),
        "recommendations": recommendations[:10],
    }


def run_proactive_review(
    db: Session,
    user_id: UUID,
    lookback_days: int = 120,
) -> dict[str, Any]:
    """
    Execute the complete proactive AI audit across transactions, cards, accounts,
    categories, and budgets, persisting deduplicated actionable `AISuggestion` records.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"created": 0, "by_module": {}}

    categories = ensure_default_categories(db, user_id)
    cat_names = [c.name for c in categories]
    cat_names_lower = {c.name.lower() for c in categories}

    accounts = (
        db.query(Account)
        .filter(Account.user_id == user_id, Account.deleted_at.is_(None))
        .all()
    )
    account_map = {a.id: a for a in accounts}
    account_keywords = [
        tok
        for a in accounts
        for tok in _norm(a.name).split()
        if len(tok) >= 4 and tok not in ("conta", "corrente", "cartao", "credito", "poupanca", "banco")
    ]

    user_name_tokens = [
        t for t in _norm(user.full_name or "").split() if len(t) >= 4 and t not in ("silva", "santos", "souza", "oliveira")
    ]
    if not user_name_tokens and user.full_name:
        user_name_tokens = [t for t in _norm(user.full_name).split() if len(t) >= 3][:2]

    cards = (
        db.query(CreditCard)
        .filter(CreditCard.user_id == user_id, CreditCard.deleted_at.is_(None), CreditCard.is_active.is_(True))
        .all()
    )
    card_by_account = {c.account_id: c for c in cards if c.account_id}

    cutoff = date.today() - timedelta(days=lookback_days)
    txs = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(
            and_(
                Transaction.user_id == user_id,
                Transaction.deleted_at.is_(None),
                Transaction.transaction_date >= cutoff,
            )
        )
        .order_by(Transaction.transaction_date.desc())
        .all()
    )

    created_counts: dict[str, int] = defaultdict(int)
    now = datetime.utcnow()

    # Pre-compute category averages for outlier detection
    cat_amounts: dict[str, list[float]] = defaultdict(list)
    for tx in txs:
        if tx.type == TransactionType.EXPENSE:
            cname = tx.categories[0].category.name if tx.categories and tx.categories[0].category else "Outros"
            cat_amounts[cname].append(float(tx.amount or 0))
    cat_avg = {k: mean(v) for k, v in cat_amounts.items() if len(v) >= 3}

    # Pre-index opposite-sign candidates for cross-account transfer detection
    expenses = [t for t in txs if t.type == TransactionType.EXPENSE]
    incomes = [t for t in txs if t.type == TransactionType.INCOME]

    outros_by_theme: dict[str, list[Transaction]] = defaultdict(list)

    for tx in txs:
        norm_desc = _norm(f"{tx.description or ''} {tx.merchant_name or ''}")
        amt = float(tx.amount or 0)
        curr_cat = tx.categories[0].category.name if tx.categories and tx.categories[0].category else "Outros"

        # --- 1. Proactive Same-Owner / Cross-Account Transfer Detection ---
        if tx.type in (TransactionType.EXPENSE, TransactionType.INCOME) and not tx.user_edited:
            has_transfer_verb = any(v in norm_desc for v in TRANSFER_VERBS)
            mentions_owner = any(tok in norm_desc for tok in user_name_tokens) if user_name_tokens else False
            mentions_other_inst = any(h in norm_desc for h in BROKER_AND_BANK_HINTS) or any(
                k in norm_desc for k in account_keywords
            )
            explicit_self = any(
                k in norm_desc
                for k in ("mesma titularidade", "entre contas", "pagamento de fatura", "pagto fatura", "corretora")
            )

            paired_match = None
            if tx.type == TransactionType.EXPENSE:
                for inc in incomes:
                    if (
                        inc.account_id != tx.account_id
                        and round(float(inc.amount or 0), 2) == round(amt, 2)
                        and abs((inc.transaction_date - tx.transaction_date).days) <= 3
                    ):
                        paired_match = inc
                        break

            if paired_match is not None or explicit_self or (has_transfer_verb and (mentions_owner or mentions_other_inst)):
                other_acct_name = (
                    account_map[paired_match.account_id].name
                    if paired_match and paired_match.account_id in account_map
                    else "outra conta sua"
                )
                reason = (
                    f"Encontrado lançamento espelho de R$ {amt:,.2f} em {other_acct_name} (±3 dias). Converter para Transferência evita duplicar receitas e despesas."
                    if paired_match
                    else f"A descrição '{tx.description}' indica transferência entre contas do mesmo titular / corretora. Converter para Transferência evita distorcer seus gastos."
                ).replace(",", "X").replace(".", ",").replace("X", ".")
                sug = _upsert_suggestion(
                    db,
                    user_id=user_id,
                    suggestion_type="self_transfer",
                    module="transactions",
                    target_entity_type="transaction",
                    target_entity_id=tx.id,
                    title=f"Possível transferência entre suas contas: {tx.description[:70]}",
                    reason=reason,
                    current_snapshot={"type": tx.type.value, "amount": amt, "description": tx.description},
                    proposed_patch={
                        "type": "transfer",
                        "paired_transaction_id": str(paired_match.id) if paired_match else None,
                    },
                    confidence=0.95 if paired_match or explicit_self else 0.84,
                    dedup_key=f"self_transfer:{tx.id}",
                )
                if sug:
                    created_counts["transactions"] += 1

        # --- 2. Proactive Credit Card Invoice Month Detection ---
        card = card_by_account.get(tx.account_id)
        if card and tx.type in (TransactionType.EXPENSE, TransactionType.REFUND) and not tx.user_edited:
            tx_dt = tx.transaction_date
            if tx_dt.day >= card.closing_day:
                exp_y, exp_m = _add_months(tx_dt.year, tx_dt.month, 1)
            else:
                exp_y, exp_m = tx_dt.year, tx_dt.month
            expected_ym = f"{exp_y:04d}-{exp_m:02d}"
            actual_ym = tx.statement_month or tx_dt.strftime("%Y-%m")
            if actual_ym != expected_ym:
                sug = _upsert_suggestion(
                    db,
                    user_id=user_id,
                    suggestion_type="invoice_month",
                    module="transactions",
                    target_entity_type="transaction",
                    target_entity_id=tx.id,
                    title=f"Fatura sugerida {expected_ym}: {tx.description[:60]}",
                    reason=(
                        f"Compra em {tx_dt.strftime('%d/%m/%Y')} no cartão {card.name} (fecha dia {card.closing_day}). "
                        f"Atualmente está alocada em {actual_ym}, mas pertence à fatura de {expected_ym}."
                    ),
                    current_snapshot={"statement_month": actual_ym, "transaction_date": tx_dt.isoformat(), "card": card.name},
                    proposed_patch={"statement_month": expected_ym},
                    confidence=0.92,
                    dedup_key=f"invoice_month:{tx.id}:{expected_ym}",
                )
                if sug:
                    created_counts["transactions"] += 1

        # --- 3. Smart Category / Divergence Review ---
        if tx.type == TransactionType.EXPENSE and curr_cat.lower() == "outros" and not tx.user_edited:
            inferred = _classify_category(f"{tx.description} {tx.merchant_name or ''}", cat_names, "expense")
            if inferred and inferred.lower() != "outros":
                sug = _upsert_suggestion(
                    db,
                    user_id=user_id,
                    suggestion_type="tx_divergence",
                    module="transactions",
                    target_entity_type="transaction",
                    target_entity_id=tx.id,
                    title=f"Recategorizar '{tx.description[:50]}' → {inferred}",
                    reason=f"Lançamento classificado como 'Outros', mas o padrão de descrição indica a categoria {inferred}.",
                    current_snapshot={"category_name": curr_cat, "amount": amt},
                    proposed_patch={"category_name": inferred},
                    confidence=0.86,
                    dedup_key=f"recat:{tx.id}:{inferred}",
                )
                if sug:
                    created_counts["transactions"] += 1

            # Collect potential missing categories for Story 5.7
            for theme_name, (_icon, _col, keywords) in MISSING_CATEGORY_THEMES.items():
                if theme_name.lower() not in cat_names_lower and any(k in norm_desc for k in keywords):
                    outros_by_theme[theme_name].append(tx)
                    break

        # Outlier alert (high-value expense vs category average)
        if tx.type == TransactionType.EXPENSE and curr_cat in cat_avg and amt > cat_avg[curr_cat] * 2.8 and amt >= 300:
            sug = _upsert_suggestion(
                db,
                user_id=user_id,
                suggestion_type="tx_divergence",
                module="transactions",
                target_entity_type="transaction",
                target_entity_id=tx.id,
                title=f"Valor atípico em {curr_cat}: {tx.description[:50]}",
                reason=(
                    f"Valor de R$ {amt:,.2f} está {round(amt / cat_avg[curr_cat], 1)}× acima da média "
                    f"de {curr_cat} (R$ {cat_avg[curr_cat]:,.2f}). Verifique se a categoria, parcelamento ou valor estão corretos."
                ).replace(",", "X").replace(".", ",").replace("X", "."),
                current_snapshot={"amount": amt, "category_name": curr_cat},
                proposed_patch={"review_ack": True},
                confidence=0.78,
                dedup_key=f"outlier:{tx.id}",
            )
            if sug:
                created_counts["transactions"] += 1

        tx.ai_reviewed_at = now

    # --- 4. Proactive Credit Card Inconsistency Audit (Story 5.6) ---
    today = date.today()
    for card in cards:
        payload = _build_card_payload(db, user_id, card, today)
        div = payload.get("balance_divergence")
        if div is not None and abs(div) >= 20.0:
            sug = _upsert_suggestion(
                db,
                user_id=user_id,
                suggestion_type="card_inconsistency",
                module="cards",
                target_entity_type="credit_card",
                target_entity_id=card.id,
                title=f"Divergência na fatura de {card.name} (R$ {abs(div):,.2f})".replace(",", "X").replace(".", ",").replace("X", "."),
                reason=(
                    f"O Mony calcula fatura aberta de R$ {payload['open_invoice_total']:,.2f}, enquanto o Open Finance "
                    f"reporta R$ {abs(payload['pluggy_balance'] or 0):,.2f}. Verifique se há compras alocadas no mês errado ou estornos pendentes."
                ).replace(",", "X").replace(".", ",").replace("X", "."),
                current_snapshot={"open_invoice_total": payload["open_invoice_total"], "pluggy_balance": payload["pluggy_balance"]},
                proposed_patch={"recheck_closing_day": card.closing_day},
                confidence=0.88,
                dedup_key=f"card_div:{card.id}:{payload['open_invoice_month']}",
            )
            if sug:
                created_counts["cards"] += 1

        if payload["usage_pct"] >= 75.0:
            sug = _upsert_suggestion(
                db,
                user_id=user_id,
                suggestion_type="card_inconsistency",
                module="cards",
                target_entity_type="credit_card",
                target_entity_id=card.id,
                title=f"Limite elevado em {card.name} ({payload['usage_pct']}% comprometido)",
                reason=(
                    f"Entre fatura aberta e parcelas futuras, você comprometeu R$ {payload['total_committed']:,.2f} "
                    f"do limite de R$ {payload['credit_limit']:,.2f}. Considere revisar o limite ou priorizar débito/PIX até o dia {card.best_buy_day}."
                ).replace(",", "X").replace(".", ",").replace("X", "."),
                current_snapshot={"usage_pct": payload["usage_pct"], "credit_limit": payload["credit_limit"]},
                proposed_patch={"review_ack": True},
                confidence=0.90,
                dedup_key=f"card_limit:{card.id}:{today.strftime('%Y-%m')}",
            )
            if sug:
                created_counts["cards"] += 1

    # --- 5. Accounts & Categories Open Finance Audit (Story 5.7) ---
    for acct in accounts:
        norm_name = _norm(acct.name)
        if acct.type == AccountType.CHECKING and any(k in norm_name for k in ("corretora", "invest", "xp ", "rico", "clear", "btg")):
            sug = _upsert_suggestion(
                db,
                user_id=user_id,
                suggestion_type="account_audit",
                module="accounts",
                target_entity_type="account",
                target_entity_id=acct.id,
                title=f"Ajustar tipo da conta '{acct.name}' para Investimentos",
                reason="O nome da conta sugere uma corretora/carteira de investimentos, mas está cadastrada como Conta Corrente.",
                current_snapshot={"type": acct.type.value, "name": acct.name},
                proposed_patch={"type": "investment"},
                confidence=0.88,
                dedup_key=f"acct_type:{acct.id}:investment",
            )
            if sug:
                created_counts["accounts"] += 1

        origin = acct.origin_metadata or {}
        official_bal = origin.get("official_balance")
        if official_bal is not None and abs(float(acct.balance or 0) - float(official_bal)) >= 10.0 and not acct.user_edited:
            sug = _upsert_suggestion(
                db,
                user_id=user_id,
                suggestion_type="account_audit",
                module="accounts",
                target_entity_type="account",
                target_entity_id=acct.id,
                title=f"Saldo divergente em '{acct.name}' vs Open Finance",
                reason=(
                    f"Saldo atual no Mony é R$ {float(acct.balance or 0):,.2f}, mas o banco reportou R$ {float(official_bal):,.2f}. "
                    "Clique em Aplicar para alinhar ao saldo oficial do Open Finance."
                ).replace(",", "X").replace(".", ",").replace("X", "."),
                current_snapshot={"balance": float(acct.balance or 0), "official_balance": float(official_bal)},
                proposed_patch={"balance": float(official_bal)},
                confidence=0.91,
                dedup_key=f"acct_bal:{acct.id}:{round(float(official_bal), 0)}",
            )
            if sug:
                created_counts["accounts"] += 1

    for theme_name, matched_txs in outros_by_theme.items():
        if len(matched_txs) >= 2:
            icon, color, _kw = MISSING_CATEGORY_THEMES[theme_name]
            sug = _upsert_suggestion(
                db,
                user_id=user_id,
                suggestion_type="category_missing",
                module="categories",
                target_entity_type="category",
                target_entity_id=None,
                title=f"Criar categoria '{theme_name}' ({len(matched_txs)} lançamentos em Outros)",
                reason=f"Identificamos {len(matched_txs)} gastos em 'Outros' que pertencem a {theme_name}. Criar a categoria e recategorizar automaticamente?",
                current_snapshot={"outros_count": len(matched_txs)},
                proposed_patch={
                    "category_name": theme_name,
                    "icon": icon,
                    "color": color,
                    "transaction_ids": [str(t.id) for t in matched_txs],
                },
                confidence=0.89,
                dedup_key=f"cat_missing:{_slugify(theme_name)}",
            )
            if sug:
                created_counts["categories"] += 1

    # --- 6. Proactive Budget Recommendations (Story 5.5) ---
    b_recs = compute_budget_recommendations(db, user_id)
    for rec in b_recs["recommendations"][:4]:
        sug = _upsert_suggestion(
            db,
            user_id=user_id,
            suggestion_type="budget_recommendation",
            module="budgets",
            target_entity_type="budget",
            target_entity_id=UUID(rec["budget_id"]) if rec.get("budget_id") else None,
            title=(
                f"Criar budget para {rec['category']}: R$ {rec['suggested_limit']:,.2f}"
                if rec["action"] == "create"
                else f"Ajustar budget de {rec['category']} para R$ {rec['suggested_limit']:,.2f}"
            ).replace(",", "X").replace(".", ",").replace("X", "."),
            reason=rec["reason"],
            current_snapshot={"category": rec["category"], "current_limit": rec["current_limit"], "avg_spend": rec["avg_monthly_spend"]},
            proposed_patch={"action": rec["action"], "category": rec["category"], "limit_amount": rec["suggested_limit"]},
            confidence=0.86,
            dedup_key=f"budget_rec:{_slugify(rec['category'])}:{today.strftime('%Y-%m')}",
        )
        if sug:
            created_counts["budgets"] += 1

    return {
        "created": sum(created_counts.values()),
        "by_module": dict(created_counts),
        "reviewed_transactions": len(txs),
    }


def apply_ai_suggestion(db: Session, user_id: UUID, suggestion: AISuggestion) -> dict[str, Any]:
    """Atomically apply a pending `AISuggestion`'s `proposed_patch`."""
    patch = suggestion.proposed_patch or {}
    stype = suggestion.suggestion_type

    if stype in ("self_transfer", "invoice_month", "tx_divergence") and suggestion.target_entity_id:
        tx = (
            db.query(Transaction)
            .filter(
                Transaction.id == suggestion.target_entity_id,
                Transaction.user_id == user_id,
                Transaction.deleted_at.is_(None),
            )
            .first()
        )
        if tx is not None:
            if "type" in patch:
                old_type = tx.type
                new_type = TransactionType(patch["type"])
                amt = Decimal(str(tx.amount))
                tx.type = new_type
                acct = db.query(Account).filter(Account.id == tx.account_id).first()
                if acct is not None:
                    acct.balance = Decimal(str(acct.balance or 0)) + (
                        _balance_delta(new_type, amt) - _balance_delta(old_type, amt)
                    )
                paired_id = patch.get("paired_transaction_id")
                if paired_id:
                    ptx = (
                        db.query(Transaction)
                        .filter(Transaction.id == UUID(paired_id), Transaction.user_id == user_id)
                        .first()
                    )
                    if ptx is not None:
                        ptx.type = TransactionType.TRANSFER
                        ptx.user_edited = True
            if "statement_month" in patch:
                tx.statement_month = str(patch["statement_month"])[:7]
            if "category_name" in patch:
                cat = _resolve_category(db, user_id, category_name=patch["category_name"])
                if cat is not None:
                    _set_transaction_category(db, tx, cat)
            tx.user_edited = True
            tx.updated_at = datetime.utcnow()

    elif stype == "account_audit" and suggestion.target_entity_id:
        acct = (
            db.query(Account)
            .filter(Account.id == suggestion.target_entity_id, Account.user_id == user_id)
            .first()
        )
        if acct is not None:
            if "type" in patch:
                acct.type = AccountType(patch["type"])
            if "balance" in patch:
                acct.balance = Decimal(f"{float(patch['balance']):.2f}")
            acct.user_edited = True
            acct.updated_at = datetime.utcnow()

    elif stype == "category_missing":
        cname = str(patch.get("category_name") or "").strip()
        if cname:
            cat = _resolve_category(db, user_id, category_name=cname)
            if cat is None:
                cat = Category(
                    user_id=user_id,
                    name=cname,
                    slug=_slugify(cname),
                    icon=patch.get("icon") or "🏷️",
                    color=patch.get("color") or "#6366F1",
                    is_system=False,
                )
                db.add(cat)
                db.flush()
            for tid_str in patch.get("transaction_ids") or []:
                tx = (
                    db.query(Transaction)
                    .filter(Transaction.id == UUID(tid_str), Transaction.user_id == user_id)
                    .first()
                )
                if tx is not None:
                    _set_transaction_category(db, tx, cat)

    elif stype == "budget_recommendation":
        cname = str(patch.get("category") or "").strip()
        lim = Decimal(f"{float(patch.get('limit_amount') or 0):.2f}")
        if cname and lim > 0:
            existing_b = (
                db.query(Budget)
                .filter(Budget.user_id == user_id, Budget.category == cname, Budget.is_active.is_(True))
                .first()
            )
            if existing_b is not None:
                existing_b.limit_amount = lim
                existing_b.updated_at = datetime.utcnow()
            else:
                db.add(Budget(user_id=user_id, category=cname, limit_amount=lim, currency="BRL", is_active=True))

    suggestion.status = "applied"
    suggestion.resolved_at = datetime.utcnow()
    return {"applied": True, "suggestion_id": str(suggestion.id), "type": stype}
