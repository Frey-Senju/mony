"""
Authentication endpoints for Mony API.

Provides user registration (with default account + category seeding), login,
profile read/update (/auth/users/me), token refresh, logout (with token
blacklist), 2FA setup/verify/disable, and password reset.
"""

from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
import httpx
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import Account, AccountType, User
from routes.categories import ensure_default_categories
from utils.auth import (
    blacklist_token,
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    extract_bearer_token,
    generate_backup_codes,
    generate_totp_qr_code,
    generate_totp_secret,
    get_current_user_from_header,
    hash_password,
    verify_password,
    verify_password_reset_token,
    verify_token,
    verify_totp_code,
)
from utils.uuid_utils import parse_uuid

logger = logging.getLogger(__name__)

# In-memory store for password reset tokens (24h TTL).
# Exported for compatibility with existing tests.
password_reset_tokens: dict[str, dict] = {}

router = APIRouter(prefix="/auth", tags=["authentication"])


# ============ Request/Response Models ============


class RegisterRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "user@example.com",
                "password": "SecurePass123!",
                "full_name": "João Silva",
            }
        }
    )

    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "email": "user@example.com",
                "password": "SecurePass123!",
            }
        }
    )

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "access_token": "eyJhbGci...",
                "refresh_token": "eyJhbGci...",
                "token_type": "bearer",
                "expires_in": 900,
            }
        }
    )

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


class TwoFASetupResponse(BaseModel):
    qr_code: str
    secret: str
    backup_codes: list[str]


class TwoFAVerifyRequest(BaseModel):
    totp_code: str = Field(min_length=6, max_length=8)


class UserProfileResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: Optional[str] = None
    preferred_currency: str = "BRL"
    timezone: str = "America/Sao_Paulo"
    is_email_verified: bool = False
    two_factor_enabled: bool = False
    plan: str = "BASIC"
    created_at: str


class UserProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=20)
    preferred_currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    timezone: Optional[str] = Field(default=None, max_length=50)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


def _serialize_user(user: User) -> UserProfileResponse:
    plan_value = user.plan.value.upper() if hasattr(user.plan, "value") else str(user.plan or "BASIC").upper()
    return UserProfileResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        preferred_currency=user.preferred_currency or "BRL",
        timezone=user.timezone or "America/Sao_Paulo",
        is_email_verified=bool(user.is_email_verified),
        two_factor_enabled=bool(user.two_factor_enabled),
        plan=plan_value,
        created_at=user.created_at.isoformat() if user.created_at else datetime.utcnow().isoformat(),
    )


async def _send_password_reset_email(email: str, reset_token: str) -> None:
    """Send password reset link via Resend when RESEND_API_KEY is configured."""
    api_key = os.getenv("RESEND_API_KEY")
    frontend_url = os.getenv("FRONTEND_URL", "https://web-flame-alpha-37.vercel.app").rstrip("/")
    reset_link = f"{frontend_url}/auth/forgot-password?token={reset_token}"

    if not api_key:
        logger.info("[DEV MODE] Password reset link for %s: %s", email, reset_link)
        return

    from_addr = os.getenv("RESEND_FROM_EMAIL", "Mony <noreply@mony.app>")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "from": from_addr,
                    "to": [email],
                    "subject": "Redefinição de senha — Mony",
                    "html": (
                        f"<p>Recebemos uma solicitação para redefinir sua senha no Mony.</p>"
                        f"<p><a href='{reset_link}'>Clique aqui para criar uma nova senha</a> (válido por 24 horas).</p>"
                    ),
                },
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to send password reset email via Resend: %s", exc)


# ============ Endpoint 1: Register ============


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
):
    """
    Register new user.

    Automatically provisions a default checking account ("Conta Principal") and
    seeds the default transaction categories so new users can start immediately.
    """
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        is_email_verified=False,
        created_at=datetime.utcnow(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Auto-provision default account and default categories for seamless onboarding
    default_account = Account(
        user_id=user.id,
        name="Conta Principal",
        type=AccountType.CHECKING,
        balance=Decimal("0.00"),
        currency=user.preferred_currency or "BRL",
        icon="🏦",
        color="#0071E3",
        is_default=True,
        sort_order=0.0,
    )
    db.add(default_account)
    db.commit()
    ensure_default_categories(db, user.id)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=900,
    )


# ============ Endpoint 2: Login ============


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Authenticate user with email + password and account lockout protection."""
    user = db.query(User).filter(User.email == payload.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if user.is_locked:
        if user.locked_until and datetime.utcnow() < user.locked_until:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is locked. Try again later.",
            )
        user.is_locked = False
        user.failed_login_attempts = 0

    if not verify_password(payload.password, user.password_hash):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= 5:
            user.is_locked = True
            user.locked_until = datetime.utcnow() + timedelta(hours=24)

        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    user.failed_login_attempts = 0
    user.last_login_at = datetime.utcnow()
    if request.client:
        user.last_login_ip = request.client.host
    db.commit()

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=900,
    )


# ============ Endpoint 2b: Current User Profile ============


@router.get("/users/me", response_model=UserProfileResponse)
async def get_current_user_profile(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Return the authenticated user's profile."""
    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _serialize_user(user)


