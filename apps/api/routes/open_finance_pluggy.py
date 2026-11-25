"""
Pluggy Real Open Finance routes for Mony API.

Endpoints:
  GET  /open-finance/pluggy/status               — check live vs sandbox mode & dedup status
  POST /open-finance/pluggy/connect-token        — generate Pluggy Connect Widget token
  POST /open-finance/pluggy/items                — link/reconnect a Pluggy item + full 3-layer dedup sync
  POST /open-finance/pluggy/sync/{linked_id}     — re-sync a Pluggy-linked account with 3-layer dedup
  POST /open-finance/pluggy/webhook              — receive real-time Pluggy push webhooks
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
import asyncio
import logging
import os
import re
from typing import Any, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Account,
    AccountType,
    ConsentStatus,
    LinkedAccountSyncStatus,
    OFConsent,
    OFInstitution,
    OFLinkedAccount,
    OFSyncJob,
    SyncJobStatus,
    Transaction,
    TransactionSource,
    TransactionType,
)
from routes.categories import ensure_default_categories
from routes.transactions import _resolve_category, _set_transaction_category
from services.ai_analyzer import _classify_category, _detect_payment_method, _extract_installment
from services.dedup_engine import (
    assign_batch_dedup_hashes,
    check_3layer_dedup,
    compute_account_fingerprint,
)
from services.pluggy_client import (
    create_connect_token,
    fetch_pluggy_accounts,
    fetch_pluggy_connectors,
    fetch_pluggy_item,
    fetch_pluggy_transactions,
    is_pluggy_configured,
)
from services.rules_engine import (
    detect_and_link_paired_transfers,
    is_internal_transfer_text,
    load_active_rules,
    match_user_rule,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/open-finance/pluggy", tags=["open-finance-pluggy"])


class ConnectTokenRequest(BaseModel):
    item_id: Optional[str] = None


class RegisterPluggyItemRequest(BaseModel):
    item_id: str = Field(min_length=3, max_length=200)
    institution_name: Optional[str] = None
    lookback_days: int = Field(default=90, ge=1, le=365)


def _map_pluggy_account_type(p_type: str, subtype: Optional[str]) -> AccountType:
    st = (subtype or "").upper()
    pt = (p_type or "").upper()
    if pt == "CREDIT" or "CREDIT" in st:
        return AccountType.CREDIT_CARD
    if "SAVINGS" in st:
        return AccountType.SAVINGS
    if "INVEST" in pt or "INVEST" in st:
        return AccountType.INVESTMENT
    return AccountType.CHECKING


def _map_pluggy_payment_method(raw_tx: dict[str, Any], is_credit_card: bool) -> str:
    pd = raw_tx.get("paymentData") or {}
    pm = str(pd.get("paymentMethod") or "").upper()
    if "PIX" in pm:
        return "pix"
    if "BOLETO" in pm:
        return "boleto"
    if "CREDIT" in pm or is_credit_card:
        return "credit_card"
    if "DEBIT" in pm:
        return "debit_card"
    if "TED" in pm or "DOC" in pm or "TRANSFER" in pm:
        return "bank_transfer"
    return _detect_payment_method(str(raw_tx.get("description") or ""), "credit_card" if is_credit_card else "other")


def _parse_pluggy_tx(raw_tx: dict[str, Any], is_credit_card: bool) -> Optional[dict[str, Any]]:
    raw_amt = raw_tx.get("amount")
    if raw_amt is None:
        return None
    amt_float = float(raw_amt)
    if amt_float == 0:
        return None

    tx_type_raw = str(raw_tx.get("type") or "").upper()
    if is_credit_card:
        # On credit card accounts, positive or DEBIT charges are expenses, negative refunds are refunds
        tx_type = TransactionType.REFUND if (tx_type_raw == "CREDIT" and amt_float > 0) else TransactionType.EXPENSE
    else:
        tx_type = TransactionType.INCOME if (tx_type_raw == "CREDIT" or amt_float > 0) else TransactionType.EXPENSE

    date_raw = str(raw_tx.get("date") or "")[:10]
    try:
        tx_date = date.fromisoformat(date_raw)
    except ValueError:
        tx_date = date.today()

    desc = str(raw_tx.get("description") or "Transação Open Finance").strip()[:255]
    cc_meta = raw_tx.get("creditCardMetadata") or {}
    inst_num = cc_meta.get("installmentNumber")
    inst_tot = cc_meta.get("totalInstallments")
    if not inst_num:
        inst_num, inst_tot, _ = _extract_installment(desc)

    stmt_month = None
    bill_id = cc_meta.get("billId")
    if bill_id and re.match(r"^\d{4}-\d{2}$", str(bill_id)):
        stmt_month = str(bill_id)
    else:
        stmt_month = tx_date.strftime("%Y-%m")

    merchant = None
    m_obj = raw_tx.get("merchant")
    if isinstance(m_obj, dict):
        merchant = m_obj.get("name") or m_obj.get("businessName")
    if not merchant:
        merchant = desc[:120]

    return {
        "external_id": str(raw_tx.get("id") or ""),
        "type": tx_type,
        "amount": Decimal(f"{abs(amt_float):.2f}"),
        "currency": raw_tx.get("currencyCode") or "BRL",
        "description": desc,
        "merchant_name": str(merchant)[:255] if merchant else None,
        "transaction_date": tx_date,
        "statement_month": stmt_month,
        "payment_method": _map_pluggy_payment_method(raw_tx, is_credit_card),
        "installment_number": int(inst_num) if inst_num else None,
        "installment_total": int(inst_tot) if inst_tot else None,
    }


def _get_or_create_institution(db: Session, connector_id: str, name: str, logo_url: Optional[str]) -> OFInstitution:
    ext_id = f"pluggy-{connector_id}"
    inst = db.query(OFInstitution).filter(OFInstitution.external_id == ext_id).first()
    if inst:
        return inst
    inst = OFInstitution(
        external_id=ext_id,
        name=name[:200],
        logo_url=logo_url,
        authorization_server_url="https://connect.pluggy.ai",
        token_endpoint="https://api.pluggy.ai/auth",
        accounts_endpoint="https://api.pluggy.ai/accounts",
        is_sandbox=not is_pluggy_configured(),
        is_active=True,
    )
    db.add(inst)
    db.flush()
    return inst


async def _sync_pluggy_account_txs(
    db: Session,
    *,
    uid: UUID,
    linked: OFLinkedAccount,
    mony_account: Account,
    pluggy_account_id: str,
    is_credit_card: bool,
    from_date: date,
) -> dict[str, int]:
    """Fetch Pluggy transactions for one account and persist through 3-layer deduplication."""
    raw_txs = await fetch_pluggy_transactions(pluggy_account_id, from_date=from_date)
    parsed = [p for raw in raw_txs if (p := _parse_pluggy_tx(raw, is_credit_card)) is not None]

    categories = ensure_default_categories(db, uid)
    cat_names = [c.name for c in categories]
    active_rules = load_active_rules(db, uid)

    acct_fp = linked.account_fingerprint or compute_account_fingerprint(
        mony_account.name,
        linked.account_type,
        linked.account_number_last4,
        linked.owner_name,
    )
    dedup_hashes = assign_batch_dedup_hashes(
        user_id=uid,
        account_fingerprint=acct_fp,
        items=parsed,
    )

    inserted = 0
    skipped_dedup = 0
    reconciled = 0

    for item, dhash in zip(parsed, dedup_hashes):
        action, existing = check_3layer_dedup(
            db,
            user_id=uid,
            external_id=item["external_id"] or None,
            source=TransactionSource.OPEN_FINANCE.value,
            dedup_hash=dhash,
            tx_type=item["type"],
            amount=item["amount"],
            tx_date=item["transaction_date"],
            statement_month=item["statement_month"],
            description=item["description"],
            merchant_name=item["merchant_name"],
        )

        if action in ("duplicate_external_id", "duplicate_content_hash"):
            skipped_dedup += 1
            continue

        if action == "reconcile_manual" and existing is not None:
            existing.is_reconciled = True
            existing.external_id = item["external_id"] or existing.external_id
            existing.dedup_hash = dhash
            if not existing.payment_method:
                existing.payment_method = item["payment_method"]
            reconciled += 1
            continue

        matched_rule = match_user_rule(active_rules, item["description"], item["merchant_name"])
        tx_type = item["type"]
        rule_category: Optional[str] = None
        if matched_rule is not None:
            matched_rule.matches_count = int(matched_rule.matches_count or 0) + 1
            if matched_rule.action == "mark_transfer":
                tx_type = TransactionType.TRANSFER
            elif matched_rule.action == "categorize" and matched_rule.category_name:
                rule_category = matched_rule.category_name
        elif tx_type in (TransactionType.EXPENSE, TransactionType.INCOME) and is_internal_transfer_text(
            item["description"], item["merchant_name"]
        ):
            tx_type = TransactionType.TRANSFER

        tx = Transaction(
            user_id=uid,
            account_id=mony_account.id,
            type=tx_type,
            amount=item["amount"],
            currency=item["currency"],
            description=item["description"],
            merchant_name=item["merchant_name"],
            transaction_date=item["transaction_date"],
            statement_month=item["statement_month"],
            payment_method=item["payment_method"],
            installment_number=item["installment_number"],
            installment_total=item["installment_total"],
            is_reconciled=True,
            source=TransactionSource.OPEN_FINANCE.value,
            external_id=item["external_id"] or None,
            dedup_hash=dhash,
        )
        db.add(tx)
        db.flush()

        cat_label = rule_category or _classify_category(
            f"{item['description']} {item['merchant_name'] or ''}",
            cat_names,
            tx_type.value,
        )
        cat = _resolve_category(db, uid, category_name=cat_label)
        if cat is not None:
            _set_transaction_category(db, tx, cat)

        inserted += 1

    if inserted > 0:
        detect_and_link_paired_transfers(db, uid, days_back=90)

    linked.last_sync_at = datetime.utcnow()
    linked.last_sync_attempt_at = datetime.utcnow()
    linked.sync_status = LinkedAccountSyncStatus.IDLE.value
    linked.last_sync_error = None
    return {
        "inserted": inserted,
        "skipped_dedup": skipped_dedup,
        "reconciled": reconciled,
    }


@router.get("/status")
async def pluggy_status(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    linked = (
        db.query(OFLinkedAccount)
        .filter(
            OFLinkedAccount.user_id == uid,
            OFLinkedAccount.provider == "pluggy",
            OFLinkedAccount.is_active.is_(True),
        )
        .all()
    )
    items = sorted({a.external_item_id for a in linked if a.external_item_id})
    configured = is_pluggy_configured()
    connectors = await fetch_pluggy_connectors(include_sandbox=False) if configured else []
    meu_pluggy_only = bool(
        configured
        and len(connectors) == 1
        and (connectors[0].get("id") == 200 or "meupluggy" in str(connectors[0].get("name", "")).lower())
    )
    return {
        "configured": configured,
        "mode": "live" if configured else "sandbox",
        "meu_pluggy_only": meu_pluggy_only,
        "available_live_connectors": len(connectors),
        "connected_accounts": len(linked),
        "connected_items": items,
        "dedup_engine": "3-layer-reconnect-safe",
    }


@router.post("/connect-token")
async def pluggy_connect_token(
    payload: Optional[ConnectTokenRequest] = None,
    user_id: str = Depends(get_current_user_from_header),
):
    """Generate a short-lived Pluggy Connect Widget token for the user."""
    backend_url = os.getenv("BACKEND_PUBLIC_URL", "https://mony-api-one.vercel.app").rstrip("/")
    frontend_url = os.getenv("FRONTEND_URL", "https://mony-kappa.vercel.app").rstrip("/")
    webhook_url = f"{backend_url}/open-finance/pluggy/webhook"
    oauth_redirect_uri = f"{frontend_url}/settings/connections"
    try:
        return await create_connect_token(
            client_user_id=str(user_id),
            item_id=payload.item_id if payload else None,
            webhook_url=webhook_url,
            oauth_redirect_uri=oauth_redirect_uri,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Pluggy connect_token failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Falha ao iniciar Pluggy Connect: {exc}",
        ) from exc


@router.post("/items", status_code=status.HTTP_201_CREATED)
async def register_pluggy_item(
    payload: RegisterPluggyItemRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Register (or safely reconnect!) a Pluggy Open Finance Item.

    Reuses existing Mony accounts matched by `account_fingerprint` and runs
    3-layer deduplication across all imported transactions so reconnecting a
    bank NEVER creates duplicate accounts or duplicate transactions.
    """
    uid = parse_uuid(user_id, "user_id")
    try:
        item_data = await fetch_pluggy_item(payload.item_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Não foi possível localizar o Item '{payload.item_id}' na Pluggy: {exc}",
        ) from exc

    connector = item_data.get("connector") or {}
    inst_name = payload.institution_name or connector.get("name") or "Instituição Open Finance"
    inst = _get_or_create_institution(
        db,
        connector_id=str(connector.get("id") or "generic"),
        name=inst_name,
        logo_url=connector.get("imageUrl"),
    )

    # Create authorized consent record with unique state_token
    consent = OFConsent(
        user_id=uid,
        institution_id=inst.id,
        external_consent_id=payload.item_id,
        status=ConsentStatus.AUTHORIZED,
        permissions=["accounts", "transactions", "credit_cards", "investments"],
        state_token=f"{payload.item_id[:48]}-{uuid4().hex[:12]}"[:64],
        authorization_url="https://connect.pluggy.ai",
        expires_at=datetime.utcnow() + timedelta(days=365),
    )
    db.add(consent)
    db.flush()

    # Freshly connected Pluggy items can take 1-3s to expose accounts while UPDATING
    pluggy_accounts = await fetch_pluggy_accounts(payload.item_id)
    if not pluggy_accounts and is_pluggy_configured() and not payload.item_id.startswith("sandbox-") and not os.getenv("PYTEST_CURRENT_TEST"):
        for _ in range(3):
            await asyncio.sleep(2.0)
            pluggy_accounts = await fetch_pluggy_accounts(payload.item_id)
            if pluggy_accounts:
                break
    since = date.today() - timedelta(days=payload.lookback_days)

    accounts_linked = 0
    accounts_reused = 0
    total_inserted = 0
    total_skipped = 0
    total_reconciled = 0

    for p_acct in pluggy_accounts:
        p_acct_id = str(p_acct.get("id"))
        acct_type = _map_pluggy_account_type(str(p_acct.get("type") or ""), p_acct.get("subtype"))
        raw_num = str(p_acct.get("number") or p_acct_id)
        last4 = re.sub(r"\D", "", raw_num)[-4:] or raw_num[-4:]
        owner = p_acct.get("owner") or ""
        fp = compute_account_fingerprint(inst_name, acct_type.value, last4, owner)
        balance_val = Decimal(f"{float(p_acct.get('balance') or 0):.2f}")

        # Check if user ALREADY linked this same bank account before (reconnect scenario!)
        existing_linked = (
            db.query(OFLinkedAccount)
            .filter(
                OFLinkedAccount.user_id == uid,
                OFLinkedAccount.account_fingerprint == fp,
            )
            .first()
        )

        mony_acct: Optional[Account] = None
        if existing_linked is not None:
            accounts_reused += 1
            existing_linked.external_account_id = p_acct_id
            existing_linked.external_item_id = payload.item_id
            existing_linked.consent_id = consent.id
            existing_linked.institution_id = inst.id
            existing_linked.provider = "pluggy"
            existing_linked.is_active = True
            linked = existing_linked
            if existing_linked.mony_account_id:
                mony_acct = (
                    db.query(Account)
                    .filter(Account.id == existing_linked.mony_account_id, Account.deleted_at.is_(None))
                    .first()
                )
        else:
            accounts_linked += 1
            linked = OFLinkedAccount(
                user_id=uid,
                consent_id=consent.id,
                institution_id=inst.id,
                external_account_id=p_acct_id,
                account_type=acct_type.value,
                account_number_last4=last4,
                owner_name=owner[:200] if owner else None,
                currency=p_acct.get("currencyCode") or "BRL",
                is_active=True,
                provider="pluggy",
                external_item_id=payload.item_id,
                account_fingerprint=fp,
            )
            db.add(linked)
            db.flush()

        if mony_acct is None:
            base_name = f"{inst_name} · {p_acct.get('name') or acct_type.value}"
            if last4:
                base_name = f"{base_name} ({last4})"
            candidate_name = base_name[:100]
            existing_by_name = (
                db.query(Account)
                .filter(
                    Account.user_id == uid,
                    Account.name == candidate_name,
                    Account.deleted_at.is_(None),
                )
                .first()
            )
            if existing_by_name is not None:
                mony_acct = existing_by_name
                mony_acct.balance = balance_val
            else:
                mony_acct = Account(
                    user_id=uid,
                    name=candidate_name,
                    type=acct_type,
                    balance=balance_val,
                    currency=p_acct.get("currencyCode") or "BRL",
                )
                db.add(mony_acct)
                db.flush()
            linked.mony_account_id = mony_acct.id
        else:
            mony_acct.balance = balance_val

        stats = await _sync_pluggy_account_txs(
            db,
            uid=uid,
            linked=linked,
            mony_account=mony_acct,
            pluggy_account_id=p_acct_id,
            is_credit_card=(acct_type == AccountType.CREDIT_CARD),
            from_date=since,
        )
        total_inserted += stats["inserted"]
        total_skipped += stats["skipped_dedup"]
        total_reconciled += stats["reconciled"]

    job = OFSyncJob(
        user_id=uid,
        status=SyncJobStatus.COMPLETED.value,
        trigger="manual",
        accounts_queued=len(pluggy_accounts),
        accounts_processed=len(pluggy_accounts),
        transactions_inserted=total_inserted,
        transactions_skipped=total_skipped + total_reconciled,
        started_at=datetime.utcnow(),
        finished_at=datetime.utcnow(),
    )
    db.add(job)
    db.commit()

    return {
        "item_id": payload.item_id,
        "institution_name": inst_name,
        "mode": "live" if is_pluggy_configured() and not payload.item_id.startswith("sandbox-") else "sandbox",
        "accounts_linked": accounts_linked,
        "accounts_reused": accounts_reused,
        "transactions_inserted": total_inserted,
        "transactions_skipped_dedup": total_skipped,
        "transactions_reconciled": total_reconciled,
    }


