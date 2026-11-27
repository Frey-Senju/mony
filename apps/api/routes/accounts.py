"""
Account management endpoints for Mony API.

Provides complete CRUD for user financial accounts (checking, savings,
credit card, investment, cash).
"""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Account,
    AccountType,
    Transaction,
    TransactionType,
    User,
)
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
    user_edited: bool = False
    origin_metadata: Optional[dict] = None


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


# ============ EPIC-010: Account Transfer & Balance Reconciliation ============


class AccountTransferRequest(BaseModel):
    from_account_id: UUID
    to_account_id: UUID
    amount: Decimal = Field(gt=0, decimal_places=2)
    description: Optional[str] = Field(default=None, max_length=255)
    transfer_date: Optional[date] = None


class AccountReconcileRequest(BaseModel):
    actual_balance: Decimal = Field(..., decimal_places=2)
    create_adjustment_transaction: bool = True
    description: Optional[str] = Field(default="Ajuste de conciliação de saldo", max_length=255)


@router.post("/transfer", status_code=201)
async def transfer_between_accounts(
    payload: AccountTransferRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    EPIC-010 Atomic transfer between two user accounts.
    Updates both balances and logs paired TransactionType.TRANSFER entries
    tagged #transferencia so monthly income/expense totals stay clean.
    """
    if payload.from_account_id == payload.to_account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="As contas de origem e destino devem ser diferentes.",
        )

    uid = parse_uuid(user_id, "user_id")
    src = (
        db.query(Account)
        .filter(Account.id == payload.from_account_id, Account.user_id == uid, Account.deleted_at.is_(None))
        .first()
    )
    dst = (
        db.query(Account)
        .filter(Account.id == payload.to_account_id, Account.user_id == uid, Account.deleted_at.is_(None))
        .first()
    )
    if not src or not dst:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta de origem ou destino não encontrada.")

    tx_date = payload.transfer_date or date.today()
    ym = tx_date.strftime("%Y-%m")
    amt = Decimal(str(payload.amount))
    base_desc = (payload.description or "").strip()

    out_desc = base_desc or f"Transferência para {dst.name}"
    in_desc = base_desc or f"Transferência recebida de {src.name}"

    tx_out = Transaction(
        user_id=uid,
        account_id=src.id,
        type=TransactionType.TRANSFER,
        amount=amt,
        currency=src.currency or "BRL",
        description=out_desc,
        notes=f"Transferência interna: {src.name} → {dst.name}",
        transaction_date=tx_date,
        statement_month=ym,
        source="manual",
        is_reconciled=True,
        tags=["#transferencia"],
    )
    tx_in = Transaction(
        user_id=uid,
        account_id=dst.id,
        type=TransactionType.TRANSFER,
        amount=amt,
        currency=dst.currency or "BRL",
        description=in_desc,
        notes=f"Transferência interna: {src.name} → {dst.name}",
        transaction_date=tx_date,
        statement_month=ym,
        source="manual",
        is_reconciled=True,
        tags=["#transferencia"],
    )

    src.balance = Decimal(str(src.balance or 0)) - amt
    dst.balance = Decimal(str(dst.balance or 0)) + amt
    now = datetime.utcnow()
    src.updated_at = now
    dst.updated_at = now

    db.add(tx_out)
    db.add(tx_in)
    db.commit()

    return {
        "amount": round(float(amt), 2),
        "transfer_date": tx_date.isoformat(),
        "from_account": {"id": str(src.id), "name": src.name, "new_balance": round(float(src.balance), 2)},
        "to_account": {"id": str(dst.id), "name": dst.name, "new_balance": round(float(dst.balance), 2)},
        "transaction_ids": [str(tx_out.id), str(tx_in.id)],
    }


@router.post("/{account_id}/reconcile", status_code=200)
async def reconcile_account_balance(
    account_id: UUID,
    payload: AccountReconcileRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    EPIC-010 Reconcile an account to match real bank balance.
    Computes exact delta and optionally inserts an adjustment transaction tagged #conciliacao.
    """
    uid = parse_uuid(user_id, "user_id")
    acct = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == uid, Account.deleted_at.is_(None))
        .first()
    )
    if not acct:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    old_bal = Decimal(str(acct.balance or 0))
    target_bal = Decimal(str(payload.actual_balance))
    delta = target_bal - old_bal

    tx_id: Optional[str] = None
    if payload.create_adjustment_transaction and abs(delta) >= Decimal("0.01"):
        today = date.today()
        tx_type = TransactionType.INCOME if delta > 0 else TransactionType.EXPENSE
        adj_tx = Transaction(
            user_id=uid,
            account_id=acct.id,
            type=tx_type,
            amount=abs(delta),
            currency=acct.currency or "BRL",
            description=(payload.description or "Ajuste de conciliação de saldo").strip(),
            notes=f"Saldo ajustado de R$ {float(old_bal):.2f} para R$ {float(target_bal):.2f}",
            transaction_date=today,
            statement_month=today.strftime("%Y-%m"),
            source="manual",
            is_reconciled=True,
            tags=["#conciliacao"],
        )
        db.add(adj_tx)
        db.flush()
        tx_id = str(adj_tx.id)

    acct.balance = target_bal
    acct.user_edited = True
    acct.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(acct)

    return {
        "account_id": str(acct.id),
        "account_name": acct.name,
        "previous_balance": round(float(old_bal), 2),
        "new_balance": round(float(target_bal), 2),
        "delta": round(float(delta), 2),
        "adjustment_transaction_id": tx_id,
    }


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

    account.user_edited = True

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
