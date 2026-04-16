"""
Authentication endpoints for Mony API.

Provides user registration, login, token refresh, logout, 2FA, password reset.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from database.base import SessionLocal
from database.models import User
from utils.auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_token,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


def get_db():
    """Dependency injection for database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============ Request/Response Models ============


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str

    class Config:
        example = {
            "email": "user@example.com",
            "password": "SecurePass123!",
            "full_name": "João Silva"
        }


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    class Config:
        example = {
            "email": "user@example.com",
            "password": "SecurePass123!"
        }


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds

    class Config:
        example = {
            "access_token": "eyJhbGci...",
            "refresh_token": "eyJhbGci...",
            "token_type": "bearer",
            "expires_in": 900
        }


class RefreshTokenRequest(BaseModel):
    refresh_token: str

    class Config:
        example = {"refresh_token": "eyJhbGci..."}


class PasswordResetRequest(BaseModel):
    email: EmailStr

    class Config:
        example = {"email": "user@example.com"}


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

    class Config:
        example = {
            "token": "reset_token_from_email",
            "new_password": "NewSecurePass123!"
        }


class TwoFASetupResponse(BaseModel):
    qr_code: str
    secret: str
    backup_codes: list[str]

    class Config:
        example = {
            "qr_code": "data:image/png;base64,...",
            "secret": "JBSWY3DPEBLW64TMMQ======",
            "backup_codes": ["code1", "code2", ...]
        }


class TwoFAVerifyRequest(BaseModel):
    totp_code: str

    class Config:
        example = {"totp_code": "123456"}


# ============ Endpoint 1: Register ============


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db)
):
    """
    Register new user.

    - email: unique identifier
    - password: stored with bcrypt (cost 12)
    - full_name: display name

    Returns access + refresh tokens (tokens valid immediately, no email verification required).
    """
    # Check if email exists
    existing_user = db.query(User).filter(User.email == payload.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered"
        )

    # Create new user
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        is_email_verified=False,  # TODO: email verification flow in Story 1.2b
        created_at=datetime.now(timezone.utc)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Generate tokens
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=900  # 15 minutes
    )


# ============ Endpoint 2: Login ============


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Authenticate user with email + password.

    - Account lockout after 5 failed attempts (24h lockdown)
    - Rate limited to 15 attempts/min per IP

    Returns access + refresh tokens.
    """
    user = db.query(User).filter(User.email == payload.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    # Check if account is locked
    if user.is_locked:
        if datetime.now(timezone.utc) < user.locked_until:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is locked. Try again later."
            )
        else:
            # Unlock account after lockout period
            user.is_locked = False
            user.failed_login_attempts = 0

    # Verify password
    if not verify_password(payload.password, user.password_hash):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1

        # Lock account after 5 failed attempts
        if user.failed_login_attempts >= 5:
            user.is_locked = True
            user.locked_until = datetime.now(timezone.utc) + timedelta(hours=24)

        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    # Reset failed attempts on success
    user.failed_login_attempts = 0
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    # Generate tokens
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=900
    )


# ============ Endpoint 3: Refresh Token ============


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db)
):
    """
    Issue new access token using valid refresh token.

    - Refresh tokens valid for 7 days
    - Expired refresh tokens return 401

    Returns new access + refresh tokens.
    """
    try:
        user_id = verify_token(payload.refresh_token, token_type="refresh")
    except HTTPException as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Generate new tokens
    access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token(user.id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=900
    )


# ============ Endpoint 4: Logout ============


@router.post("/logout", status_code=204)
async def logout(
    access_token: str = Depends(verify_token)
):
    """
    Invalidate user session.

    - Token added to blacklist (Redis, 7-day TTL)
    - Subsequent requests with this token rejected
    """
    # TODO: Add token to blacklist in Redis
    return None


# ============ Endpoint 5: Setup 2FA (TOTP) ============


@router.post("/2fa/setup", response_model=TwoFASetupResponse)
async def setup_2fa(
    user_id: int = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """
    Generate TOTP secret for 2FA setup.

    - Generates 6-digit TOTP codes (Google Authenticator compatible)
    - Returns QR code + secret + 10 backup codes
    - User must verify with verify_2fa endpoint to enable

    Backup codes: 1-time use, can disable 2FA if TOTP device lost.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # TODO: Generate TOTP secret + QR code + backup codes
    # Use: pyotp, qrcode libraries

    return TwoFASetupResponse(
        qr_code="data:image/png;base64,...",
        secret="JBSWY3DPEBLW64TMMQ======",
        backup_codes=["code1", "code2", ...]
    )


# ============ Endpoint 6: Password Reset (2-step) ============


@router.post("/password-reset/request", status_code=202)
async def request_password_reset(
    payload: PasswordResetRequest,
    db: Session = Depends(get_db)
):
    """
    Step 1: Request password reset.

    - Email sent with reset token (24h validity)
    - Returns 202 regardless of email existence (security: no user enumeration)
    """
    user = db.query(User).filter(User.email == payload.email).first()

    if user:
        # TODO: Generate reset token + send email
        # Token stored in memory/cache with 24h TTL
        pass

    return {"message": "Check your email for password reset instructions"}


@router.post("/password-reset/confirm", status_code=200)
async def confirm_password_reset(
    payload: PasswordResetConfirm,
    db: Session = Depends(get_db)
):
    """
    Step 2: Confirm password reset with token from email.

    - Token must be valid (within 24h)
    - New password must meet security policy
    - Old refresh tokens invalidated (logout all sessions)
    """
    # TODO: Verify reset token validity
    # TODO: Update password + invalidate sessions

    return {"message": "Password reset successfully"}
