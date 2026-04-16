"""
Authentication endpoints tests.

Tests for register, login, refresh, logout, 2fa/setup, password-reset.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from database.base import Base, SessionLocal
from database.models import User
from utils.auth import hash_password, verify_totp_code, generate_totp_secret


# ============ Test Database Setup ============


@pytest.fixture
def test_db():
    """Create test database and drop after tests."""
    # Use in-memory SQLite for testing
    SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    Base.metadata.create_all(bind=engine)

    def override_get_db():
        try:
            db = TestingSessionLocal()
            yield db
        finally:
            db.close()

    app.dependency_overrides[SessionLocal] = override_get_db

    yield engine

    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(test_db):
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def test_user(test_db):
    """Create a test user."""
    db = SessionLocal()
    user = User(
        email="test@example.com",
        password_hash=hash_password("SecurePass123!"),
        full_name="Test User",
        is_email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ============ Register Tests ============


def test_register_success(client):
    """Test successful user registration."""
    response = client.post(
        "/auth/register",
        json={
            "email": "newuser@example.com",
            "password": "SecurePass123!",
            "full_name": "New User",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 900


def test_register_duplicate_email(client, test_user):
    """Test registration with duplicate email."""
    response = client.post(
        "/auth/register",
        json={
            "email": test_user.email,
            "password": "AnotherPass123!",
            "full_name": "Another User",
        },
    )

    assert response.status_code == 409
    assert "already registered" in response.json()["detail"]


def test_register_invalid_email(client):
    """Test registration with invalid email."""
    response = client.post(
        "/auth/register",
        json={
            "email": "not-an-email",
            "password": "SecurePass123!",
            "full_name": "User",
        },
    )

    assert response.status_code == 422  # Validation error


# ============ Login Tests ============


def test_login_success(client, test_user):
    """Test successful login."""
    response = client.post(
        "/auth/login",
        json={"email": test_user.email, "password": "SecurePass123!"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_invalid_email(client):
    """Test login with non-existent email."""
    response = client.post(
        "/auth/login",
        json={"email": "nonexistent@example.com", "password": "AnyPass123!"},
    )

    assert response.status_code == 401
    assert "Invalid credentials" in response.json()["detail"]


def test_login_invalid_password(client, test_user):
    """Test login with wrong password."""
    response = client.post(
        "/auth/login",
        json={"email": test_user.email, "password": "WrongPassword123!"},
    )

    assert response.status_code == 401
    assert "Invalid credentials" in response.json()["detail"]


def test_login_account_lockout(client, test_user):
    """Test account lockout after 5 failed attempts."""
    # Make 5 failed login attempts
    for i in range(5):
        response = client.post(
            "/auth/login",
            json={"email": test_user.email, "password": "WrongPassword123!"},
        )
        assert response.status_code == 401

    # 6th attempt should be locked
    response = client.post(
        "/auth/login",
        json={"email": test_user.email, "password": "AnyPassword123!"},
    )
    assert response.status_code == 403
    assert "locked" in response.json()["detail"].lower()


# ============ Refresh Token Tests ============


def test_refresh_token_success(client, test_user):
    """Test successful token refresh."""
    # First, login to get refresh token
    login_response = client.post(
        "/auth/login",
        json={"email": test_user.email, "password": "SecurePass123!"},
    )
    refresh_token = login_response.json()["refresh_token"]

    # Refresh the token
    response = client.post(
        "/auth/refresh",
        json={"refresh_token": refresh_token},
    )

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_refresh_token_invalid(client):
    """Test refresh with invalid token."""
    response = client.post(
        "/auth/refresh",
        json={"refresh_token": "invalid.token.here"},
    )

    assert response.status_code == 401
    assert "Invalid" in response.json()["detail"]


# ============ 2FA Setup Tests ============


def test_2fa_setup_success(client, test_user):
    """Test successful TOTP setup."""
    # Login to get access token
    login_response = client.post(
        "/auth/login",
        json={"email": test_user.email, "password": "SecurePass123!"},
    )
    access_token = login_response.json()["access_token"]

    # Setup 2FA
    response = client.post(
        "/auth/2fa/setup",
        headers={"Authorization": f"Bearer {access_token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert "qr_code" in data
    assert "secret" in data
    assert "backup_codes" in data
    assert len(data["backup_codes"]) == 10
    assert data["qr_code"].startswith("data:image/png;base64,")


def test_2fa_setup_unauthorized(client):
    """Test 2FA setup without authentication."""
    response = client.post("/auth/2fa/setup")

    assert response.status_code == 403  # Forbidden (missing auth)


def test_totp_code_verification():
    """Test TOTP code verification."""
    secret = generate_totp_secret("test@example.com")

    # Get current TOTP code
    import pyotp
    totp = pyotp.TOTP(secret)
    code = totp.now()

    # Verify
    assert verify_totp_code(secret, code) is True


def test_totp_code_invalid():
    """Test TOTP code verification with invalid code."""
    secret = generate_totp_secret("test@example.com")

    # Invalid code
    assert verify_totp_code(secret, "000000") is False


# ============ Password Reset Tests ============


def test_password_reset_request_success(client, test_user):
    """Test password reset request."""
    response = client.post(
        "/auth/password-reset/request",
        json={"email": test_user.email},
    )

    assert response.status_code == 202
    assert "email" in response.json()["message"].lower()


def test_password_reset_request_nonexistent_email(client):
    """Test password reset request with non-existent email."""
    response = client.post(
        "/auth/password-reset/request",
        json={"email": "nonexistent@example.com"},
    )

    # Should return 202 regardless (no user enumeration)
    assert response.status_code == 202


def test_password_reset_confirm_success(client, test_user):
    """Test password reset confirmation."""
    from utils.auth import create_password_reset_token

    # Create a valid reset token
    reset_token = create_password_reset_token(test_user.id)

    # Add token to the store (simulate request step)
    from routes.auth import password_reset_tokens
    from datetime import timedelta
    password_reset_tokens[reset_token] = {
        "user_id": test_user.id,
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=24),
    }

    # Confirm password reset
    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": reset_token, "new_password": "NewSecurePass123!"},
    )

    assert response.status_code == 200
    assert "successfully" in response.json()["message"].lower()

    # Verify new password works
    login_response = client.post(
        "/auth/login",
        json={"email": test_user.email, "password": "NewSecurePass123!"},
    )
    assert login_response.status_code == 200


def test_password_reset_invalid_token(client):
    """Test password reset with invalid token."""
    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": "invalid.token.here", "new_password": "NewPass123!"},
    )

    assert response.status_code == 401
    assert "Invalid" in response.json()["detail"]


def test_password_reset_expired_token(client, test_user):
    """Test password reset with expired token."""
    from utils.auth import create_password_reset_token
    from routes.auth import password_reset_tokens
    from datetime import timedelta

    # Create an expired token
    reset_token = create_password_reset_token(test_user.id)
    password_reset_tokens[reset_token] = {
        "user_id": test_user.id,
        "created_at": datetime.now(timezone.utc) - timedelta(hours=25),
        "expires_at": datetime.now(timezone.utc) - timedelta(hours=1),  # Expired
    }

    # Try to use expired token
    response = client.post(
        "/auth/password-reset/confirm",
        json={"token": reset_token, "new_password": "NewPass123!"},
    )

    assert response.status_code == 400
    assert "expired" in response.json()["detail"].lower()


# ============ Integration Tests ============


def test_full_auth_flow(client):
    """Test complete auth flow: register → login → refresh → 2fa."""
    # Register
    register_response = client.post(
        "/auth/register",
        json={
            "email": "fullflow@example.com",
            "password": "FlowPass123!",
            "full_name": "Flow User",
        },
    )
    assert register_response.status_code == 201
    access_token = register_response.json()["access_token"]
    refresh_token = register_response.json()["refresh_token"]

    # Login (should also work)
    login_response = client.post(
        "/auth/login",
        json={"email": "fullflow@example.com", "password": "FlowPass123!"},
    )
    assert login_response.status_code == 200

    # Refresh token
    refresh_response = client.post(
        "/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_response.status_code == 200
    new_access_token = refresh_response.json()["access_token"]

    # Setup 2FA
    twofa_response = client.post(
        "/auth/2fa/setup",
        headers={"Authorization": f"Bearer {new_access_token}"},
    )
    assert twofa_response.status_code == 200
    assert "qr_code" in twofa_response.json()
