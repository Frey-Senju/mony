"""
Web Push Subscription & Test Delivery endpoints for Mony PWA.

Endpoints:
  GET    /push/vapid-public-key — public VAPID key for browser PushManager.subscribe()
  GET    /push/status           — user's active push devices count
  POST   /push/subscribe        — register or reactivate a browser/PWA push subscription
  DELETE /push/unsubscribe      — deactivate a browser push subscription by endpoint
  POST   /push/test             — send an immediate test notification to user's devices
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import PushSubscription
from services.push_service import (
    get_vapid_public_key,
    is_push_configured,
    send_push_to_user,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/push", tags=["push"])


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=10)
    auth: str = Field(min_length=6)


class PushSubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=10)
    keys: PushKeys
    user_agent: Optional[str] = Field(default=None, max_length=255)


class PushUnsubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=10)


@router.get("/vapid-public-key")
async def vapid_public_key():
    return {
        "configured": is_push_configured(),
        "public_key": get_vapid_public_key() or None,
    }


@router.get("/status")
async def push_status(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    active = (
        db.query(PushSubscription)
        .filter(PushSubscription.user_id == uid, PushSubscription.is_active.is_(True))
        .all()
    )
    return {
        "configured": is_push_configured(),
        "public_key": get_vapid_public_key() or None,
        "subscribed_devices": len(active),
        "endpoints": [s.endpoint for s in active],
    }


@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe_push(
    payload: PushSubscribeRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    existing = (
        db.query(PushSubscription)
        .filter(
            PushSubscription.user_id == uid,
            PushSubscription.endpoint == payload.endpoint,
        )
        .first()
    )
    if existing is not None:
        existing.p256dh = payload.keys.p256dh
        existing.auth = payload.keys.auth
        existing.user_agent = (payload.user_agent or existing.user_agent or "")[:255] or None
        existing.is_active = True
        sub = existing
    else:
        sub = PushSubscription(
            user_id=uid,
            endpoint=payload.endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth,
            user_agent=(payload.user_agent or "")[:255] or None,
            is_active=True,
        )
        db.add(sub)
    db.commit()
    db.refresh(sub)
    return {"id": str(sub.id), "subscribed": True}


@router.delete("/unsubscribe")
async def unsubscribe_push(
    endpoint: str = Query(min_length=10),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    sub = (
        db.query(PushSubscription)
        .filter(PushSubscription.user_id == uid, PushSubscription.endpoint == endpoint)
        .first()
    )
    if sub:
        sub.is_active = False
        db.commit()
    return {"unsubscribed": True}


@router.post("/test")
async def test_push(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    stats = send_push_to_user(
        db,
        uid,
        title="Mony · Notificações Ativadas!",
        body="Você receberá alertas de vencimentos, budgets, Open Finance e proventos B3 aqui.",
        url="/dashboard",
        tag="mony-test",
    )
    db.commit()
    if stats["sent"] == 0 and stats["failed"] == 0 and stats["deactivated"] == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum dispositivo inscrito para notificações push.",
        )
    return stats
