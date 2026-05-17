"""
Tests for Story 3.1 — Custom Date Range Filtering in reports endpoints.

Covers:
1. Backward compat: year+month still works
2. start_date+end_date range filtering
3. category-breakdown date range
4. Invalid range (start > end) → 422
5. Cross-month range sums correctly
6. Missing one of start_date/end_date → 422
7. No params provided → 422
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from database.models import (
    Account,
    AccountType,
    Transaction,
    TransactionType,
    User,
    UserPlan,
)
# AccountType is used as `type` field value in Account model
from main import app
from utils.auth import create_access_token, hash_password
from tests.conftest import db_session  # noqa: F401 (fixture)

client = TestClient(app)

# ============ Helpers ============


def _make_user(db, suffix="") -> tuple[User, str]:
    u = User(
        email=f"dr_test{suffix}@example.com",
        password_hash=hash_password("Test@12345"),
        full_name="Reports DR User",
        is_email_verified=True,
        plan=UserPlan.BASIC,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    token = create_access_token(u.id)
    return u, token


def _make_account(db, user_id) -> Account:
    a = Account(
        user_id=user_id,
        name="Test Account",
        type=AccountType.CHECKING,
        balance=Decimal("0.00"),
        currency="BRL",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def _make_tx(db, user_id, account_id, amount, tx_type, tx_date) -> Transaction:
    t = Transaction(
        user_id=user_id,
        account_id=account_id,
        description="Test tx",
        amount=Decimal(str(amount)),
        type=tx_type,
        transaction_date=tx_date,
        currency="BRL",
        is_reconciled=False,
    )
    db.add(t)
    db.commit()
    return t


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ============ Tests ============


def test_monthly_summary_year_month_backward_compat(db_session):
    """year+month params still work (backward compat)."""
    user, token = _make_user(db_session, "_bc")
    acc = _make_account(db_session, user.id)
    _make_tx(db_session, user.id, acc.id, 1000, TransactionType.INCOME, date(2026, 3, 15))

    r = client.get(
        "/reports/monthly-summary?year=2026&month=3",
        headers=_auth(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert data["year"] == 2026
    assert data["month"] == 3
    assert "period" in data
    assert data["period"]["start"] == "2026-03-01"
    assert float(data["total_income"]) == 1000.0


def test_monthly_summary_date_range(db_session):
    """start_date+end_date filters correctly across months."""
    user, token = _make_user(db_session, "_range")
    acc = _make_account(db_session, user.id)
    # Inside range
    _make_tx(db_session, user.id, acc.id, 500, TransactionType.EXPENSE, date(2026, 1, 15))
    _make_tx(db_session, user.id, acc.id, 300, TransactionType.EXPENSE, date(2026, 2, 10))
    # Outside range
    _make_tx(db_session, user.id, acc.id, 9999, TransactionType.EXPENSE, date(2026, 3, 1))

    r = client.get(
        "/reports/monthly-summary?start_date=2026-01-01&end_date=2026-02-28",
        headers=_auth(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert float(data["total_expenses"]) == 800.0
    assert data["period"]["start"] == "2026-01-01"
    assert data["period"]["end"] == "2026-02-28"
    assert data["year"] is None


def test_category_breakdown_date_range(db_session):
    """category-breakdown accepts start_date+end_date."""
    user, token = _make_user(db_session, "_cat")
    acc = _make_account(db_session, user.id)
    _make_tx(db_session, user.id, acc.id, 200, TransactionType.EXPENSE, date(2026, 4, 5))
    _make_tx(db_session, user.id, acc.id, 999, TransactionType.EXPENSE, date(2026, 5, 1))

    r = client.get(
        "/reports/category-breakdown?start_date=2026-04-01&end_date=2026-04-30",
        headers=_auth(token),
    )
    assert r.status_code == 200
    data = r.json()
    assert float(data["total_expenses"]) == 200.0
    assert data["period"]["start"] == "2026-04-01"


def test_invalid_range_returns_422(db_session):
    """start_date > end_date must return 422."""
    user, token = _make_user(db_session, "_inv")

    r = client.get(
        "/reports/monthly-summary?start_date=2026-05-31&end_date=2026-05-01",
        headers=_auth(token),
    )
    assert r.status_code == 422


def test_cross_month_range_sums_correctly(db_session):
    """Range spanning Jan–Mar sums all three months together."""
    user, token = _make_user(db_session, "_cross")
    acc = _make_account(db_session, user.id)
    for tx_date in [date(2026, 1, 10), date(2026, 2, 20), date(2026, 3, 5)]:
        _make_tx(db_session, user.id, acc.id, 100, TransactionType.EXPENSE, tx_date)
    # April — outside range
    _make_tx(db_session, user.id, acc.id, 500, TransactionType.EXPENSE, date(2026, 4, 1))

    r = client.get(
        "/reports/monthly-summary?start_date=2026-01-01&end_date=2026-03-31",
        headers=_auth(token),
    )
    assert r.status_code == 200
    assert float(r.json()["total_expenses"]) == 300.0


def test_missing_one_date_param_returns_422(db_session):
    """Providing only start_date without end_date must return 422."""
    user, token = _make_user(db_session, "_miss")

    r = client.get(
        "/reports/monthly-summary?start_date=2026-01-01",
        headers=_auth(token),
    )
    assert r.status_code == 422


def test_no_params_returns_422(db_session):
    """Calling endpoint with no params must return 422."""
    user, token = _make_user(db_session, "_nop")

    r = client.get(
        "/reports/monthly-summary",
        headers=_auth(token),
    )
    assert r.status_code == 422
