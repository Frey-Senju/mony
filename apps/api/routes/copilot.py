"""
Mony IA 2.0 — Active Copilot (1-Click Action Execution) & Real-Data "What-If" Scenario Planner
(EPIC-006 Stories 6.4 & 6.5).

Endpoints:
- POST /ai/copilot/plan     -> Parses natural language into a safe preview action plan
- POST /ai/copilot/execute  -> Executes a user-confirmed action atomically
- POST /ai/what-if          -> Runs real-data "E se...?" simulations (12-60m curve + verdict)
"""

from __future__ import annotations

import json
import os
import re
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Account,
    AccountType,
    Budget,
    Category,
    CategoryRule,
    Debt,
    Goal,
    InvestmentAsset,
    RecurringRule,
    Transaction,
    TransactionCategory,
    TransactionType,
    ValuerWatchlistItem,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/ai", tags=["ai-copilot"])


class CopilotPlanRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=1000)


class CopilotExecuteRequest(BaseModel):
    action_type: str = Field(..., max_length=60)
    payload: dict[str, Any] = Field(default_factory=dict)


class WhatIfRequest(BaseModel):
    scenario_type: str = Field(default="finance_purchase", max_length=40)
    question: Optional[str] = Field(default=None, max_length=500)
    amount: float = Field(default=50000.0, ge=0, le=50_000_000)
    monthly_delta: float = Field(default=1000.0, ge=-500_000, le=500_000)
    months: int = Field(default=36, ge=3, le=360)
    annual_rate_pct: float = Field(default=12.0, ge=0, le=120)


def _extract_brl(text: str) -> Optional[float]:
    m = re.search(r"r\$\s*([\d\.,]+)|(\d+(?:[\.,]\d{1,2})?)\s*(?:reais|k|mil)\b|(?:\bde\s+)(\d+(?:[\.,]\d{1,2})?)", text, re.I)
    if not m:
        m2 = re.search(r"\b(\d+(?:[\.,]\d{1,2})?)\b", text)
        raw = m2.group(1) if m2 else None
        mult = 1.0
    else:
        raw = m.group(1) or m.group(2) or m.group(3)
        mult = 1000.0 if re.search(r"(?:k|mil)\b", m.group(0), re.I) else 1.0
    if not raw:
        return None
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw:
        raw = raw.replace(",", ".")
    try:
        return round(float(raw) * mult, 2)
    except ValueError:
        return None


def _match_category_name(text: str, user_categories: list[str]) -> str:
    low = text.lower()
    for c in user_categories:
        if c.lower() in low:
            return c
    # Common PT-BR aliases
    aliases = {
        "alimenta": "Alimentação",
        "mercado": "Alimentação",
        "restaurante": "Alimentação",
        "ifood": "Alimentação",
        "transport": "Transporte",
        "uber": "Transporte",
        "combust": "Transporte",
        "moradia": "Moradia",
        "aluguel": "Moradia",
        "saude": "Saúde",
        "saúde": "Saúde",
        "lazer": "Lazer",
        "trabalho": "Trabalho",
        "educa": "Educação",
        "viagem": "Viagem",
    }
    for k, v in aliases.items():
        if k in low:
            return v
    return "Outros"