@router.post("/sync/{linked_account_id}")
async def sync_pluggy_linked_account(
    linked_account_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    lid = parse_uuid(linked_account_id, "linked_account_id")
    linked = (
        db.query(OFLinkedAccount)
        .filter(
            OFLinkedAccount.id == lid,
            OFLinkedAccount.user_id == uid,
            OFLinkedAccount.is_active.is_(True),
        )
        .first()
    )
    if not linked:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta vinculada não encontrada.")

    mony_acct = (
        db.query(Account)
        .filter(Account.id == linked.mony_account_id, Account.deleted_at.is_(None))
        .first()
        if linked.mony_account_id
        else db.query(Account).filter(Account.user_id == uid, Account.deleted_at.is_(None)).first()
    )
    if not mony_acct:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta Mony associada não encontrada.")

    since = date.today() - timedelta(days=30)
    stats = await _sync_pluggy_account_txs(
        db,
        uid=uid,
        linked=linked,
        mony_account=mony_acct,
        pluggy_account_id=linked.external_account_id,
        is_credit_card=(linked.account_type == AccountType.CREDIT_CARD.value),
        from_date=since,
    )
    db.commit()
    return {
        "linked_account_id": str(linked.id),
        "transactions_inserted": stats["inserted"],
        "transactions_skipped_dedup": stats["skipped_dedup"],
        "transactions_reconciled": stats["reconciled"],
    }


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def pluggy_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """Handle Pluggy real-time webhooks (`item/updated`, `transactions/created`)."""
    body = await request.json()
    event = body.get("event")
    item_id = body.get("itemId")
    if not item_id:
        return {"received": True, "processed": False}

    linked_rows = (
        db.query(OFLinkedAccount)
        .filter(OFLinkedAccount.external_item_id == str(item_id), OFLinkedAccount.is_active.is_(True))
        .all()
    )
    synced = 0
    for linked in linked_rows:
        if not linked.mony_account_id:
            continue
        mony_acct = db.query(Account).filter(Account.id == linked.mony_account_id, Account.deleted_at.is_(None)).first()
        if not mony_acct:
            continue
        try:
            await _sync_pluggy_account_txs(
                db,
                uid=linked.user_id,
                linked=linked,
                mony_account=mony_acct,
                pluggy_account_id=linked.external_account_id,
                is_credit_card=(linked.account_type == AccountType.CREDIT_CARD.value),
                from_date=date.today() - timedelta(days=14),
            )
            synced += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning("Pluggy webhook sync failed for linked=%s: %s", linked.id, exc)
    db.commit()
    return {"received": True, "event": event, "accounts_synced": synced}
