"""
EPIC-014 Wave 2 — Couple/Family Shared Workspaces, PJ/MEI Management DRE,
and Expensify-style Reimbursements & Mileage (KM) Tracker.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
import secrets
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from database.base import get_db
from database.models import (
    ExpenseReport,
    ExpenseReportItem,
    SharedExpense,
    SharedMember,
    SharedWorkspace,
    Transaction,
    TransactionCategory,
    TransactionType,
    User,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


# ============ 1. Couple & Family Shared Workspaces (Optio / Despezzas / GranaZen) ============


class WorkspaceCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    split_mode: str = Field(default="equal", pattern=r"^(equal|proportional)$")
    owner_monthly_income: float = Field(default=5000.0, ge=0.0)


class WorkspaceUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    split_mode: Optional[str] = Field(default=None, pattern=r"^(equal|proportional)$")


class MemberCreateRequest(BaseModel):
    member_name: str = Field(min_length=2, max_length=120)
    member_email: Optional[str] = Field(default=None, max_length=200)
    role: str = Field(default="editor", pattern=r"^(owner|editor|viewer)$")
    monthly_income: float = Field(default=0.0, ge=0.0)


class SharedExpenseCreateRequest(BaseModel):
    paid_by_member_id: UUID
    description: str = Field(min_length=1, max_length=255)
    category: str = Field(default="Casa", max_length=100)
    amount: float = Field(gt=0.0)
    expense_date: Optional[date] = None


def _compute_settlement(ws: SharedWorkspace) -> dict[str, Any]:
    members = list(ws.members or [])
    expenses = list(ws.expenses or [])
    open_expenses = [e for e in expenses if not e.is_settled]
    total_open = round(sum(float(e.amount or 0) for e in open_expenses), 2)
    total_all = round(sum(float(e.amount or 0) for e in expenses), 2)

    if not members:
        return {"total_open": total_open, "total_all": total_all, "balances": [], "transfers": []}

    # Compute share ratio per member
    incomes = [float(m.monthly_income or 0) for m in members]
    sum_inc = sum(incomes)
    use_prop = ws.split_mode == "proportional" and sum_inc > 0

    paid_map: dict[str, float] = {str(m.id): 0.0 for m in members}
    for e in open_expenses:
        pid = str(e.paid_by_member_id)
        if pid in paid_map:
            paid_map[pid] += float(e.amount or 0)

    balances: list[dict[str, Any]] = []
    creditors: list[list[Any]] = []
    debtors: list[list[Any]] = []

    for m, inc in zip(members, incomes):
        share_ratio = (inc / sum_inc) if use_prop else (1.0 / len(members))
        fair_share = round(total_open * share_ratio, 2)
        paid = round(paid_map[str(m.id)], 2)
        net = round(paid - fair_share, 2)
        balances.append(
            {
                "member_id": str(m.id),
                "member_name": m.member_name,
                "role": m.role,
                "monthly_income": round(inc, 2),
                "share_pct": round(share_ratio * 100.0, 1),
                "paid": paid,
                "fair_share": fair_share,
                "net_balance": net,
            }
        )
        if net > 0.01:
            creditors.append([m.member_name, net])
        elif net < -0.01:
            debtors.append([m.member_name, -net])

    # Greedy minimal transfers ("Quem deve quanto a quem")
    transfers: list[dict[str, Any]] = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        d_name, d_amt = debtors[i]
        c_name, c_amt = creditors[j]
        pay = round(min(d_amt, c_amt), 2)
        if pay >= 0.01:
            transfers.append({"from": d_name, "to": c_name, "amount": pay})
        debtors[i][1] = round(d_amt - pay, 2)
        creditors[j][1] = round(c_amt - pay, 2)
        if debtors[i][1] < 0.01:
            i += 1
        if creditors[j][1] < 0.01:
            j += 1

    return {"total_open": total_open, "total_all": total_all, "balances": balances, "transfers": transfers}


def _serialize_workspace(ws: SharedWorkspace) -> dict[str, Any]:
    member_names = {str(m.id): m.member_name for m in (ws.members or [])}
    settlement = _compute_settlement(ws)
    return {
        "id": str(ws.id),
        "name": ws.name,
        "split_mode": ws.split_mode,
        "invite_code": ws.invite_code,
        "created_at": ws.created_at.isoformat() if ws.created_at else None,
        "members": [
            {
                "id": str(m.id),
                "member_name": m.member_name,
                "member_email": m.member_email,
                "role": m.role,
                "monthly_income": float(m.monthly_income or 0),
            }
            for m in (ws.members or [])
        ],
        "expenses": [
            {
                "id": str(e.id),
                "paid_by_member_id": str(e.paid_by_member_id),
                "paid_by_name": member_names.get(str(e.paid_by_member_id), "Membro"),
                "description": e.description,
                "category": e.category,
                "amount": float(e.amount or 0),
                "expense_date": e.expense_date.isoformat() if e.expense_date else "",
                "is_settled": bool(e.is_settled),
            }
            for e in sorted(ws.expenses or [], key=lambda x: x.expense_date or date.today(), reverse=True)
        ],
        "settlement": settlement,
    }


@router.get("")
async def list_shared_workspaces(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    rows = (
        db.query(SharedWorkspace)
        .options(joinedload(SharedWorkspace.members), joinedload(SharedWorkspace.expenses))
        .filter(SharedWorkspace.owner_id == uid)
        .order_by(SharedWorkspace.created_at.desc())
        .all()
    )
    return {"items": [_serialize_workspace(w) for w in rows]}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_shared_workspace(
    payload: WorkspaceCreateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    user = db.query(User).filter(User.id == uid).first()
    ws = SharedWorkspace(
        owner_id=uid,
        name=payload.name.strip(),
        split_mode=payload.split_mode,
        invite_code=f"MONY-{secrets.token_hex(4).upper()}",
    )
    db.add(ws)
    db.flush()

    owner_member = SharedMember(
        workspace_id=ws.id,
        user_id=uid,
        member_name=(user.full_name if user and user.full_name else "Você"),
        member_email=(user.email if user else None),
        role="owner",
        monthly_income=Decimal(f"{payload.owner_monthly_income:.2f}"),
    )
    db.add(owner_member)
    db.commit()
    db.refresh(ws)
    return _serialize_workspace(ws)


@router.patch("/{workspace_id}")
async def update_shared_workspace(
    workspace_id: UUID,
    payload: WorkspaceUpdateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    ws = (
        db.query(SharedWorkspace)
        .options(joinedload(SharedWorkspace.members), joinedload(SharedWorkspace.expenses))
        .filter(SharedWorkspace.id == workspace_id, SharedWorkspace.owner_id == uid)
        .first()
    )
    if not ws:
        raise HTTPException(status_code=404, detail="Espaço compartilhado não encontrado.")
    if payload.name:
        ws.name = payload.name.strip()
    if payload.split_mode:
        ws.split_mode = payload.split_mode
    db.commit()
    db.refresh(ws)
    return _serialize_workspace(ws)


@router.post("/{workspace_id}/members", status_code=status.HTTP_201_CREATED)
async def add_workspace_member(
    workspace_id: UUID,
    payload: MemberCreateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    ws = (
        db.query(SharedWorkspace)
        .options(joinedload(SharedWorkspace.members), joinedload(SharedWorkspace.expenses))
        .filter(SharedWorkspace.id == workspace_id, SharedWorkspace.owner_id == uid)
        .first()
    )
    if not ws:
        raise HTTPException(status_code=404, detail="Espaço não encontrado.")
    if len(ws.members or []) >= 5:
        raise HTTPException(status_code=400, detail="Limite de até 5 membros por espaço compartilhado.")

    m = SharedMember(
        workspace_id=ws.id,
        member_name=payload.member_name.strip(),
        member_email=payload.member_email.strip() if payload.member_email else None,
        role=payload.role,
        monthly_income=Decimal(f"{payload.monthly_income:.2f}"),
    )
    db.add(m)
    db.commit()
    db.refresh(ws)
    return _serialize_workspace(ws)


@router.delete("/{workspace_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_workspace_member(
    workspace_id: UUID,
    member_id: UUID,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    ws = db.query(SharedWorkspace).filter(SharedWorkspace.id == workspace_id, SharedWorkspace.owner_id == uid).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Espaço não encontrado.")
    m = db.query(SharedMember).filter(SharedMember.id == member_id, SharedMember.workspace_id == ws.id).first()
    if m and m.role != "owner":
        db.delete(m)
        db.commit()
    return None


@router.post("/{workspace_id}/expenses", status_code=status.HTTP_201_CREATED)
async def add_shared_expense(
    workspace_id: UUID,
    payload: SharedExpenseCreateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    ws = (
        db.query(SharedWorkspace)
        .options(joinedload(SharedWorkspace.members), joinedload(SharedWorkspace.expenses))
        .filter(SharedWorkspace.id == workspace_id, SharedWorkspace.owner_id == uid)
        .first()
    )
    if not ws:
        raise HTTPException(status_code=404, detail="Espaço não encontrado.")
    exp = SharedExpense(
        workspace_id=ws.id,
        paid_by_member_id=payload.paid_by_member_id,
        description=payload.description.strip(),
        category=payload.category.strip() or "Casa",
        amount=Decimal(f"{payload.amount:.2f}"),
        expense_date=payload.expense_date or date.today(),
    )
    db.add(exp)
    db.commit()
    db.refresh(ws)
    return _serialize_workspace(ws)


@router.post("/{workspace_id}/settle")
async def settle_workspace_expenses(
    workspace_id: UUID,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    ws = db.query(SharedWorkspace).filter(SharedWorkspace.id == workspace_id, SharedWorkspace.owner_id == uid).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Espaço não encontrado.")
    updated = (
        db.query(SharedExpense)
        .filter(SharedExpense.workspace_id == ws.id, SharedExpense.is_settled.is_(False))
        .update({SharedExpense.is_settled: True})
    )
    db.commit()
    return {"settled_count": updated}


# ============ 2. Modo PJ / MEI & DRE Gerencial (Olívia / Organizze) ============


FIXED_COST_CATEGORIES = {"moradia", "aluguel", "internet", "assinaturas", "serviços", "contabilidade", "software", "salários", "impostos"}


@router.get("/business/dre")
async def get_business_dre(
    year: int = Query(default_factory=lambda: date.today().year, ge=2020, le=2035),
    month: Optional[int] = Query(default=None, ge=1, le=12),
    scope: str = Query(default="all", pattern=r"^(all|pj|pf)$"),
    tax_rate_pct: float = Query(default=6.0, ge=0.0, le=40.0),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    EPIC-014 DRE Gerencial (Demonstrativo de Resultado do Exercício) for MEI / PJ / PF.
    Supports filtering by scope (`all` | `pj` tagged `#pj`/`#mei`/`#empresa` | `pf`).
    """
    uid = parse_uuid(user_id, "user_id")
    if month is not None:
        start_d = date(year, month, 1)
        end_d = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    else:
        start_d = date(year, 1, 1)
        end_d = date(year + 1, 1, 1)

    rows = (
        db.query(Transaction)
        .options(joinedload(Transaction.categories).joinedload(TransactionCategory.category))
        .filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            Transaction.transaction_date >= start_d,
            Transaction.transaction_date < end_d,
        )
        .all()
    )

    def _is_pj(t: Transaction) -> bool:
        tags_l = [str(x).lower() for x in (t.tags or [])] if isinstance(t.tags, list) else []
        desc_l = (t.description or "").lower()
        return any(k in tags_l for k in ("#pj", "#mei", "#empresa", "#negocio")) or any(
            k in desc_l for k in ("das mei", "nota fiscal", "nf-e", "cliente", "cnpj", "pro-labore", "pró-labore")
        )

    if scope == "pj":
        filtered = [t for t in rows if _is_pj(t)]
    elif scope == "pf":
        filtered = [t for t in rows if not _is_pj(t)]
    else:
        filtered = rows

    gross_revenue = 0.0
    fixed_costs = 0.0
    variable_expenses = 0.0
    by_cost_center: dict[str, dict[str, float]] = {}
    monthly_map: dict[int, dict[str, float]] = {m: {"revenue": 0.0, "expenses": 0.0} for m in range(1, 13)}

    for t in filtered:
        if t.type == TransactionType.TRANSFER:
            continue
        amt = float(t.amount or 0)
        m_idx = t.transaction_date.month if t.transaction_date else 1
        cname = t.categories[0].category.name if t.categories and t.categories[0].category else "Outros"

        if t.type in (TransactionType.INCOME, TransactionType.REFUND):
            gross_revenue += amt
            monthly_map[m_idx]["revenue"] += amt
        elif t.type == TransactionType.EXPENSE:
            monthly_map[m_idx]["expenses"] += amt
            if cname.lower() in FIXED_COST_CATEGORIES or t.is_recurring:
                fixed_costs += amt
            else:
                variable_expenses += amt
            cc = by_cost_center.setdefault(cname, {"category": cname, "total": 0.0, "count": 0})
            cc["total"] = round(cc["total"] + amt, 2)
            cc["count"] += 1

    estimated_taxes = round(gross_revenue * (tax_rate_pct / 100.0), 2)
    net_revenue = round(gross_revenue - estimated_taxes, 2)
    contribution_margin = round(net_revenue - variable_expenses, 2)
    ebitda_net_profit = round(contribution_margin - fixed_costs, 2)
    net_margin_pct = round((ebitda_net_profit / gross_revenue) * 100.0, 1) if gross_revenue > 0 else 0.0

    month_abbr = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    monthly_series = [
        {
            "month": m,
            "label": month_abbr[m - 1],
            "revenue": round(monthly_map[m]["revenue"], 2),
            "expenses": round(monthly_map[m]["expenses"], 2),
            "profit": round(monthly_map[m]["revenue"] * (1 - tax_rate_pct / 100.0) - monthly_map[m]["expenses"], 2),
        }
        for m in range(1, 13)
    ]

    return {
        "year": year,
        "month": month,
        "scope": scope,
        "tax_rate_pct": tax_rate_pct,
        "transactions_count": len(filtered),
        "dre": {
            "gross_revenue": round(gross_revenue, 2),
            "estimated_taxes": estimated_taxes,
            "net_revenue": net_revenue,
            "variable_expenses": round(variable_expenses, 2),
            "contribution_margin": contribution_margin,
            "fixed_costs": round(fixed_costs, 2),
            "net_profit": ebitda_net_profit,
            "net_margin_pct": net_margin_pct,
        },
        "cost_centers": sorted(by_cost_center.values(), key=lambda x: x["total"], reverse=True)[:10],
        "monthly_series": monthly_series,
    }


