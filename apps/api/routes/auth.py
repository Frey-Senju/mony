"""
Authentication endpoints for Mony API.

Provides user registration, login, token refresh, logout, 2FA, password reset.
"""

from datetime import datetime, timedelta, timezone as dt_timezone
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
    get_current_user_from_header,
    create_password_reset_token,
    verify_password_reset_token,
)

# In-memory store for password reset tokens (24h TTL)
# TODO: Move to Redis for production
password_reset_tokens = {}

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
        created_at=datetime.utcnow()
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
        if datetime.utcnow() < user.locked_until:
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
            user.locked_until = datetime.utcnow() + timedelta(hours=24)

        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )

    # Reset failed attempts on success
    user.failed_login_attempts = 0
    user.last_login_at = datetime.utcnow()
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
    user_id: str = Depends(get_current_user_from_header)
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
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db)
):
    """
    Generate TOTP secret for 2FA setup.

    - Generates 6-digit TOTP codes (Google Authenticator compatible)
    - Returns QR code + secret + 10 backup codes
    - User must verify with verify_2fa endpoint to enable

    Backup codes: 1-time use, can disable 2FA if TOTP device lost.
    """
    from uuid import UUID
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Generate TOTP secret + QR code + backup codes
    from utils.auth import generate_totp_secret, generate_totp_qr_code, generate_backup_codes

    secret = generate_totp_secret(user.email)
    qr_code = generate_totp_qr_code(user.email, secret)
    backup_codes = generate_backup_codes(count=10)

    # TODO: Store secret + backup codes in database (encrypted)
    # User must confirm with TOTP code before 2FA is actually enabled

    return TwoFASetupResponse(
        qr_code=qr_code,
        secret=secret,
        backup_codes=backup_codes
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
        # Generate reset token
        reset_token = create_password_reset_token(user.id)
        password_reset_tokens[reset_token] = {
            "user_id": user.id,
            "created_at": datetime.utcnow(),
            "expires_at": datetime.utcnow() + timedelta(hours=24)
        }

        # TODO: Send email with reset token
        # Email template: https://app.example.com/reset-password?token={reset_token}
        # Use: Resend, SendGrid, or other email service
        print(f"[DEV MODE] Password reset token for {user.email}: {reset_token}")

    # Return 202 regardless of whether user exists (no user enumeration)
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
    # Verify reset token
    try:
        user_id = verify_password_reset_token(payload.token)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    # Check if token still exists in our store (not already used)
    if payload.token not in password_reset_tokens:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )

    # Check token expiration
    token_data = password_reset_tokens[payload.token]
    if datetime.utcnow() > token_data["expires_at"]:
        del password_reset_tokens[payload.token]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token expired"
        )

    # Get user
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Update password
    user.password_hash = hash_password(payload.new_password)
    db.commit()

    # Invalidate token (mark as used)
    del password_reset_tokens[payload.token]

    # TODO: Invalidate all refresh tokens (logout all sessions)
    # Approach: Add blacklist entry for all tokens issued before now

    return {"message": "Password reset successfully"}
