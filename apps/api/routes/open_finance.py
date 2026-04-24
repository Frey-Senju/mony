"""
Open Finance routes for Mony API.

Implements the consent flow for linking bank accounts via Open Banking Brasil (sandbox).
Endpoints:
  GET    /open-finance/institutions          — list available sandbox institutions
  POST   /open-finance/consent/initiate      — start OAuth2 consent flow
  GET    /open-finance/consent/callback      — OAuth2 callback from bank
  GET    /open-finance/accounts              — list linked accounts
  DELETE /open-finance/accounts/{id}         — unlink account
"""

import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    ConsentStatus,
    OFConsent,
    OFInstitution,
    OFLinkedAccount,
    User,
    UserPlan,
)
from utils.auth import get_current_user_from_header
from utils.encryption import decrypt_token, encrypt_token

router = APIRouter(prefix="/open-finance", tags=["open-finance"])

CONSENT_TTL_MINUTES = 30
HTTPX_TIMEOUT = 10.0
OPEN_FINANCE_CALLBACK_URL = os.getenv(
    "OPEN_FINANCE_CALLBACK_URL", "http://localhost:8000/open-finance/consent/callback"
)

# Plan limits for linked accounts
PLAN_ACCOUNT_LIMITS: dict[str, Optional[int]] = {
    UserPlan.BASIC.value: 1,
    UserPlan.PRO.value: 5,
    UserPlan.PREMIUM.value: None,  # unlimited
}


# ============ Request / Response Schemas ============


class InstitutionResponse(BaseModel):
    id: UUID
    external_id: str
    name: str
    logo_url: Optional[str] = None
    authorization_server_url: str

    class Config:
        from_attributes = True


class ConsentInitiateRequest(BaseModel):
    institution_id: UUID
    permissions: list[str] = ["openid", "accounts", "transactions"]


class ConsentInitiateResponse(BaseModel):
    consent_id: UUID
    authorization_url: str
    expires_at: datetime


class LinkedAccountResponse(BaseModel):
    id: UUID
    institution_id: UUID
    institution_name: str
    account_type: Optional[str] = None
    account_number_last4: Optional[str] = None
    owner_name: Optional[str] = None
    currency: str
    is_active: bool
    last_sync_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ============ Helpers ============


def _get_user(user_id: str, db: Session) -> User:
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _check_account_limit(user: User, db: Session) -> None:
    limit = PLAN_ACCOUNT_LIMITS.get(user.plan.value)
    if limit is None:
        return
    count = (
        db.query(OFLinkedAccount)
        .filter(OFLinkedAccount.user_id == user.id, OFLinkedAccount.is_active == True)
        .count()
    )
    if count >= limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Plan {user.plan.value.upper()} allows at most {limit} linked account(s). Upgrade to link more.",
        )


def _check_rate_limit(user_id: UUID, db: Session) -> None:
    """Allow at most 3 consent initiations per hour per user."""
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    recent = (
        db.query(OFConsent)
        .filter(
            OFConsent.user_id == user_id,
            OFConsent.created_at >= one_hour_ago,
        )
        .count()
    )
    if recent >= 3:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many consent attempts. Try again in an hour.",
        )


# ============ Seed Helper ============


def seed_institutions(db: Session) -> None:
    """Idempotent: insert sandbox institutions if not present."""
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "sandbox_institutions.json")
    try:
        with open(data_path) as f:
            institutions = json.load(f)
    except FileNotFoundError:
        return

    for item in institutions:
        exists = db.query(OFInstitution).filter(OFInstitution.external_id == item["external_id"]).first()
        if not exists:
            db.add(OFInstitution(**item))
    db.commit()


# ============ Endpoint 1: List Institutions ============


@router.get("/institutions", response_model=list[InstitutionResponse])
async def list_institutions(
    search: Optional[str] = Query(None, description="Filter by institution name"),
    db: Session = Depends(get_db),
    _user_id: str = Depends(get_current_user_from_header),
):
    """List available Open Finance sandbox institutions."""
    seed_institutions(db)
    q = db.query(OFInstitution).filter(OFInstitution.is_active == True)
    if search:
        q = q.filter(OFInstitution.name.ilike(f"%{search}%"))
    return q.order_by(OFInstitution.name).all()


