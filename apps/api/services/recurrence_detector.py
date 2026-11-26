"""
Automatic Recurrence Detector & Registrar for Mony (Story 5.4).

Scans a user's transaction history (Open Finance + manual) and automatically
registers detected recurring bills/subscriptions into `mony.recurring_rules`,
deduplicated by `detection_signature` so duplicates are NEVER created.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
import re
from statistics import median
from typing import Any
import unicodedata
from uuid import UUID

from sqlalchemy import and_
from sqlalchemy.orm import Session, joinedload

from database.models import (
    OFLinkedAccount,
    RecurringRule,
    Transaction,
    TransactionCategory,
    TransactionType,
)

KNOWN_SUBSCRIPTION_KEYWORDS: tuple[str, ...] = (
    "netflix",
    "spotify",
    "amazon prime",
    "prime video",
    "disney",
    "hbo",
    "max.com",
    "apple.com/bill",
    "icloud",
    "google one",
    "youtube",
    "chatgpt",
    "openai",
    "claude",
    "gympass",
    "wellhub",
    "smart fit",
    "smartfit",
    "totalpass",
    "vivo",
    "claro",
    "tim ",
    "oi fibra",
    "enel",
    "light ",
    "cemig",
    "copel",
    "sabesp",
    "cedae",
    "aluguel",
    "condominio",
    "quintoandar",
    "seguro",
    "plano de saude",
    "unimed",
    "amil",
    "bradesco saude",
    "sulamerica",
    "sem parar",
    "veloe",
    "conectcar",
    "meli+",
    "mercadolivre",
    "globoplay",
    "adobe",
    "microsoft 365",
    "dropbox",
    "canva",
)


def _norm_sig(text: str) -> str:
    s = re.sub(r"\(\s*\d{1,2}\s*/\s*\d{1,2}\s*\)", "", text or "")
    s = re.sub(r"(?:parcela|parc\.?)\s*\d{1,2}\s*(?:/|de)\s*\d{1,2}", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\d{2,}", " ", s)
    nfkd = unicodedata.normalize("NFKD", s.lower())
    cleaned = "".join(c for c in nfkd if not unicodedata.combining(c))
    cleaned = re.sub(r"[^a-z]+", " ", cleaned).strip()
    tokens = [t for t in cleaned.split() if len(t) > 1][:4]
    return " ".join(tokens)[:90]


def _is_known_subscription(norm_text: str) -> bool:
    return any(k in norm_text for k in KNOWN_SUBSCRIPTION_KEYWORDS)


def detect_and_register_recurrences(
    db: Session,
    user_id: UUID,
    lookback_days: int = 180,
) -> dict[str, Any]:
    """
    Detect recurring expenses/income in the last `lookback_days` and register them
    idempotently in `mony.recurring_rules`.
    """
    cutoff = date.today() - timedelta(days=lookback_days)
    txs = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(
            and_(
                Transaction.user_id == user_id,
                Transaction.deleted_at.is_(None),
                Transaction.transaction_date >= cutoff,
                Transaction.type.in_([TransactionType.EXPENSE, TransactionType.INCOME]),
            )
        )
        .order_by(Transaction.transaction_date.asc())
        .all()
    )

    # Identify which Mony accounts are synced via Open Finance (auto_create=False so bank feed isn't doubled)
    of_account_ids = {
        row[0]
        for row in db.query(OFLinkedAccount.mony_account_id)
        .filter(
            OFLinkedAccount.user_id == user_id,
            OFLinkedAccount.is_active.is_(True),
            OFLinkedAccount.mony_account_id.isnot(None),
        )
        .all()
    }

    existing_rules = (
        db.query(RecurringRule)
        .filter(RecurringRule.user_id == user_id, RecurringRule.deleted_at.is_(None))
        .all()
    )
    existing_sigs = {r.detection_signature for r in existing_rules if r.detection_signature}
    existing_desc_norms = {_norm_sig(r.description) for r in existing_rules}

    groups: dict[tuple[str, str], list[Transaction]] = defaultdict(list)
    for tx in txs:
        # Skip finite installment purchases (e.g., 3/10) — those belong to Credit Card projection, not infinite recurring
        if tx.installment_total and tx.installment_total > 1:
            continue
        base_label = tx.merchant_name or tx.description
        sig = _norm_sig(base_label)
        if not sig or len(sig) < 3:
            continue
        groups[(tx.type.value, sig)].append(tx)

    created_rules: list[dict[str, Any]] = []
    skipped_existing = 0

    for (tx_type_str, sig), items in groups.items():
        months = {t.transaction_date.strftime("%Y-%m") for t in items}
        known_sub = _is_known_subscription(sig)

        # Must repeat across >= 2 distinct months, OR be a well-known subscription seen at least once
        if len(months) < 2 and not known_sub:
            continue

        amounts = [float(t.amount or 0) for t in items if float(t.amount or 0) > 0]
        if not amounts:
            continue
        med_amt = float(median(amounts))
        if med_amt <= 0:
            continue

        # For non-known-subscriptions, require reasonable amount stability (<= 25% spread from median)
        if not known_sub and len(amounts) >= 2:
            max_dev = max(abs(a - med_amt) / med_amt for a in amounts)
            if max_dev > 0.25:
                continue

        full_sig = f"{tx_type_str}:{sig}"[:120]
        if full_sig in existing_sigs or sig in existing_desc_norms:
            skipped_existing += 1
            continue

        latest = items[-1]
        typical_day = int(round(median([t.transaction_date.day for t in items])))
        typical_day = max(1, min(28, typical_day))
        cat_name = "Outros"
        if latest.categories and latest.categories[0].category:
            cat_name = latest.categories[0].category.name

        is_of_account = latest.account_id in of_account_ids
        rule = RecurringRule(
            user_id=user_id,
            account_id=latest.account_id,
            type=TransactionType(tx_type_str),
            amount=Decimal(f"{med_amt:.2f}"),
            currency=latest.currency or "BRL",
            description=(latest.merchant_name or latest.description)[:255],
            merchant_name=latest.merchant_name,
            category_name=cat_name,
            payment_method=latest.payment_method or "other",
            frequency="monthly",
            day_of_month=typical_day,
            is_active=True,
            # For Open Finance accounts, keep auto_create=False so bank sync stays source of truth
            auto_create=not is_of_account,
            last_generated_month=latest.transaction_date.strftime("%Y-%m"),
            source="ai_detected",
            detection_signature=full_sig,
        )
        db.add(rule)
        db.flush()

        # Mark matched transactions as recurring for UI clarity
        for t in items:
            t.is_recurring = True
            t.recurring_pattern = "monthly"

        existing_sigs.add(full_sig)
        existing_desc_norms.add(sig)
        created_rules.append({
            "id": str(rule.id),
            "description": rule.description,
            "amount": float(rule.amount),
            "day_of_month": rule.day_of_month,
            "category_name": rule.category_name,
            "occurrences": len(items),
            "months_seen": len(months),
        })

    return {
        "detected_and_registered": len(created_rules),
        "skipped_existing": skipped_existing,
        "rules": created_rules,
    }