# ============ 3. Reimbursements & Mileage (KM) Reports (Expensify style) ============


class ReportCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    client_or_company: Optional[str] = Field(default=None, max_length=180)
    km_rate: float = Field(default=1.50, gt=0.0, le=50.0)
    notes: Optional[str] = Field(default=None, max_length=1000)


class ReportItemCreateRequest(BaseModel):
    description: str = Field(min_length=1, max_length=255)
    category: str = Field(default="Viagem", max_length=100)
    amount: Optional[float] = Field(default=None, ge=0.0)
    item_date: Optional[date] = None
    is_mileage: bool = False
    km_distance: float = Field(default=0.0, ge=0.0)


class ReportStatusUpdate(BaseModel):
    status: str = Field(pattern=r"^(draft|submitted|reimbursed)$")


def _serialize_report(r: ExpenseReport) -> dict[str, Any]:
    items = list(r.items or [])
    total = round(sum(float(i.amount or 0) for i in items), 2)
    total_km = round(sum(float(i.km_distance or 0) for i in items if i.is_mileage), 1)
    return {
        "id": str(r.id),
        "title": r.title,
        "client_or_company": r.client_or_company,
        "status": r.status,
        "km_rate": float(r.km_rate or 1.5),
        "notes": r.notes,
        "total_amount": total,
        "total_km": total_km,
        "items_count": len(items),
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "items": [
            {
                "id": str(i.id),
                "description": i.description,
                "category": i.category,
                "amount": float(i.amount or 0),
                "item_date": i.item_date.isoformat() if i.item_date else "",
                "is_mileage": bool(i.is_mileage),
                "km_distance": float(i.km_distance or 0),
            }
            for i in sorted(items, key=lambda x: x.item_date or date.today(), reverse=True)
        ],
    }