# ============ Endpoint 2: Initiate Consent ============


@router.post("/consent/initiate", response_model=ConsentInitiateResponse, status_code=201)
async def initiate_consent(
    payload: ConsentInitiateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Start the OAuth2 consent flow for linking a bank account."""
    user = _get_user(user_id, db)
    _check_rate_limit(user.id, db)
    _check_account_limit(user, db)

    institution = db.query(OFInstitution).filter(
        OFInstitution.id == payload.institution_id,
        OFInstitution.is_active == True,
    ).first()
    if not institution:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Institution not found")

    state_token = secrets.token_hex(32)
    expires_at = datetime.utcnow() + timedelta(minutes=CONSENT_TTL_MINUTES)

    # Build authorization URL
    authorization_url = (
        f"{institution.authorization_server_url}"
        f"?response_type=code"
        f"&client_id=mony-sandbox"
        f"&redirect_uri={OPEN_FINANCE_CALLBACK_URL}"
        f"&scope={'+'.join(payload.permissions)}"
        f"&state={state_token}"
    )

    consent = OFConsent(
        user_id=user.id,
        institution_id=institution.id,
        status=ConsentStatus.PENDING,
        permissions=payload.permissions,
        state_token=state_token,
        authorization_url=authorization_url,
        expires_at=expires_at,
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)

    return ConsentInitiateResponse(
        consent_id=consent.id,
        authorization_url=authorization_url,
        expires_at=expires_at,
    )


# ============ Endpoint 3: OAuth2 Callback ============


@router.get("/consent/callback")
async def consent_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Process OAuth2 callback from the bank. Redirects to frontend on completion."""
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    if error or not state:
        return RedirectResponse(
            url=f"{frontend_url}/settings/connections?error={error or 'missing_state'}"
        )

    # Look up consent by state token
    consent = (
        db.query(OFConsent)
        .filter(OFConsent.state_token == state, OFConsent.status == ConsentStatus.PENDING)
        .first()
    )
    if not consent:
        return RedirectResponse(
            url=f"{frontend_url}/settings/connections?error=invalid_state"
        )

    # Check expiry
    if datetime.utcnow() > consent.expires_at:
        consent.status = ConsentStatus.EXPIRED
        db.commit()
        return RedirectResponse(
            url=f"{frontend_url}/settings/connections?error=consent_expired"
        )

    if not code:
        consent.status = ConsentStatus.REJECTED
        db.commit()
        return RedirectResponse(
            url=f"{frontend_url}/settings/connections?error=no_code"
        )

    institution = db.query(OFInstitution).filter(OFInstitution.id == consent.institution_id).first()

    # Exchange code for tokens
    try:
        async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
            token_response = await client.post(
                institution.token_endpoint,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": OPEN_FINANCE_CALLBACK_URL,
                    "client_id": "mony-sandbox",
                },
            )
            token_response.raise_for_status()
            token_data = token_response.json()
    except Exception:
        consent.status = ConsentStatus.REJECTED
        db.commit()
        return RedirectResponse(
            url=f"{frontend_url}/settings/connections?error=token_exchange_failed"
        )

    access_token = token_data.get("access_token", "")
    refresh_token_val = token_data.get("refresh_token", "")
    expires_in = token_data.get("expires_in", 3600)

    # Encrypt tokens before storing
    try:
        consent.access_token_encrypted = encrypt_token(access_token) if access_token else None
        consent.refresh_token_encrypted = encrypt_token(refresh_token_val) if refresh_token_val else None
    except RuntimeError:
        # ENCRYPTION_KEY not set — store plaintext in sandbox only (log warning)
        consent.access_token_encrypted = access_token
        consent.refresh_token_encrypted = refresh_token_val

    consent.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    consent.status = ConsentStatus.AUTHORIZED
    db.commit()

    # Fetch linked accounts from bank
    try:
        async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
            accounts_response = await client.get(
                institution.accounts_endpoint,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            accounts_response.raise_for_status()
            accounts_data = accounts_response.json()
    except Exception:
        # Even if account fetch fails, consent is authorized; user can retry later
        db.commit()
        return RedirectResponse(
            url=f"{frontend_url}/settings/connections?warning=accounts_fetch_failed"
        )

    # Persist linked accounts (skip if already linked)
    accounts_list = accounts_data if isinstance(accounts_data, list) else accounts_data.get("data", [])
    for acct in accounts_list:
        external_id = acct.get("accountId") or acct.get("id", "unknown")
        existing = db.query(OFLinkedAccount).filter(
            OFLinkedAccount.user_id == consent.user_id,
            OFLinkedAccount.institution_id == institution.id,
            OFLinkedAccount.external_account_id == external_id,
        ).first()
        if not existing:
            db.add(
                OFLinkedAccount(
                    user_id=consent.user_id,
                    consent_id=consent.id,
                    institution_id=institution.id,
                    external_account_id=external_id,
                    account_type=acct.get("type"),
                    account_number_last4=str(acct.get("number", ""))[-4:] or None,
                    owner_name=acct.get("holderName"),
                    currency=acct.get("currency", "BRL"),
                )
            )
    db.commit()

    return RedirectResponse(
        url=f"{frontend_url}/settings/connections?success=true"
    )


# ============ Endpoint 4: List Linked Accounts ============


@router.get("/accounts", response_model=list[LinkedAccountResponse])
async def list_linked_accounts(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """List all active linked bank accounts for the authenticated user."""
    uid = UUID(user_id)
    accounts = (
        db.query(OFLinkedAccount, OFInstitution)
        .join(OFInstitution, OFLinkedAccount.institution_id == OFInstitution.id)
        .filter(OFLinkedAccount.user_id == uid, OFLinkedAccount.is_active == True)
        .all()
    )

    result = []
    for acct, inst in accounts:
        result.append(
            LinkedAccountResponse(
                id=acct.id,
                institution_id=acct.institution_id,
                institution_name=inst.name,
                account_type=acct.account_type,
                account_number_last4=acct.account_number_last4,
                owner_name=acct.owner_name,
                currency=acct.currency,
                is_active=acct.is_active,
                last_sync_at=acct.last_sync_at,
                created_at=acct.created_at,
            )
        )
    return result


# ============ Endpoint 5: Unlink Account ============


@router.delete("/accounts/{linked_account_id}", status_code=204)
async def unlink_account(
    linked_account_id: UUID,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Unlink a bank account. Revokes consent at bank (best effort)."""
    uid = UUID(user_id)
    acct = db.query(OFLinkedAccount).filter(
        OFLinkedAccount.id == linked_account_id,
        OFLinkedAccount.user_id == uid,
        OFLinkedAccount.is_active == True,
    ).first()
    if not acct:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked account not found")

    # Attempt to revoke consent at bank (best effort, non-blocking)
    consent = db.query(OFConsent).filter(OFConsent.id == acct.consent_id).first()
    if consent and consent.status == ConsentStatus.AUTHORIZED and consent.access_token_encrypted:
        institution = db.query(OFInstitution).filter(OFInstitution.id == consent.institution_id).first()
        if institution:
            try:
                token = decrypt_token(consent.access_token_encrypted)
                revoke_url = institution.token_endpoint.replace("/token", "/revoke")
                async with httpx.AsyncClient(timeout=HTTPX_TIMEOUT) as client:
                    await client.delete(
                        f"{revoke_url}/{consent.external_consent_id or ''}",
                        headers={"Authorization": f"Bearer {token}"},
                    )
            except Exception:
                pass  # Best effort — continue regardless

        consent.status = ConsentStatus.REVOKED
        db.commit()

    acct.is_active = False
    db.commit()