@router.post("/copilot/plan")
async def plan_copilot_action(
    req: CopilotPlanRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Parses a natural-language Portuguese command into a structured action preview
    that requires explicit 1-click confirmation before mutating data (Story 6.4).
    """
    uid = parse_uuid(user_id, "user_id")
    text = req.prompt.strip()
    low = text.lower()

    cats = db.query(Category).filter(Category.user_id == uid, Category.deleted_at.is_(None)).all()
    cat_names = [c.name for c in cats] or ["Alimentação", "Transporte", "Moradia", "Saúde", "Lazer", "Trabalho", "Outros"]

    # 1. Create / update Budget
    if any(w in low for w in ("budget", "orçamento", "orcamento", "limite de gasto", "limite para")):
        amt = _extract_brl(text) or 500.0
        cat = _match_category_name(text, cat_names)
        return {
            "action_type": "create_budget",
            "requires_confirmation": True,
            "summary": f"Definir budget mensal de R$ {amt:,.2f} para {cat}".replace(",", "X").replace(".", ",").replace("X", "."),
            "preview_details": [
                f"Categoria: {cat}",
                f"Limite mensal: R$ {amt:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
                "Se já existir um budget para esta categoria, o valor será atualizado.",
            ],
            "payload": {"category": cat, "limit_amount": amt},
        }

    # 2. Create Goal
    if any(w in low for w in ("criar meta", "nova meta", "meta de", "economizar para", "juntar")):
        amt = _extract_brl(text) or 5000.0
        m_name = re.search(r"(?:meta(?:\s+de)?|para)\s+([a-zA-ZÀ-ÿ0-9\s]{3,40}?)(?:\s+de\s+r?\$|\s+no\s+valor|$)", text, re.I)
        name = m_name.group(1).strip().title() if m_name else "Nova Meta Financeira"
        return {
            "action_type": "create_goal",
            "requires_confirmation": True,
            "summary": f"Criar meta \"{name}\" de R$ {amt:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
            "preview_details": [
                f"Nome da meta: {name}",
                f"Objetivo: R$ {amt:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
            ],
            "payload": {"name": name, "target_amount": amt},
        }

    # 3. Recategorize merchant transactions
    if any(w in low for w in ("mover todas", "muda todas", "mudar todas", "recategoriz", "trocar categoria")):
        cat = _match_category_name(text, cat_names)
        m_merch = re.search(r"(?:da|do|de|em)\s+([a-zA-ZÀ-ÿ0-9\.\-]{2,30})", text, re.I)
        keyword = m_merch.group(1).strip() if m_merch else ""
        # Exclude common filler words
        if keyword.lower() in ("todas", "todos", "compras", "gastos", "transacoes", "transações", "mes", "mês"):
            m_merch2 = re.search(r"(?:compras|gastos|transações|transacoes)\s+(?:da|do|de|na|no)\s+([a-zA-ZÀ-ÿ0-9\.\-]{2,30})", text, re.I)
            keyword = m_merch2.group(1).strip() if m_merch2 else keyword
        return {
            "action_type": "recategorize_merchant",
            "requires_confirmation": True,
            "summary": f"Recategorizar lançamentos com \"{keyword or 'termo'}\" para {cat}",
            "preview_details": [
                f"Palavra-chave/Estabelecimento: {keyword or '(informe no comando)'}",
                f"Nova categoria: {cat}",
                "Também cria uma regra automática opcional para lançamentos futuros.",
            ],
            "payload": {"keyword": keyword, "category_name": cat, "also_create_rule": True},
        }

    # 4. Create automatic rule
    if any(w in low for w in ("criar regra", "nova regra", "sempre categoriz", "regra para")):
        cat = _match_category_name(text, cat_names)
        m_kw = re.search(r"(?:para|quando|com|contendo)\s+[\"']?([a-zA-ZÀ-ÿ0-9\.\-\s]{2,30})[\"']?(?:\s+como|\s+para|\s+em|$)", text, re.I)
        kw = m_kw.group(1).strip() if m_kw else "Estabelecimento"
        return {
            "action_type": "create_rule",
            "requires_confirmation": True,
            "summary": f"Criar regra automática: \"{kw}\" → {cat}",
            "preview_details": [
                f"Padrão: contém \"{kw}\"",
                f"Categoria automática: {cat}",
            ],
            "payload": {"pattern": kw, "category_name": cat},
        }

    # 5. Create recurring expense/income
    if any(w in low for w in ("recorrência", "recorrencia", "conta fixa", "todo mês", "todo mes", "assinatura")):
        amt = _extract_brl(text) or 99.9
        cat = _match_category_name(text, cat_names)
        m_day = re.search(r"dia\s+(\d{1,2})", low)
        day = min(28, max(1, int(m_day.group(1)))) if m_day else 10
        is_inc = any(w in low for w in ("salário", "salario", "receita", "recebo"))
        return {
            "action_type": "create_recurring",
            "requires_confirmation": True,
            "summary": f"Cadastrar recorrência mensal de R$ {amt:,.2f} (todo dia {day})".replace(",", "X").replace(".", ",").replace("X", "."),
            "preview_details": [
                f"Descrição: {text[:60]}",
                f"Tipo: {'Receita Fixa' if is_inc else 'Despesa Fixa'}",
                f"Valor: R$ {amt:,.2f} · Dia {day} · {cat}".replace(",", "X").replace(".", ",").replace("X", "."),
            ],
            "payload": {
                "description": text[:80],
                "amount": amt,
                "type": "income" if is_inc else "expense",
                "category_name": cat,
                "day_of_month": day,
            },
        }

    # 6.5 Add ticker to Mony Valuer Watchlist with ceiling price (EPIC-016)
    if any(w in low for w in ("watchlist", "monitorar", "preço-teto", "preco-teto", "preco teto", "preço teto", "teto")):
        m_tkr = re.search(r"\b([A-Za-z]{4}\d{1,2})\b", text)
        if m_tkr:
            tkr = m_tkr.group(1).upper()
            amt = _extract_brl(text) or 25.0
            return {
                "action_type": "add_valuer_watchlist",
                "requires_confirmation": True,
                "summary": f"Monitorar {tkr} na Watchlist Valuer com teto de R$ {amt:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
                "preview_details": [
                    f"Ticker B3: {tkr}",
                    f"Preço-Teto alvo: R$ {amt:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
                    "Você receberá alerta automático (Push/E-mail/Webhook) quando negociar abaixo do teto.",
                ],
                "payload": {"ticker": tkr, "target_price": amt},
            }

    # 6.6 Amortize active debt (EPIC-016)
    if any(w in low for w in ("amortizar", "abater dívida", "abater divida", "pagar parcela da dívida")):
        amt = _extract_brl(text)
        if amt and amt > 0:
            active_debt = (
                db.query(Debt)
                .filter(Debt.user_id == uid, Debt.deleted_at.is_(None), Debt.is_active.is_(True), Debt.current_balance > 0)
                .order_by(Debt.interest_rate_monthly.desc())
                .first()
            )
            debt_name = active_debt.name if active_debt else "Dívida de maior juros"
            return {
                "action_type": "amortize_debt",
                "requires_confirmation": True,
                "summary": f"Amortizar R$ {amt:,.2f} em \"{debt_name}\"".replace(",", "X").replace(".", ",").replace("X", "."),
                "preview_details": [
                    f"Dívida alvo (Avalanche): {debt_name}",
                    f"Valor da amortização: R$ {amt:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
                    "Reduz imediatamente o saldo devedor e antecipa sua Debt-Free Date.",
                ],
                "payload": {"debt_id": str(active_debt.id) if active_debt else None, "amount": amt},
            }

    # 6. Register quick transaction
    if any(w in low for w in ("gastei", "paguei", "comprei", "recebi", "lança", "lanca", "registrar")):
        amt = _extract_brl(text)
        if amt and amt > 0:
            is_inc = any(w in low for w in ("recebi", "ganhei", "salário", "salario", "entrada"))
            cat = _match_category_name(text, cat_names)
            pm = "pix" if "pix" in low else ("credit_card" if "crédito" in low or "credito" in low or "cartão" in low else "other")
            return {
                "action_type": "create_transaction",
                "requires_confirmation": True,
                "summary": f"Registrar {'receita' if is_inc else 'despesa'} de R$ {amt:,.2f} em {cat}".replace(",", "X").replace(".", ",").replace("X", "."),
                "preview_details": [
                    f"Descrição: {text[:80]}",
                    f"Valor: R$ {amt:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."),
                    f"Categoria: {cat} · Pagamento: {pm}",
                ],
                "payload": {
                    "description": text[:100],
                    "amount": amt,
                    "type": "income" if is_inc else "expense",
                    "category_name": cat,
                    "payment_method": pm,
                    "transaction_date": date.today().isoformat(),
                },
            }

    return {
        "action_type": "answer_only",
        "requires_confirmation": False,
        "summary": "Nenhuma ação mutável detectada — use o chat normal da Mony IA para consultas.",
        "preview_details": [
            "Exemplos de comandos do Copiloto:",
            "• \"Criar budget de R$ 900 para Alimentação\"",
            "• \"Criar meta Reserva de R$ 25000\"",
            "• \"Mudar todas as compras da Uber para Trabalho\"",
            "• \"Paguei R$ 145 no PIX no mercado\"",
        ],
        "payload": {},
    }


@router.post("/copilot/execute")
async def execute_copilot_action(
    req: CopilotExecuteRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Executes a confirmed Copilot action safely scoped to ``user_id`` (Story 6.4)."""
    uid = parse_uuid(user_id, "user_id")
    act = req.action_type
    p = req.payload or {}

    if act == "create_budget":
        cat = str(p.get("category") or "Outros").strip()
        amt = float(p.get("limit_amount") or 0)
        if amt <= 0:
            raise HTTPException(status_code=400, detail="Valor do budget deve ser positivo.")
        existing = (
            db.query(Budget)
            .filter(Budget.user_id == uid, Budget.category.ilike(cat))
            .first()
        )
        if existing:
            existing.limit_amount = Decimal(str(amt))
            db.commit()
            return {"ok": True, "message": f"Budget de {cat} atualizado para R$ {amt:,.2f}!", "entity_id": str(existing.id)}
        b = Budget(id=uuid4(), user_id=uid, category=cat, limit_amount=Decimal(str(amt)))
        db.add(b)
        db.commit()
        return {"ok": True, "message": f"Budget de {cat} (R$ {amt:,.2f}) criado com sucesso!", "entity_id": str(b.id)}

    if act == "create_goal":
        name = str(p.get("name") or "Meta Financeira").strip()
        amt = float(p.get("target_amount") or 0)
        if amt <= 0:
            raise HTTPException(status_code=400, detail="Valor da meta deve ser positivo.")
        g = Goal(id=uuid4(), user_id=uid, name=name, target_amount=Decimal(str(amt)), current_amount=Decimal("0"))
        db.add(g)
        db.commit()
        return {"ok": True, "message": f"Meta \"{name}\" de R$ {amt:,.2f} criada com sucesso!", "entity_id": str(g.id)}

    if act == "create_rule":
        pattern = str(p.get("pattern") or "").strip()
        cat_name = str(p.get("category_name") or "Outros").strip()
        if not pattern:
            raise HTTPException(status_code=400, detail="Informe o padrão da regra.")
        r = CategoryRule(
            id=uuid4(),
            user_id=uid,
            name=f"Auto: {pattern} → {cat_name}",
            pattern=pattern,
            match_type="contains",
            category_name=cat_name,
            is_active=True,
        )
        db.add(r)
        db.commit()
        return {"ok": True, "message": f"Regra automática criada: \"{pattern}\" → {cat_name}!", "entity_id": str(r.id)}

    if act == "recategorize_merchant":
        kw = str(p.get("keyword") or "").strip()
        cat_name = str(p.get("category_name") or "Outros").strip()
        if not kw:
            raise HTTPException(status_code=400, detail="Informe o nome do estabelecimento.")
        cat = db.query(Category).filter(Category.user_id == uid, Category.name.ilike(cat_name), Category.deleted_at.is_(None)).first()
        if not cat:
            cat = Category(id=uuid4(), user_id=uid, name=cat_name, color="#0071E3", icon="🏷️", is_system=False)
            db.add(cat)
            db.flush()

        txs = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == uid,
                Transaction.deleted_at.is_(None),
                (Transaction.description.ilike(f"%{kw}%")) | (Transaction.merchant_name.ilike(f"%{kw}%")),
            )
            .all()
        )
        updated = 0
        for tx in txs:
            db.query(TransactionCategory).filter(TransactionCategory.transaction_id == tx.id).delete()
            db.add(TransactionCategory(transaction_id=tx.id, category_id=cat.id, percentage=Decimal("100.00")))
            tx.user_edited = True
            updated += 1
        if p.get("also_create_rule"):
            db.add(CategoryRule(
                id=uuid4(),
                user_id=uid,
                name=f"Copiloto: {kw} → {cat.name}",
                pattern=kw,
                match_type="contains",
                category_name=cat.name,
                is_active=True,
            ))
        db.commit()
        return {"ok": True, "message": f"{updated} transação(ões) com \"{kw}\" movida(s) para {cat.name}!", "updated_count": updated}

    if act == "create_recurring":
        acct = db.query(Account).filter(Account.user_id == uid, Account.deleted_at.is_(None)).order_by(Account.is_default.desc()).first()
        if not acct:
            raise HTTPException(status_code=400, detail="Crie ao menos uma conta antes de cadastrar recorrências.")
        rule = RecurringRule(
            id=uuid4(),
            user_id=uid,
            account_id=acct.id,
            type=TransactionType.INCOME if p.get("type") == "income" else TransactionType.EXPENSE,
            amount=Decimal(str(p.get("amount") or 0)),
            description=str(p.get("description") or "Conta Fixa")[:255],
            category_name=str(p.get("category_name") or "Outros"),
            payment_method="boleto",
            frequency="monthly",
            day_of_month=int(p.get("day_of_month") or 10),
            is_active=True,
            source="copilot",
        )
        db.add(rule)
        db.commit()
        return {"ok": True, "message": f"Recorrência \"{rule.description}\" cadastrada!", "entity_id": str(rule.id)}

    if act == "create_transaction":
        acct = db.query(Account).filter(Account.user_id == uid, Account.deleted_at.is_(None)).order_by(Account.is_default.desc()).first()
        if not acct:
            raise HTTPException(status_code=400, detail="Crie ao menos uma conta antes de lançar transações.")
        amt = Decimal(str(p.get("amount") or 0))
        if amt <= 0:
            raise HTTPException(status_code=400, detail="Valor deve ser positivo.")
        tx_type = TransactionType.INCOME if p.get("type") == "income" else TransactionType.EXPENSE
        tx_date = date.fromisoformat(str(p.get("transaction_date") or date.today().isoformat()))
        tx = Transaction(
            id=uuid4(),
            user_id=uid,
            account_id=acct.id,
            type=tx_type,
            amount=amt,
            description=str(p.get("description") or "Lançamento Mony IA")[:255],
            transaction_date=tx_date,
            payment_method=str(p.get("payment_method") or "other"),
            source="copilot",
        )
        db.add(tx)
        if tx_type == TransactionType.INCOME:
            acct.balance = (acct.balance or Decimal("0")) + amt
        else:
            acct.balance = (acct.balance or Decimal("0")) - amt
        cat_name = str(p.get("category_name") or "Outros")
        cat = db.query(Category).filter(Category.user_id == uid, Category.name.ilike(cat_name), Category.deleted_at.is_(None)).first()
        if cat:
            db.flush()
            db.add(TransactionCategory(transaction_id=tx.id, category_id=cat.id, percentage=Decimal("100.00")))
        db.commit()
        return {"ok": True, "message": f"Lançamento \"{tx.description}\" (R$ {float(amt):,.2f}) salvo em {acct.name}!", "entity_id": str(tx.id)}

    if act == "add_valuer_watchlist":
        tkr = str(p.get("ticker") or "").strip().upper()[:24]
        target = float(p.get("target_price") or 0)
        if not tkr or target <= 0:
            raise HTTPException(status_code=400, detail="Informe ticker e preço-teto positivo.")
        existing = (
            db.query(ValuerWatchlistItem)
            .filter(ValuerWatchlistItem.user_id == uid, ValuerWatchlistItem.ticker == tkr)
            .first()
        )
        if existing:
            existing.target_price = Decimal(str(target))
            db.commit()
            return {"ok": True, "message": f"Preço-teto de {tkr} atualizado para R$ {target:,.2f} na Watchlist Valuer!", "entity_id": str(existing.id)}
        item = ValuerWatchlistItem(
            id=uuid4(),
            user_id=uid,
            ticker=tkr,
            name=tkr,
            target_price=Decimal(str(target)),
            notes="Adicionado via Mony IA Copiloto",
        )
        db.add(item)
        db.commit()
        return {"ok": True, "message": f"{tkr} adicionado à Watchlist Valuer (teto R$ {target:,.2f})!", "entity_id": str(item.id)}

    if act == "amortize_debt":
        amt = Decimal(str(p.get("amount") or 0))
        if amt <= 0:
            raise HTTPException(status_code=400, detail="Valor da amortização deve ser positivo.")
        debt_id = p.get("debt_id")
        debt = None
        if debt_id:
            debt = db.query(Debt).filter(Debt.id == parse_uuid(str(debt_id), "debt_id"), Debt.user_id == uid, Debt.deleted_at.is_(None)).first()
        if not debt:
            debt = (
                db.query(Debt)
                .filter(Debt.user_id == uid, Debt.deleted_at.is_(None), Debt.is_active.is_(True), Debt.current_balance > 0)
                .order_by(Debt.interest_rate_monthly.desc())
                .first()
            )
        if not debt:
            raise HTTPException(status_code=404, detail="Nenhuma dívida ativa encontrada para amortizar.")
        next_bal = max(Decimal("0.00"), Decimal(str(debt.current_balance or 0)) - amt)
        debt.current_balance = next_bal
        if next_bal <= 0:
            debt.is_active = False
        db.commit()
        return {"ok": True, "message": f"Amortização de R$ {float(amt):,.2f} registrada em \"{debt.name}\" (saldo: R$ {float(next_bal):,.2f})!", "entity_id": str(debt.id)}

    raise HTTPException(status_code=400, detail=f"Ação não suportada: {act}")


