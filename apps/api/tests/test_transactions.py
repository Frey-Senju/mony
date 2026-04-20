"""
Transaction endpoints tests.

Tests for POST, GET, PUT, DELETE /transactions with filtering, pagination, and plan limits.
"""

import pytest
from fastapi.testclient import TestClient
from datetime import date, datetime
from decimal import Decimal

from main import app
from database.base import SessionLocal
from database.models import User, Account, Transaction, TransactionType, AccountType, UserPlan
from utils.auth import hash_password, create_access_token


client = TestClient(app)


@pytest.fixture
def test_user(db_session):
    """Create test user."""
    user = User(
        email="test@example.com",
        password_hash=hash_password("TestPass123!"),
        full_name="Test User",
        is_email_verified=True,
        plan=UserPlan.BASIC,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_account(db_session, test_user):
    """Create test account."""
    account = Account(
        user_id=test_user.id,
        name="Test Checking Account",
        type=AccountType.CHECKING,
        balance=Decimal("1000.00"),
        currency="BRL",
        is_active=True,
    )
    db_session.add(account)
    db_session.commit()
    db_session.refresh(account)
    return account


@pytest.fixture
def auth_headers(test_user):
    """Generate auth headers."""
    token = create_access_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}


# ============ Create Transaction Tests ============


