"""
Open Finance sync pipeline tests — Story 2.2.

Covers:
- Sync trigger endpoint (queues + per-account variant + rate limit)
- Sync status endpoint
- Webhook HMAC validation (valid + tampered)
- Deduplication (no duplicate insert + upsert updates fields)
- Lookback windows (first sync 90d vs incremental 7d)
- ARCH-001 cleanup migration is idempotent

Runs against SQLite in-memory (matching test_open_finance.py pattern). The
``CELERY_TASK_ALWAYS_EAGER`` env var is set to ``1`` so tasks run inline.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
from datetime import date, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Force eager Celery + stub bank API for the entire test module.
os.environ["CELERY_TASK_ALWAYS_EAGER"] = "1"
os.environ["OF_SYNC_USE_STUB"] = "1"
os.environ.setdefault("WEBHOOK_SECRET", "test-webhook-secret-32bytes-xxxxxx")
os.environ.setdefault("ENCRYPTION_KEY", "JE6X8Yd1jM7s4iOQyq0g9_-6n8AbJv1uS1Iqj1eIE_o=")

from database.base import get_db
from database.models import (
    Account,
    AccountType,
    Base,
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
    User,
    UserPlan,
)
from main import app
from utils.auth import create_access_token, hash_password


SQLALCHEMY_DATABASE_URL = "sqlite:///./test_of_sync.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    # Materialise the partial unique index in the test DB — production gets it
    # via Alembic, but tests use create_all so we apply the same DDL by hand.
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uix_transactions_external "
                "ON transactions (user_id, external_id, source) "
                "WHERE external_id IS NOT NULL"
            )
        )
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


@pytest.fixture
def user(db) -> User:
    u = User(
        id=uuid4(),
        email="sync-user@example.com",
        password_hash=hash_password("Test@1234"),
        full_name="Sync User",
        plan=UserPlan.PRO,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def institution(db) -> OFInstitution:
    inst = OFInstitution(
        id=uuid4(),
        external_id="sandbox-sync-001",
        name="Sync Sandbox Bank",
        authorization_server_url="http://localhost:9000/sync/authorize",
        token_endpoint="http://localhost:9000/sync/token",
        accounts_endpoint="http://localhost:9000/sync/accounts",
        is_sandbox=True,
        is_active=True,
    )
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


@pytest.fixture
def authorized_consent(db, user, institution) -> OFConsent:
    consent = OFConsent(
        user_id=user.id,
        institution_id=institution.id,
        status=ConsentStatus.AUTHORIZED,
        permissions=["openid", "accounts", "transactions"],
        state_token=secrets.token_hex(32),
        authorization_url="http://example.com",
        access_token_encrypted=None,  # service falls back to stub when missing
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    db.add(consent)
    db.commit()
    db.refresh(consent)
    return consent


@pytest.fixture
def linked_account(db, user, institution, authorized_consent) -> OFLinkedAccount:
    acct = OFLinkedAccount(
        user_id=user.id,
        consent_id=authorized_consent.id,
        institution_id=institution.id,
        external_account_id="acc-sync-001",
        account_type="CHECKING",
        account_number_last4="9999",
        currency="BRL",
        is_active=True,
    )
    db.add(acct)
    db.commit()
    db.refresh(acct)
    return acct


def auth_header(user: User) -> dict:
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


# ---------------------------------------------------------------------------
# AC-2: Sync endpoint
# ---------------------------------------------------------------------------


def test_sync_endpoint_requires_auth(client):
    resp = client.post("/open-finance/sync")
    assert resp.status_code == 401


def test_sync_endpoint_no_accounts(client, user):
    resp = client.post("/open-finance/sync", headers=auth_header(user))
    assert resp.status_code == 400


def test_sync_endpoint_queues_and_runs(client, user, linked_account):
    resp = client.post("/open-finance/sync", headers=auth_header(user))
    assert resp.status_code == 202
    body = resp.json()
    assert "sync_id" in body
    assert body["accounts_queued"] == 1
    # Eager mode runs inline -> stub inserts 2 transactions
    assert body["status"] in {"completed", "queued", "running"}


def test_sync_specific_account(client, user, linked_account, db):
    resp = client.post(
        f"/open-finance/sync?account_id={linked_account.id}",
        headers=auth_header(user),
    )
    assert resp.status_code == 202
    assert resp.json()["accounts_queued"] == 1


def test_sync_specific_account_unknown_returns_404(client, user):
    resp = client.post(
        f"/open-finance/sync?account_id={uuid4()}",
        headers=auth_header(user),
    )
    assert resp.status_code == 404


def test_sync_rate_limit_per_account(client, user, linked_account):
    first = client.post(
        f"/open-finance/sync?account_id={linked_account.id}",
        headers=auth_header(user),
    )
    assert first.status_code == 202
    second = client.post(
        f"/open-finance/sync?account_id={linked_account.id}",
        headers=auth_header(user),
    )
    assert second.status_code == 429


def test_sync_inserts_transactions_with_source_open_finance(client, user, linked_account, db):
    client.post("/open-finance/sync", headers=auth_header(user))
    db.expire_all()
    txs = db.query(Transaction).filter(Transaction.user_id == user.id).all()
    assert len(txs) >= 1
    for tx in txs:
        assert tx.source == TransactionSource.OPEN_FINANCE.value
        assert tx.external_id is not None


# ---------------------------------------------------------------------------
# AC-3: Deduplication
# ---------------------------------------------------------------------------


def test_dedup_no_duplicate_on_resync(client, user, linked_account, db):
    client.post("/open-finance/sync", headers=auth_header(user))
    db.expire_all()
    count_after_first = db.query(Transaction).filter(Transaction.user_id == user.id).count()
    assert count_after_first >= 1

    # Bypass rate limit by clearing prior sync jobs.
    db.query(OFSyncJob).delete()
    db.commit()

    client.post("/open-finance/sync", headers=auth_header(user))
    db.expire_all()
    count_after_second = db.query(Transaction).filter(Transaction.user_id == user.id).count()
    assert count_after_second == count_after_first


def test_dedup_upsert_updates_fields(client, user, linked_account, db):
    from services.open_finance_sync import _upsert_transaction
    from services.open_finance_sync import _ensure_internal_account

    internal = _ensure_internal_account(db, linked_account)
    db.commit()

    raw = {
        "transactionId": "ext-fixed-1",
        "amount": "10.00",
        "type": "debit",
        "transactionDate": "2026-04-20",
        "description": "First version",
    }
    inserted, skipped = _upsert_transaction(
        db, user_id=user.id, account_id=internal.id, raw=raw
    )
    db.commit()
    assert inserted is True

    raw_v2 = {**raw, "amount": "12.50", "description": "Updated description"}
    inserted2, skipped2 = _upsert_transaction(
        db, user_id=user.id, account_id=internal.id, raw=raw_v2
    )
    db.commit()
    assert inserted2 is False
    assert skipped2 is True

    db.expire_all()
    tx = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.external_id == "ext-fixed-1",
        )
        .one()
    )
    assert str(tx.amount) == "12.50"
    assert tx.description == "Updated description"


# ---------------------------------------------------------------------------
# AC-5: Webhook HMAC
# ---------------------------------------------------------------------------


def _sign(payload: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def test_webhook_rejects_missing_signature(client, authorized_consent):
    payload = b'{"accountId": "acc-sync-001"}'
    resp = client.post(
        "/open-finance/webhook",
        content=payload,
        headers={"X-Consent-Id": str(authorized_consent.id), "Content-Type": "application/json"},
    )
    assert resp.status_code == 401


def test_webhook_rejects_tampered_signature(client, authorized_consent):
    payload = b'{"accountId": "acc-sync-001"}'
    bad_sig = "sha256=" + "0" * 64
    resp = client.post(
        "/open-finance/webhook",
        content=payload,
        headers={
            "X-Consent-Id": str(authorized_consent.id),
            "X-Webhook-Signature": bad_sig,
            "Content-Type": "application/json",
        },
    )
    assert resp.status_code == 401


def test_webhook_accepts_valid_signature(client, linked_account, authorized_consent, db):
    payload = json.dumps({"accountId": linked_account.external_account_id}).encode()
    sig = _sign(payload, os.environ["WEBHOOK_SECRET"])
    resp = client.post(
        "/open-finance/webhook",
        content=payload,
        headers={
            "X-Consent-Id": str(authorized_consent.id),
            "X-Webhook-Signature": sig,
            "Content-Type": "application/json",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["accepted"] is True


def test_webhook_unknown_consent_returns_404(client):
    payload = b'{"accountId": "acc-sync-001"}'
    sig = _sign(payload, os.environ["WEBHOOK_SECRET"])
    resp = client.post(
        "/open-finance/webhook",
        content=payload,
        headers={
            "X-Consent-Id": str(uuid4()),
            "X-Webhook-Signature": sig,
            "Content-Type": "application/json",
        },
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# AC-2 (sync status endpoint)
# ---------------------------------------------------------------------------


def test_sync_status_endpoint(client, user, linked_account):
    trigger = client.post("/open-finance/sync", headers=auth_header(user))
    sync_id = trigger.json()["sync_id"]

    resp = client.get(f"/open-finance/sync/{sync_id}", headers=auth_header(user))
    assert resp.status_code == 200
    body = resp.json()
    assert body["sync_id"] == sync_id
    assert body["accounts_queued"] >= 1
    assert "transactions_inserted" in body


def test_sync_status_unknown_returns_404(client, user):
    resp = client.get(f"/open-finance/sync/{uuid4()}", headers=auth_header(user))
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# AC-4 (lookback windows)
# ---------------------------------------------------------------------------


def test_first_sync_uses_first_sync_lookback(linked_account, db):
    from services.open_finance_sync import _lookback_for, FIRST_SYNC_LOOKBACK_DAYS

    assert linked_account.last_sync_at is None
    expected = (datetime.utcnow().date() - timedelta(days=FIRST_SYNC_LOOKBACK_DAYS))
    assert _lookback_for(linked_account) == expected


def test_incremental_sync_uses_default_lookback(linked_account, db):
    from services.open_finance_sync import _lookback_for, DEFAULT_LOOKBACK_DAYS

    linked_account.last_sync_at = datetime.utcnow() - timedelta(days=2)
    db.commit()
    expected = datetime.utcnow().date() - timedelta(days=DEFAULT_LOOKBACK_DAYS)
    assert _lookback_for(linked_account) == expected


# ---------------------------------------------------------------------------
# AC-1 (ARCH-001 migration is idempotent)
# ---------------------------------------------------------------------------


def test_arch_001_migration_idempotent():
    """Running the upgrade twice on a clean SQLite DB must not raise.

    The migration body uses ``op.get_bind()`` + inspection helpers that detect
    missing tables/columns and skip the drop; running it twice must therefore
    be a no-op the second time around.
    """
    import importlib.util
    import pathlib

    pytest.importorskip("alembic", reason="alembic not installed in this environment")

    from alembic.operations import Operations
    from alembic.runtime.migration import MigrationContext
    from sqlalchemy import create_engine as _create_engine

    test_engine = _create_engine("sqlite:///./test_arch001.db")
    Base.metadata.create_all(bind=test_engine)

    mig_path = (
        pathlib.Path(__file__).resolve().parent.parent
        / "alembic"
        / "versions"
        / "20260429_0002_cleanup_openfinance_legacy.py"
    )
    spec = importlib.util.spec_from_file_location("mig_arch001", mig_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    with test_engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            module.upgrade()
            module.upgrade()  # second run must be a no-op

    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()  # release file lock on Windows before unlink
    pathlib.Path("./test_arch001.db").unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# AC-8 (linked account exposes sync_status + last_sync_at)
# ---------------------------------------------------------------------------


def test_linked_account_response_includes_sync_status(client, user, linked_account):
    client.post("/open-finance/sync", headers=auth_header(user))

    resp = client.get("/open-finance/accounts", headers=auth_header(user))
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    record = data[0]
    assert "sync_status" in record
    assert "last_sync_at" in record
    assert record["sync_status"] == LinkedAccountSyncStatus.IDLE.value
    assert record["last_sync_at"] is not None
