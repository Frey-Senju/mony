#!/usr/bin/env python
"""
Test server runner that uses SQLite instead of PostgreSQL.
Used for E2E testing and development without Docker.
"""

import os
import sys
from pathlib import Path

# Change to API directory
api_dir = Path(__file__).parent
os.chdir(api_dir)
sys.path.insert(0, str(api_dir))

# Override DATABASE_URL to use SQLite
os.environ["DATABASE_URL"] = "sqlite:///./mony_test.db"

import uvicorn
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database.base import Base, SessionLocal, get_db as original_get_db
from main import app

# Initialize database with SQLite
engine = create_engine(
    "sqlite:///./mony_test.db",
    connect_args={"check_same_thread": False}
)
Base.metadata.drop_all(bind=engine)  # Clean slate for each test run
Base.metadata.create_all(bind=engine)

# Override dependency
def override_get_db():
    db_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
    try:
        yield db_session
    finally:
        db_session.close()

# Seed test data
from database.models import User, Account, Transaction
from passlib.context import CryptContext
from datetime import date, timedelta

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
test_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()

try:
    # Create test user
    existing_user = test_session.query(User).filter(User.email == "testuser@example.com").first()
    if not existing_user:
        test_user = User(
            email="testuser@example.com",
            password_hash=pwd_context.hash("Test@123456"),
            full_name="Test User",
            preferred_currency="BRL",
            timezone="America/Sao_Paulo",
            is_email_verified=True,
        )
        test_session.add(test_user)
        test_session.commit()
        test_session.refresh(test_user)
        print(f"[OK] Created test user: {test_user.email}")

        # Create test accounts
        checking_account = Account(
            user_id=test_user.id,
            name="Checking Account",
            type="checking",
            balance=5000.00,
            currency="BRL",
            is_default=True,
        )
        savings_account = Account(
            user_id=test_user.id,
            name="Savings Account",
            type="savings",
            balance=10000.00,
            currency="BRL",
            is_default=False,
        )
        test_session.add(checking_account)
        test_session.add(savings_account)
        test_session.commit()
        print(f"[OK] Created test accounts")

        # Create test transactions
        today = date.today()
        transactions = [
            Transaction(
                user_id=test_user.id,
                account_id=checking_account.id,
                description="Grocery Store",
                amount=150.00,
                type="expense",
                transaction_date=today - timedelta(days=5),
                is_reconciled=True,
            ),
            Transaction(
                user_id=test_user.id,
                account_id=checking_account.id,
                description="Monthly Salary",
                amount=3000.00,
                type="income",
                transaction_date=today - timedelta(days=3),
                is_reconciled=True,
            ),
            Transaction(
                user_id=test_user.id,
                account_id=checking_account.id,
                description="Movie Tickets",
                amount=50.00,
                type="expense",
                transaction_date=today - timedelta(days=1),
                is_reconciled=False,
            ),
        ]
        for txn in transactions:
            test_session.add(txn)
        test_session.commit()
        print(f"[OK] Created {len(transactions)} test transactions")
finally:
    test_session.close()

# Override the get_db function, not SessionLocal class
app.dependency_overrides[original_get_db] = override_get_db

print("Starting Mony API test server (SQLite)...")
print("Database: sqlite:///./mony_test.db")
print("API Docs: http://localhost:8000/docs")
print("")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False  # Disable reload to avoid subprocess issues with environment variables
    )
