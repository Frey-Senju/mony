"""
Open Finance endpoints tests.

Tests for consent flow, account linking, and unlinking.
Uses SQLite in-memory database to isolate test state.
"""

import json
import os
import secrets
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database.base import get_db
from database.models import (
    Base,
    ConsentStatus,
    OFConsent,
    OFInstitution,
    OFLinkedAccount,
    User,
    UserPlan,
)
from main import app
from utils.auth import create_access_token, hash_password


# ============ Test Database Setup ============


SQLALCHEMY_DATABASE_URL = "sqlite:///./test_of.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ============ Fixtures ============


@pytest.fixture
def user(db):
    u = User(
        id=uuid4(),
        email="test@example.com",
        password_hash=hash_password("Test@1234"),
        full_name="Test User",
        plan=UserPlan.BASIC,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def pro_user(db):
    u = User(
        id=uuid4(),
        email="pro@example.com",
        password_hash=hash_password("Test@1234"),
        full_name="Pro User",
        plan=UserPlan.PRO,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def institution(db):
    inst = OFInstitution(
        id=uuid4(),
        external_id="sandbox-test-001",
        name="Test Bank (Sandbox)",
        authorization_server_url="http://localhost:9000/test/authorize",
        token_endpoint="http://localhost:9000/test/token",
        accounts_endpoint="http://localhost:9000/test/accounts",
        is_sandbox=True,
        is_active=True,
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


def auth_header(user: User) -> dict:
    token = create_access_token(str(user.id))
    return {"Authorization": f"Bearer {token}"}


# ============ Test: List Institutions ============


def test_list_institutions(client, user, institution):
    resp = client.get("/open-finance/institutions", headers=auth_header(user))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert any(i["external_id"] == "sandbox-test-001" for i in data)


def test_list_institutions_search(client, user, institution):
    resp = client.get("/open-finance/institutions?search=Test", headers=auth_header(user))
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    resp2 = client.get("/open-finance/institutions?search=nonexistent", headers=auth_header(user))
    assert resp2.status_code == 200
    assert resp2.json() == []


# ============ Test: Initiate Consent ============


def test_initiate_consent(client, user, institution):
    resp = client.post(
        "/open-finance/consent/initiate",
        json={"institution_id": str(institution.id)},
        headers=auth_header(user),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "consent_id" in data
    assert "authorization_url" in data
    assert "expires_at" in data
    assert "state=" in data["authorization_url"]


def test_initiate_consent_invalid_institution(client, user):
    resp = client.post(
        "/open-finance/consent/initiate",
        json={"institution_id": str(uuid4())},
        headers=auth_header(user),
    )
    assert resp.status_code == 404


def test_initiate_consent_rate_limit(client, user, institution, db):
    # Create 3 consents in the past hour
    for _ in range(3):
        db.add(OFConsent(
            user_id=user.id,
            institution_id=institution.id,
            status=ConsentStatus.PENDING,
            permissions=["openid"],
            state_token=secrets.token_hex(32),
            authorization_url="http://example.com",
            expires_at=datetime.utcnow() + timedelta(minutes=30),
        ))
    db.commit()

    resp = client.post(
        "/open-finance/consent/initiate",
        json={"institution_id": str(institution.id)},
        headers=auth_header(user),
    )
    assert resp.status_code == 429


def test_initiate_consent_basic_plan_limit(client, user, institution, db):
    """BASIC plan allows only 1 linked account."""
    # Pre-create 1 active linked account
    consent = OFConsent(
        user_id=user.id,
        institution_id=institution.id,
        status=ConsentStatus.AUTHORIZED,
        permissions=["openid"],
        state_token=secrets.token_hex(32),
        authorization_url="http://example.com",
        expires_at=datetime.utcnow() + timedelta(minutes=30),
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)

    db.add(OFLinkedAccount(
        user_id=user.id,
        consent_id=consent.id,
        institution_id=institution.id,
        external_account_id="acc-001",
        is_active=True,
    ))
    db.commit()

    resp = client.post(
        "/open-finance/consent/initiate",
        json={"institution_id": str(institution.id)},
        headers=auth_header(user),
    )
    assert resp.status_code == 403
    assert "BASIC" in resp.json()["detail"]


# ============ Test: Callback ============


def test_callback_invalid_state(client):
    resp = client.get(
        "/open-finance/consent/callback?code=abc&state=invalid_state_xyz",
        follow_redirects=False,
    )
    # Should redirect to frontend with error=invalid_state
    assert resp.status_code in (302, 307)


def test_callback_expired_consent(client, user, institution, db):
    state = secrets.token_hex(32)
    consent = OFConsent(
        user_id=user.id,
        institution_id=institution.id,
        status=ConsentStatus.PENDING,
        permissions=["openid"],
        state_token=state,
        authorization_url="http://example.com",
        expires_at=datetime.utcnow() - timedelta(minutes=1),  # already expired
    )
    db.add(consent)
    db.commit()

    resp = client.get(
        f"/open-finance/consent/callback?code=abc&state={state}",
        follow_redirects=False,
    )
    # Should redirect to frontend with error=consent_expired
    assert resp.status_code in (302, 307)
    assert "consent_expired" in resp.headers.get("location", "")


# ============ Test: List Linked Accounts ============


def test_list_linked_accounts_empty(client, user):
    resp = client.get("/open-finance/accounts", headers=auth_header(user))
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_linked_accounts(client, user, institution, db):
    consent = OFConsent(
        user_id=user.id,
        institution_id=institution.id,
        status=ConsentStatus.AUTHORIZED,
        permissions=["openid"],
        state_token=secrets.token_hex(32),
        authorization_url="http://example.com",
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)

    db.add(OFLinkedAccount(
        user_id=user.id,
        consent_id=consent.id,
        institution_id=institution.id,
        external_account_id="acc-001",
        account_type="CHECKING",
        account_number_last4="1234",
        owner_name="Test User",
        currency="BRL",
        is_active=True,
    ))
    db.commit()

    resp = client.get("/open-finance/accounts", headers=auth_header(user))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["account_number_last4"] == "1234"
    assert data[0]["institution_name"] == "Test Bank (Sandbox)"


# ============ Test: Unlink Account ============


def test_unlink_account(client, user, institution, db):
    consent = OFConsent(
        user_id=user.id,
        institution_id=institution.id,
        status=ConsentStatus.AUTHORIZED,
        permissions=["openid"],
        state_token=secrets.token_hex(32),
        authorization_url="http://example.com",
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)

    linked = OFLinkedAccount(
        user_id=user.id,
        consent_id=consent.id,
        institution_id=institution.id,
        external_account_id="acc-001",
        is_active=True,
    )
    db.add(linked)
    db.commit()
    db.refresh(linked)

    resp = client.delete(f"/open-finance/accounts/{linked.id}", headers=auth_header(user))
    assert resp.status_code == 204

    db.refresh(linked)
    assert linked.is_active is False


def test_unlink_account_not_found(client, user):
    resp = client.delete(f"/open-finance/accounts/{uuid4()}", headers=auth_header(user))
    assert resp.status_code == 404


def test_unlink_account_wrong_user(client, user, pro_user, institution, db):
    """User cannot unlink another user's account."""
    consent = OFConsent(
        user_id=pro_user.id,
        institution_id=institution.id,
        status=ConsentStatus.AUTHORIZED,
        permissions=["openid"],
        state_token=secrets.token_hex(32),
        authorization_url="http://example.com",
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)

    linked = OFLinkedAccount(
        user_id=pro_user.id,
        consent_id=consent.id,
        institution_id=institution.id,
        external_account_id="acc-002",
        is_active=True,
    )
    db.add(linked)
    db.commit()
    db.refresh(linked)

    resp = client.delete(f"/open-finance/accounts/{linked.id}", headers=auth_header(user))
    assert resp.status_code == 404
