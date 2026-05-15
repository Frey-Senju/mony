"""
Open Finance transaction sync routes — Story 2.2.

Endpoints:
  POST /open-finance/sync                — dispatch a sync job for the user
       ?account_id=UUID                   — limit to one linked account
  GET  /open-finance/sync/{sync_id}      — read status of a sync job
  POST /open-finance/webhook             — push endpoint for partner banks

The HTTP layer is intentionally thin: it validates auth + rate limits,
materialises an ``OFSyncJob`` row for traceability, and hands the actual
fetch/upsert work off to Celery (or runs eagerly when
``CELERY_TASK_ALWAYS_EAGER=1``).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    ConsentStatus,
    OFConsent,
    OFLinkedAccount,
    OFSyncJob,
    SyncJobStatus,
)
from services.open_finance_sync import (
    authorized_linked_accounts_for_user,
    sync_account_transactions,
)
from utils.auth import get_current_user_from_header

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/open-finance", tags=["open-finance-sync"])

SYNC_RATE_LIMIT_WINDOW = timedelta(hours=1)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class SyncTriggerResponse(BaseModel):
    sync_id: UUID
    accounts_queued: int
    status: str

    model_config = ConfigDict(from_attributes=True)


class SyncStatusResponse(BaseModel):
    sync_id: UUID = Field(validation_alias="id")
    status: str
    accounts_queued: int
    accounts_processed: int
    transactions_inserted: int
    transactions_skipped: int
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _eager_mode() -> bool:
    return os.getenv("CELERY_TASK_ALWAYS_EAGER") == "1"


def _check_sync_rate_limit(db: Session, *, user_id: UUID, linked_account_id: Optional[UUID]) -> None:
    """One manual sync per linked account per hour (or per-user when global)."""
    cutoff = datetime.utcnow() - SYNC_RATE_LIMIT_WINDOW
    stmt = select(OFSyncJob).where(
        OFSyncJob.user_id == user_id,
        OFSyncJob.created_at >= cutoff,
        OFSyncJob.trigger == "manual",
    )
    if linked_account_id is not None:
        stmt = stmt.where(OFSyncJob.linked_account_id == linked_account_id)
    recent = db.execute(stmt).scalars().first()
    if recent is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Sync rate limit exceeded — try again in an hour.",
        )


def _verify_webhook_signature(payload: bytes, signature: str | None, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    candidate = signature.removeprefix("sha256=") if signature.startswith("sha256=") else signature
    return hmac.compare_digest(expected, candidate)


# ---------------------------------------------------------------------------
# POST /sync — dispatch a sync job
# ---------------------------------------------------------------------------


@router.post("/sync", response_model=SyncTriggerResponse, status_code=202)
async def trigger_sync(
    account_id: Optional[UUID] = Query(None, description="Limit sync to one linked account"),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Dispatch a sync job. Honours the per-account hourly rate limit."""
    uid = UUID(user_id)
    _check_sync_rate_limit(db, user_id=uid, linked_account_id=account_id)

    if account_id is not None:
        # Validate ownership + AUTHORIZED consent on the requested linked account.
        linked = db.execute(
            select(OFLinkedAccount)
            .join(OFConsent, OFLinkedAccount.consent_id == OFConsent.id)
            .where(
                OFLinkedAccount.id == account_id,
                OFLinkedAccount.user_id == uid,
                OFLinkedAccount.is_active.is_(True),
                OFConsent.status == ConsentStatus.AUTHORIZED,
            )
        ).scalar_one_or_none()
        if linked is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Linked account not found or consent not authorized",
            )
        targets = [linked]
    else:
        targets = list(authorized_linked_accounts_for_user(db, uid))

    if not targets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No authorized linked accounts to sync.",
        )

    job = OFSyncJob(
        id=uuid4(),
        user_id=uid,
        linked_account_id=account_id,
        status=SyncJobStatus.QUEUED.value,
        trigger="manual",
        accounts_queued=len(targets),
        accounts_processed=0,
        transactions_inserted=0,
        transactions_skipped=0,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    if _eager_mode():
        # Run synchronously in tests / no-broker environments.
        for linked in targets:
            try:
                result = await sync_account_transactions(db, linked_account_id=linked.id)
                job.accounts_processed += 1
                job.transactions_inserted += result.inserted
                job.transactions_skipped += result.skipped
            except Exception as exc:  # noqa: BLE001
                job.error_message = (job.error_message or "") + f"{exc}; "
        job.status = (
            SyncJobStatus.COMPLETED.value if not job.error_message else SyncJobStatus.FAILED.value
        )
        job.started_at = job.started_at or datetime.utcnow()
        job.finished_at = datetime.utcnow()
        db.commit()
    else:
        # Lazy import to keep the celery dependency optional in dev.
        from workers.tasks.sync_tasks import sync_account_transactions_task

        for linked in targets:
            sync_account_transactions_task.delay(str(linked.id), str(job.id))

    return SyncTriggerResponse(
        sync_id=job.id,
        accounts_queued=job.accounts_queued,
        status=job.status,
    )


# ---------------------------------------------------------------------------
# GET /sync/{sync_id} — status
# ---------------------------------------------------------------------------


@router.get("/sync/{sync_id}", response_model=SyncStatusResponse)
async def get_sync_status(
    sync_id: UUID,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    job = db.execute(
        select(OFSyncJob).where(OFSyncJob.id == sync_id, OFSyncJob.user_id == UUID(user_id))
    ).scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sync job not found")
    return SyncStatusResponse.model_validate(job)


# ---------------------------------------------------------------------------
# POST /webhook — push endpoint
# ---------------------------------------------------------------------------


@router.post("/webhook", status_code=200)
async def open_finance_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_webhook_signature: Optional[str] = Header(None, alias="X-Webhook-Signature"),
    x_consent_id: Optional[str] = Header(None, alias="X-Consent-Id"),
):
    """Receive a push from a partner bank.

    HMAC-SHA256 over the raw body using ``WEBHOOK_SECRET``.
    Headers expected:
      X-Webhook-Signature: sha256=<hex>
      X-Consent-Id: <our internal consent UUID>
    """
    secret = os.getenv("WEBHOOK_SECRET")
    if not secret:
        # Fail-closed: never accept webhooks if the secret is not configured.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Webhook receiver not configured",
        )

    raw_body = await request.body()
    if not _verify_webhook_signature(raw_body, x_webhook_signature, secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    try:
        payload = json.loads(raw_body or b"{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")

    # Validate consent id resolves to a known consent.
    if not x_consent_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing X-Consent-Id")
    try:
        consent_uuid = UUID(x_consent_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid X-Consent-Id")

    consent = db.get(OFConsent, consent_uuid)
    if consent is None or consent.status != ConsentStatus.AUTHORIZED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consent not found or not authorized")

    if _eager_mode():
        # In eager mode persist immediately for tests.
        external_account_id = payload.get("accountId") or payload.get("account_id")
        if not external_account_id:
            return {"accepted": True, "queued": 0}
        linked = db.execute(
            select(OFLinkedAccount).where(
                OFLinkedAccount.consent_id == consent.id,
                OFLinkedAccount.external_account_id == external_account_id,
                OFLinkedAccount.is_active.is_(True),
            )
        ).scalar_one_or_none()
        if linked is None:
            return {"accepted": True, "queued": 0}
        await sync_account_transactions(db, linked_account_id=linked.id)
        db.commit()
        return {"accepted": True, "queued": 1}

    from workers.tasks.sync_tasks import process_webhook_payload

    process_webhook_payload.delay(payload, str(consent.id))
    return {"accepted": True, "queued": 1}
