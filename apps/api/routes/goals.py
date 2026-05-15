"""
Financial Goals endpoints — Story 2.5.

Provides savings goal tracking with incremental deposits and progress calculation.

Endpoints:
  POST   /goals               — create goal
  GET    /goals               — list active goals with progress
  PUT    /goals/{id}          — update name / target / deadline
  PATCH  /goals/{id}/deposit  — add amount to current_amount
  DELETE /goals/{id}          — soft-delete
"""

from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import Goal
from utils.auth import get_current_user_from_header

router = APIRouter(prefix="/goals", tags=["goals"])


# ============ Request / Response Models ============


class GoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    target_amount: Decimal = Field(gt=0, decimal_places=2)
    current_amount: Optional[Decimal] = Field(default=Decimal("0"), ge=0, decimal_places=2)
    currency: str = Field(default="BRL", min_length=3, max_length=3)
    description: Optional[str] = None
    target_date: Optional[date] = None


class GoalUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    target_amount: Optional[Decimal] = Field(default=None, gt=0, decimal_places=2)
    description: Optional[str] = None
    target_date: Optional[date] = None


class DepositRequest(BaseModel):
    amount: Decimal = Field(gt=0, decimal_places=2)


class GoalResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    target_amount: Decimal
    current_amount: Decimal
    currency: str
    progress_pct: Decimal
    remaining_amount: Decimal
    is_achieved: bool
    target_date: Optional[str]
    achieved_at: Optional[str]
    created_at: str
    updated_at: str


# ============ Helpers ============


def _get_goal_or_404(db: Session, goal_id: str, user_id: UUID) -> Goal:
    goal = (
        db.query(Goal)
        .filter(Goal.id == UUID(goal_id), Goal.user_id == user_id, Goal.is_active.is_(True))
        .first()
    )
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


def _to_response(g: Goal) -> GoalResponse:
    target = Decimal(str(g.target_amount))
    current = Decimal(str(g.current_amount or 0))
    pct = (current / target * 100).quantize(Decimal("0.01")) if target > 0 else Decimal("0")
    remaining = max(target - current, Decimal("0"))
    return GoalResponse(
        id=str(g.id),
        name=g.name,
        description=g.description,
        target_amount=target,
        current_amount=current,
        currency=g.currency,
        progress_pct=pct,
        remaining_amount=remaining,
        is_achieved=current >= target,
        target_date=g.target_date.isoformat() if g.target_date else None,
        achieved_at=g.achieved_at.isoformat() if g.achieved_at else None,
        created_at=g.created_at.isoformat(),
        updated_at=g.updated_at.isoformat(),
    )


# ============ Endpoints ============


@router.post("", status_code=status.HTTP_201_CREATED, response_model=GoalResponse)
async def create_goal(
    body: GoalCreate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = UUID(user_id)
    now = datetime.utcnow()
    initial = body.current_amount or Decimal("0")
    goal = Goal(
        user_id=uid,
        name=body.name,
        description=body.description,
        target_amount=body.target_amount,
        current_amount=initial,
        currency=body.currency,
        target_date=body.target_date,
        is_active=True,
        achieved_at=now if initial >= body.target_amount else None,
        created_at=now,
        updated_at=now,
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _to_response(goal)


@router.get("", response_model=List[GoalResponse])
async def list_goals(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = UUID(user_id)
    goals = (
        db.query(Goal)
        .filter(Goal.user_id == uid, Goal.is_active.is_(True))
        .order_by(Goal.created_at)
        .all()
    )
    return [_to_response(g) for g in goals]


@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: str,
    body: GoalUpdate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = UUID(user_id)
    goal = _get_goal_or_404(db, goal_id, uid)
    if body.name is not None:
        goal.name = body.name
    if body.target_amount is not None:
        goal.target_amount = body.target_amount
    if body.description is not None:
        goal.description = body.description
    if body.target_date is not None:
        goal.target_date = body.target_date
    goal.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(goal)
    return _to_response(goal)


@router.patch("/{goal_id}/deposit", response_model=GoalResponse)
async def deposit_to_goal(
    goal_id: str,
    body: DepositRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = UUID(user_id)
    goal = _get_goal_or_404(db, goal_id, uid)
    new_amount = Decimal(str(goal.current_amount or 0)) + body.amount
    goal.current_amount = new_amount
    goal.updated_at = datetime.utcnow()
    if new_amount >= Decimal(str(goal.target_amount)) and not goal.achieved_at:
        goal.achieved_at = datetime.utcnow()
    db.commit()
    db.refresh(goal)
    return _to_response(goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = UUID(user_id)
    goal = _get_goal_or_404(db, goal_id, uid)
    goal.is_active = False
    goal.updated_at = datetime.utcnow()
    db.commit()
