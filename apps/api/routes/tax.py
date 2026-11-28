"""
EPIC-016 — IRPF & DARF B3 Automático para Investidores Brasileiros.

Endpoints:
  GET  /tax/irpf-summary?year=YYYY  — Ficha Bens e Direitos, Rendimentos Isentos (Dividendos/FIIs),
                                      Tributação Exclusiva (JCP) e Apuração Mensal de DARF B3
  POST /tax/darf-simulate           — Calculadora interativa de DARF (Swing/Day Trade, isenção R$ 20k,
                                      compensação de prejuízo acumulado, IRRF dedo-duro, código 6015)
"""

from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import date
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    Account,
    AccountType,
    InvestmentAsset,
    InvestmentDividend,
    InvestmentTrade,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/tax", tags=["tax-irpf"])

IRPF_ASSET_CLASS_MAP: dict[str, dict[str, str]] = {
    "stock": {
        "grupo": "03",
        "grupo_label": "Participações Societárias",
        "codigo": "01",
        "codigo_label": "Ações (inclusive as listadas em bolsa)",
    },
    "fii": {
        "grupo": "07",
        "grupo_label": "Fundos",
        "codigo": "03",
        "codigo_label": "Fundos de Investimento Imobiliário (FII)",
    },
    "etf": {
        "grupo": "07",
        "grupo_label": "Fundos",
        "codigo": "09",
        "codigo_label": "Fundos de Índice de Renda Variável (ETF)",
    },
    "bdr": {
        "grupo": "04",
        "grupo_label": "Aplicações e Investimentos",
        "codigo": "04",
        "codigo_label": "Ativos negociados em bolsa no Brasil (BDRs)",
    },
    "fixed_income": {
        "grupo": "04",
        "grupo_label": "Aplicações e Investimentos",
        "codigo": "02",
        "codigo_label": "Títulos Públicos e Privados sujeitos à tributação (Tesouro/CDB/Debêntures)",
    },
    "crypto": {
        "grupo": "08",
        "grupo_label": "Criptoativos",
        "codigo": "01",
        "codigo_label": "Criptoativo (Bitcoin / Altcoins / Stablecoins)",
    },
}


def _brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _last_business_day_next_month(year: int, month: int) -> str:
    ny, nm = (year + 1, 1) if month == 12 else (year, month + 1)
    last_day = calendar.monthrange(ny, nm)[1]
    d = date(ny, nm, last_day)
    while d.weekday() >= 5:  # Sat/Sun -> move back to Friday
        d = date(ny, nm, d.day - 1)
    return d.isoformat()


class DarfSimulateRequest(BaseModel):
    asset_class: Literal["stock", "fii", "etf", "bdr", "crypto"] = "stock"
    trade_mode: Literal["swing", "day"] = "swing"
    total_sales: float = Field(..., ge=0, le=500_000_000)
    total_cost: float = Field(..., ge=0, le=500_000_000)
    fees: float = Field(default=0.0, ge=0, le=10_000_000)
    prior_accumulated_loss: float = Field(default=0.0, ge=0, le=500_000_000)
    irrf_withheld: float = Field(default=0.0, ge=0, le=10_000_000)
    reference_year: Optional[int] = Field(default=None, ge=2020, le=2035)
    reference_month: Optional[int] = Field(default=None, ge=1, le=12)