@router.post("/what-if")
async def simulate_what_if_scenario(
    req: WhatIfRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Real-Data "E se...?" Financial Scenario Simulator (Story 6.5).
    Grounds projections on the user's actual trailing 3-month income, expenses,
    liquid balance, B3 portfolio, and active debt obligations.
    """
    uid = parse_uuid(user_id, "user_id")
    cutoff = date.today() - timedelta(days=95)
    txs = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == uid,
            Transaction.deleted_at.is_(None),
            Transaction.transaction_date >= cutoff,
            Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]),
        )
        .all()
    )
    inc_by_m: dict[str, float] = {}
    exp_by_m: dict[str, float] = {}
    for tx in txs:
        ym = tx.transaction_date.strftime("%Y-%m")
        amt = float(tx.amount or 0)
        if tx.type == TransactionType.INCOME:
            inc_by_m[ym] = inc_by_m.get(ym, 0.0) + amt
        else:
            exp_by_m[ym] = exp_by_m.get(ym, 0.0) + amt

    avg_income = round(sum(inc_by_m.values()) / max(1, len(inc_by_m)), 2) if inc_by_m else 6000.0
    avg_expenses = round(sum(exp_by_m.values()) / max(1, len(exp_by_m)), 2) if exp_by_m else 4000.0
    base_surplus = round(avg_income - avg_expenses, 2)

    accounts = db.query(Account).filter(Account.user_id == uid, Account.deleted_at.is_(None)).all()
    liquid_now = round(sum(float(a.balance or 0) for a in accounts if a.type in {AccountType.CHECKING, AccountType.SAVINGS, AccountType.CASH}), 2)
    holdings = db.query(InvestmentAsset).filter(InvestmentAsset.user_id == uid, InvestmentAsset.deleted_at.is_(None)).all()
    invested_now = round(sum(float(h.quantity or 0) * float(h.average_price or 0) for h in holdings), 2)
    debts = db.query(Debt).filter(Debt.user_id == uid, Debt.is_active.is_(True), Debt.deleted_at.is_(None)).all()
    debt_now = round(sum(float(d.current_balance or 0) for d in debts), 2)

    start_wealth = round(liquid_now + invested_now - debt_now, 2)
    r_m = (1.0 + req.annual_rate_pct / 100.0) ** (1.0 / 12.0) - 1.0
    months = req.months

    # Compute scenario monthly cashflow delta
    scenario_monthly_impact = 0.0
    headline = ""
    if req.scenario_type == "finance_purchase":
        if r_m > 0:
            pmt = req.amount * (r_m * (1 + r_m) ** months) / ((1 + r_m) ** months - 1)
        else:
            pmt = req.amount / max(1, months)
        scenario_monthly_impact = -round(pmt, 2)
        headline = f"Financiar R$ {req.amount:,.2f} em {months}x de R$ {pmt:,.2f} ({req.annual_rate_pct:.1f}% a.a.)"
    elif req.scenario_type == "income_drop":
        drop = abs(req.monthly_delta) if req.monthly_delta != 0 else round(avg_income * 0.2, 2)
        scenario_monthly_impact = -round(drop, 2)
        headline = f"Queda de renda de R$ {drop:,.2f}/mês por {months} meses"
    elif req.scenario_type == "monthly_saving":
        save = abs(req.monthly_delta) if req.monthly_delta != 0 else 1000.0
        scenario_monthly_impact = round(save, 2)
        headline = f"Aporte adicional de R$ {save:,.2f}/mês rendendo {req.annual_rate_pct:.1f}% a.a."
    else:
        scenario_monthly_impact = round(req.monthly_delta, 2)
        headline = req.question or f"Cenário personalizado ({req.monthly_delta:+,.2f}/mês por {months} meses)"

    new_surplus = round(base_surplus + scenario_monthly_impact, 2)
    yield_m = (1.0 + 0.11 / 12.0) - 1.0  # ~11% a.a. baseline CDI
    scen_yield_m = r_m if req.scenario_type == "monthly_saving" else yield_m

    timeline: list[dict[str, Any]] = []
    base_w = start_wealth
    scen_w = start_wealth
    step = max(1, months // 24)
    for m_idx in range(1, months + 1):
        base_w = base_w * (1.0 + (yield_m if base_w > 0 else 0.0)) + base_surplus
        scen_w = scen_w * (1.0 + (scen_yield_m if scen_w > 0 else 0.0)) + new_surplus
        if m_idx == 1 or m_idx == months or m_idx % step == 0:
            timeline.append({
                "month": m_idx,
                "label": f"Mês {m_idx}",
                "baseline_wealth": round(base_w, 2),
                "scenario_wealth": round(scen_w, 2),
            })

    if new_surplus >= avg_income * 0.15:
        verdict = "viable"
        verdict_label = "Viável com folga"
    elif new_surplus >= 0:
        verdict = "caution"
        verdict_label = "Atenção — margem apertada"
    else:
        verdict = "risky"
        verdict_label = "Alto risco — déficit mensal"

    fmt = lambda v: f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    recommendation = (
        f"Com sua renda média real de {fmt(avg_income)} e despesas de {fmt(avg_expenses)} "
        f"(sobra atual: {fmt(base_surplus)}/mês), este cenário leva sua sobra mensal para {fmt(new_surplus)}/mês. "
        f"Em {months} meses, seu patrimônio projetado muda de {fmt(base_w)} para {fmt(scen_w)}."
    )

    return {
        "headline": headline.replace(",", "X").replace(".", ",").replace("X", "."),
        "verdict": verdict,
        "verdict_label": verdict_label,
        "baseline": {
            "avg_monthly_income": avg_income,
            "avg_monthly_expenses": avg_expenses,
            "monthly_surplus": base_surplus,
            "starting_net_worth": start_wealth,
            "ending_net_worth": round(base_w, 2),
        },
        "scenario": {
            "monthly_impact": scenario_monthly_impact,
            "new_monthly_surplus": new_surplus,
            "ending_net_worth": round(scen_w, 2),
            "wealth_delta": round(scen_w - base_w, 2),
        },
        "recommendation": recommendation,
        "timeline": timeline,
    }
