"""
Vercel Cron Daily Automation & User-Triggered Alert Scan endpoints for Mony API.

Configured in `apps/api/vercel.json` to run daily at 10:00 UTC (07:00 BRT):
  GET  /cron/daily        (Authorization: Bearer <CRON_SECRET>)
  POST /cron/run-my-scan  (Authenticated user JWT — runs immediate scan for current user)

Performs 6 idempotent, error-isolated automation stages:
  1. Refresh B3 live quotes (`brapi.dev` + Yahoo `.SA`) for all active portfolio tickers.
  2. Sync connected Pluggy Open Finance accounts (3-layer dedup + transfer/rule detection).
  3. Generate due monthly recurring transactions (`auto_create=True`) for the current month.
  4. Sync smart alerts (budget warnings/exceeded, upcoming bills, goals) + Web Push delivery.
  5. Scan Mony Valuer Watchlist for Price-Ceiling hits -> Notification + Web Push + HMAC Webhook + Resend Email.
  6. On day 1 of the month, send Monthly Mony Review digest email via Resend (when configured).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
import hashlib
import hmac
import json
import logging
import os
import secrets
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
import httpx
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Account,
    AccountType,
    InvestmentAsset,
    Notification,
    OFLinkedAccount,
    OutgoingWebhook,
    RecurringRule,
    Transaction,
    TransactionType,
    User,
    ValuerWatchlistItem,
)
from routes.notifications import _sync_smart_alerts
from routes.open_finance_pluggy import _sync_pluggy_account_txs
from routes.recurring import _generate_rule_tx
from routes.valuer import B3_UNIVERSE
from services.email_service import (
    is_email_configured,
    send_monthly_review_email,
    send_valuer_ceiling_alert_email,
)
from services.market_data import get_quote
from services.pluggy_client import is_pluggy_configured
from services.push_service import send_push_to_user
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cron", tags=["cron"])


def _verify_cron_auth(authorization: str | None) -> None:
    expected = os.getenv("CRON_SECRET", "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CRON_SECRET não configurado no servidor.",
        )
    provided = ""
    if authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:].strip()
    if not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autorização de Cron inválida.",
        )


async def _dispatch_user_webhooks(
    db: Session,
    uid: UUID,
    event_name: str,
    payload: dict[str, Any],
) -> int:
    """Dispatch signed HMAC-SHA256 outgoing webhooks for matching event subscriptions."""
    hooks = (
        db.query(OutgoingWebhook)
        .filter(OutgoingWebhook.user_id == uid, OutgoingWebhook.is_active.is_(True))
        .all()
    )
    delivered = 0
    body_bytes = json.dumps(
        {
            "event": event_name,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "data": payload,
        },
        ensure_ascii=False,
    ).encode("utf-8")

    async with httpx.AsyncClient(timeout=6.0) as client:
        for h in hooks:
            events = list(h.events or [])
            if events and event_name not in events and "*" not in events:
                continue
            sig = hmac.new(
                (h.secret or "").encode("utf-8"),
                body_bytes,
                hashlib.sha256,
            ).hexdigest()
            try:
                res = await client.post(
                    h.target_url,
                    content=body_bytes,
                    headers={
                        "Content-Type": "application/json",
                        "X-Mony-Event": event_name,
                        "X-Mony-Signature": f"sha256={sig}",
                    },
                )
                h.last_status_code = res.status_code
                h.last_triggered_at = datetime.utcnow()
                if 200 <= res.status_code < 300:
                    delivered += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("Webhook %s failed: %s", h.id, exc)
                h.last_status_code = 0
                h.last_triggered_at = datetime.utcnow()
    return delivered


async def _scan_user_valuer_watchlist(db: Session, user: User) -> dict[str, Any]:
    """Scan a user's Valuer Watchlist against current prices and dispatch alerts."""
    items = (
        db.query(ValuerWatchlistItem)
        .filter(ValuerWatchlistItem.user_id == user.id)
        .all()
    )
    if not items:
        return {"checked": 0, "hits": [], "webhooks_delivered": 0, "email_sent": False}

    universe_price = {a["ticker"].upper(): float(a.get("ref_price", a.get("price", 0))) for a in B3_UNIVERSE}
    hits: list[dict[str, Any]] = []
    today_iso = date.today().isoformat()

    for w in items:
        target = float(w.target_price or 0)
        if target <= 0:
            continue
        tkr = (w.ticker or "").upper()
        live_price = universe_price.get(tkr, 0.0)
        try:
            q = await get_quote(db, tkr, asset_class="stock", force_refresh=False)
            if q and getattr(q, "price", None):
                live_price = float(q.price)
        except Exception:  # noqa: BLE001
            pass

        if live_price > 0 and live_price <= target:
            discount_pct = round(((target - live_price) / target) * 100.0, 1)
            hits.append(
                {
                    "ticker": tkr,
                    "price": round(live_price, 2),
                    "target_ceiling": round(target, 2),
                    "discount_pct": discount_pct,
                }
            )

    webhooks_delivered = 0
    email_sent = False
    if hits:
        summary_tickers = ", ".join(f"{h['ticker']} (R$ {h['price']:.2f})" for h in hits[:4])
        notif_title = f"🎯 Watchlist Valuer: {len(hits)} ativo(s) abaixo do Teto"
        existing_today = (
            db.query(Notification)
            .filter(
                Notification.user_id == user.id,
                Notification.title == notif_title,
                Notification.created_at >= datetime.utcnow() - timedelta(hours=20),
            )
            .first()
        )
        if not existing_today:
            db.add(
                Notification(
                    user_id=user.id,
                    type="valuer_ceiling",
                    title=notif_title,
                    message=f"Oportunidade detectada: {summary_tickers}. Confira no Mony Valuer.",
                    is_read=False,
                )
            )
            send_push_to_user(
                db,
                user.id,
                title=notif_title,
                body=summary_tickers,
                url="/dashboard/valuer",
                tag=f"mony-valuer-{today_iso}",
            )
        webhooks_delivered = await _dispatch_user_webhooks(
            db, user.id, "valuer.ceiling_reached", {"hits": hits, "date": today_iso}
        )
        if user.email and is_email_configured():
            em = await send_valuer_ceiling_alert_email(user.email, user.full_name or "", hits)
            email_sent = bool(em.get("sent"))

    return {
        "checked": len(items),
        "hits": hits,
        "webhooks_delivered": webhooks_delivered,
        "email_sent": email_sent,
    }


