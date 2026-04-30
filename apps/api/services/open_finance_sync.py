"""
Open Finance transaction sync service.

Encapsulates the logic for fetching transactions from a partner institution's
Open Finance sandbox endpoint, mapping them onto Mony's ``Transaction`` model,
and inserting them with deduplication on ``(user_id, external_id, source)``.

Real Bacen production integration requires ICP-Brasil certificates that are not
available in the dev environment. This service therefore:

* Calls ``OFInstitution.accounts_endpoint`` (or a configured ``transactions``
  variant) when the URL is reachable.
* Falls back to a deterministic stub generator in test / offline mode so
  pytest and the manual sync endpoint remain useful before sandbox credentials
  are provisioned. Stub mode is auto-detected when ``httpx`` raises any
  network error or when ``OF_SYNC_USE_STUB=1`` is set.
"""

from __future__ import annotations

import hashlib
import logging
import os
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Iterable
from uuid import UUID, uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database.models import (
    Account,
    AccountType,
    LinkedAccountSyncStatus,
    OFConsent,
    OFInstitution,
    OFLinkedAccount,
    Transaction,
    TransactionSource,
    TransactionType,
    ConsentStatus,
)
from utils.encryption import decrypt_token

logger = logging.getLogger(__name__)

HTTPX_TIMEOUT = 15.0
DEFAULT_LOOKBACK_DAYS = int(os.getenv("OF_SYNC_LOOKBACK_DAYS", "7"))
FIRST_SYNC_LOOKBACK_DAYS = int(os.getenv("OF_FIRST_SYNC_LOOKBACK_DAYS", "90"))


# ---------------------------------------------------------------------------
# Result objects
# ---------------------------------------------------------------------------


@dataclass
class SyncResult:
    """Outcome of syncing a single linked account."""

    linked_account_id: UUID
    inserted: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)
    last_external_date: date | None = None

    @property
    def ok(self) -> bool:
        return not self.errors


# ---------------------------------------------------------------------------
# Lookback helpers
# ---------------------------------------------------------------------------


def _lookback_for(account: OFLinkedAccount) -> date:
    """Return the start date for the next sync window for this account."""
    days = FIRST_SYNC_LOOKBACK_DAYS if account.last_sync_at is None else DEFAULT_LOOKBACK_DAYS
    return (datetime.utcnow().date() - timedelta(days=days))


# ---------------------------------------------------------------------------
# Bank API client
# ---------------------------------------------------------------------------


def _stub_transactions(account: OFLinkedAccount, since: date) -> list[dict[str, Any]]:
    """Produce a stable, deterministic set of stub transactions for dev/offline.

    The stub is keyed by ``external_account_id`` so re-runs return the same
    transactions and the dedup path is exercised on subsequent syncs.
    """
    seed = hashlib.md5(account.external_account_id.encode()).hexdigest()
    base_amount = (int(seed[:6], 16) % 9000) / 100  # R$ 0.00–90.00
    return [
        {
            "transactionId": f"{account.external_account_id}-stub-1",
            "amount": round(base_amount + 12.34, 2),
            "currency": account.currency or "BRL",
            "description": "Stub transaction — coffee",
            "transactionDate": (datetime.utcnow().date() - timedelta(days=1)).isoformat(),
            "merchantName": "Stub Coffee Co.",
            "type": "expense",
        },
        {
            "transactionId": f"{account.external_account_id}-stub-2",
            "amount": round(base_amount + 250.00, 2),
            "currency": account.currency or "BRL",
            "description": "Stub salary deposit",
            "transactionDate": (datetime.utcnow().date() - timedelta(days=3)).isoformat(),
            "merchantName": "Stub Employer Ltda",
            "type": "income",
        },
    ]


