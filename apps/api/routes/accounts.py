"""
Account management endpoints for Mony API.

Provides complete CRUD for user financial accounts (checking, savings,
credit card, investment, cash).
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import Account, AccountType, User
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/accounts", tags=["accounts"])


# ============ Request/Response Models ============


class AccountResponse(BaseModel):
    """Account response model."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    type: str
    balance: float
    currency: str
    icon: Optional[str] = None
    color: Optional[str] = None
    is_default: bool = False


class AccountCreateRequest(BaseModel):
    """Account creation request model."""

    name: str = Field(min_length=1, max_length=100)
    type: str  # checking, savings, credit_card, investment, cash
    balance: float = 0.0
    currency: str = Field(default="BRL", min_length=3, max_length=3)
    icon: Optional[str] = None
    color: Optional[str] = None
    is_default: bool = False


class AccountUpdateRequest(BaseModel):
    """Account update request model."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    type: Optional[str] = None
    balance: Optional[float] = None
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    icon: Optional[str] = None
    color: Optional[str] = None
    is_default: Optional[bool] = None


# ============ Endpoint 1: List Accounts ============


@router.get("", response_model=List[AccountResponse])
async def list_accounts(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """List all active accounts for the authenticated user."""
    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    accounts = (
        db.query(Account)
        .filter(Account.user_id == user.id, Account.deleted_at.is_(None))
        .order_by(Account.is_default.desc(), Account.sort_order, Account.created_at)
        .all()
    )
    return accounts


# ============ Endpoint 2: Create Account ============


@router.post("", response_model=AccountResponse, status_code=201)
async def create_account(
    payload: AccountCreateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Create new account for authenticated user."""
    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    valid_types = [e.value for e in AccountType]
    if payload.type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid account type. Must be one of: {', '.join(valid_types)}",
        )

    existing = (
        db.query(Account)
        .filter(
            Account.user_id == user.id,
            Account.name == payload.name.strip(),
            Account.deleted_at.is_(None),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account with this name already exists",
        )

    # Automatically make first account default if user has none
    active_count = (
        db.query(Account)
        .filter(Account.user_id == user.id, Account.deleted_at.is_(None))
        .count()
    )
    should_be_default = bool(payload.is_default) or active_count == 0

    if should_be_default:
        db.query(Account).filter(
            Account.user_id == user.id,
            Account.is_default.is_(True),
            Account.deleted_at.is_(None),
        ).update({Account.is_default: False})

    account = Account(
        user_id=user.id,
        name=payload.name.strip(),
        type=AccountType(payload.type),
        balance=payload.balance,
        currency=payload.currency.upper(),
        icon=payload.icon,
        color=payload.color,
        is_default=should_be_default,
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
    db: Session = Depends(get_db),
):
    """Get details of a specific account."""
    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    account = (
        db.query(Account)
        .filter(
            Account.id == account_id,
            Account.user_id == user.id,
            Account.deleted_at.is_(None),
        )
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    return account


# ============ Endpoint 4: Update Account ============


@router.put("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: UUID,
    payload: AccountUpdateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Update an existing account owned by the authenticated user."""
    uid = parse_uuid(user_id, "user_id")
    account = (
        db.query(Account)
        .filter(
            Account.id == account_id,
            Account.user_id == uid,
            Account.deleted_at.is_(None),
        )
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    if payload.type is not None:
        valid_types = [e.value for e in AccountType]
        if payload.type not in valid_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid account type. Must be one of: {', '.join(valid_types)}",
            )
        account.type = AccountType(payload.type)

    if payload.name is not None:
        clean_name = payload.name.strip()
        conflict = (
            db.query(Account)
            .filter(
                Account.user_id == uid,
                Account.name == clean_name,
                Account.id != account_id,
                Account.deleted_at.is_(None),
            )
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Account with this name already exists",
            )
        account.name = clean_name

    if payload.balance is not None:
        account.balance = payload.balance
    if payload.currency is not None:
        account.currency = payload.currency.upper()
    if payload.icon is not None:
        account.icon = payload.icon
    if payload.color is not None:
        account.color = payload.color

    if payload.is_default is True:
        db.query(Account).filter(
            Account.user_id == uid,
            Account.id != account_id,
            Account.is_default.is_(True),
            Account.deleted_at.is_(None),
        ).update({Account.is_default: False})
        account.is_default = True
    elif payload.is_default is False:
        account.is_default = False

    account.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(account)
    return account


# ============ Endpoint 5: Delete Account ============


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: UUID,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Soft-delete an account and reassign default flag if needed."""
    uid = parse_uuid(user_id, "user_id")
    account = (
        db.query(Account)
        .filter(
            Account.id == account_id,
            Account.user_id == uid,
            Account.deleted_at.is_(None),
        )
        .first()
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    was_default = bool(account.is_default)
    account.deleted_at = datetime.utcnow()
    account.is_default = False
    db.flush()

    if was_default:
        replacement = (
            db.query(Account)
            .filter(Account.user_id == uid, Account.deleted_at.is_(None))
            .order_by(Account.created_at.asc())
            .first()
        )
        if replacement:
            replacement.is_default = True

    db.commit()
    return None
