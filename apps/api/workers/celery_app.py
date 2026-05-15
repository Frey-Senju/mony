"""
Celery application factory for Mony.

Configures a single Celery app with a Redis broker (``REDIS_URL``) and a Beat
schedule that triggers ``sync_all_authorized_accounts`` every 4 hours.

The app is imported by both the worker process and any FastAPI module that
wants to dispatch tasks via ``send_task`` — keeping a single instance avoids
fan-out of broker connections.

Why a separate factory module: the ``celery beat`` and ``celery worker``
processes both need to import this without dragging in the FastAPI app object,
and tests need to be able to patch ``celery_app.send_task`` cleanly.
"""

from __future__ import annotations

import os

from celery import Celery
from celery.schedules import crontab

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "mony",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["workers.tasks.sync_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
)

# Periodic schedule — sync every 4 hours, on the hour.
celery_app.conf.beat_schedule = {
    "sync-all-authorized-accounts": {
        "task": "workers.tasks.sync_tasks.sync_all_authorized_accounts",
        "schedule": crontab(minute=0, hour="*/4"),
    },
}
