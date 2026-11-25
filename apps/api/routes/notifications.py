"""
In-App Notifications & Smart Financial Alerts endpoints for Mony API.

Automatically evaluates & deduplicates:
  - Budget alerts (>= 80% warning, >= 100% exceeded)
  - Upcoming / overdue fixed recurring bills (within next 5 days)
  - Achieved financial goals

Endpoints:
  GET    /notifications               — sync smart alerts + list notifications & unread count
  PATCH  /notifications/{id}/read     — mark single notification as read
  POST   /notifications/mark-all-read — mark all unread notifications as read
  DELETE /notifications/{id}          — dismiss/delete notification
"""

import calendar
from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Budget,
    Category,
    Goal,
    Notification,
    NotificationType,
    RecurringRule,
    Transaction,
    TransactionCategory,
    TransactionType,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _brl(val: float) -> str:
    return f"R$ {val:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _sync_smart_alerts(db: Session, uid: UUID) -> None:
    """Idempotently generate smart notifications for budgets, upcoming bills, and goals."""
    today = date.today()
    ym = today.strftime("%Y-%m")
    month_start = date(today.year, today.month, 1)
    next_month = date(today.year + 1, 1, 1) if today.month == 12 else date(today.year, today.month + 1, 1)

    # Fetch notifications created this month to prevent duplicates
    existing_month = (
        db.query(Notification)
        .filter(Notification.user_id == uid, Notification.created_at >= datetime(today.year, today.month, 1))
        .all()
    )
    existing_keys = {
        (n.related_entity_type, str(n.related_entity_id), n.type.value if hasattr(n.type, "value") else str(n.type))
        for n in existing_month
    }

    created_any = False

    # 1. Budget threshold alerts (80% warning / 100% exceeded)
    budgets = db.query(Budget).filter(Budget.user_id == uid, Budget.is_active.is_(True)).all()
    if budgets:
        cat_rows = (
            db.query(Category.name, func.coalesce(func.sum(Transaction.amount), 0))
            .select_from(Transaction)
            .join(TransactionCategory, TransactionCategory.transaction_id == Transaction.id)
            .join(Category, Category.id == TransactionCategory.category_id)
            .filter(
                and_(
                    Transaction.user_id == uid,
                    Transaction.type == TransactionType.EXPENSE,
                    Transaction.deleted_at.is_(None),
                    Transaction.transaction_date >= month_start,
                    Transaction.transaction_date < next_month,
                )
            )
            .group_by(Category.name)
            .all()
        )
        spent_map = {name.lower(): float(tot) for name, tot in cat_rows}

        for b in budgets:
            limit_val = float(b.limit_amount)
            if limit_val <= 0:
                continue
            spent = spent_map.get(b.category.lower(), 0.0)
            pct = round((spent / limit_val) * 100, 1)
            if pct >= 100:
                key = ("budget_exceeded", str(b.id), NotificationType.LIMIT_ALERT.value)
                if key not in existing_keys:
                    db.add(
                        Notification(
                            user_id=uid,
                            type=NotificationType.LIMIT_ALERT,
                            title=f"Budget ultrapassado: {b.category}",
                            message=f"Você gastou {_brl(spent)} de {_brl(limit_val)} ({pct}%) em {b.category} neste mês.",
                            related_entity_type="budget_exceeded",
                            related_entity_id=b.id,
                        )
                    )
                    existing_keys.add(key)
                    created_any = True
            elif pct >= 80:
                key = ("budget_warning", str(b.id), NotificationType.LIMIT_ALERT.value)
                if key not in existing_keys:
                    db.add(
                        Notification(
                            user_id=uid,
                            type=NotificationType.LIMIT_ALERT,
                            title=f"Budget em atenção: {b.category}",
                            message=f"Você já atingiu {pct}% ({_brl(spent)} / {_brl(limit_val)}) do limite de {b.category}.",
                            related_entity_type="budget_warning",
                            related_entity_id=b.id,
                        )
                    )
                    existing_keys.add(key)
                    created_any = True

    # 2. Upcoming / overdue recurring fixed expenses (within next 5 days or past due in current month)
    max_day = calendar.monthrange(today.year, today.month)[1]
    recurring = (
        db.query(RecurringRule)
        .filter(
            RecurringRule.user_id == uid,
            RecurringRule.deleted_at.is_(None),
            RecurringRule.is_active.is_(True),
            RecurringRule.type == TransactionType.EXPENSE,
        )
        .all()
    )
    for r in recurring:
        if r.last_generated_month == ym:
            continue
        due_day = min(max(1, r.day_of_month), max_day)
        due_dt = date(today.year, today.month, due_day)
        days_left = (due_dt - today).days
        if days_left <= 5:
            key = ("recurring_due", str(r.id), NotificationType.CUSTOM.value)
            if key not in existing_keys:
                when = (
                    "vence hoje"
                    if days_left == 0
                    else (f"vence em {days_left} dia(s)" if days_left > 0 else f"venceu há {abs(days_left)} dia(s)")
                )
                db.add(
                    Notification(
                        user_id=uid,
                        type=NotificationType.CUSTOM,
                        title=f"Conta fixa {when}: {r.description}",
                        message=f"{r.description} ({_brl(float(r.amount))}) — vencimento dia {due_day:02d}/{today.month:02d}.",
                        related_entity_type="recurring_due",
                        related_entity_id=r.id,
                    )
                )
                existing_keys.add(key)
                created_any = True

    # 3. Achieved financial goals
    goals = db.query(Goal).filter(Goal.user_id == uid, Goal.is_active.is_(True)).all()
    for g in goals:
        if float(g.target_amount or 0) > 0 and float(g.current_amount or 0) >= float(g.target_amount):
            key = ("goal", str(g.id), NotificationType.GOAL_PROGRESS.value)
            if key not in existing_keys:
                db.add(
                    Notification(
                        user_id=uid,
                        type=NotificationType.GOAL_PROGRESS,
                        title=f"Meta alcançada: {g.name}!",
                        message=f"Parabéns! Você atingiu {_brl(float(g.current_amount))} da meta {g.name}.",
                        related_entity_type="goal",
                        related_entity_id=g.id,
                    )
                )
                existing_keys.add(key)
                created_any = True

    if created_any:
        db.commit()


