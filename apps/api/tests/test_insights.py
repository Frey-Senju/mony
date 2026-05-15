"""
Insights endpoint unit tests — Story 2.4.

Covers 7 required cases:
  test_monthly_insights_top_categories          — top 3 ordered descending
  test_monthly_insights_trend_up                — MoM increase > 5%
  test_monthly_insights_trend_stable            — MoM ±5%
  test_monthly_insights_anomaly_detected        — spend > 150% of 3m avg
  test_monthly_insights_no_anomaly_insufficient — < 2 months history → []
  test_auto_categorize_high_confidence          — exact keyword → "high"
  test_auto_categorize_no_match                 — unknown text → category=None
"""

from datetime import date, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

from database.models import (
    Account,
    AccountType,
    Category,
    Transaction,
    TransactionCategory,
    TransactionType,
    User,
    UserPlan,
)
from main import app
from utils.auth import create_access_token, hash_password

client = TestClient(app)


# ============ Fixtures ============


@pytest.fixture
def user(db_session):
    u = User(
        email="insights@example.com",
        password_hash=hash_password("Pass123!"),
        full_name="Insight User",
        is_email_verified=True,
        plan=UserPlan.BASIC,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def account(db_session, user):
    a = Account(
        user_id=user.id,
        name="Main",
        type=AccountType.CHECKING,
        balance=Decimal("10000"),
        currency="BRL",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(a)
    db_session.commit()
    db_session.refresh(a)
    return a


@pytest.fixture
def auth_headers(user):
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def _cat(db_session, user, name):
    c = Category(
        user_id=user.id,
        name=name,
        slug=name.lower().replace(" ", "_"),
        is_system=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(c)
    db_session.flush()
    return c


def _expense(db_session, user, account, category, amount, tx_date):
    tx = Transaction(
        user_id=user.id,
        account_id=account.id,
        type=TransactionType.EXPENSE,
        amount=Decimal(str(amount)),
        currency="BRL",
        description="test",
        transaction_date=tx_date,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(tx)
    db_session.flush()
    db_session.add(TransactionCategory(transaction_id=tx.id, category_id=category.id))
    db_session.commit()
    return tx


# ============ Tests ============


def test_monthly_insights_top_categories(client, user, account, auth_headers, db_session):
    today = date.today()
    cats = [_cat(db_session, user, n) for n in ["Alpha", "Beta", "Gamma", "Delta"]]
    db_session.commit()

    for cat, amt in zip(cats, [300, 100, 200, 50]):
        _expense(db_session, user, account, cat, amt, today)

    resp = client.get("/insights/monthly", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    top = data["top_categories"]
    assert len(top) <= 3
    # Must be ordered descending
    totals = [Decimal(t["total"]) for t in top]
    assert totals == sorted(totals, reverse=True)
    assert top[0]["category"] == "Alpha"


def test_monthly_insights_trend_up(client, user, account, auth_headers, db_session):
    today = date.today()
    prev_m = today.month - 1 if today.month > 1 else 12
    prev_y = today.year if today.month > 1 else today.year - 1

    cat = _cat(db_session, user, "Geral")
    db_session.commit()
    _expense(db_session, user, account, cat, 500, date(prev_y, prev_m, 15))
    _expense(db_session, user, account, cat, 700, today)

    resp = client.get("/insights/monthly", headers=auth_headers)
    assert resp.status_code == 200
    trend = resp.json()["trend"]
    assert trend["trend_direction"] == "up"
    assert Decimal(trend["pct_change"]) > 5


def test_monthly_insights_trend_stable(client, user, account, auth_headers, db_session):
    today = date.today()
    prev_m = today.month - 1 if today.month > 1 else 12
    prev_y = today.year if today.month > 1 else today.year - 1

    cat = _cat(db_session, user, "Estavel")
    db_session.commit()
    _expense(db_session, user, account, cat, 1000, date(prev_y, prev_m, 15))
    _expense(db_session, user, account, cat, 1030, today)  # +3%

    resp = client.get("/insights/monthly", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["trend"]["trend_direction"] == "stable"


def test_monthly_insights_anomaly_detected(client, user, account, auth_headers, db_session):
    today = date.today()
    cat = _cat(db_session, user, "Lazer")
    db_session.commit()

    # 3 previous months — avg 100/month
    for delta in range(1, 4):
        m = today.month - delta
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        _expense(db_session, user, account, cat, 100, date(y, m, 15))

    # Current month: 300 (3x > 150% threshold)
    _expense(db_session, user, account, cat, 300, today)

    resp = client.get("/insights/monthly", headers=auth_headers)
    assert resp.status_code == 200
    anomalies = resp.json()["anomalies"]
    assert len(anomalies) >= 1
    assert anomalies[0]["category"] == "Lazer"
    assert Decimal(anomalies[0]["ratio"]) >= Decimal("1.5")


def test_monthly_insights_no_anomaly_insufficient_history(
    client, user, account, auth_headers, db_session
):
    today = date.today()
    cat = _cat(db_session, user, "Novo")
    db_session.commit()
    # Only current month data — no prior history
    _expense(db_session, user, account, cat, 500, today)

    resp = client.get("/insights/monthly", headers=auth_headers)
    assert resp.status_code == 200
    # With 0 months of prior data, anomalies should be empty
    assert resp.json()["anomalies"] == []


def test_auto_categorize_high_confidence(client, user, auth_headers):
    resp = client.get(
        "/insights/auto-categorize",
        headers=auth_headers,
        params={"description": "Jantar no McDonald's", "merchant": "McDonalds"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["category"] == "Alimentação"
    assert data["confidence"] == "high"


def test_auto_categorize_no_match(client, user, auth_headers):
    resp = client.get(
        "/insights/auto-categorize",
        headers=auth_headers,
        params={"description": "Transferência aleatória xyz", "merchant": ""},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["category"] is None
    assert data["confidence"] == "none"
