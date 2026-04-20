"""
Transaction endpoints for Mony API.

Provides CRUD operations for financial transactions with filtering, pagination, and plan limits.
"""

from datetime import datetime, date
from typing import Optional
from decimal import Decimal

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, desc, or_
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from database.base import SessionLocal
from database.models import Transaction, Account, TransactionType, User
from utils.auth import get_current_user_from_header

router = APIRouter(prefix="/transactions", tags=["transactions"])


def get_db():
    """Dependency injection for database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============ Request/Response Models ============


class TransactionCreate(BaseModel):
    """Create transaction request."""

    account_id: str
    type: TransactionType
    amount: Decimal = Field(gt=0, decimal_places=2)
    currency: str = "BRL"
    description: str = Field(min_length=1, max_length=255)
    notes: Optional[str] = None
    transaction_date: date
    merchant_name: Optional[str] = None
    is_recurring: bool = False
    recurring_pattern: Optional[str] = None

    class Config:
        example = {
            "account_id": "550e8400-e29b-41d4-a716-446655440000",
            "type": "expense",
            "amount": 50.00,
            "currency": "BRL",
            "description": "Coffee at Starbucks",
            "transaction_date": "2026-04-16",
            "merchant_name": "Starbucks Coffee",
        }


class TransactionUpdate(BaseModel):
    """Update transaction request."""

    type: Optional[TransactionType] = None
    amount: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    description: Optional[str] = Field(None, min_length=1, max_length=255)
    notes: Optional[str] = None
    transaction_date: Optional[date] = None
    merchant_name: Optional[str] = None
    is_recurring: Optional[bool] = None
    recurring_pattern: Optional[str] = None
    is_reconciled: Optional[bool] = None

    class Config:
        example = {
            "description": "Coffee at Starbucks Coffee Shop",
            "amount": 55.00,
            "is_reconciled": True,
        }


class TransactionResponse(BaseModel):
    """Transaction response model."""

    id: UUID | str
    user_id: UUID | str
    account_id: UUID | str
    type: TransactionType
    amount: Decimal
    currency: str
    description: str
    notes: Optional[str]
    transaction_date: date
    merchant_name: Optional[str]
    is_recurring: bool
    recurring_pattern: Optional[str]
    is_reconciled: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        example = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "user_id": "550e8400-e29b-41d4-a716-446655440001",
            "account_id": "550e8400-e29b-41d4-a716-446655440002",
            "type": "expense",
            "amount": 50.00,
            "currency": "BRL",
            "description": "Coffee at Starbucks",
            "notes": None,
            "transaction_date": "2026-04-16",
            "merchant_name": "Starbucks Coffee",
            "is_recurring": False,
            "recurring_pattern": None,
            "is_reconciled": False,
            "created_at": "2026-04-16T10:30:00",
            "updated_at": "2026-04-16T10:30:00",
        }


class TransactionListResponse(BaseModel):
    """Transaction list response with pagination."""

    items: list[TransactionResponse]
    total: int
    offset: int
    limit: int

    class Config:
        example = {
            "items": [
                {
                    "id": "550e8400-e29b-41d4-a716-446655440000",
                    "user_id": "550e8400-e29b-41d4-a716-446655440001",
                    "account_id": "550e8400-e29b-41d4-a716-446655440002",
                    "type": "expense",
                    "amount": 50.00,
                    "currency": "BRL",
                    "description": "Coffee",
                    "notes": None,
                    "transaction_date": "2026-04-16",
                    "merchant_name": "Starbucks",
                    "is_recurring": False,
                    "recurring_pattern": None,
                    "is_reconciled": False,
                    "created_at": "2026-04-16T10:30:00",
                    "updated_at": "2026-04-16T10:30:00",
                }
            ],
            "total": 1,
            "offset": 0,
            "limit": 20,
        }


# ============ Endpoint 1: Create Transaction ============


@router.post("", response_model=TransactionResponse, status_code=201)
async def create_transaction(
    payload: TransactionCreate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Create new financial transaction.

    - Validates account ownership
    - Checks plan limits (BASIC: 100 tx/month)
    - Amount must be > 0
    """
    # Get user
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check plan limit (BASIC: 100 tx/month)
    if user.plan == "BASIC":
        current_month_tx = db.query(Transaction).filter(
            and_(
                Transaction.user_id == UUID(user_id),
                Transaction.transaction_date.year == datetime.now().year,
                Transaction.transaction_date.month == datetime.now().month,
            )
        ).count()

        if current_month_tx >= 100:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Transaction limit reached for this month (BASIC: 100/month)",
            )

    # Verify account ownership
    account = db.query(Account).filter(
        and_(
            Account.id == UUID(payload.account_id),
            Account.user_id == UUID(user_id),
        )
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found or not owned by user",
        )

    # Create transaction
    transaction = Transaction(
        user_id=UUID(user_id),
        account_id=UUID(payload.account_id),
        type=payload.type,
        amount=payload.amount,
        currency=payload.currency,
        description=payload.description,
        notes=payload.notes,
        transaction_date=payload.transaction_date,
        merchant_name=payload.merchant_name,
        is_recurring=payload.is_recurring,
        recurring_pattern=payload.recurring_pattern,
    )

    db.add(transaction)
    db.commit()
    db.refresh(transaction)

    return transaction