@router.post("/run-my-scan")
async def run_my_automation_scan(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Manual trigger for the authenticated user to immediately scan:
    - Smart Financial Alerts (budgets, bills, goals)
    - Mony Valuer Watchlist Price-Ceiling alerts (Notification + Push + HMAC Webhooks + Email)
    """
    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    _sync_smart_alerts(db, uid)
    watchlist_result = await _scan_user_valuer_watchlist(db, user)
    db.commit()

    return {
        "ok": True,
        "ran_at": datetime.utcnow().isoformat() + "Z",
        "email_provider_configured": is_email_configured(),
        "smart_alerts_synced": True,
        "watchlist": watchlist_result,
    }


@router.get("/daily")
async def run_daily_cron(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Daily automated sync invoked by Vercel Cron (07:00 BRT / 10:00 UTC)."""
    _verify_cron_auth(authorization)

    started_at = datetime.utcnow()
    today = date.today()
    current_ym = today.strftime("%Y-%m")

    report: dict = {
        "ran_at": started_at.isoformat(),
        "date": today.isoformat(),
        "quotes_refreshed": 0,
        "quotes_failed": 0,
        "pluggy_accounts_synced": 0,
        "pluggy_txs_inserted": 0,
        "pluggy_txs_deduped": 0,
        "recurring_generated": 0,
        "alerts_users_checked": 0,
        "push_sent": 0,
        "valuer_watchlist_hits": 0,
        "webhooks_delivered": 0,
        "emails_sent": 0,
        "errors": [],
    }

    # 1. Refresh B3 live quotes for all distinct active non-fixed-income tickers
    try:
        rows = (
            db.query(InvestmentAsset.ticker, InvestmentAsset.asset_class)
            .filter(
                InvestmentAsset.deleted_at.is_(None),
                InvestmentAsset.quantity > 0,
                InvestmentAsset.asset_class != "fixed_income",
            )
            .distinct()
            .limit(40)
            .all()
        )
        for ticker, asset_class in rows:
            try:
                q = await get_quote(db, ticker, asset_class=asset_class, force_refresh=True)
                if q:
                    report["quotes_refreshed"] += 1
                else:
                    report["quotes_failed"] += 1
            except Exception as exc:  # noqa: BLE001
                report["quotes_failed"] += 1
                report["errors"].append(f"quote:{ticker}:{exc}")
    except Exception as exc:  # noqa: BLE001
        report["errors"].append(f"quotes_stage:{exc}")

    # 2. Sync Pluggy live linked accounts (last 14 days, 3-layer dedup)
    if is_pluggy_configured():
        try:
            linked_rows = (
                db.query(OFLinkedAccount)
                .filter(
                    OFLinkedAccount.provider == "pluggy",
                    OFLinkedAccount.is_active.is_(True),
                )
                .limit(30)
                .all()
            )
            since = today - timedelta(days=14)
            for linked in linked_rows:
                if not linked.mony_account_id:
                    continue
                mony_acct = (
                    db.query(Account)
                    .filter(Account.id == linked.mony_account_id, Account.deleted_at.is_(None))
                    .first()
                )
                if not mony_acct:
                    continue
                try:
                    stats = await _sync_pluggy_account_txs(
                        db,
                        uid=linked.user_id,
                        linked=linked,
                        mony_account=mony_acct,
                        pluggy_account_id=linked.external_account_id,
                        is_credit_card=(linked.account_type == AccountType.CREDIT_CARD.value),
                        from_date=since,
                    )
                    report["pluggy_accounts_synced"] += 1
                    report["pluggy_txs_inserted"] += stats["inserted"]
                    report["pluggy_txs_deduped"] += stats["skipped_dedup"]
                except Exception as exc:  # noqa: BLE001
                    report["errors"].append(f"pluggy:{linked.id}:{exc}")
            db.commit()
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            report["errors"].append(f"pluggy_stage:{exc}")

    # 3. Generate due recurring transactions (auto_create=True, day_of_month <= today.day)
    try:
        due_rules = (
            db.query(RecurringRule)
            .filter(
                RecurringRule.deleted_at.is_(None),
                RecurringRule.is_active.is_(True),
                RecurringRule.auto_create.is_(True),
                RecurringRule.day_of_month <= today.day,
            )
            .all()
        )
        for rule in due_rules:
            if rule.last_generated_month == current_ym:
                continue
            try:
                created_tx = _generate_rule_tx(db, rule.user_id, rule, current_ym)
                if created_tx is not None:
                    report["recurring_generated"] += 1
            except Exception as exc:  # noqa: BLE001
                report["errors"].append(f"recurring:{rule.id}:{exc}")
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        report["errors"].append(f"recurring_stage:{exc}")

    # 4, 5 & 6. Smart Alerts + Web Push + Valuer Watchlist Scan + Monthly Email Digest
    try:
        active_users = db.query(User).filter(User.deleted_at.is_(None)).limit(100).all()
        for user in active_users:
            uid = user.id
            try:
                _sync_smart_alerts(db, uid)
                report["alerts_users_checked"] += 1
                latest_unread = (
                    db.query(Notification)
                    .filter(
                        Notification.user_id == uid,
                        Notification.is_read.is_(False),
                        Notification.created_at >= datetime.utcnow() - timedelta(hours=24),
                    )
                    .order_by(Notification.created_at.desc())
                    .first()
                )
                if latest_unread is not None:
                    pstats = send_push_to_user(
                        db,
                        uid,
                        title=latest_unread.title,
                        body=latest_unread.message,
                        url="/dashboard",
                        tag=f"mony-daily-{today.isoformat()}",
                    )
                    report["push_sent"] += pstats["sent"]

                # Stage 5: Valuer Watchlist Price-Ceiling scan
                wres = await _scan_user_valuer_watchlist(db, user)
                report["valuer_watchlist_hits"] += len(wres["hits"])
                report["webhooks_delivered"] += wres["webhooks_delivered"]
                if wres["email_sent"]:
                    report["emails_sent"] += 1

                # Stage 6: Monthly Mony Review Email on day 1 of month
                if today.day == 1 and user.email and is_email_configured():
                    prev_end = today.replace(day=1)
                    prev_start = (prev_end - timedelta(days=1)).replace(day=1)
                    txs = (
                        db.query(Transaction)
                        .filter(
                            Transaction.user_id == uid,
                            Transaction.deleted_at.is_(None),
                            Transaction.transaction_date >= prev_start,
                            Transaction.transaction_date < prev_end,
                        )
                        .all()
                    )
                    inc = sum(float(t.amount or 0) for t in txs if t.type == TransactionType.INCOME)
                    exp = sum(float(t.amount or 0) for t in txs if t.type == TransactionType.EXPENSE)
                    em = await send_monthly_review_email(
                        user.email,
                        user.full_name or "",
                        prev_start.strftime("%m/%Y"),
                        inc,
                        exp,
                        inc - exp,
                    )
                    if em.get("sent"):
                        report["emails_sent"] += 1
            except Exception as exc:  # noqa: BLE001
                report["errors"].append(f"alerts:{uid}:{exc}")
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        report["errors"].append(f"alerts_stage:{exc}")

    report["duration_ms"] = int((datetime.utcnow() - started_at).total_seconds() * 1000)
    return report
