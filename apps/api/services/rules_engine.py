"""
Auto-Categorization Rules & Internal Transfer Detection Engine for Mony.

Prevents double-counting in Open Finance / Mony IA imports by:
  1. Applying user-defined keyword rules (`mony.category_rules`) in priority order.
  2. Detecting internal transfers (credit card bill payments, broker deposits,
     own-account Pix/TED, CDB/Caixinha/Cofrinho movements) and marking them as
     `TransactionType.TRANSFER` so Dashboard income/expenses and Cashflow stay clean.
  3. Pairing cross-account transfers (opposite INCOME & EXPENSE with identical amount
     across 2 distinct accounts within ±2 days) and converting both to `TRANSFER`.
"""

from __future__ import annotations

from datetime import date, timedelta
import re
from typing import Optional
import unicodedata
from uuid import UUID

from sqlalchemy import and_
from sqlalchemy.orm import Session

from database.models import CategoryRule, Transaction, TransactionType
from routes.transactions import _resolve_category, _set_transaction_category


INTERNAL_TRANSFER_PATTERNS: tuple[str, ...] = (
    "pagamento de fatura",
    "pagamento fatura",
    "pagto fatura",
    "pgto fatura",
    "fatura cartao",
    "fatura do cartao",
    "deb aut fatura",
    "pagamento recebido fatura",
    "transferencia entre contas",
    "transferencia interna",
    "mesma titularidade",
    "pix mesma titularidade",
    "transferencia para corretora",
    "aplicacao cdb",
    "resgate cdb",
    "aplicacao rdb",
    "resgate rdb",
    "guardar dinheiro",
    "resgate dinheiro guardado",
    "dinheiro guardado",
    "caixinha",
    "cofrinho",
    "porquinho",
    "xp investimentos",
    "rico investimentos",
    "clear corretora",
    "nuinvest",
    "btg pactual digital",
    "inter invest",
)


def normalize_rule_text(text: Optional[str]) -> str:
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text.lower())
    cleaned = "".join(c for c in nfkd if not unicodedata.combining(c))
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def is_internal_transfer_text(description: Optional[str], merchant: Optional[str] = None) -> bool:
    combined = normalize_rule_text(f"{description or ''} {merchant or ''}")
    if not combined:
        return False
    return any(pat in combined for pat in INTERNAL_TRANSFER_PATTERNS)


def load_active_rules(db: Session, user_id: UUID) -> list[CategoryRule]:
    return (
        db.query(CategoryRule)
        .filter(CategoryRule.user_id == user_id, CategoryRule.is_active.is_(True))
        .order_by(CategoryRule.priority.asc(), CategoryRule.created_at.asc())
        .all()
    )


def match_user_rule(
    rules: list[CategoryRule],
    description: Optional[str],
    merchant: Optional[str] = None,
) -> Optional[CategoryRule]:
    norm_desc = normalize_rule_text(description)
    norm_merch = normalize_rule_text(merchant)
    norm_any = f"{norm_desc} {norm_merch}".strip()

    for rule in rules:
        needle = normalize_rule_text(rule.pattern)
        if not needle:
            continue
        field = (rule.match_field or "any").lower()
        haystack = (
            norm_desc
            if field == "description"
            else (norm_merch if field == "merchant" else norm_any)
        )
        if needle in haystack:
            return rule
    return None


def detect_and_link_paired_transfers(
    db: Session,
    user_id: UUID,
    days_back: int = 90,
) -> int:
    """
    Find pairs of (EXPENSE in Account A, INCOME in Account B) with identical amount
    within ±2 days and mark both as TRANSFER so neither inflates income/expenses.
    Returns the number of transactions converted to TRANSFER.
    """
    cutoff = date.today() - timedelta(days=days_back)
    txs = (
        db.query(Transaction)
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

    expenses = [t for t in txs if t.type == TransactionType.EXPENSE]
    incomes = [t for t in txs if t.type == TransactionType.INCOME]
    used_income_ids: set[UUID] = set()
    converted = 0

    for exp in expenses:
        exp_amt = round(float(exp.amount or 0), 2)
        if exp_amt <= 0:
            continue
        for inc in incomes:
            if inc.id in used_income_ids:
                continue
            if inc.account_id == exp.account_id:
                continue
            if round(float(inc.amount or 0), 2) != exp_amt:
                continue
            if abs((inc.transaction_date - exp.transaction_date).days) > 2:
                continue
            exp.type = TransactionType.TRANSFER
            inc.type = TransactionType.TRANSFER
            used_income_ids.add(inc.id)
            converted += 2
            break

    return converted


def apply_rules_retroactively(
    db: Session,
    user_id: UUID,
    days_back: int = 365,
) -> dict[str, int]:
    """Run all active user rules + internal transfer heuristics + paired transfer detection."""
    rules = load_active_rules(db, user_id)
    cutoff = date.today() - timedelta(days=days_back)

    txs = (
        db.query(Transaction)
        .filter(
            and_(
                Transaction.user_id == user_id,
                Transaction.deleted_at.is_(None),
                Transaction.transaction_date >= cutoff,
            )
        )
        .all()
    )

    categorized = 0
    transfers_by_rule = 0
    transfers_by_heuristic = 0

    for tx in txs:
        matched = match_user_rule(rules, tx.description, tx.merchant_name)
        if matched is not None:
            matched.matches_count = int(matched.matches_count or 0) + 1
            if matched.action == "mark_transfer":
                if tx.type != TransactionType.TRANSFER:
                    tx.type = TransactionType.TRANSFER
                    transfers_by_rule += 1
            elif matched.action == "categorize" and matched.category_name:
                cat = _resolve_category(db, user_id, category_name=matched.category_name)
                if cat is not None:
                    _set_transaction_category(db, tx, cat)
                    categorized += 1
            continue

        # Fallback heuristic: credit card bill / own-account / broker transfers
        if tx.type in (TransactionType.EXPENSE, TransactionType.INCOME) and is_internal_transfer_text(
            tx.description, tx.merchant_name
        ):
            tx.type = TransactionType.TRANSFER
            transfers_by_heuristic += 1

    paired = detect_and_link_paired_transfers(db, user_id, days_back=days_back)

    return {
        "scanned": len(txs),
        "categorized": categorized,
        "transfers_by_rule": transfers_by_rule,
        "transfers_by_heuristic": transfers_by_heuristic,
        "paired_transfers_detected": paired,
        "total_updated": categorized + transfers_by_rule + transfers_by_heuristic + paired,
    }