async def _fetch_transactions_from_bank(
    institution: OFInstitution,
    consent: OFConsent,
    account: OFLinkedAccount,
    since: date,
) -> list[dict[str, Any]]:
    """Fetch transactions from the bank's sandbox API.

    The Open Finance sandbox URL contract used here mirrors what Story 2.1
    already calls for accounts: GET on ``{accounts_endpoint}/{external_account_id}/transactions``
    with a Bearer token. Falls back to a deterministic stub on any network /
    HTTP error so downstream logic (dedup, persistence) still gets exercised.
    """
    if os.getenv("OF_SYNC_USE_STUB") == "1":
        return _stub_transactions(account, since)

    if not consent.access_token_encrypted:
        return _stub_transactions(account, since)

    try:
        token = decrypt_token(consent.access_token_encrypted)
    except ValueError:
        logger.warning("decrypt_token failed for consent %s — falling back to stub", consent.id)
        return _stub_transactions(account, since)

    url = f"{institution.accounts_endpoint.rstrip('/')}/{account.external_account_id}/transactions"
    params = {"fromBookingDate": since.isoformat()}

    try:
        async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
            response = await client.get(
                url,
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning(
            "Open Finance fetch failed for account %s — falling back to stub. err=%s",
            account.id,
            exc,
        )
        return _stub_transactions(account, since)

    if isinstance(payload, list):
        return payload
    return payload.get("data", []) or []


# ---------------------------------------------------------------------------
# Transaction mapping
# ---------------------------------------------------------------------------


_TYPE_MAP = {
    "credit": TransactionType.INCOME,
    "income": TransactionType.INCOME,
    "deposit": TransactionType.INCOME,
    "salary": TransactionType.INCOME,
    "debit": TransactionType.EXPENSE,
    "expense": TransactionType.EXPENSE,
    "withdrawal": TransactionType.EXPENSE,
    "transfer": TransactionType.TRANSFER,
    "investment": TransactionType.INVESTMENT,
    "refund": TransactionType.REFUND,
    "reversal": TransactionType.REFUND,
}


def _map_type(raw: str | None, amount: Decimal) -> TransactionType:
    if raw:
        mapped = _TYPE_MAP.get(raw.lower())
        if mapped:
            return mapped
    return TransactionType.INCOME if amount > 0 else TransactionType.EXPENSE


def _map_date(raw: str | None) -> date:
    if not raw:
        return datetime.utcnow().date()
    try:
        # Accept ISO datetime or plain date.
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        return datetime.utcnow().date()


def _ensure_internal_account(db: Session, linked: OFLinkedAccount) -> Account:
    """Find or create the internal Account that mirrors a linked OF account.

    Synced transactions need to point at an Account row (FK ``account_id``).
    The story defers explicit account-mapping UX, so we lazily provision an
    internal Account named after the institution + last-4 the first time we
    sync this linked account.
    """
    # Reuse if a previously-provisioned account already exists for this OF link.
    existing_tx = db.execute(
        select(Transaction)
        .where(
            Transaction.user_id == linked.user_id,
            Transaction.source == TransactionSource.OPEN_FINANCE.value,
        )
        .limit(1)
    ).scalar_one_or_none()
    if existing_tx:
        account = db.get(Account, existing_tx.account_id)
        if account is not None:
            return account

    institution = db.get(OFInstitution, linked.institution_id)
    inst_name = institution.name if institution else "Open Finance"
    suffix = f" •••• {linked.account_number_last4}" if linked.account_number_last4 else ""
    account_name = f"{inst_name}{suffix}"[:100]

    # Map account_type from OF string to internal AccountType enum.
    type_str = (linked.account_type or "").upper()
    if "SAVING" in type_str or "POUP" in type_str:
        account_type = AccountType.SAVINGS
    elif "CREDIT" in type_str or "CARD" in type_str:
        account_type = AccountType.CREDIT_CARD
    elif "INVEST" in type_str:
        account_type = AccountType.INVESTMENT
    else:
        account_type = AccountType.CHECKING

    # Reuse if an account with same name already exists (uq_accounts_user_name).
    duplicate = db.execute(
        select(Account).where(
            Account.user_id == linked.user_id,
            Account.name == account_name,
        )
    ).scalar_one_or_none()
    if duplicate is not None:
        return duplicate

    account = Account(
        id=uuid4(),
        user_id=linked.user_id,
        name=account_name,
        type=account_type,
        currency=linked.currency or "BRL",
    )
    db.add(account)
    db.flush()
    return account


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def _upsert_transaction(
    db: Session,
    *,
    user_id: UUID,
    account_id: UUID,
    raw: dict[str, Any],
) -> tuple[bool, bool]:
    """Insert or update a single transaction.

    Returns ``(inserted, skipped_duplicate)``. ``inserted=True`` means a new row
    was created; ``skipped_duplicate=True`` means an existing row was updated
    (so the partial-unique index prevented duplication). The two flags are
    mutually exclusive.
    """
    external_id = str(raw.get("transactionId") or raw.get("id") or "").strip()
    if not external_id:
        return False, False

    raw_amount = raw.get("amount", 0)
    try:
        amount = Decimal(str(raw_amount))
    except Exception:
        return False, False
    abs_amount = abs(amount)
    if abs_amount <= 0:
        return False, False

    tx_type = _map_type(raw.get("type") or raw.get("transactionType"), amount)
    tx_date = _map_date(raw.get("transactionDate") or raw.get("bookingDate"))

    existing = db.execute(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.source == TransactionSource.OPEN_FINANCE.value,
            Transaction.external_id == external_id,
        )
    ).scalar_one_or_none()

    if existing is not None:
        existing.amount = abs_amount
        existing.description = (raw.get("description") or existing.description)[:255]
        existing.merchant_name = raw.get("merchantName") or existing.merchant_name
        existing.transaction_date = tx_date
        existing.type = tx_type
        return False, True

    db.add(
        Transaction(
            id=uuid4(),
            user_id=user_id,
            account_id=account_id,
            type=tx_type,
            amount=abs_amount,
            currency=raw.get("currency") or "BRL",
            description=(raw.get("description") or "Open Finance transaction")[:255],
            merchant_name=raw.get("merchantName"),
            transaction_date=tx_date,
            source=TransactionSource.OPEN_FINANCE.value,
            external_id=external_id,
        )
    )
    return True, False


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


