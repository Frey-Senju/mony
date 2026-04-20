#!/usr/bin/env python
"""
Seed test data for E2E testing.
Creates test users and sample data in the database.
"""

import os
import sys
from pathlib import Path

# Add API directory to path
api_dir = Path(__file__).parent
sys.path.insert(0, str(api_dir))

# Override DATABASE_URL to use SQLite
os.environ["DATABASE_URL"] = "sqlite:///./mony_test.db"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database.base import Base
from database.models import User, Account, Transaction
from datetime import datetime, timedelta, date
from passlib.context import CryptContext

# Create password context with argon2 (must match auth.py configuration)
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

# Create engine and session
engine = create_engine("sqlite:///./mony_test.db", connect_args={"check_same_thread": False})
# Drop all existing tables to recreate with updated schema
Base.metadata.drop_all(bind=engine)
# Create all tables with new schema
Base.metadata.create_all(bind=engine)
Session = sessionmaker(bind=engine)
db = Session()

def seed_data():
    """Seed test data."""
    print("Seeding test data...")

    # Create test user
    test_user = User(
        email="testuser@example.com",
        password_hash=pwd_context.hash("Test@123456"),
        full_name="Test User",
        preferred_currency="BRL",
        timezone="America/Sao_Paulo",
        is_email_verified=True,
    )

    # Check if user already exists
    existing_user = db.query(User).filter(User.email == "testuser@example.com").first()
    if existing_user:
        print("Test user already exists, skipping creation")
        db.close()
        return

    db.add(test_user)
    db.commit()
    print(f"Created test user: {test_user.email}")

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

    db.add(checking_account)
    db.add(savings_account)
    db.commit()
    print(f"Created test accounts")

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
        db.add(txn)
    db.commit()
    print(f"Created test transactions")

    print("Test data seeding complete!")
    db.close()

if __name__ == "__main__":
    seed_data()
