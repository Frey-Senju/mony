"""
Celery tasks for Open Finance transaction sync.

Two task entry points:

* ``sync_account_transactions_task`` — sync a single linked account. Bound to
  the user's manual sync button and to the Beat-scheduled fan-out below.
* ``sync_all_authorized_accounts`` — Beat-scheduled task that fans out to
  every active linked account whose consent is still AUTHORIZED.

Retries: exponential backoff with a hard cap of 3 attempts. Per-account
errors are surfaced via the linked account's ``sync_status`` /
``last_sync_error`` columns rather than crashing the broker.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime
from uuid import UUID

from celery import shared_task

from database.base import SessionLocal
from database.models import (
    LinkedAccountSyncStatus,
    OFLinkedAccount,
    OFSyncJob,
    SyncJobStatus,
)
from services.open_finance_sync import (
    all_authorized_linked_accounts,
    sync_account_transactions,
)

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_BACKOFF_SECONDS = 60


def _run_async(coro):
    """Run an async coroutine inside a Celery task context."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # Should not happen in a Celery worker, but be defensive.
            new_loop = asyncio.new_event_loop()
            try:
                return new_loop.run_until_complete(coro)
            finally:
                new_loop.close()
        return loop.run_until_complete(coro)
    except RuntimeError:
        new_loop = asyncio.new_event_loop()
        try:
            return new_loop.run_until_complete(coro)
        finally:
            new_loop.close()


@shared_task(
    name="workers.tasks.sync_tasks.sync_account_transactions_task",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=RETRY_BACKOFF_SECONDS,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=MAX_RETRIES,
)
def sync_account_transactions_task(self, linked_account_id: str, sync_job_id: str | None = None):
    """Sync one linked account; mark errors on the row and on the parent job."""
    account_uuid = UUID(linked_account_id)
    job_uuid = UUID(sync_job_id) if sync_job_id else None

    db = SessionLocal()
    try:
        if job_uuid:
            job = db.get(OFSyncJob, job_uuid)
            if job and not job.started_at:
                job.started_at = datetime.utcnow()
                job.status = SyncJobStatus.RUNNING.value
                db.commit()

        result = _run_async(sync_account_transactions(db, linked_account_id=account_uuid))

        if job_uuid:
            job = db.get(OFSyncJob, job_uuid)
            if job:
                job.accounts_processed = (job.accounts_processed or 0) + 1
                job.transactions_inserted = (job.transactions_inserted or 0) + result.inserted
                job.transactions_skipped = (job.transactions_skipped or 0) + result.skipped
                if job.accounts_processed >= (job.accounts_queued or 0):
                    job.status = (
                        SyncJobStatus.COMPLETED.value if result.ok else SyncJobStatus.FAILED.value
                    )
                    job.finished_at = datetime.utcnow()
                if not result.ok:
                    job.error_message = "; ".join(result.errors)[:1000]

        db.commit()
        return {
            "linked_account_id": linked_account_id,
            "inserted": result.inserted,
            "skipped": result.skipped,
            "ok": result.ok,
        }
    except Exception as exc:
        db.rollback()
        # Mark the linked account as errored so the user sees state in the UI.
        try:
            linked = db.get(OFLinkedAccount, account_uuid)
            if linked is not None:
                linked.sync_status = LinkedAccountSyncStatus.ERROR.value
                linked.last_sync_error = str(exc)[:500]
                linked.last_sync_attempt_at = datetime.utcnow()
                db.commit()
        finally:
            pass
        raise
    finally:
        db.close()


@shared_task(name="workers.tasks.sync_tasks.sync_all_authorized_accounts")
def sync_all_authorized_accounts():
    """Fan-out: enqueue per-account sync for every authorized account."""
    db = SessionLocal()
    try:
        accounts = list(all_authorized_linked_accounts(db))
        for acct in accounts:
            sync_account_transactions_task.delay(str(acct.id))
        return {"queued": len(accounts)}
    finally:
        db.close()


@shared_task(name="workers.tasks.sync_tasks.process_webhook_payload")
def process_webhook_payload(payload: dict, source_consent_id: str | None = None):
    """Persist a webhook-pushed transaction batch.

    Webhook handlers respond 200 immediately and offload the work here.
    """
    from sqlalchemy import select  # local import keeps the task module light

    from database.models import OFConsent, OFLinkedAccount

    db = SessionLocal()
    try:
        consent = None
        if source_consent_id:
            consent = db.get(OFConsent, UUID(source_consent_id))

        external_account_id = payload.get("accountId") or payload.get("account_id")
        if not external_account_id or not consent:
            logger.warning("webhook payload missing account/consent — skipping")
            return {"processed": 0}

        linked = db.execute(
            select(OFLinkedAccount).where(
                OFLinkedAccount.consent_id == consent.id,
                OFLinkedAccount.external_account_id == external_account_id,
                OFLinkedAccount.is_active.is_(True),
            )
        ).scalar_one_or_none()

        if linked is None:
            logger.warning("webhook for unknown account %s — skipping", external_account_id)
            return {"processed": 0}

        # Defer to the per-account sync — this also handles dedup.
        sync_account_transactions_task.delay(str(linked.id))
        return {"processed": 1, "linked_account_id": str(linked.id)}
    finally:
        db.close()


# Eager-mode helper: when CELERY_TASK_ALWAYS_EAGER=1 the dispatcher runs in the
# request thread (handy for tests + dev without a broker). The Celery library
# already supports this at app config level — we mirror the env var here so it
# can be flipped without code changes. Wrapped in a try so the module still
# imports cleanly when celery itself is unavailable (the route layer only
# imports this module lazily on the non-eager path anyway).
if os.getenv("CELERY_TASK_ALWAYS_EAGER") == "1":
    try:
        from workers.celery_app import celery_app  # noqa: E402

        celery_app.conf.task_always_eager = True
        celery_app.conf.task_eager_propagates = True
    except Exception:  # noqa: BLE001
        pass
