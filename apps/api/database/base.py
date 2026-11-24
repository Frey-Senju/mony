"""
Database configuration and session management for Mony API.
"""

import os
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from .models import Base

# Database connection - read from environment or use default PostgreSQL
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://user:password@localhost:5432/mony_dev"
).strip()
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

DB_SCHEMA = os.environ.get("DB_SCHEMA", "").strip()

# Create engine (NullPool is ideal for serverless Vercel + Supabase Supavisor)
engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    poolclass=NullPool,
)

# Enforce isolated Postgres schema when DB_SCHEMA is configured (e.g. DB_SCHEMA=mony)
if DB_SCHEMA and DATABASE_URL.startswith("postgresql"):
    @event.listens_for(engine, "connect")
    def _set_search_path(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute(f'SET search_path TO "{DB_SCHEMA}"')
        finally:
            cursor.close()

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """Dependency for FastAPI to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Create all tables in database."""
    Base.metadata.create_all(bind=engine)


def drop_tables():
    """Drop all tables in database (WARNING: Data loss)."""
    Base.metadata.drop_all(bind=engine)


def init_db():
    """Initialize database with schema and seed data."""
    create_tables()
    print("✅ Database tables created")
