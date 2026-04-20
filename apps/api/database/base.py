"""
Database configuration and session management for Mony API.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from .models import Base

# Database connection - read from environment or use default PostgreSQL
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://user:password@localhost:5432/mony_dev"
)

# Create engine with connection pooling
engine = create_engine(
    DATABASE_URL,
    echo=False,  # Set to True to see SQL queries
    pool_pre_ping=True,  # Verify connections are alive before using
    poolclass=NullPool,  # Disable connection pooling for serverless (Render)
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """
    Dependency for FastAPI to get database session.

    Usage:
        @app.get("/items/")
        def get_items(db: Session = Depends(get_db)):
            return db.query(Item).all()
    """
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