def _compute_darf(
    *,
    asset_class: str,
    trade_mode: str,
    total_sales: float,
    total_cost: float,
    fees: float,
    prior_accumulated_loss: float,
    irrf_withheld: float,
    year: int,
    month: int,
) -> dict[str, Any]:
    gross_profit = round(total_sales - total_cost - fees, 2)

    # Tax rate rules (Receita Federal Brasil)
    if asset_class == "fii":
        tax_rate = 0.20
    elif trade_mode == "day" and asset_class in ("stock", "etf", "bdr"):
        tax_rate = 0.20
    else:
        tax_rate = 0.15

    # Statutory monthly sales exemptions
    is_exempt = False
    exemption_reason: Optional[str] = None
    if asset_class == "stock" and trade_mode == "swing" and total_sales <= 20_000.0 and gross_profit > 0:
        is_exempt = True
        exemption_reason = (
            "Isenção legal de IR para vendas de ações em Swing Trade até R$ 20.000,00 no mês "
            "(declare o lucro em Rendimentos Isentos — Código 20)."
        )
    elif asset_class == "crypto" and total_sales <= 35_000.0 and gross_profit > 0:
        is_exempt = True
        exemption_reason = "Isenção legal para alienação de criptoativos até R$ 35.000,00 no mês."

    # Loss carryforward compensation (only when taxable & gross_profit > 0)
    loss_used = 0.0
    next_accumulated_loss = round(prior_accumulated_loss, 2)
    taxable_base = 0.0

    if gross_profit < 0:
        next_accumulated_loss = round(prior_accumulated_loss + abs(gross_profit), 2)
    elif gross_profit > 0 and not is_exempt:
        loss_used = round(min(prior_accumulated_loss, gross_profit), 2)
        taxable_base = round(max(0.0, gross_profit - loss_used), 2)
        next_accumulated_loss = round(max(0.0, prior_accumulated_loss - loss_used), 2)

    gross_tax = round(taxable_base * tax_rate, 2)
    irrf_deducted = round(min(gross_tax, irrf_withheld), 2) if gross_tax > 0 else 0.0
    darf_amount = round(max(0.0, gross_tax - irrf_deducted), 2)
    accumulated_below_min = 0.0 < darf_amount < 10.0

    return {
        "asset_class": asset_class,
        "trade_mode": trade_mode,
        "darf_code": "6015" if asset_class != "crypto" else "4600",
        "due_date": _last_business_day_next_month(year, month),
        "tax_rate_pct": round(tax_rate * 100, 1),
        "total_sales": round(total_sales, 2),
        "total_cost": round(total_cost, 2),
        "fees": round(fees, 2),
        "gross_profit": gross_profit,
        "is_exempt": is_exempt,
        "exemption_reason": exemption_reason,
        "prior_loss_used": loss_used,
        "taxable_base": taxable_base,
        "gross_tax": gross_tax,
        "irrf_deducted": irrf_deducted,
        "darf_amount": darf_amount,
        "must_pay_darf": darf_amount >= 10.0,
        "accumulated_below_min_10": accumulated_below_min,
        "next_accumulated_loss": next_accumulated_loss,
        "status_label": (
            "Isento (Vendas dentro do limite mensal)"
            if is_exempt
            else (
                "Prejuízo acumulado para compensar em meses futuros"
                if gross_profit < 0
                else (
                    "DARF abaixo de R$ 10,00 — acumular para o próximo mês"
                    if accumulated_below_min
                    else (
                        f"DARF a recolher ({_brl(darf_amount)}) — Código {'6015' if asset_class != 'crypto' else '4600'}"
                        if darf_amount >= 10.0
                        else "Sem imposto devido neste mês"
                    )
                )
            )
        ),
    }


@router.post("/darf-simulate")
async def simulate_darf(
    req: DarfSimulateRequest,
    user_id: str = Depends(get_current_user_from_header),
):
    """Interactive Brazilian B3/Crypto DARF simulator with R$ 20k/35k exemption & loss carryforward."""
    _ = parse_uuid(user_id, "user_id")
    today = date.today()
    yr = req.reference_year or today.year
    mo = req.reference_month or today.month
    return _compute_darf(
        asset_class=req.asset_class,
        trade_mode=req.trade_mode,
        total_sales=req.total_sales,
        total_cost=req.total_cost,
        fees=req.fees,
        prior_accumulated_loss=req.prior_accumulated_loss,
        irrf_withheld=req.irrf_withheld,
        year=yr,
        month=mo,
    )


