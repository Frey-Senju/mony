"""
Budget endpoints unit tests — Story 2.3.

Covers all 9 required test cases:
  test_create_budget                     — POST 201 with correct fields
  test_create_budget_duplicate           — 409 on same category
  test_list_budgets_with_progress        — spent_amount calculated from transactions
  test_list_budgets_excludes_other_months — prior-month transactions not counted
  test_list_budgets_alert_levels         — ok / warning / exceeded thresholds
  test_update_budget                     — PUT updates limit_amount
  test_delete_budget                     — DELETE 204, excluded from GET
  test_basic_plan_limit                  — 4th budget returns 403 on BASIC plan
  test_budget_isolation                  — user A cannot see user B's budgets
"""

import pytest
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient

from database.models import (
    Account,
    AccountType,
    Budget,
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
def user_basic(db_session):
    u = User(
        email="basic@example.com",
        password_hash=hash_password("Pass123!"),
        full_name="Basic User",
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
def user_b(db_session):
    u = User(
        email="userb@example.com",
        password_hash=hash_password("Pass123!"),
        full_name="User B",
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
def account(db_session, user_basic):
    a = Account(
        user_id=user_basic.id,
        name="Checking",
        type=AccountType.CHECKING,
        balance=Decimal("5000.00"),
        currency="BRL",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(a)
    db_session.commit()
    db_session.refresh(a)
    return a


@pytest.fixture
def category_alimentacao(db_session, user_basic):
    c = Category(
        user_id=user_basic.id,
        name="Alimentação",
        slug="alimentacao",
        is_system=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


@pytest.fixture
def auth_headers(user_basic):
    token = create_access_token(user_basic.id)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_b(user_b):
    token = create_access_token(user_b.id)
    return {"Authorization": f"Bearer {token}"}


def _make_expense(db_session, user, account, category, amount, tx_date):
    """Helper: create an expense transaction linked to a category."""
    tx = Transaction(
        user_id=user.id,
        account_id=account.id,
        type=TransactionType.EXPENSE,
        amount=Decimal(str(amount)),
        currency="BRL",
        description="test expense",
        transaction_date=tx_date,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db_session.add(tx)
    db_session.flush()
    link = TransactionCategory(transaction_id=tx.id, category_id=category.id)
    db_session.add(link)
    db_session.commit()
    return tx


# ============ Tests ============


def test_create_budget(client, user_basic, auth_headers, db_session):
    resp = client.post(
        "/budgets",
        headers=auth_headers,
        json={"category": "Alimentação", "limit_amount": 500.00},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["category"] == "Alimentação"
    assert Decimal(data["limit_amount"]) == Decimal("500.00")
    assert data["currency"] == "BRL"
    assert data["alert_level"] == "ok"
    assert "id" in data
    assert "period" in data


def test_create_budget_duplicate(client, user_basic, auth_headers, db_session):
    now = datetime.utcnow()
    b = Budget(
        user_id=user_basic.id,
        category="Transporte",
        limit_amount=Decimal("300.00"),
        currency="BRL",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db_session.add(b)
    db_session.commit()

    resp = client.post(
        "/budgets",
        headers=auth_headers,
        json={"category": "Transporte", "limit_amount": 400.00},
    )
    assert resp.status_code == 409


def test_list_budgets_with_progress(
    client, user_basic, account, category_alimentacao, auth_headers, db_session
):
    today = date.today()
    _make_expense(db_session, user_basic, account, category_alimentacao, "250.00", today)

    now = datetime.utcnow()
    b = Budget(
        user_id=user_basic.id,
        category="Alimentação",
        limit_amount=Decimal("500.00"),
        currency="BRL",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db_session.add(b)
    db_session.commit()

    resp = client.get("/budgets", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert Decimal(items[0]["spent_amount"]) == Decimal("250.00")
    assert Decimal(items[0]["percentage"]) == Decimal("50.00")
    assert items[0]["alert_level"] == "ok"


def test_list_budgets_excludes_other_months(
    client, user_basic, account, category_alimentacao, auth_headers, db_session
):
    today = date.today()
    last_month = date(today.year, today.month, 1) - timedelta(days=1)
    _make_expense(db_session, user_basic, account, category_alimentacao, "999.00", last_month)

    now = datetime.utcnow()
    b = Budget(
        user_id=user_basic.id,
        category="Alimentação",
        limit_amount=Decimal("500.00"),
        currency="BRL",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db_session.add(b)
    db_session.commit()

    resp = client.get("/budgets", headers=auth_headers)
    assert resp.status_code == 200
    items = resp.json()
    assert Decimal(items[0]["spent_amount"]) == Decimal("0.00")


def test_list_budgets_alert_levels(client, user_basic, account, auth_headers, db_session):
    today = date.today()

    # Create 3 categories with different spend levels
    cats = []
    for name in ["Cat-Ok", "Cat-Warning", "Cat-Exceeded"]:
        c = Category(
            user_id=user_basic.id,
            name=name,
            slug=name.lower().replace("-", "_"),
            is_system=False,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db_session.add(c)
        db_session.flush()
        cats.append(c)
    db_session.commit()

    _make_expense(db_session, user_basic, account, cats[0], "30.00", today)   # 30% → ok
    _make_expense(db_session, user_basic, account, cats[1], "85.00", today)   # 85% → warning
    _make_expense(db_session, user_basic, account, cats[2], "110.00", today)  # 110% → exceeded

    now = datetime.utcnow()
    for cat, limit in zip(cats, [100, 100, 100]):
        db_session.add(Budget(
            user_id=user_basic.id,
            category=cat.name,
            limit_amount=Decimal(str(limit)),
            currency="BRL",
            is_active=True,
            created_at=now,
            updated_at=now,
        ))
    db_session.commit()

    resp = client.get("/budgets", headers=auth_headers)
    assert resp.status_code == 200
    levels = {item["category"]: item["alert_level"] for item in resp.json()}
    assert levels["Cat-Ok"] == "ok"
    assert levels["Cat-Warning"] == "warning"
    assert levels["Cat-Exceeded"] == "exceeded"


def test_update_budget(client, user_basic, auth_headers, db_session):
    now = datetime.utcnow()
    b = Budget(
        user_id=user_basic.id,
        category="Lazer",
        limit_amount=Decimal("200.00"),
        currency="BRL",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db_session.add(b)
    db_session.commit()
    db_session.refresh(b)

    resp = client.put(
        f"/budgets/{b.id}",
        headers=auth_headers,
        json={"limit_amount": 350.00},
    )
    assert resp.status_code == 200
    assert Decimal(resp.json()["limit_amount"]) == Decimal("350.00")


def test_delete_budget(client, user_basic, auth_headers, db_session):
    now = datetime.utcnow()
    b = Budget(
        user_id=user_basic.id,
        category="Saúde",
        limit_amount=Decimal("400.00"),
        currency="BRL",
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db_session.add(b)
    db_session.commit()
    db_session.refresh(b)

    resp = client.delete(f"/budgets/{b.id}", headers=auth_headers)
    assert resp.status_code == 204

    resp = client.get("/budgets", headers=auth_headers)
    assert all(item["category"] != "Saúde" for item in resp.json())


def test_basic_plan_limit(client, user_basic, auth_headers, db_session):
    now = datetime.utcnow()
    for cat in ["A", "B", "C"]:
        db_session.add(Budget(
            user_id=user_basic.id,
            category=cat,
            limit_amount=Decimal("100.00"),
            currency="BRL",
            is_active=True,
            created_at=now,
            updated_at=now,
        ))
    db_session.commit()

    resp = client.post(
        "/budgets",
        headers=auth_headers,
        json={"category": "D", "limit_amount": 100.00},
    )
    assert resp.status_code == 403
    assert "Budget limit reached" in resp.json()["detail"]


def test_budget_isolation(client, user_basic, user_b, auth_headers, auth_headers_b, db_session):
    now = datetime.utcnow()
    db_session.add(Budget(
        user_id=user_b.id,
        category="Secreto",
        limit_amount=Decimal("999.00"),
        currency="BRL",
        is_active=True,
        created_at=now,
        updated_at=now,
    ))
    db_session.commit()

    resp = client.get("/budgets", headers=auth_headers)
    assert resp.status_code == 200
    assert all(item["category"] != "Secreto" for item in resp.json())
