"""
Authentication utilities for Mony API.

Includes password hashing, JWT token generation/verification, Redis-backed
token blacklist (with in-memory fallback), and TOTP 2FA utilities.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4
import hashlib
import logging
import os
import time

from fastapi import HTTPException, status, Header
from passlib.context import CryptContext
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

# ============ Configuration ============

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Get JWT secret from environment
SECRET_KEY = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")

# Password hashing context (argon2)
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# In-memory fallback stores (used when REDIS_URL is unset or unreachable)
_memory_blacklist: dict[str, float] = {}
_redis_client = None
_redis_checked = False


def _get_redis():
    """Lazily connect to Redis if REDIS_URL is set. Falls back gracefully to None."""
    global _redis_client, _redis_checked
    if _redis_checked:
        return _redis_client
    _redis_checked = True
    redis_url = os.getenv("REDIS_URL")
    if not redis_url or os.getenv("PYTEST_CURRENT_TEST"):
        return None
    try:
        import redis
        client = redis.from_url(redis_url, decode_responses=True, socket_connect_timeout=1.5)
        client.ping()
        _redis_client = client
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis unavailable for auth blacklist — using in-memory fallback: %s", exc)
        _redis_client = None
    return _redis_client


def _token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def blacklist_token(token: str, ttl_seconds: int = REFRESH_TOKEN_EXPIRE_DAYS * 86400) -> None:
    """Revoke a JWT token until it expires."""
    fp = _token_fingerprint(token)
    client = _get_redis()
    if client is not None:
        try:
            client.setex(f"mony:blacklist:{fp}", max(1, ttl_seconds), "1")
            return
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis blacklist write failed, falling back to memory: %s", exc)
    _memory_blacklist[fp] = time.time() + max(1, ttl_seconds)


def is_token_blacklisted(token: str) -> bool:
    """Return True if the JWT token has been explicitly revoked."""
    fp = _token_fingerprint(token)
    client = _get_redis()
    if client is not None:
        try:
            if client.exists(f"mony:blacklist:{fp}"):
                return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis blacklist check failed, falling back to memory: %s", exc)

    exp = _memory_blacklist.get(fp)
    if exp is None:
        return False
    if time.time() > exp:
        _memory_blacklist.pop(fp, None)
        return False
    return True


# ============ Password Hashing ============


def hash_password(password: str) -> str:
    """Hash password using argon2."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain text password against hashed password."""
    return pwd_context.verify(plain_password, hashed_password)


# ============ JWT Token Generation ============


def create_access_token(user_id: int | str, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT access token (15 minutes validity)."""
    if expires_delta is None:
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    expire = datetime.now(timezone.utc) + expires_delta
    to_encode = {
        "sub": str(user_id),
        "type": "access",
        "jti": str(uuid4()),
        "exp": expire,
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: int | str, expires_delta: Optional[timedelta] = None) -> str:
    """Create JWT refresh token (7 days validity)."""
    if expires_delta is None:
        expires_delta = timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    expire = datetime.now(timezone.utc) + expires_delta
    to_encode = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": str(uuid4()),
        "exp": expire,
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# ============ JWT Token Verification ============


def verify_token(token: str, token_type: str = "access") -> str:
    """Verify JWT token, check revocation blacklist, and extract user ID."""
    if is_token_blacklisted(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: Optional[str] = payload.get("sub")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token_type_claim = payload.get("type")
        if token_type_claim != token_type:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token type. Expected {token_type}",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return user_id

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ============ FastAPI Dependency ============


def extract_bearer_token(authorization: Optional[str]) -> str:
    """Extract raw JWT from ``Authorization: Bearer <token>`` header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return authorization.replace("Bearer ", "", 1).strip()


def get_current_user_from_header(authorization: str = Header(None)) -> str:
    """FastAPI dependency to extract and verify JWT token from Authorization header."""
    token = extract_bearer_token(authorization)
    return verify_token(token, token_type="access")


# ============ TOTP (2FA) ============


def generate_totp_secret(user_email: str) -> str:
    """Generate a 32-character base32-encoded TOTP secret."""
    import pyotp
    return pyotp.random_base32()


def generate_totp_qr_code(user_email: str, secret: str) -> str:
    """Generate PNG data URL QR code for TOTP secret."""
    import pyotp
    import qrcode
    import io
    import base64

    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=user_email, issuer_name="Mony")

    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(uri)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return f"data:image/png;base64,{b64}"


def generate_backup_codes(count: int = 10) -> list[str]:
    """Generate one-time 8-char alphanumeric backup codes for 2FA recovery."""
    import secrets
    return [secrets.token_hex(4).upper() for _ in range(count)]


def verify_totp_code(secret: str, code: str, window: int = 1) -> bool:
    """Verify a 6-digit TOTP code with ±30s tolerance."""
    import pyotp
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=window)


def verify_backup_code(backup_code: str, stored_codes: list[str]) -> bool:
    """Verify backup code against a list of stored plain or hashed codes."""
    normalized = backup_code.strip().upper()
    if not normalized or not stored_codes:
        return False
    for stored in stored_codes:
        if stored == normalized:
            return True
        if stored.startswith("$argon2") and verify_password(normalized, stored):
            return True
    return False


# ============ Password Reset Token ============


def create_password_reset_token(user_id: int | str, expires_delta: Optional[timedelta] = None) -> str:
    """Create password reset token (24 hours validity)."""
    if expires_delta is None:
        expires_delta = timedelta(hours=24)

    expire = datetime.now(timezone.utc) + expires_delta
    to_encode = {
        "sub": str(user_id),
        "type": "password_reset",
        "jti": str(uuid4()),
        "exp": expire,
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_password_reset_token(token: str) -> str:
    """Verify password reset token and extract user ID."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: Optional[str] = payload.get("sub")

        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )

        if payload.get("type") != "password_reset":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )

        return user_id

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}",
        )