@router.get("/reimbursements")
async def list_reimbursement_reports(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    rows = (
        db.query(ExpenseReport)
        .options(joinedload(ExpenseReport.items))
        .filter(ExpenseReport.user_id == uid)
        .order_by(ExpenseReport.created_at.desc())
        .all()
    )
    serialized = [_serialize_report(r) for r in rows]
    pending_total = round(sum(r["total_amount"] for r in serialized if r["status"] != "reimbursed"), 2)
    reimbursed_total = round(sum(r["total_amount"] for r in serialized if r["status"] == "reimbursed"), 2)
    return {"pending_total": pending_total, "reimbursed_total": reimbursed_total, "items": serialized}


@router.post("/reimbursements", status_code=status.HTTP_201_CREATED)
async def create_reimbursement_report(
    payload: ReportCreateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    rep = ExpenseReport(
        user_id=uid,
        title=payload.title.strip(),
        client_or_company=payload.client_or_company.strip() if payload.client_or_company else None,
        km_rate=Decimal(f"{payload.km_rate:.2f}"),
        notes=payload.notes,
    )
    db.add(rep)
    db.commit()
    db.refresh(rep)
    return _serialize_report(rep)


@router.post("/reimbursements/{report_id}/items", status_code=status.HTTP_201_CREATED)
async def add_reimbursement_item(
    report_id: UUID,
    payload: ReportItemCreateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    rep = (
        db.query(ExpenseReport)
        .options(joinedload(ExpenseReport.items))
        .filter(ExpenseReport.id == report_id, ExpenseReport.user_id == uid)
        .first()
    )
    if not rep:
        raise HTTPException(status_code=404, detail="Relatório de reembolso não encontrado.")

    computed_amount = (
        round(float(payload.km_distance) * float(rep.km_rate or 1.5), 2)
        if payload.is_mileage
        else round(float(payload.amount or 0), 2)
    )
    item = ExpenseReportItem(
        report_id=rep.id,
        description=payload.description.strip(),
        category="Quilometragem (KM)" if payload.is_mileage else (payload.category.strip() or "Viagem"),
        amount=Decimal(f"{computed_amount:.2f}"),
        item_date=payload.item_date or date.today(),
        is_mileage=payload.is_mileage,
        km_distance=Decimal(f"{payload.km_distance:.2f}"),
    )
    db.add(item)
    rep.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rep)
    return _serialize_report(rep)


@router.patch("/reimbursements/{report_id}/status")
async def update_reimbursement_status(
    report_id: UUID,
    payload: ReportStatusUpdate,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    rep = (
        db.query(ExpenseReport)
        .options(joinedload(ExpenseReport.items))
        .filter(ExpenseReport.id == report_id, ExpenseReport.user_id == uid)
        .first()
    )
    if not rep:
        raise HTTPException(status_code=404, detail="Relatório não encontrado.")
    rep.status = payload.status
    rep.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rep)
    return _serialize_report(rep)


@router.delete("/reimbursements/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reimbursement_report(
    report_id: UUID,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    rep = db.query(ExpenseReport).filter(ExpenseReport.id == report_id, ExpenseReport.user_id == uid).first()
    if rep:
        db.delete(rep)
        db.commit()
    return None
