"""
Account management endpoints for Mony API.

Provides endpoints to list and create user accounts (checking, savings, credit card, etc).
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database.base import SessionLocal
from database.models import Account, User, AccountType
from utils.auth import get_current_user_from_header

router = APIRouter(prefix="/accounts", tags=["accounts"])


def get_db():
    """Dependency injection for database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============ Request/Response Models ============


class AccountResponse(BaseModel):
    """Account response model."""
    id: UUID
    name: str
    type: str
    balance: float
    currency: str
    icon: Optional[str] = None
    color: Optional[str] = None
    is_default: bool = False

    class Config:
        from_attributes = True
        example = {
            "id": "123e4567-e89b-12d3-a456-426614174000",
            "name": "Conta Corrente Itaú",
            "type": "checking",
            "balance": 5000.00,
            "currency": "BRL",
            "icon": "💳",
            "color": "#FF6B6B",
            "is_default": True
        }


class AccountCreateRequest(BaseModel):
    """Account creation request model."""
    name: str
    type: str  # checking, savings, credit_card, investment, cash
    balance: float = 0.0
    currency: str = "BRL"
    icon: Optional[str] = None
    color: Optional[str] = None
    is_default: bool = False

    class Config:
        example = {
            "name": "Conta Poupança",
            "type": "savings",
            "balance": 1000.00,
            "currency": "BRL",
            "icon": "🏦",
            "color": "#4ECDC4",
            "is_default": False
        }


# ============ Endpoint 1: List Accounts ============


@router.get("", response_model=List[AccountResponse])
async def list_accounts(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db)
):
    """
    List all accounts for the authenticated user.

    Returns accounts sorted by is_default (default first), then by sort_order.
    """
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    accounts = db.query(Account).filter(
        Account.user_id == user.id,
        Account.deleted_at.is_(None)
    ).order_by(
        Account.is_default.desc(),
        Account.sort_order
    ).all()

    return accounts


# ============ Endpoint 2: Create Account ============


@router.post("", response_model=AccountResponse, status_code=201)
async def create_account(
    payload: AccountCreateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db)
):
    """
    Create new account for authenticated user.

    - name: Account name (unique per user)
    - type: checking, savings, credit_card, investment, cash
    - balance: Initial balance (default 0)
    - currency: ISO 4217 code (default BRL)
    - is_default: Set as default account (replaces previous default)
    """
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Validate account type
    valid_types = [e.value for e in AccountType]
    if payload.type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid account type. Must be one of: {', '.join(valid_types)}"
        )

    # Check if name is unique for this user
    existing = db.query(Account).filter(
        Account.user_id == user.id,
        Account.name == payload.name,
        Account.deleted_at.is_(None)
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account with this name already exists"
        )

    # If setting as default, clear previous default
    if payload.is_default:
        db.query(Account).filter(
            Account.user_id == user.id,
            Account.is_default == True,
            Account.deleted_at.is_(None)
        ).update({Account.is_default: False})

    # Create new account
    account = Account(
        user_id=user.id,
        name=payload.name,
        type=payload.type,
        balance=payload.balance,
        currency=payload.currency,
        icon=payload.icon,
        color=payload.color,
        is_default=payload.is_default or False
    )

    db.add(account)
    db.commit()
    db.refresh(account)

    return account


# ============ Endpoint 3: Get Account Details ============


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: UUID,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db)
):
    """
    Get details of a specific account.

    - account_id: UUID of the account
    """
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    account = db.query(Account).filter(
        Account.id == UUID(account_id),
        Account.user_id == user.id,
        Account.deleted_at.is_(None)
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )

    return account