# ============ Endpoint 2: List Transactions ============


@router.get("", response_model=TransactionListResponse)
async def list_transactions(
    user_id: str = Depends(get_current_user_from_header),
    account_id: Optional[str] = Query(None, description="Filter by account ID"),
    type: Optional[TransactionType] = Query(None, description="Filter by transaction type"),
    start_date: Optional[date] = Query(None, description="Filter transactions from this date"),
    end_date: Optional[date] = Query(None, description="Filter transactions until this date"),
    search: Optional[str] = Query(None, description="Search in description or merchant_name"),
    is_reconciled: Optional[bool] = Query(None, description="Filter by reconciliation status"),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    order_by: str = Query("transaction_date", description="Field to sort by (desc: -field)"),
    db: Session = Depends(get_db),
):
    """
    List user transactions with filtering and pagination.

    - Filters by account, type, date range
    - Pagination: offset + limit
    - Sorting: transaction_date (default), amount, created_at
    """
    # Build query
    query = db.query(Transaction).filter(Transaction.user_id == UUID(user_id))

    # Apply filters
    if account_id:
        query = query.filter(Transaction.account_id == UUID(account_id))

    if type:
        query = query.filter(Transaction.type == type)

    if start_date:
        query = query.filter(Transaction.transaction_date >= start_date)

    if end_date:
        query = query.filter(Transaction.transaction_date <= end_date)

    if search:
        query = query.filter(
            or_(
                Transaction.description.ilike(f"%{search}%"),
                Transaction.merchant_name.ilike(f"%{search}%"),
            )
        )

    if is_reconciled is not None:
        query = query.filter(Transaction.is_reconciled == is_reconciled)

    # Count total before pagination
    total = query.count()

    # Apply sorting
    if order_by.startswith("-"):
        field_name = order_by[1:]
        query = query.order_by(desc(getattr(Transaction, field_name, Transaction.transaction_date)))
    else:
        query = query.order_by(getattr(Transaction, order_by, Transaction.transaction_date))

    # Apply pagination
    transactions = query.offset(offset).limit(limit).all()

    return TransactionListResponse(
        items=transactions,
        total=total,
        offset=offset,
        limit=limit,
    )


# ============ Endpoint 3: Get Transaction ============


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(
    transaction_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Get single transaction by ID.

    - Verifies user ownership
    - Returns 404 if not found or not owned by user
    """
    transaction = db.query(Transaction).filter(
        and_(
            Transaction.id == UUID(transaction_id),
            Transaction.user_id == UUID(user_id),
        )
    ).first()

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )

    return transaction


# ============ Endpoint 4: Update Transaction ============


@router.put("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: str,
    payload: TransactionUpdate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Update transaction by ID.

    - Verifies user ownership
    - Only allows updating certain fields
    - Amount must be > 0
    """
    transaction = db.query(Transaction).filter(
        and_(
            Transaction.id == UUID(transaction_id),
            Transaction.user_id == UUID(user_id),
        )
    ).first()

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )

    # Update fields
    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(transaction, field, value)

    db.commit()
    db.refresh(transaction)

    return transaction


# ============ Endpoint 5: Delete Transaction ============


@router.delete("/{transaction_id}", status_code=204)
async def delete_transaction(
    transaction_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Delete transaction by ID (soft delete).

    - Sets deleted_at timestamp instead of hard delete
    - Verifies user ownership
    """
    transaction = db.query(Transaction).filter(
        and_(
            Transaction.id == UUID(transaction_id),
            Transaction.user_id == UUID(user_id),
        )
    ).first()

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )

    # Soft delete
    transaction.deleted_at = datetime.utcnow()
    db.commit()

    return None
