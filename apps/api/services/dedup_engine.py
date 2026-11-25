"""
3-Layer Reconnect-Safe Transaction Deduplication Engine for Mony.

Protects against duplicates even when a user disconnects an Open Finance bank
and re-links it later (which causes Pluggy/banks to issue brand-new itemIds,
accountIds, and transactionIds):

  Layer 1 — Exact external ID match: (user_id, external_id, source)
  Layer 2 — Deterministic content hash (`dedup_hash`):
            SHA256(user_id | account_fp | type | amount_2dp | date_or_month |
                   normalized_desc | installment_num | seq_same_day)
            Using `seq_same_day` (0, 1, ...) ensures 2 genuine identical
            purchases on the same day are BOTH saved, while re-linking never
            creates duplicates.
  Layer 3 — Cross-source reconciliation (Manual / Mony IA <-> Open Finance):
            Matches an existing `manual` transaction within ±1 day (or same
            statement_month), identical amount & type, and overlapping merchant
            stem -> reconciles & links external_id/dedup_hash instead of
            inserting a duplicate.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
import hashlib
import re
from typing import Any, Optional
import unicodedata
from uuid import UUID

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database.models import Transaction, TransactionType


def normalize_text(text: str) -> str:
    """Strip accents, installment markers, prefixes, and punctuation for stable matching."""
    s = (text or "").lower()
    s = re.sub(r"\(\s*\d{1,2}\s*/\s*\d{1,2}\s*\)", "", s)
    s = re.sub(r"(?:parcela|parc\.?)\s*\d{1,2}\s*(?:/|de)\s*\d{1,2}", "", s)
    s = re.sub(r"\b(?:pix\s+(?:enviado|recebido)|compra\s+(?:cartao|debito|credito)|pag\*|mp\*|mercadopago\*)\b", "", s)
    nfkd = unicodedata.normalize("NFKD", s)
    cleaned = "".join(c for c in nfkd if not unicodedata.combining(c))
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned).strip()
    return cleaned[:64]


def compute_account_fingerprint(
    institution_name: str,
    account_type: Optional[str],
    last4: Optional[str],
    owner_name: Optional[str] = None,
) -> str:
    """Stable identity of a real bank account across Open Finance reconnects."""
    raw = "|".join([
        normalize_text(institution_name or "bank"),
        normalize_text(account_type or "checking"),
        re.sub(r"\D", "", last4 or "")[-4:] or "0000",
        normalize_text(owner_name or "")[:24],
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]


def compute_transaction_dedup_hash(
    *,
    user_id: UUID | str,
    account_fingerprint: str,
    tx_type: str,
    amount: Decimal | float,
    tx_date: date,
    statement_month: Optional[str],
    description: str,
    merchant_name: Optional[str] = None,
    installment_number: Optional[int] = None,
    seq_same_day: int = 0,
) -> str:
    """Deterministic SHA-256 hash surviving Open Finance disconnect/reconnect."""
    amt_str = f"{abs(float(amount)):.2f}"
    date_anchor = statement_month if (installment_number and statement_month) else tx_date.isoformat()
    desc_norm = normalize_text(merchant_name or description)
    payload = "|".join([
        str(user_id),
        account_fingerprint or "default",
        str(tx_type).lower(),
        amt_str,
        date_anchor,
        desc_norm,
        str(installment_number or 0),
        str(seq_same_day),
    ])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def assign_batch_dedup_hashes(
    *,
    user_id: UUID | str,
    account_fingerprint: str,
    items: list[dict[str, Any]],
) -> list[str]:
    """
    Assign deterministic `dedup_hash` to every item in a sync batch.
    Identical items occurring multiple times on the same day receive sequential
    indices (`0, 1, ...`) so genuine repeat purchases are preserved while
    re-syncing/re-linking yields the exact same hashes.
    """
    counts: dict[tuple, int] = {}
    hashes: list[str] = []
    for item in items:
        tx_date: date = item["transaction_date"]
        stmt_month: Optional[str] = item.get("statement_month")
        inst_num: Optional[int] = item.get("installment_number")
        desc_norm = normalize_text(item.get("merchant_name") or item.get("description") or "")
        amt_key = f"{abs(float(item['amount'])):.2f}"
        date_anchor = stmt_month if (inst_num and stmt_month) else tx_date.isoformat()
        sig = (str(item["type"]).lower(), amt_key, date_anchor, desc_norm, inst_num or 0)
        seq = counts.get(sig, 0)
        counts[sig] = seq + 1
        hashes.append(
            compute_transaction_dedup_hash(
                user_id=user_id,
                account_fingerprint=account_fingerprint,
                tx_type=str(item["type"]),
                amount=item["amount"],
                tx_date=tx_date,
                statement_month=stmt_month,
                description=item.get("description") or "",
                merchant_name=item.get("merchant_name"),
                installment_number=inst_num,
                seq_same_day=seq,
            )
        )
    return hashes


def _merchant_stems_overlap(a: str, b: str) -> bool:
    na, nb = normalize_text(a), normalize_text(b)
    if not na or not nb:
        return False
    if na == nb or na in nb or nb in na:
        return True
    toks_a = {t for t in na.split() if len(t) >= 3}
    toks_b = {t for t in nb.split() if len(t) >= 3}
    return bool(toks_a & toks_b)


def check_3layer_dedup(
    db: Session,
    *,
    user_id: UUID,
    external_id: Optional[str],
    source: str,
    dedup_hash: str,
    tx_type: TransactionType,
    amount: Decimal,
    tx_date: date,
    statement_month: Optional[str],
    description: str,
    merchant_name: Optional[str] = None,
) -> tuple[str, Optional[Transaction]]:
    """
    Evaluate 3-layer deduplication before inserting an Open Finance transaction.

    Returns:
      - ``("insert", None)`` — safe to insert as new transaction
      - ``("duplicate_external_id", existing)`` — Layer 1 hit
      - ``("duplicate_content_hash", existing)`` — Layer 2 hit (reconnect-safe!)
      - ``("reconcile_manual", existing)`` — Layer 3 hit (links manual/AI tx)
    """
    # Layer 1: Exact external_id match
    if external_id:
        existing_ext = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.external_id == external_id,
                Transaction.source == source,
                Transaction.deleted_at.is_(None),
            )
            .first()
        )
        if existing_ext is not None:
            return ("duplicate_external_id", existing_ext)

    # Layer 2: Reconnect-safe deterministic content hash
    if dedup_hash:
        existing_hash = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == user_id,
                Transaction.dedup_hash == dedup_hash,
                Transaction.deleted_at.is_(None),
            )
            .first()
        )
        if existing_hash is not None:
            # Refresh external_id on reconnect so future Layer 1 lookups hit immediately
            if external_id and existing_hash.external_id != external_id:
                existing_hash.external_id = external_id
            return ("duplicate_content_hash", existing_hash)

    # Layer 3: Cross-source reconciliation with existing manual / Mony IA transaction
    date_lo = tx_date - timedelta(days=1)
    date_hi = tx_date + timedelta(days=1)
    date_clause = and_(Transaction.transaction_date >= date_lo, Transaction.transaction_date <= date_hi)
    if statement_month:
        date_clause = or_(date_clause, Transaction.statement_month == statement_month)

    candidates = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.source == "manual",
            Transaction.type == tx_type,
            Transaction.amount == amount,
            Transaction.deleted_at.is_(None),
            date_clause,
        )
        .all()
    )
    incoming_label = merchant_name or description
    for cand in candidates:
        cand_label = cand.merchant_name or cand.description
        if _merchant_stems_overlap(incoming_label, cand_label):
            return ("reconcile_manual", cand)

    return ("insert", None)
