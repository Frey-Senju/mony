"""
Authentication utilities for Mony API.

Includes password hashing, JWT token generation/verification, and TOTP.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from passlib.context import CryptContext
from jose import JWTError, jwt
import os

# ============ Configuration ============

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Get JWT secret from environment
SECRET_KEY = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")

# Password hashing context (bcrypt, cost factor 12)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


# ============ Password Hashing ============


def hash_password(password: str) -> str:
    """
    Hash password using bcrypt (cost factor 12).

    Args:
        password: Plain text password

    Returns:
        Hashed password
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify plain text password against hashed password.

    Args:
        plain_password: Plain text password from user
        hashed_password: Stored hashed password from database

    Returns:
        True if passwords match, False otherwise
    """
    return pwd_context.verify(plain_password, hashed_password)


# ============ JWT Token Generation ============


def create_access_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create JWT access token (15 minutes validity).

    Args:
        user_id: User identifier
        expires_delta: Custom expiration time (defaults to 15 min)

    Returns:
        Encoded JWT token
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    expire = datetime.now(timezone.utc) + expires_delta
    to_encode = {
        "sub": str(user_id),
        "type": "access",
        "exp": expire
    }

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(user_id: int, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create JWT refresh token (7 days validity).

    Args:
        user_id: User identifier
        expires_delta: Custom expiration time (defaults to 7 days)

    Returns:
        Encoded JWT token
    """
    if expires_delta is None:
        expires_delta = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    expire = datetime.now(timezone.utc) + expires_delta
    to_encode = {
        "sub": str(user_id),
        "type": "refresh",
        "exp": expire
    }

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# ============ JWT Token Verification ============


def verify_token(token: str, token_type: str = "access") -> int:
    """
    Verify JWT token and extract user ID.

    Args:
        token: JWT token string
        token_type: "access" or "refresh" (validates token type claim)

    Returns:
        User ID extracted from token

    Raises:
        HTTPException: If token is invalid/expired
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"}
            )

        # Verify token type
        token_type_claim = payload.get("type")
        if token_type_claim != token_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token type. Expected {token_type}",
                headers={"WWW-Authenticate": "Bearer"}
            )

        return int(user_id)

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"}
        )


# ============ TOTP (2FA) ============


def generate_totp_secret(user_email: str) -> str:
    """
    Generate TOTP secret for 2FA.

    Uses pyotp to create a 32-character base32-encoded secret.
    User can import this into Google Authenticator, Authy, etc.

    Args:
        user_email: User email (used as account name in QR code)

    Returns:
        Base32-encoded secret (32 chars)
    """
    # TODO: Implement with pyotp library
    # import pyotp
    # totp = pyotp.TOTP()
    # return totp.secret
    pass


def generate_totp_qr_code(user_email: str, secret: str) -> str:
    """
    Generate QR code for TOTP secret.

    Args:
        user_email: User email (account name)
        secret: TOTP secret

    Returns:
        Data URL for QR code image (data:image/png;base64,...)
    """
    # TODO: Implement with pyotp + qrcode library
    # import pyotp
    # import qrcode
    # totp = pyotp.TOTP(secret)
    # uri = totp.provisioning_uri(name=user_email, issuer_name="Mony")
    # qr = qrcode.QRCode()
    # qr.add_data(uri)
    # qr.make()
    # img = qr.make_image()
    # ... convert to base64 data URL
    pass


def generate_backup_codes(count: int = 10) -> list[str]:
    """
    Generate backup codes for 2FA recovery.

    Each code is 8 alphanumeric characters, 1-time use only.

    Args:
        count: Number of codes to generate (default: 10)

    Returns:
        List of backup codes
    """
    # TODO: Implement
    # import secrets
    # codes = [secrets.token_hex(4).upper() for _ in range(count)]
    # return codes
    pass


def verify_totp_code(secret: str, code: str, window: int = 1) -> bool:
    """
    Verify TOTP 6-digit code.

    Allows time window of ±30 seconds to account for clock skew.

    Args:
        secret: TOTP secret
        code: 6-digit code from user
        window: Time window tolerance (default: 1 = ±30 sec)

    Returns:
        True if code is valid
    """
    # TODO: Implement with pyotp
    # import pyotp
    # totp = pyotp.TOTP(secret)
    # return totp.verify(code, valid_window=window)
    pass


def verify_backup_code(backup_code: str, stored_codes: list[str]) -> bool:
    """
    Verify backup code (1-time use).

    Args:
        backup_code: Code from user
        stored_codes: Hashed backup codes from database

    Returns:
        True if code is valid (not yet used)
    """
    # TODO: Check if backup code matches any stored code
    # Mark as used (update database)
    pass
