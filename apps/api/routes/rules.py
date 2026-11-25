"""
Auto-Categorization Rules & Internal Transfer Detection API for Mony.

Endpoints:
  GET    /rules           — list user's rules + detected transfers summary + quick presets
  POST   /rules           — create a rule (optionally apply retroactively immediately)
  PUT    /rules/{rule_id} — toggle/edit an existing rule
  DELETE /rules/{rule_id} — delete a rule
  POST   /rules/apply     — run all rules + internal transfer detection on existing transactions
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import CategoryRule, Transaction, TransactionType
from routes.categories import ensure_default_categories
from services.rules_engine import apply_rules_retroactively
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/rules", tags=["rules"])


PRESET_RULES = [
    {"pattern": "IFOOD", "action": "categorize", "category_name": "Alimentação", "label": "iFood → Alimentação"},
    {"pattern": "UBER", "action": "categorize", "category_name": "Transporte", "label": "Uber → Transporte"},
    {"pattern": "99APP", "action": "categorize", "category_name": "Transporte", "label": "99 → Transporte"},
    {"pattern": "NETFLIX", "action": "categorize", "category_name": "Assinaturas", "label": "Netflix → Assinaturas"},
    {"pattern": "SPOTIFY", "action": "categorize", "category_name": "Assinaturas", "label": "Spotify → Assinaturas"},
    {"pattern": "DROGASIL", "action": "categorize", "category_name": "Saúde", "label": "Drogasil → Saúde"},
    {"pattern": "PAGAMENTO DE FATURA", "action": "mark_transfer", "category_name": None, "label": "Fatura Cartão → Transferência"},
    {"pattern": "XP INVESTIMENTOS", "action": "mark_transfer", "category_name": None, "label": "Aporte XP → Transferência"},
]


class RuleCreateRequest(BaseModel):
    pattern: str = Field(min_length=2, max_length=120)
    match_field: str = Field(default="any", pattern=r"^(any|description|merchant)$")
    action: str = Field(default="categorize", pattern=r"^(categorize|mark_transfer)$")
    category_name: Optional[str] = Field(default=None, max_length=100)
    priority: int = Field(default=100, ge=1, le=999)
    apply_now: bool = True


class RuleUpdateRequest(BaseModel):
    pattern: Optional[str] = Field(default=None, min_length=2, max_length=120)
    match_field: Optional[str] = Field(default=None, pattern=r"^(any|description|merchant)$")
    action: Optional[str] = Field(default=None, pattern=r"^(categorize|mark_transfer)$")
    category_name: Optional[str] = Field(default=None, max_length=100)
    priority: Optional[int] = Field(default=None, ge=1, le=999)
    is_active: Optional[bool] = None


class ApplyRulesRequest(BaseModel):
    days_back: int = Field(default=365, ge=7, le=1825)


def _serialize(rule: CategoryRule) -> dict:
    return {
        "id": str(rule.id),
        "pattern": rule.pattern,
        "match_field": rule.match_field,
        "action": rule.action,
        "category_name": rule.category_name,
        "priority": rule.priority,
        "is_active": bool(rule.is_active),
        "matches_count": int(rule.matches_count or 0),
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
    }


@router.get("")
async def list_rules(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    rules = (
        db.query(CategoryRule)
        .filter(CategoryRule.user_id == uid)
        .order_by(CategoryRule.priority.asc(), CategoryRule.created_at.desc())
        .all()
    )
    transfers_count = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            Transaction.type == TransactionType.TRANSFER,
        )
        .count()
    )
    return {
        "rules": [_serialize(r) for r in rules],
        "presets": PRESET_RULES,
        "summary": {
            "total_rules": len(rules),
            "active_rules": sum(1 for r in rules if r.is_active),
            "total_matches": sum(int(r.matches_count or 0) for r in rules),
            "transfers_excluded": transfers_count,
        },
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_rule(
    payload: RuleCreateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    if payload.action == "categorize" and not (payload.category_name or "").strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe a categoria para regras de categorização.",
        )

    ensure_default_categories(db, uid)
    rule = CategoryRule(
        user_id=uid,
        pattern=payload.pattern.strip(),
        match_field=payload.match_field,
        action=payload.action,
        category_name=payload.category_name.strip() if payload.action == "categorize" and payload.category_name else None,
        priority=payload.priority,
        is_active=True,
    )
    db.add(rule)
    db.flush()

    applied = None
    if payload.apply_now:
        applied = apply_rules_retroactively(db, uid, days_back=365)

    db.commit()
    db.refresh(rule)
    return {"rule": _serialize(rule), "applied": applied}


@router.put("/{rule_id}")
async def update_rule(
    rule_id: str,
    payload: RuleUpdateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    rid = parse_uuid(rule_id, "rule_id")
    rule = (
        db.query(CategoryRule)
        .filter(CategoryRule.id == rid, CategoryRule.user_id == uid)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regra não encontrada.")

    if payload.pattern is not None:
        rule.pattern = payload.pattern.strip()
    if payload.match_field is not None:
        rule.match_field = payload.match_field
    if payload.action is not None:
        rule.action = payload.action
        if payload.action == "mark_transfer":
            rule.category_name = None
    if payload.category_name is not None and rule.action == "categorize":
        rule.category_name = payload.category_name.strip() or None
    if payload.priority is not None:
        rule.priority = payload.priority
    if payload.is_active is not None:
        rule.is_active = payload.is_active
    rule.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(rule)
    return {"rule": _serialize(rule)}


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    rid = parse_uuid(rule_id, "rule_id")
    rule = (
        db.query(CategoryRule)
        .filter(CategoryRule.id == rid, CategoryRule.user_id == uid)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Regra não encontrada.")
    db.delete(rule)
    db.commit()


@router.post("/apply")
async def apply_all_rules(
    payload: Optional[ApplyRulesRequest] = None,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    ensure_default_categories(db, uid)
    days_back = payload.days_back if payload else 365
    stats = apply_rules_retroactively(db, uid, days_back=days_back)
    db.commit()
    return stats