async def sync_account_transactions(
    db: Session,
    *,
    linked_account_id: UUID,
) -> SyncResult:
    """Sync transactions for a single OF-linked account.

    Caller is responsible for committing the session — the service flushes
    after each insert and only marks the linked account state, so callers
    (Celery task or HTTP endpoint) can choose their commit boundary.
    """
    linked = db.get(OFLinkedAccount, linked_account_id)
    if linked is None or not linked.is_active:
        return SyncResult(linked_account_id=linked_account_id, errors=["account_not_found_or_inactive"])

    consent = db.get(OFConsent, linked.consent_id)
    if consent is None or consent.status != ConsentStatus.AUTHORIZED:
        return SyncResult(linked_account_id=linked_account_id, errors=["consent_not_authorized"])

    institution = db.get(OFInstitution, linked.institution_id)
    if institution is None:
        return SyncResult(linked_account_id=linked_account_id, errors=["institution_not_found"])

    linked.sync_status = LinkedAccountSyncStatus.SYNCING.value
    linked.last_sync_attempt_at = datetime.utcnow()
    db.flush()

    since = _lookback_for(linked)
    try:
        raw_transactions = await _fetch_transactions_from_bank(
            institution=institution,
            consent=consent,
            account=linked,
            since=since,
        )
    except Exception as exc:  # noqa: BLE001 — must mark the account on any failure
        logger.exception("sync_account_transactions failed for %s", linked_account_id)
        linked.sync_status = LinkedAccountSyncStatus.ERROR.value
        linked.last_sync_error = str(exc)[:500]
        db.flush()
        return SyncResult(linked_account_id=linked_account_id, errors=[str(exc)])

    internal_account = _ensure_internal_account(db, linked)

    result = SyncResult(linked_account_id=linked_account_id)
    for raw in raw_transactions:
        try:
            inserted, skipped = _upsert_transaction(
                db,
                user_id=linked.user_id,
                account_id=internal_account.id,
                raw=raw,
            )
            if inserted:
                result.inserted += 1
                tx_date = _map_date(raw.get("transactionDate") or raw.get("bookingDate"))
                if result.last_external_date is None or tx_date > result.last_external_date:
                    result.last_external_date = tx_date
            elif skipped:
                result.skipped += 1
            db.flush()
        except IntegrityError as exc:
            db.rollback()
            result.skipped += 1
            logger.info("dedup integrity hit for account=%s err=%s", linked_account_id, exc)

    linked.sync_status = LinkedAccountSyncStatus.IDLE.value
    linked.last_sync_at = datetime.utcnow()
    linked.last_sync_error = None
    db.flush()

    logger.info(
        "OF sync done linked_account=%s inserted=%d skipped=%d",
        linked_account_id,
        result.inserted,
        result.skipped,
    )
    return result


def authorized_linked_accounts_for_user(db: Session, user_id: UUID) -> Iterable[OFLinkedAccount]:
    """Yield every active linked account whose consent is AUTHORIZED."""
    stmt = (
        select(OFLinkedAccount)
        .join(OFConsent, OFLinkedAccount.consent_id == OFConsent.id)
        .where(
            OFLinkedAccount.user_id == user_id,
            OFLinkedAccount.is_active.is_(True),
            OFConsent.status == ConsentStatus.AUTHORIZED,
        )
    )
    return db.execute(stmt).scalars().all()


def all_authorized_linked_accounts(db: Session) -> Iterable[OFLinkedAccount]:
    """Yield every authorized + active linked account, across all users."""
    stmt = (
        select(OFLinkedAccount)
        .join(OFConsent, OFLinkedAccount.consent_id == OFConsent.id)
        .where(
            OFLinkedAccount.is_active.is_(True),
            OFConsent.status == ConsentStatus.AUTHORIZED,
        )
    )
    return db.execute(stmt).scalars().all()