@router.get("/irpf-summary")
async def get_irpf_summary(
    year: int = Query(default=date.today().year, ge=2020, le=2035),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Full annual Brazilian IRPF report generated from real user portfolio, dividends,
    trades, and bank account balances:
    1. Ficha Bens e Direitos (ready-to-copy Discriminação + Grupo/Código)
    2. Ficha Rendimentos Isentos (Dividendos Cód 09 + FIIs Cód 26)
    3. Ficha Tributação Exclusiva (JCP Cód 10)
    4. Apuração Mensal de DARF B3 (Jan–Dez) com regra de isenção R$ 20.000/mês
    """
    uid = parse_uuid(user_id, "user_id")

    assets = (
        db.query(InvestmentAsset)
        .filter(
            InvestmentAsset.user_id == uid,
            InvestmentAsset.deleted_at.is_(None),
            InvestmentAsset.quantity > 0,
        )
        .order_by(InvestmentAsset.asset_class.asc(), InvestmentAsset.ticker.asc())
        .all()
    )
    asset_by_id = {a.id: a for a in assets}

    accounts = (
        db.query(Account)
        .filter(Account.user_id == uid, Account.deleted_at.is_(None))
        .all()
    )

    # 1. Ficha Bens e Direitos
    bens_e_direitos: list[dict[str, Any]] = []
    total_bens = 0.0

    for a in assets:
        qty = float(a.quantity or 0)
        avg = float(a.average_price or 0)
        cost = round(qty * avg, 2)
        if cost <= 0:
            continue
        meta = IRPF_ASSET_CLASS_MAP.get(a.asset_class, IRPF_ASSET_CLASS_MAP["stock"])
        broker_txt = f" — Custódia: {a.broker}" if a.broker else ""
        qty_fmt = f"{qty:,.0f}".replace(",", ".") if qty.is_integer() else f"{qty:,.4f}".replace(",", "X").replace(".", ",").replace("X", ".")
        discriminacao = (
            f"{qty_fmt} unidade(s) de {a.ticker.upper()} ({a.name}) — "
            f"Preço médio de aquisição: {_brl(avg)} — Custo total: {_brl(cost)}{broker_txt}."
        )
        total_bens += cost
        bens_e_direitos.append(
            {
                "id": str(a.id),
                "ticker": a.ticker.upper(),
                "name": a.name,
                "asset_class": a.asset_class,
                "grupo": meta["grupo"],
                "grupo_label": meta["grupo_label"],
                "codigo": meta["codigo"],
                "codigo_label": meta["codigo_label"],
                "quantity": qty,
                "average_price": round(avg, 4),
                "total_cost": cost,
                "broker": a.broker,
                "discriminacao": discriminacao,
            }
        )

    # Bank accounts >= R$ 140 (Receita Federal reporting threshold for Grupo 06)
    for acc in accounts:
        if acc.type == AccountType.CREDIT_CARD:
            continue
        bal = round(float(acc.balance or 0), 2)
        if bal < 140.0:
            continue
        codigo = "01" if acc.type in (AccountType.CHECKING, AccountType.SAVINGS) else "99"
        disc = f"Saldo em conta {acc.name} ({acc.currency}) em 31/12/{year}: {_brl(bal)}."
        total_bens += bal
        bens_e_direitos.append(
            {
                "id": str(acc.id),
                "ticker": acc.currency,
                "name": acc.name,
                "asset_class": "cash",
                "grupo": "06",
                "grupo_label": "Depósito à Vista e Numerário",
                "codigo": codigo,
                "codigo_label": "Depósito em conta corrente ou conta pagamento",
                "quantity": 1,
                "average_price": bal,
                "total_cost": bal,
                "broker": acc.name,
                "discriminacao": disc,
            }
        )

    # 2 & 3. Dividends (Isentos Cód 09 / 26) & JCP (Tributação Exclusiva Cód 10)
    year_start = date(year, 1, 1)
    year_end = date(year, 12, 31)
    divs = (
        db.query(InvestmentDividend)
        .filter(
            InvestmentDividend.user_id == uid,
            InvestmentDividend.payment_date >= year_start,
            InvestmentDividend.payment_date <= year_end,
        )
        .all()
    )

    isentos_agg: dict[tuple[str, str], dict[str, Any]] = {}
    exclusiva_agg: dict[str, dict[str, Any]] = {}

    for d in divs:
        asset = asset_by_id.get(d.asset_id) or db.query(InvestmentAsset).filter(InvestmentAsset.id == d.asset_id).first()
        tkr = asset.ticker.upper() if asset else "ATIVO"
        aname = asset.name if asset else tkr
        amt = float(d.total_amount or 0)
        if amt <= 0:
            continue
        dtype = (d.dividend_type or "dividend").lower()
        if dtype == "jcp":
            bucket = exclusiva_agg.setdefault(
                tkr,
                {
                    "ticker": tkr,
                    "name": aname,
                    "codigo": "10",
                    "codigo_label": "Juros sobre Capital Próprio (JCP)",
                    "total": 0.0,
                    "payments_count": 0,
                },
            )
            bucket["total"] = round(bucket["total"] + amt, 2)
            bucket["payments_count"] += 1
        else:
            is_fii = (dtype == "fii_yield") or (asset is not None and asset.asset_class == "fii")
            cod = "26" if is_fii else "09"
            lbl = "Outros — Rendimentos de FIIs isentos" if is_fii else "Lucros e dividendos recebidos"
            key = (tkr, cod)
            bucket = isentos_agg.setdefault(
                key,
                {
                    "ticker": tkr,
                    "name": aname,
                    "codigo": cod,
                    "codigo_label": lbl,
                    "total": 0.0,
                    "payments_count": 0,
                },
            )
            bucket["total"] = round(bucket["total"] + amt, 2)
            bucket["payments_count"] += 1

    rendimentos_isentos = sorted(isentos_agg.values(), key=lambda x: x["total"], reverse=True)
    tributacao_exclusiva = sorted(exclusiva_agg.values(), key=lambda x: x["total"], reverse=True)

    # 4. Monthly B3 DARF calculation from recorded sells in `investment_trades`
    sells = (
        db.query(InvestmentTrade)
        .filter(
            InvestmentTrade.user_id == uid,
            InvestmentTrade.operation == "sell",
            InvestmentTrade.trade_date >= year_start,
            InvestmentTrade.trade_date <= year_end,
        )
        .order_by(InvestmentTrade.trade_date.asc())
        .all()
    )

    monthly_buckets: dict[tuple[int, str], dict[str, float]] = defaultdict(
        lambda: {"sales": 0.0, "cost": 0.0, "fees": 0.0}
    )
    for tr in sells:
        asset = asset_by_id.get(tr.asset_id) or db.query(InvestmentAsset).filter(InvestmentAsset.id == tr.asset_id).first()
        ac = asset.asset_class if asset else "stock"
        if ac not in ("stock", "fii", "etf", "bdr", "crypto"):
            continue
        qty = float(tr.quantity or 0)
        sale_val = qty * float(tr.unit_price or 0)
        cost_val = qty * float(asset.average_price if asset else 0)
        fees_val = float(tr.fees or 0)
        b = monthly_buckets[(tr.trade_date.month, ac)]
        b["sales"] += sale_val
        b["cost"] += cost_val
        b["fees"] += fees_val

    loss_carry: dict[str, float] = {"stock": 0.0, "fii": 0.0, "etf": 0.0, "bdr": 0.0, "crypto": 0.0}
    monthly_darf: list[dict[str, Any]] = []
    total_darf_year = 0.0
    total_exempt_profit_year = 0.0

    for mo in range(1, 13):
        for ac in ("stock", "fii", "etf", "bdr", "crypto"):
            b = monthly_buckets.get((mo, ac))
            if not b or b["sales"] <= 0:
                continue
            res = _compute_darf(
                asset_class=ac,
                trade_mode="swing",
                total_sales=b["sales"],
                total_cost=b["cost"],
                fees=b["fees"],
                prior_accumulated_loss=loss_carry[ac],
                irrf_withheld=0.0,
                year=year,
                month=mo,
            )
            loss_carry[ac] = res["next_accumulated_loss"]
            res["month"] = mo
            res["ym"] = f"{year:04d}-{mo:02d}"
            monthly_darf.append(res)
            total_darf_year += res["darf_amount"]
            if res["is_exempt"] and res["gross_profit"] > 0:
                total_exempt_profit_year += res["gross_profit"]

    return {
        "year": year,
        "summary": {
            "total_bens_e_direitos": round(total_bens, 2),
            "bens_count": len(bens_e_direitos),
            "total_rendimentos_isentos": round(sum(x["total"] for x in rendimentos_isentos), 2),
            "total_tributacao_exclusiva": round(sum(x["total"] for x in tributacao_exclusiva), 2),
            "total_darf_year": round(total_darf_year, 2),
            "total_exempt_swing_profit": round(total_exempt_profit_year, 2),
            "accumulated_losses_end_of_year": {k: round(v, 2) for k, v in loss_carry.items() if v > 0},
        },
        "bens_e_direitos": bens_e_direitos,
        "rendimentos_isentos": rendimentos_isentos,
        "tributacao_exclusiva": tributacao_exclusiva,
        "monthly_darf": monthly_darf,
    }
