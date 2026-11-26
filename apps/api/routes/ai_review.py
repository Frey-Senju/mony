"""
Proactive AI Review & Suggestions API endpoints for Mony (EPIC-005 · Stories 5.3, 5.5, 5.7).

Endpoints:
  POST /ai/review/run                — run proactive AI audit across transactions, cards, accounts, categories & budgets
  GET  /ai/suggestions               — list pending/resolved suggestions (filterable by module & status)
  POST /ai/suggestions/{id}/apply    — apply a single suggestion atomically
  POST /ai/suggestions/{id}/dismiss  — dismiss a suggestion (memorized so it doesn't re-appear)
  POST /ai/suggestions/apply-bulk    — apply selected or high-confidence pending suggestions in 1 click
  GET  /budgets/ai-suggestions       — proactive budget plan grounded in real avg monthly income & spend
  GET  /accounts/audit               — Open Finance completeness audit for accounts & categories
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Account,
    AISuggestion,
    Category,
    OFLinkedAccount,
    Transaction,
    TransactionCategory,
    TransactionType,
)
from services.ai_review_engine import (
    apply_ai_suggestion,
    compute_budget_recommendations,
    run_proactive_review,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(tags=["ai-review"])


class BulkApplyRequest(BaseModel):
    suggestion_ids: Optional[list[str]] = None
    min_confidence: float = Field(default=0.85, ge=0.5, le=1.0)
    module: Optional[str] = None


def _serialize_suggestion(s: AISuggestion) -> dict:
    return {
        "id": str(s.id),
        "suggestion_type": s.suggestion_type,
        "module": s.module,
        "target_entity_type": s.target_entity_type,
        "target_entity_id": str(s.target_entity_id) if s.target_entity_id else None,
        "title": s.title,
        "reason": s.reason,
        "current_snapshot": s.current_snapshot,
        "proposed_patch": s.proposed_patch,
        "confidence": float(s.confidence or 0.85),
        "status": s.status,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "resolved_at": s.resolved_at.isoformat() if s.resolved_at else None,
    }


@router.post("/ai/review/run")
async def trigger_proactive_review(
    lookback_days: int = Query(default=120, ge=7, le=365),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    stats = run_proactive_review(db, uid, lookback_days=lookback_days)
    db.commit()
    pending_count = (
        db.query(AISuggestion)
        .filter(AISuggestion.user_id == uid, AISuggestion.status == "pending")
        .count()
    )
    return {**stats, "total_pending": pending_count}


@router.get("/ai/suggestions")
async def list_ai_suggestions(
    module: Optional[str] = Query(default=None),
    status_filter: str = Query(default="pending", alias="status"),
    auto_run: bool = Query(default=False),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    if auto_run:
        run_proactive_review(db, uid)
        db.commit()

    q = db.query(AISuggestion).filter(AISuggestion.user_id == uid)
    if status_filter and status_filter != "all":
        q = q.filter(AISuggestion.status == status_filter)
    if module:
        q = q.filter(AISuggestion.module == module)

    items = q.order_by(AISuggestion.confidence.desc(), AISuggestion.created_at.desc()).limit(100).all()

    all_pending = (
        db.query(AISuggestion.module)
        .filter(AISuggestion.user_id == uid, AISuggestion.status == "pending")
        .all()
    )
    counts_by_module: dict[str, int] = {}
    for (mod,) in all_pending:
        counts_by_module[mod] = counts_by_module.get(mod, 0) + 1

    return {
        "items": [_serialize_suggestion(s) for s in items],
        "total_pending": len(all_pending),
        "counts_by_module": counts_by_module,
    }


@router.post("/ai/suggestions/{suggestion_id}/apply")
async def apply_single_suggestion(
    suggestion_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    sid = parse_uuid(suggestion_id, "suggestion_id")
    sug = (
        db.query(AISuggestion)
        .filter(AISuggestion.id == sid, AISuggestion.user_id == uid)
        .first()
    )
    if not sug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sugestão não encontrada.")
    res = apply_ai_suggestion(db, uid, sug)
    db.commit()
    return res


@router.post("/ai/suggestions/{suggestion_id}/dismiss")
async def dismiss_single_suggestion(
    suggestion_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    sid = parse_uuid(suggestion_id, "suggestion_id")
    sug = (
        db.query(AISuggestion)
        .filter(AISuggestion.id == sid, AISuggestion.user_id == uid)
        .first()
    )
    if not sug:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sugestão não encontrada.")
    sug.status = "dismissed"
    sug.resolved_at = datetime.utcnow()
    db.commit()
    return {"dismissed": True, "suggestion_id": str(sug.id)}


@router.post("/ai/suggestions/apply-bulk")
async def apply_bulk_suggestions(
    payload: BulkApplyRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    q = db.query(AISuggestion).filter(AISuggestion.user_id == uid, AISuggestion.status == "pending")
    if payload.suggestion_ids:
        uuids = [parse_uuid(i, "suggestion_id") for i in payload.suggestion_ids]
        q = q.filter(AISuggestion.id.in_(uuids))
    else:
        q = q.filter(AISuggestion.confidence >= payload.min_confidence)
    if payload.module:
        q = q.filter(AISuggestion.module == payload.module)

    targets = q.all()
    applied = 0
    for sug in targets:
        apply_ai_suggestion(db, uid, sug)
        applied += 1
    db.commit()
    return {"applied": applied}


@router.get("/budgets/ai-suggestions")
async def get_budget_ai_suggestions(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    return compute_budget_recommendations(db, uid)


@router.get("/accounts/audit")
async def get_accounts_and_categories_audit(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Open Finance completeness & health audit for accounts and categories (Story 5.7)."""
    uid = parse_uuid(user_id, "user_id")
    run_proactive_review(db, uid)
    db.commit()

    accounts = db.query(Account).filter(Account.user_id == uid, Account.deleted_at.is_(None)).all()
    linked = (
        db.query(OFLinkedAccount)
        .filter(OFLinkedAccount.user_id == uid, OFLinkedAccount.is_active.is_(True))
        .all()
    )
    categories = db.query(Category).filter(Category.user_id == uid, Category.deleted_at.is_(None)).all()

    linked_acct_ids = {l.mony_account_id for l in linked if l.mony_account_id}
    of_accounts_synced = sum(1 for a in accounts if a.id in linked_acct_ids)

    # Count transactions still sitting in "Outros"
    outros_cat = next((c for c in categories if c.name.lower() == "outros"), None)
    outros_tx_count = 0
    if outros_cat:
        outros_tx_count = (
            db.query(TransactionCategory)
            .join(Transaction, Transaction.id == TransactionCategory.transaction_id)
            .filter(
                Transaction.user_id == uid,
                Transaction.deleted_at.is_(None),
                Transaction.type == TransactionType.EXPENSE,
                TransactionCategory.category_id == outros_cat.id,
            )
            .count()
        )

    pending_sugs = (
        db.query(AISuggestion)
        .filter(
            AISuggestion.user_id == uid,
            AISuggestion.status == "pending",
            AISuggestion.module.in_(["accounts", "categories"]),
        )
        .order_by(AISuggestion.confidence.desc())
        .all()
    )

    return {
        "accounts_total": len(accounts),
        "open_finance_linked_accounts": len(linked),
        "accounts_synced_with_open_finance": of_accounts_synced,
        "categories_total": len(categories),
        "outros_expenses_count": outros_tx_count,
        "suggestions": [_serialize_suggestion(s) for s in pending_sugs],
    }
