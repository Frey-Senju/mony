"""
Shared test fixtures for Mony API tests.

Provides db_session and client fixtures backed by the test database.
Uses DATABASE_URL env var (PostgreSQL in CI) or SQLite fallback for local dev.
Used by test_transactions.py (test_auth.py defines its own local fixtures).
"""

import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from database.base import Base, get_db


def _make_engine():
    url = os.getenv("DATABASE_URL")
    if url:
        return create_engine(url)
    return create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


@pytest.fixture(scope="function")
def db_session():
    engine = _make_engine()
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()

    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    yield session

    app.dependency_overrides.pop(get_db, None)
    session.close()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def client(db_session):
    return TestClient(app)
