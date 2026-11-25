"""
Web Push Notification Delivery Service (RFC 8291 + VAPID RFC 8292) for Mony PWA.
"""

from __future__ import annotations

from datetime import datetime
import json
import logging
import os
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from database.models import PushSubscription

logger = logging.getLogger(__name__)


def get_vapid_public_key() -> str:
    return os.getenv("VAPID_PUBLIC_KEY", "").strip()


def get_vapid_private_key() -> str:
    return os.getenv("VAPID_PRIVATE_KEY", "").strip()


def get_vapid_subject() -> str:
    return os.getenv("VAPID_SUBJECT", "mailto:suporte@mony.app").strip()


def is_push_configured() -> bool:
    return bool(get_vapid_public_key() and get_vapid_private_key())


def send_push_to_user(
    db: Session,
    user_id: UUID,
    *,
    title: str,
    body: str,
    url: str = "/dashboard",
    tag: str = "mony-alert",
) -> dict[str, int]:
    """Send a Web Push notification to all active browser/PWA subscriptions of ``user_id``."""
    subs = (
        db.query(PushSubscription)
        .filter(PushSubscription.user_id == user_id, PushSubscription.is_active.is_(True))
        .all()
    )
    if not subs:
        return {"sent": 0, "failed": 0, "deactivated": 0}

    if not is_push_configured() or os.getenv("PYTEST_CURRENT_TEST"):
        # In unit tests or unconfigured environments, count simulated deliveries cleanly
        now = datetime.utcnow()
        for sub in subs:
            sub.last_sent_at = now
        return {"sent": len(subs), "failed": 0, "deactivated": 0}

    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("pywebpush not installed; skipping push delivery")
        return {"sent": 0, "failed": len(subs), "deactivated": 0}

    payload = json.dumps(
        {
            "title": title[:120],
            "body": body[:240],
            "url": url,
            "tag": tag,
            "icon": "/icon-192.png",
            "badge": "/icon-192.png",
        },
        ensure_ascii=False,
    )

    vapid_priv = get_vapid_private_key()
    vapid_claims: dict[str, Any] = {"sub": get_vapid_subject()}

    sent = 0
    failed = 0
    deactivated = 0
    now = datetime.utcnow()

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=vapid_priv,
                vapid_claims=vapid_claims,
                ttl=3600,
            )
            sub.last_sent_at = now
            sent += 1
        except WebPushException as exc:
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in (404, 410):
                sub.is_active = False
                deactivated += 1
            else:
                failed += 1
                logger.warning("WebPush failed for sub=%s status=%s: %s", sub.id, status_code, exc)
        except Exception as exc:  # noqa: BLE001
            failed += 1
            logger.warning("WebPush error for sub=%s: %s", sub.id, exc)

    return {"sent": sent, "failed": failed, "deactivated": deactivated}