@router.put("/users/me", response_model=UserProfileResponse)
async def update_current_user_profile(
    payload: UserProfileUpdateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Update the authenticated user's profile fields."""
    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.phone is not None:
        user.phone = payload.phone.strip() or None
    if payload.preferred_currency is not None:
        user.preferred_currency = payload.preferred_currency.upper()
    if payload.timezone is not None:
        user.timezone = payload.timezone

    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.post("/change-password", status_code=200)
async def change_password(
    payload: ChangePasswordRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Change password for the currently authenticated user after verifying current password."""
    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha atual incorreta",
        )

    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A nova senha deve ter pelo menos 8 caracteres",
        )

    user.password_hash = hash_password(payload.new_password)
    user.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Senha alterada com sucesso"}


# ============ Endpoint 3: Refresh Token ============


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
):
    """Issue new access + refresh tokens using a valid refresh token."""
    try:
        user_id = verify_token(payload.refresh_token, token_type="refresh")
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=900,
    )


# ============ Endpoint 4: Logout ============


@router.post("/logout", status_code=204)
async def logout(
    authorization: str = Header(None),
    user_id: str = Depends(get_current_user_from_header),
):
    """Invalidate the current access token by adding it to the blacklist."""
    token = extract_bearer_token(authorization)
    blacklist_token(token, ttl_seconds=900)
    return None


# ============ Endpoint 5: 2FA (TOTP) ============


@router.post("/2fa/setup", response_model=TwoFASetupResponse)
async def setup_2fa(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Generate and persist pending TOTP secret + QR code + backup codes."""
    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    secret = generate_totp_secret(user.email)
    qr_code = generate_totp_qr_code(user.email, secret)
    backup_codes = generate_backup_codes(count=10)

    # Store secret (remains disabled until user confirms via /auth/2fa/verify)
    user.two_factor_secret = secret
    user.updated_at = datetime.utcnow()
    db.commit()

    return TwoFASetupResponse(
        qr_code=qr_code,
        secret=secret,
        backup_codes=backup_codes,
    )


@router.post("/2fa/verify", status_code=200)
async def verify_2fa(
    payload: TwoFAVerifyRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Verify TOTP code and enable 2FA for the authenticated user."""
    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.two_factor_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA setup has not been initiated",
        )

    if not verify_totp_code(user.two_factor_secret, payload.totp_code.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid TOTP verification code",
        )

    user.two_factor_enabled = True
    user.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Two-factor authentication enabled", "two_factor_enabled": True}


@router.post("/2fa/disable", status_code=200)
async def disable_2fa(
    payload: TwoFAVerifyRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Disable 2FA after confirming current TOTP code."""
    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.two_factor_enabled or not user.two_factor_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is not enabled")
    if not verify_totp_code(user.two_factor_secret, payload.totp_code.strip()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid TOTP verification code")

    user.two_factor_enabled = False
    user.two_factor_secret = None
    user.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Two-factor authentication disabled", "two_factor_enabled": False}


# ============ Endpoint 6: Password Reset (2-step) ============


@router.post("/password-reset/request", status_code=202)
async def request_password_reset(
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
):
    """Step 1: Request password reset (202 always to prevent user enumeration)."""
    user = db.query(User).filter(User.email == payload.email).first()

    if user:
        reset_token = create_password_reset_token(user.id)
        password_reset_tokens[reset_token] = {
            "user_id": user.id,
            "created_at": datetime.now(dt_timezone.utc),
            "expires_at": datetime.now(dt_timezone.utc) + timedelta(hours=24),
        }
        await _send_password_reset_email(user.email, reset_token)

    return {"message": "Check your email for password reset instructions"}


@router.post("/password-reset/confirm", status_code=200)
async def confirm_password_reset(
    payload: PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    """Step 2: Confirm password reset with valid one-time token."""
    try:
        user_id = verify_password_reset_token(payload.token)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    if payload.token not in password_reset_tokens:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    token_data = password_reset_tokens[payload.token]
    if datetime.now(dt_timezone.utc) > token_data["expires_at"]:
        del password_reset_tokens[payload.token]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token expired",
        )

    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.password_hash = hash_password(payload.new_password)
    user.is_locked = False
    user.failed_login_attempts = 0
    user.updated_at = datetime.utcnow()
    db.commit()

    del password_reset_tokens[payload.token]
    blacklist_token(payload.token, ttl_seconds=86400)

    return {"message": "Password reset successfully"}