def test_create_transaction_success(client, test_user, test_account, auth_headers, db_session):
    """Test successful transaction creation."""
    response = client.post(
        "/transactions",
        headers=auth_headers,
        json={
            "account_id": str(test_account.id),
            "type": "expense",
            "amount": 50.00,
            "currency": "BRL",
            "description": "Coffee at Starbucks",
            "transaction_date": "2026-04-16",
            "merchant_name": "Starbucks",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["description"] == "Coffee at Starbucks"
    assert float(data["amount"]) == 50.00
    assert data["type"] == "expense"
    assert data["is_reconciled"] is False


def test_create_transaction_zero_amount(client, test_account, auth_headers):
    """Test transaction creation with zero amount (invalid)."""
    response = client.post(
        "/transactions",
        headers=auth_headers,
        json={
            "account_id": str(test_account.id),
            "type": "expense",
            "amount": 0,
            "currency": "BRL",
            "description": "Invalid transaction",
            "transaction_date": "2026-04-16",
        },
    )

    assert response.status_code == 422  # Validation error


def test_create_transaction_negative_amount(client, test_account, auth_headers):
    """Test transaction creation with negative amount (invalid)."""
    response = client.post(
        "/transactions",
        headers=auth_headers,
        json={
            "account_id": str(test_account.id),
            "type": "expense",
            "amount": -50.00,
            "currency": "BRL",
            "description": "Invalid transaction",
            "transaction_date": "2026-04-16",
        },
    )

    assert response.status_code == 422  # Validation error


def test_create_transaction_invalid_account(client, test_user, auth_headers):
    """Test transaction creation with invalid account ID."""
    response = client.post(
        "/transactions",
        headers=auth_headers,
        json={
            "account_id": "550e8400-e29b-41d4-a716-446655440000",  # Non-existent
            "type": "expense",
            "amount": 50.00,
            "currency": "BRL",
            "description": "Test transaction",
            "transaction_date": "2026-04-16",
        },
    )

    assert response.status_code == 404
    assert "Account not found" in response.json()["detail"]


def test_create_transaction_plan_limit(client, test_user, test_account, auth_headers, db_session):
    """Test BASIC plan transaction limit (100/month)."""
    # Create 100 transactions
    for i in range(100):
        transaction = Transaction(
            user_id=test_user.id,
            account_id=test_account.id,
            type=TransactionType.EXPENSE,
            amount=Decimal("10.00"),
            description=f"Transaction {i}",
            transaction_date=date.today(),
        )
        db_session.add(transaction)
    db_session.commit()

    # 101st transaction should fail
    response = client.post(
        "/transactions",
        headers=auth_headers,
        json={
            "account_id": str(test_account.id),
            "type": "expense",
            "amount": 50.00,
            "currency": "BRL",
            "description": "Over limit",
            "transaction_date": "2026-04-16",
        },
    )

    assert response.status_code == 403
    assert "limit reached" in response.json()["detail"]


# ============ List Transactions Tests ============


def test_list_transactions_empty(client, test_user, auth_headers):
    """Test listing transactions when none exist."""
    response = client.get("/transactions", headers=auth_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["offset"] == 0
    assert data["limit"] == 20


def test_list_transactions_with_pagination(client, test_user, test_account, auth_headers, db_session):
    """Test listing transactions with pagination."""
    # Create 25 transactions
    for i in range(25):
        transaction = Transaction(
            user_id=test_user.id,
            account_id=test_account.id,
            type=TransactionType.EXPENSE,
            amount=Decimal(f"{10.00 + i}"),
            description=f"Transaction {i}",
            transaction_date=date.today(),
        )
        db_session.add(transaction)
    db_session.commit()

    # Get first page
    response = client.get(
        "/transactions?offset=0&limit=10",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 10
    assert data["total"] == 25
    assert data["offset"] == 0
    assert data["limit"] == 10

    # Get second page
    response = client.get(
        "/transactions?offset=10&limit=10",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 10
    assert data["total"] == 25


def test_list_transactions_filter_by_type(client, test_user, test_account, auth_headers, db_session):
    """Test filtering transactions by type."""
    # Create mixed transactions
    for i in range(5):
        transaction = Transaction(
            user_id=test_user.id,
            account_id=test_account.id,
            type=TransactionType.EXPENSE,
            amount=Decimal("10.00"),
            description=f"Expense {i}",
            transaction_date=date.today(),
        )
        db_session.add(transaction)

    for i in range(3):
        transaction = Transaction(
            user_id=test_user.id,
            account_id=test_account.id,
            type=TransactionType.INCOME,
            amount=Decimal("100.00"),
            description=f"Income {i}",
            transaction_date=date.today(),
        )
        db_session.add(transaction)
    db_session.commit()

    # Filter by expense
    response = client.get(
        "/transactions?type=expense",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 5
    assert all(item["type"] == "expense" for item in data["items"])


def test_list_transactions_filter_by_date_range(client, test_user, test_account, auth_headers, db_session):
    """Test filtering transactions by date range."""
    # Create transactions on different dates
    dates = [date(2026, 4, 10), date(2026, 4, 15), date(2026, 4, 20)]

    for d in dates:
        transaction = Transaction(
            user_id=test_user.id,
            account_id=test_account.id,
            type=TransactionType.EXPENSE,
            amount=Decimal("50.00"),
            description=f"Transaction on {d}",
            transaction_date=d,
        )
        db_session.add(transaction)
    db_session.commit()

    # Filter by date range
    response = client.get(
        "/transactions?start_date=2026-04-12&end_date=2026-04-18",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 1
    assert data["items"][0]["transaction_date"] == "2026-04-15"


# ============ Get Transaction Tests ============


def test_get_transaction_success(client, test_user, test_account, auth_headers, db_session):
    """Test getting single transaction."""
    transaction = Transaction(
        user_id=test_user.id,
        account_id=test_account.id,
        type=TransactionType.EXPENSE,
        amount=Decimal("50.00"),
        description="Coffee",
        transaction_date=date.today(),
    )
    db_session.add(transaction)
    db_session.commit()

    response = client.get(
        f"/transactions/{transaction.id}",
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert str(data["id"]) == str(transaction.id)
    assert data["description"] == "Coffee"


def test_get_transaction_not_found(client, test_user, auth_headers):
    """Test getting non-existent transaction."""
    response = client.get(
        "/transactions/550e8400-e29b-41d4-a716-446655440000",
        headers=auth_headers,
    )

    assert response.status_code == 404
    assert "not found" in response.json()["detail"]


# ============ Update Transaction Tests ============


def test_update_transaction_success(client, test_user, test_account, auth_headers, db_session):
    """Test updating transaction."""
    transaction = Transaction(
        user_id=test_user.id,
        account_id=test_account.id,
        type=TransactionType.EXPENSE,
        amount=Decimal("50.00"),
        description="Coffee",
        transaction_date=date.today(),
    )
    db_session.add(transaction)
    db_session.commit()

    response = client.put(
        f"/transactions/{transaction.id}",
        headers=auth_headers,
        json={
            "description": "Coffee at Starbucks",
            "amount": 55.00,
            "is_reconciled": True,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["description"] == "Coffee at Starbucks"
    assert float(data["amount"]) == 55.00
    assert data["is_reconciled"] is True


def test_update_transaction_not_found(client, test_user, auth_headers):
    """Test updating non-existent transaction."""
    response = client.put(
        "/transactions/550e8400-e29b-41d4-a716-446655440000",
        headers=auth_headers,
        json={"description": "Updated"},
    )

    assert response.status_code == 404


# ============ Delete Transaction Tests ============


def test_delete_transaction_success(client, test_user, test_account, auth_headers, db_session):
    """Test deleting transaction (soft delete)."""
    transaction = Transaction(
        user_id=test_user.id,
        account_id=test_account.id,
        type=TransactionType.EXPENSE,
        amount=Decimal("50.00"),
        description="Coffee",
        transaction_date=date.today(),
    )
    db_session.add(transaction)
    db_session.commit()

    response = client.delete(
        f"/transactions/{transaction.id}",
        headers=auth_headers,
    )

    assert response.status_code == 204

    # Verify soft delete
    deleted_tx = db_session.query(Transaction).filter(Transaction.id == transaction.id).first()
    assert deleted_tx.deleted_at is not None


def test_delete_transaction_not_found(client, test_user, auth_headers):
    """Test deleting non-existent transaction."""
    response = client.delete(
        "/transactions/550e8400-e29b-41d4-a716-446655440000",
        headers=auth_headers,
    )

    assert response.status_code == 404
