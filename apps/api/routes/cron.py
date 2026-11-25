"""
Vercel Cron Daily Automation endpoint for Mony API.

Configured in `apps/api/vercel.json` to run daily at 10:00 UTC (07:00 BRT):
  GET /cron/daily  (Authorization: Bearer <CRON_SECRET>)

Performs 4 idempotent, error-isolated maintenance tasks:
  1. Refresh B3 live quotes (`brapi.dev` + Yahoo `.SA`) for all active portfolio tickers.
  2. Sync connected Pluggy Open Finance accounts (3-layer dedup + transfer/rule detection).
  3. Generate due monthly recurring transactions (`auto_create=True`) for the current month.
  4. Sync smart alerts (budget warnings/exceeded, upcoming bills, goals) across active users.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
import logging
import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Account,
    AccountType,
    InvestmentAsset,
    OFLinkedAccount,
    RecurringRule,
    User,
)
from routes.notifications import _sync_smart_alerts
from routes.open_finance_pluggy import _sync_pluggy_account_txs
from routes.recurring import _generate_rule_tx
from services.market_data import get_quote
from services.pluggy_client import is_pluggy_configured
from services.push_service import send_push_to_user

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

    # 4. Run Smart Financial Alerts & send Web Push notifications to subscribed devices
    try:
        from database.models import Notification
        active_users = db.query(User.id).filter(User.deleted_at.is_(None)).limit(100).all()
        for (uid,) in active_users:
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
            except Exception as exc:  # noqa: BLE001
                report["errors"].append(f"alerts:{uid}:{exc}")
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        report["errors"].append(f"alerts_stage:{exc}")

    report["duration_ms"] = int((datetime.utcnow() - started_at).total_seconds() * 1000)
    return report