def _serialize_notification(n: Notification) -> dict:
    return {
        "id": str(n.id),
        "type": n.type.value if hasattr(n.type, "value") else str(n.type),
        "title": n.title,
        "message": n.message,
        "related_entity_type": n.related_entity_type,
        "related_entity_id": str(n.related_entity_id) if n.related_entity_id else None,
        "is_read": bool(n.is_read),
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("")
async def list_notifications(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Sync smart alerts and return latest 30 notifications with unread count."""
    uid = parse_uuid(user_id, "user_id")
    _sync_smart_alerts(db, uid)

    rows = (
        db.query(Notification)
        .filter(Notification.user_id == uid)
        .order_by(Notification.is_read.asc(), Notification.created_at.desc())
        .limit(30)
        .all()
    )
    unread_count = (
        db.query(Notification)
        .filter(Notification.user_id == uid, Notification.is_read.is_(False))
        .count()
    )
    return {
        "items": [_serialize_notification(n) for n in rows],
        "unread_count": unread_count,
    }


@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    nid = parse_uuid(notification_id, "notification_id")
    notif = (
        db.query(Notification)
        .filter(Notification.id == nid, Notification.user_id == uid)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificação não encontrada.")
    notif.is_read = True
    notif.read_at = datetime.utcnow()
    db.commit()
    return _serialize_notification(notif)


@router.post("/mark-all-read")
async def mark_all_notifications_read(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    now = datetime.utcnow()
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == uid, Notification.is_read.is_(False))
        .update({"is_read": True, "read_at": now})
    )
    db.commit()
    return {"marked_read": updated}


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    nid = parse_uuid(notification_id, "notification_id")
    notif = (
        db.query(Notification)
        .filter(Notification.id == nid, Notification.user_id == uid)
        .first()
    )
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificação não encontrada.")
    db.delete(notif)
    db.commit()
    return None
