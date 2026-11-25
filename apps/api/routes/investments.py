"""
Investments Portfolio & B3 Live Quotes endpoints (Investidor10-style) for Mony API.

Endpoints:
  GET    /investments/portfolio          — full portfolio KPIs, allocation, 12m dividends, enriched assets
  GET    /investments/quote/{ticker}     — live B3 quote lookup (brapi.dev + Yahoo .SA fallback)
  POST   /investments/refresh-quotes     — force refresh live B3 quotes for all portfolio tickers
  POST   /investments/assets             — direct position creation (Fixed Income / initial custody)
  DELETE /investments/assets/{asset_id}  — remove asset (soft delete)
  GET    /investments/trades             — list trade history
  POST   /investments/trades             — register buy/sell/split/bonus & recalculate weighted avg price
  DELETE /investments/trades/{trade_id}  — delete trade & recalculate position
  GET    /investments/dividends          — list dividends/JCP/FII yields
  POST   /investments/dividends          — register dividend/JCP/FII yield (deduplicated)
  DELETE /investments/dividends/{div_id} — delete dividend record
  POST   /investments/import-b3          — import B3 Investor Area CSV/XLSX (deduplicated!)
  POST   /investments/sync-pluggy        — sync broker/B3 positions from connected Pluggy items
"""

from __future__ import annotations

import csv
from datetime import date, datetime, timedelta
from decimal import Decimal
import hashlib
import io
import re
from typing import Any, Optional
import unicodedata
from uuid import UUID
import xml.etree.ElementTree as ET
import zipfile

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import (
    InvestmentAsset,
    InvestmentDividend,
    InvestmentTrade,
    OFLinkedAccount,
)
from services.market_data import (
    classify_b3_ticker,
    get_bcb_macro_rates,
    get_quote,
    normalize_ticker,
)
from services.pluggy_client import fetch_pluggy_investments
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

router = APIRouter(prefix="/investments", tags=["investments"])

ASSET_CLASS_LABELS: dict[str, str] = {
    "stock": "Ações BR",
    "fii": "FIIs",
    "etf": "ETFs",
    "bdr": "BDRs",
    "fixed_income": "Renda Fixa",
    "crypto": "Cripto",
}


# ============ Schemas ============


class TradeCreateRequest(BaseModel):
    ticker: str = Field(min_length=2, max_length=24)
    name: Optional[str] = Field(default=None, max_length=200)
    asset_class: Optional[str] = Field(default=None, pattern=r"^(stock|fii|etf|bdr|fixed_income|crypto)$")
    sector: Optional[str] = Field(default=None, max_length=100)
    broker: Optional[str] = Field(default=None, max_length=100)
    operation: str = Field(default="buy", pattern=r"^(buy|sell|split|bonus)$")
    trade_date: date
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    fees: Decimal = Field(default=Decimal("0.00"), ge=0)
    notes: Optional[str] = None


class AssetDirectCreateRequest(BaseModel):
    ticker: str = Field(min_length=2, max_length=24)
    name: str = Field(min_length=1, max_length=200)
    asset_class: str = Field(default="fixed_income", pattern=r"^(stock|fii|etf|bdr|fixed_income|crypto)$")
    sector: Optional[str] = None
    broker: Optional[str] = None
    quantity: Decimal = Field(gt=0)
    average_price: Decimal = Field(gt=0)
    indexer: Optional[str] = None
    indexer_rate: Optional[Decimal] = None
    maturity_date: Optional[date] = None
    notes: Optional[str] = None


class DividendCreateRequest(BaseModel):
    ticker: str = Field(min_length=2, max_length=24)
    dividend_type: str = Field(default="dividend", pattern=r"^(dividend|jcp|fii_yield|amortization)$")
    ex_date: Optional[date] = None
    payment_date: date
    amount_per_share: Optional[Decimal] = Field(default=None, ge=0)
    total_amount: Decimal = Field(gt=0)
    notes: Optional[str] = None


class SyncPluggyInvestmentsRequest(BaseModel):
    item_id: Optional[str] = None


# ============ Core Position Math ============


def recalculate_asset_position(db: Session, asset: InvestmentAsset) -> None:
    """
    Recompute exact weighted average price & quantity from the asset's trade ledger
    (standard Brazilian tax / Investidor10 rules: buys adjust avg price including fees;
    sells reduce quantity without changing avg price; splits multiply quantity & divide avg price).
    """
    trades = (
        db.query(InvestmentTrade)
        .filter(InvestmentTrade.asset_id == asset.id)
        .order_by(InvestmentTrade.trade_date.asc(), InvestmentTrade.created_at.asc())
        .all()
    )
    if not trades:
        return

    qty = Decimal("0")
    total_cost = Decimal("0")
    avg_price = Decimal("0")

    for t in trades:
        t_qty = Decimal(str(t.quantity or 0))
        t_price = Decimal(str(t.unit_price or 0))
        t_fees = Decimal(str(t.fees or 0))
        op = (t.operation or "buy").lower()

        if op == "buy":
            total_cost = (qty * avg_price) + (t_qty * t_price) + t_fees
            qty += t_qty
            avg_price = (total_cost / qty) if qty > 0 else Decimal("0")
        elif op == "sell":
            qty = max(Decimal("0"), qty - t_qty)
            total_cost = qty * avg_price
            if qty == 0:
                avg_price = Decimal("0")
        elif op == "bonus":
            total_cost = (qty * avg_price) + (t_qty * t_price)
            qty += t_qty
            avg_price = (total_cost / qty) if qty > 0 else Decimal("0")
        elif op == "split":
            # Quantity holds split factor (e.g., 2 for 2:1 split)
            if t_qty > 0 and qty > 0:
                qty = qty * t_qty
                avg_price = avg_price / t_qty

    asset.quantity = qty
    asset.average_price = avg_price
    asset.updated_at = datetime.utcnow()


def _trade_dedup_hash(uid: UUID, ticker: str, op: str, trade_date: date, qty: Decimal, price: Decimal) -> str:
    raw = f"{uid}|{ticker}|{op}|{trade_date.isoformat()}|{float(qty):.4f}|{float(price):.4f}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _div_dedup_hash(uid: UUID, ticker: str, div_type: str, pay_date: date, total_amt: Decimal) -> str:
    raw = f"{uid}|{ticker}|{div_type}|{pay_date.isoformat()}|{float(total_amt):.2f}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _get_or_create_asset(
    db: Session,
    *,
    uid: UUID,
    ticker: str,
    name: Optional[str] = None,
    asset_class: Optional[str] = None,
    sector: Optional[str] = None,
    broker: Optional[str] = None,
) -> InvestmentAsset:
    norm = normalize_ticker(ticker)
    asset = (
        db.query(InvestmentAsset)
        .filter(
            InvestmentAsset.user_id == uid,
            InvestmentAsset.ticker == norm,
            InvestmentAsset.deleted_at.is_(None),
        )
        .first()
    )
    if asset:
        if name and asset.name == norm:
            asset.name = name[:200]
        if sector and not asset.sector:
            asset.sector = sector[:100]
        if broker and not asset.broker:
            asset.broker = broker[:100]
        return asset

    resolved_class = asset_class or classify_b3_ticker(norm)
    asset = InvestmentAsset(
        user_id=uid,
        ticker=norm,
        name=(name or norm)[:200],
        asset_class=resolved_class,
        sector=sector[:100] if sector else None,
        broker=broker[:100] if broker else None,
        quantity=Decimal("0"),
        average_price=Decimal("0"),
    )
    db.add(asset)
    db.flush()
    return asset


# ============ Portfolio & Quotes Endpoints ============


@router.get("/quote/{ticker}")
async def lookup_b3_quote(
    ticker: str,
    force: bool = Query(default=False),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Fetch live B3 quote + fundamentals for a ticker (used for preview & autocomplete)."""
    norm = normalize_ticker(ticker)
    asset_class = classify_b3_ticker(norm)
    quote = await get_quote(db, norm, asset_class=asset_class, force_refresh=force)
    if not quote:
        return {
            "ticker": norm,
            "asset_class": asset_class,
            "found": False,
            "price": None,
        }
    return {**quote, "asset_class": asset_class, "found": True}


@router.post("/refresh-quotes")
async def refresh_portfolio_quotes(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Force refresh live B3 quotes for every active asset in the user's portfolio."""
    uid = parse_uuid(user_id, "user_id")
    assets = (
        db.query(InvestmentAsset)
        .filter(InvestmentAsset.user_id == uid, InvestmentAsset.deleted_at.is_(None))
        .all()
    )
    updated = 0
    for a in assets:
        if a.asset_class == "fixed_income":
            continue
        q = await get_quote(db, a.ticker, asset_class=a.asset_class, force_refresh=True)
        if q:
            if q.get("name") and a.name == a.ticker:
                a.name = q["name"][:200]
            if q.get("sector") and not a.sector:
                a.sector = q["sector"][:100]
            if q.get("logo_url") and not a.logo_url:
                a.logo_url = q["logo_url"]
            updated += 1
    db.commit()
    return {"refreshed": updated, "total_assets": len(assets)}


@router.get("/portfolio")
async def get_investments_portfolio(
    refresh: bool = Query(default=False),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Return full Investidor10-style portfolio summary, allocation, 12m dividends, and enriched assets."""
    uid = parse_uuid(user_id, "user_id")
    assets = (
        db.query(InvestmentAsset)
        .filter(InvestmentAsset.user_id == uid, InvestmentAsset.deleted_at.is_(None))
        .order_by(InvestmentAsset.asset_class.asc(), InvestmentAsset.ticker.asc())
        .all()
    )
    dividends = (
        db.query(InvestmentDividend)
        .filter(InvestmentDividend.user_id == uid)
        .order_by(InvestmentDividend.payment_date.desc())
        .all()
    )
    macro = await get_bcb_macro_rates()

    today = date.today()
    cutoff_12m = today - timedelta(days=365)

    div_by_asset_12m: dict[UUID, float] = {}
    div_total_all = 0.0
    div_total_12m = 0.0
    monthly_div_map: dict[str, float] = {}

    # Seed last 12 months
    for offset in range(11, -1, -1):
        m_total = today.year * 12 + (today.month - 1) - offset
        my, mm = divmod(m_total, 12)
        monthly_div_map[f"{my:04d}-{mm + 1:02d}"] = 0.0

    for d in dividends:
        amt = float(d.total_amount or 0)
        div_total_all += amt
        if d.payment_date >= cutoff_12m:
            div_total_12m += amt
            div_by_asset_12m[d.asset_id] = div_by_asset_12m.get(d.asset_id, 0.0) + amt
        ym = d.payment_date.strftime("%Y-%m")
        if ym in monthly_div_map:
            monthly_div_map[ym] = round(monthly_div_map[ym] + amt, 2)

    enriched_assets: list[dict[str, Any]] = []
    total_value = 0.0
    total_cost = 0.0
    total_day_change = 0.0

    for a in assets:
        qty = float(a.quantity or 0)
        avg = float(a.average_price or 0)
        cost = round(qty * avg, 2)
        quote = (
            await get_quote(db, a.ticker, asset_class=a.asset_class, force_refresh=refresh)
            if a.asset_class != "fixed_income"
            else None
        )

        if quote and quote.get("price"):
            cur_price = float(quote["price"])
            day_pct = float(quote.get("change_pct") or 0.0)
            prev_close = float(quote.get("previous_close") or cur_price)
            day_val = (cur_price - prev_close) * qty
        else:
            cur_price = avg
            day_pct = 0.0
            day_val = 0.0

        cur_val = round(qty * cur_price, 2)
        gain = round(cur_val - cost, 2)
        gain_pct = round((gain / cost) * 100, 2) if cost > 0 else 0.0
        a_div_12m = round(div_by_asset_12m.get(a.id, 0.0), 2)
        yoc_pct = round((a_div_12m / cost) * 100, 2) if cost > 0 else 0.0

        total_value += cur_val
        total_cost += cost
        total_day_change += day_val

        enriched_assets.append({
            "id": str(a.id),
            "ticker": a.ticker,
            "name": (quote.get("name") if quote and a.name == a.ticker else a.name) or a.ticker,
            "asset_class": a.asset_class,
            "asset_class_label": ASSET_CLASS_LABELS.get(a.asset_class, a.asset_class),
            "sector": a.sector or (quote.get("sector") if quote else None) or ASSET_CLASS_LABELS.get(a.asset_class, "Outros"),
            "broker": a.broker,
            "quantity": qty,
            "average_price": round(avg, 4),
            "cost_total": cost,
            "current_price": round(cur_price, 4),
            "current_value": cur_val,
            "day_change_pct": round(day_pct, 2),
            "gain_value": gain,
            "gain_pct": gain_pct,
            "dy_12m": quote.get("dy_12m") if quote else None,
            "pe_ratio": quote.get("pe_ratio") if quote else None,
            "pvp_ratio": quote.get("pvp_ratio") if quote else None,
            "dividends_12m": a_div_12m,
            "yoc_pct": yoc_pct,
            "logo_url": a.logo_url or (quote.get("logo_url") if quote else None),
            "quote_source": quote.get("source") if quote else ("fixed" if a.asset_class == "fixed_income" else "manual"),
            "indexer": a.indexer,
            "indexer_rate": float(a.indexer_rate) if a.indexer_rate is not None else None,
            "maturity_date": a.maturity_date.isoformat() if a.maturity_date else None,
            "portfolio_pct": 0.0,
        })

    # Compute portfolio % + allocation breakdowns
    class_totals: dict[str, dict[str, Any]] = {}
    sector_totals: dict[str, float] = {}

    for item in enriched_assets:
        item["portfolio_pct"] = round((item["current_value"] / total_value) * 100, 2) if total_value > 0 else 0.0
        cls = item["asset_class"]
        if cls not in class_totals:
            class_totals[cls] = {"asset_class": cls, "label": ASSET_CLASS_LABELS.get(cls, cls), "value": 0.0, "count": 0}
        class_totals[cls]["value"] = round(class_totals[cls]["value"] + item["current_value"], 2)
        class_totals[cls]["count"] += 1

        sec = item["sector"] or "Outros"
        sector_totals[sec] = round(sector_totals.get(sec, 0.0) + item["current_value"], 2)

    enriched_assets.sort(key=lambda x: x["current_value"], reverse=True)

    allocation_by_class = [
        {**v, "pct": round((v["value"] / total_value) * 100, 1) if total_value > 0 else 0.0}
        for v in sorted(class_totals.values(), key=lambda x: x["value"], reverse=True)
    ]
    allocation_by_sector = [
        {"sector": k, "value": v, "pct": round((v / total_value) * 100, 1) if total_value > 0 else 0.0}
        for k, v in sorted(sector_totals.items(), key=lambda kv: kv[1], reverse=True)
    ]

    pt_short = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    monthly_dividends_12m = [
        {"ym": ym, "label": f"{pt_short[int(ym.split('-')[1])]}/{ym[2:4]}", "total": val}
        for ym, val in monthly_div_map.items()
    ]

    total_gain = round(total_value - total_cost, 2)
    total_gain_pct = round((total_gain / total_cost) * 100, 2) if total_cost > 0 else 0.0
    prev_total = total_value - total_day_change
    day_change_pct = round((total_day_change / prev_total) * 100, 2) if prev_total > 0 else 0.0

    return {
        "summary": {
            "total_value": round(total_value, 2),
            "total_cost": round(total_cost, 2),
            "total_gain": total_gain,
            "total_gain_pct": total_gain_pct,
            "day_change_value": round(total_day_change, 2),
            "day_change_pct": day_change_pct,
            "dividends_12m": round(div_total_12m, 2),
            "dividends_total": round(div_total_all, 2),
            "monthly_avg_dividends": round(div_total_12m / 12.0, 2),
            "yield_on_cost_pct": round((div_total_12m / total_cost) * 100, 2) if total_cost > 0 else 0.0,
            "assets_count": len([a for a in enriched_assets if a["quantity"] > 0]),
            "cdi_annual_pct": macro["cdi"],
            "ipca_annual_pct": macro["ipca"],
        },
        "allocation_by_class": allocation_by_class,
        "allocation_by_sector": allocation_by_sector,
        "monthly_dividends_12m": monthly_dividends_12m,
        "assets": enriched_assets,
    }


# ============ Trades & Direct Asset Endpoints ============


@router.post("/trades", status_code=status.HTTP_201_CREATED)
async def create_investment_trade(
    payload: TradeCreateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Register buy/sell/split/bonus trade and automatically recalculate asset average price."""
    uid = parse_uuid(user_id, "user_id")
    norm_ticker = normalize_ticker(payload.ticker)
    asset = _get_or_create_asset(
        db,
        uid=uid,
        ticker=norm_ticker,
        name=payload.name,
        asset_class=payload.asset_class,
        sector=payload.sector,
        broker=payload.broker,
    )

    dhash = _trade_dedup_hash(uid, norm_ticker, payload.operation, payload.trade_date, payload.quantity, payload.unit_price)
    trade = InvestmentTrade(
        user_id=uid,
        asset_id=asset.id,
        operation=payload.operation,
        trade_date=payload.trade_date,
        quantity=payload.quantity,
        unit_price=payload.unit_price,
        fees=payload.fees,
        broker=payload.broker,
        notes=payload.notes,
        dedup_hash=dhash,
    )
    db.add(trade)
    db.flush()

    recalculate_asset_position(db, asset)
    db.commit()
    db.refresh(trade)

    return {
        "id": str(trade.id),
        "asset_id": str(asset.id),
        "ticker": asset.ticker,
        "operation": trade.operation,
        "trade_date": trade.trade_date.isoformat(),
        "quantity": float(trade.quantity),
        "unit_price": float(trade.unit_price),
        "fees": float(trade.fees),
        "new_position_quantity": float(asset.quantity),
        "new_average_price": float(asset.average_price),
    }


@router.get("/trades")
async def list_investment_trades(
    ticker: Optional[str] = Query(default=None),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    q = (
        db.query(InvestmentTrade, InvestmentAsset.ticker, InvestmentAsset.name)
        .join(InvestmentAsset, InvestmentAsset.id == InvestmentTrade.asset_id)
        .filter(InvestmentTrade.user_id == uid, InvestmentAsset.deleted_at.is_(None))
    )
    if ticker:
        q = q.filter(InvestmentAsset.ticker == normalize_ticker(ticker))
    rows = q.order_by(InvestmentTrade.trade_date.desc(), InvestmentTrade.created_at.desc()).limit(100).all()
    return [
        {
            "id": str(t.id),
            "asset_id": str(t.asset_id),
            "ticker": tk,
            "asset_name": nm,
            "operation": t.operation,
            "trade_date": t.trade_date.isoformat(),
            "quantity": float(t.quantity),
            "unit_price": float(t.unit_price),
            "fees": float(t.fees),
            "total": round(float(t.quantity) * float(t.unit_price) + float(t.fees), 2),
            "broker": t.broker,
            "notes": t.notes,
        }
        for t, tk, nm in rows
    ]


@router.delete("/trades/{trade_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_investment_trade(
    trade_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    tid = parse_uuid(trade_id, "trade_id")
    trade = db.query(InvestmentTrade).filter(InvestmentTrade.id == tid, InvestmentTrade.user_id == uid).first()
    if not trade:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Operação não encontrada.")
    asset = db.query(InvestmentAsset).filter(InvestmentAsset.id == trade.asset_id).first()
    db.delete(trade)
    db.flush()
    if asset:
        recalculate_asset_position(db, asset)
    db.commit()
    return None


@router.post("/assets", status_code=status.HTTP_201_CREATED)
async def create_direct_asset(
    payload: AssetDirectCreateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Register a position directly (ideal for Fixed Income / CDB / Tesouro Direto)."""
    uid = parse_uuid(user_id, "user_id")
    norm = normalize_ticker(payload.ticker)
    asset = _get_or_create_asset(
        db,
        uid=uid,
        ticker=norm,
        name=payload.name,
        asset_class=payload.asset_class,
        sector=payload.sector,
        broker=payload.broker,
    )
    asset.quantity = payload.quantity
    asset.average_price = payload.average_price
    asset.indexer = payload.indexer
    asset.indexer_rate = payload.indexer_rate
    asset.maturity_date = payload.maturity_date
    asset.notes = payload.notes
    asset.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(asset)
    return {
        "id": str(asset.id),
        "ticker": asset.ticker,
        "name": asset.name,
        "asset_class": asset.asset_class,
        "quantity": float(asset.quantity),
        "average_price": float(asset.average_price),
    }


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_investment_asset(
    asset_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    aid = parse_uuid(asset_id, "asset_id")
    asset = (
        db.query(InvestmentAsset)
        .filter(InvestmentAsset.id == aid, InvestmentAsset.user_id == uid, InvestmentAsset.deleted_at.is_(None))
        .first()
    )
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ativo não encontrado.")
    asset.deleted_at = datetime.utcnow()
    db.commit()
    return None


# ============ Dividends Endpoints ============


@router.get("/dividends")
async def list_dividends(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    rows = (
        db.query(InvestmentDividend, InvestmentAsset.ticker, InvestmentAsset.name)
        .join(InvestmentAsset, InvestmentAsset.id == InvestmentDividend.asset_id)
        .filter(InvestmentDividend.user_id == uid, InvestmentAsset.deleted_at.is_(None))
        .order_by(InvestmentDividend.payment_date.desc())
        .limit(120)
        .all()
    )
    return [
        {
            "id": str(d.id),
            "asset_id": str(d.asset_id),
            "ticker": tk,
            "asset_name": nm,
            "dividend_type": d.dividend_type,
            "ex_date": d.ex_date.isoformat() if d.ex_date else None,
            "payment_date": d.payment_date.isoformat(),
            "amount_per_share": float(d.amount_per_share) if d.amount_per_share is not None else None,
            "total_amount": float(d.total_amount),
            "notes": d.notes,
        }
        for d, tk, nm in rows
    ]


@router.post("/dividends", status_code=status.HTTP_201_CREATED)
async def create_dividend(
    payload: DividendCreateRequest,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    norm = normalize_ticker(payload.ticker)
    asset = _get_or_create_asset(db, uid=uid, ticker=norm)
    dhash = _div_dedup_hash(uid, norm, payload.dividend_type, payload.payment_date, payload.total_amount)
    existing = (
        db.query(InvestmentDividend)
        .filter(InvestmentDividend.user_id == uid, InvestmentDividend.dedup_hash == dhash)
        .first()
    )
    if existing:
        return {"id": str(existing.id), "ticker": norm, "duplicate_skipped": True}

    div = InvestmentDividend(
        user_id=uid,
        asset_id=asset.id,
        dividend_type=payload.dividend_type,
        ex_date=payload.ex_date,
        payment_date=payload.payment_date,
        amount_per_share=payload.amount_per_share,
        total_amount=payload.total_amount,
        notes=payload.notes,
        dedup_hash=dhash,
    )
    db.add(div)
    db.commit()
    db.refresh(div)
    return {
        "id": str(div.id),
        "ticker": norm,
        "payment_date": div.payment_date.isoformat(),
        "total_amount": float(div.total_amount),
        "duplicate_skipped": False,
    }


@router.delete("/dividends/{div_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dividend(
    div_id: str,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    uid = parse_uuid(user_id, "user_id")
    did = parse_uuid(div_id, "div_id")
    div = db.query(InvestmentDividend).filter(InvestmentDividend.id == did, InvestmentDividend.user_id == uid).first()
    if not div:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Provento não encontrado.")
    db.delete(div)
    db.commit()
    return None


# ============ B3 Investor Area Import (.CSV / .XLSX) ============


def _norm_col(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", (s or "").lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c)).strip()


def _parse_br_num(val: Any) -> Optional[Decimal]:
    s = str(val or "").replace("R$", "").replace(" ", "").strip()
    if not s or s == "-":
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return Decimal(s)
    except Exception:
        return None


def _parse_br_date(val: Any) -> Optional[date]:
    s = str(val or "").strip()
    m = re.match(r"^(\d{1,2})[/\-](\d{1,2})[/\-](20\d{2})$", s)
    if m:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    m_iso = re.match(r"^(20\d{2})-(\d{2})-(\d{2})", s)
    if m_iso:
        return date(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3)))
    # Excel serial date number
    try:
        serial = float(s)
        if 35000 <= serial <= 60000:
            return date(1899, 12, 30) + timedelta(days=int(serial))
    except ValueError:
        pass
    return None


def _read_xlsx_rows(content: bytes) -> list[dict[str, str]]:
    """Lightweight stdlib XLSX parser (first worksheet) — zero extra dependencies."""
    with zipfile.ZipFile(io.BytesIO(content), "r") as z:
        ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        strings: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            sroot = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in sroot.findall("m:si", ns):
                strings.append("".join(t.text or "" for t in si.findall(".//m:t", ns)))
        sheet_names = sorted(n for n in z.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml"))
        if not sheet_names:
            return []
        root = ET.fromstring(z.read(sheet_names[0]))
        raw_rows: list[list[str]] = []
        for row in root.findall(".//m:sheetData/m:row", ns):
            vals = []
            for c in row.findall("m:c", ns):
                t = c.attrib.get("t")
                v = c.find("m:v", ns)
                if t == "s" and v is not None and v.text is not None:
                    vals.append(strings[int(v.text)])
                elif v is not None and v.text is not None:
                    vals.append(v.text)
                else:
                    vals.append("")
            if any(x.strip() for x in vals):
                raw_rows.append(vals)
        if len(raw_rows) < 2:
            return []
        headers = raw_rows[0]
        return [
            {headers[i]: (r[i] if i < len(r) else "") for i in range(len(headers))}
            for r in raw_rows[1:]
        ]


@router.post("/import-b3", status_code=status.HTTP_201_CREATED)
async def import_b3_file(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Import B3 Investor Area export (`.csv` or `.xlsx`: Movimentação / Negociação / Posição)
    with full SHA-256 deduplication for trades and dividends.
    """
    uid = parse_uuid(user_id, "user_id")
    content = await file.read()
    fname = (file.filename or "").lower()

    if fname.endswith(".xlsx"):
        rows = _read_xlsx_rows(content)
    else:
        text = ""
        for enc in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                text = content.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        delim = ";" if text[:1024].count(";") > text[:1024].count(",") else ","
        rows = list(csv.DictReader(io.StringIO(text), delimiter=delim))

    if not rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arquivo B3 vazio ou formato não reconhecido.")

    trades_imported = 0
    dividends_imported = 0
    duplicates_skipped = 0
    touched_assets: set[InvestmentAsset] = set()

    for row in rows:
        norm_map = {_norm_col(k): v for k, v in row.items() if k}
        raw_prod = (
            norm_map.get("produto")
            or norm_map.get("codigo de negociacao")
            or norm_map.get("ticker")
            or norm_map.get("ativo")
            or ""
        )
        # B3 format often looks like "PETR4 - PETROBRAS PN"
        ticker_token = str(raw_prod).split("-")[0].strip()
        ticker = normalize_ticker(ticker_token)
        if not ticker or len(ticker) < 3:
            continue

        name_part = str(raw_prod).split("-", 1)[1].strip() if "-" in str(raw_prod) else ticker
        mov_raw = _norm_col(
            norm_map.get("movimentacao")
            or norm_map.get("tipo de movimentacao")
            or norm_map.get("operacao")
            or norm_map.get("entrada/saida")
            or "compra"
        )
        dt = _parse_br_date(norm_map.get("data") or norm_map.get("data do negocio") or norm_map.get("pagamento")) or date.today()
        qty = _parse_br_num(norm_map.get("quantidade") or norm_map.get("qtd")) or Decimal("0")
        price = _parse_br_num(norm_map.get("preco unitario") or norm_map.get("preco") or norm_map.get("valor unitario")) or Decimal("0")
        total = _parse_br_num(norm_map.get("valor da operacao") or norm_map.get("valor liquido") or norm_map.get("valor")) or Decimal("0")
        broker = (norm_map.get("instituicao") or norm_map.get("corretora") or "").strip() or None

        asset = _get_or_create_asset(db, uid=uid, ticker=ticker, name=name_part, broker=broker)

        # Detect Dividend / JCP / Rendimento
        if any(k in mov_raw for k in ("dividendo", "jcp", "juros sobre capital", "rendimento")):
            div_amt = total if total > 0 else (qty * price)
            if div_amt <= 0:
                continue
            div_type = "jcp" if "jcp" in mov_raw or "juros" in mov_raw else ("fii_yield" if "rendimento" in mov_raw else "dividend")
            dhash = _div_dedup_hash(uid, ticker, div_type, dt, div_amt)
            if db.query(InvestmentDividend).filter(InvestmentDividend.user_id == uid, InvestmentDividend.dedup_hash == dhash).first():
                duplicates_skipped += 1
                continue
            db.add(
                InvestmentDividend(
                    user_id=uid,
                    asset_id=asset.id,
                    dividend_type=div_type,
                    payment_date=dt,
                    amount_per_share=price if price > 0 else None,
                    total_amount=div_amt,
                    notes=f"Importado B3 ({file.filename})",
                    dedup_hash=dhash,
                )
            )
            dividends_imported += 1
            continue

        # Otherwise Buy / Sell trade
        if qty <= 0:
            continue
        if price <= 0 and total > 0:
            price = total / qty
        op = "sell" if ("venda" in mov_raw or "debito" in mov_raw and "compra" not in mov_raw) else "buy"
        dhash = _trade_dedup_hash(uid, ticker, op, dt, qty, price)
        if db.query(InvestmentTrade).filter(InvestmentTrade.user_id == uid, InvestmentTrade.dedup_hash == dhash).first():
            duplicates_skipped += 1
            continue

        db.add(
            InvestmentTrade(
                user_id=uid,
                asset_id=asset.id,
                operation=op,
                trade_date=dt,
                quantity=qty,
                unit_price=price,
                fees=Decimal("0"),
                broker=broker,
                notes=f"Importado B3 ({file.filename})",
                dedup_hash=dhash,
            )
        )
        touched_assets.add(asset)
        trades_imported += 1

    db.flush()
    for a in touched_assets:
        recalculate_asset_position(db, a)
    db.commit()

    return {
        "trades_imported": trades_imported,
        "dividends_imported": dividends_imported,
        "duplicates_skipped": duplicates_skipped,
        "assets_updated": len(touched_assets),
    }


# ============ Pluggy Investments Sync (Brokers / B3) ============


@router.post("/sync-pluggy")
async def sync_pluggy_investments(
    payload: Optional[SyncPluggyInvestmentsRequest] = None,
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Sync B3 / Broker investment positions from connected Pluggy items (deduplicated)."""
    uid = parse_uuid(user_id, "user_id")
    item_ids: list[str] = []
    if payload and payload.item_id:
        item_ids = [payload.item_id]
    else:
        linked = (
            db.query(OFLinkedAccount)
            .filter(
                OFLinkedAccount.user_id == uid,
                OFLinkedAccount.provider == "pluggy",
                OFLinkedAccount.is_active.is_(True),
            )
            .all()
        )
        item_ids = sorted({a.external_item_id for a in linked if a.external_item_id})
        if not item_ids:
            item_ids = [f"sandbox-b3-{str(uid)[:8]}"]

    synced = 0
    created = 0
    for item_id in item_ids:
        positions = await fetch_pluggy_investments(item_id)
        for pos in positions:
            raw_code = pos.get("code") or pos.get("isin") or pos.get("name") or "ATIVO"
            ticker = normalize_ticker(str(raw_code))
            if not ticker:
                continue
            p_type = str(pos.get("type") or "").upper()
            p_sub = str(pos.get("subtype") or "").upper()
            if p_type == "FIXED_INCOME" or p_sub in ("CDB", "LCI", "LCA", "TREASURY"):
                cls = "fixed_income"
            elif "REAL_ESTATE" in p_sub or "FII" in p_sub:
                cls = "fii"
            elif "ETF" in p_sub:
                cls = "etf"
            elif "BDR" in p_sub:
                cls = "bdr"
            else:
                cls = classify_b3_ticker(ticker)

            broker = ((pos.get("institution") or {}).get("name")) or "Pluggy / B3"
            qty = Decimal(str(pos.get("quantity") or 1))
            val = Decimal(str(pos.get("value") or pos.get("balance") or 0))
            if qty <= 0 or val <= 0:
                continue

            existing = (
                db.query(InvestmentAsset)
                .filter(
                    InvestmentAsset.user_id == uid,
                    InvestmentAsset.ticker == ticker,
                    InvestmentAsset.deleted_at.is_(None),
                )
                .first()
            )
            if existing is None:
                existing = _get_or_create_asset(
                    db,
                    uid=uid,
                    ticker=ticker,
                    name=str(pos.get("name") or ticker),
                    asset_class=cls,
                    broker=broker,
                )
                created += 1

            existing.quantity = qty
            if float(existing.average_price or 0) == 0:
                existing.average_price = val
            existing.external_id = str(pos.get("id") or "")
            existing.indexer = pos.get("rateType") or existing.indexer
            if pos.get("rate"):
                existing.indexer_rate = Decimal(str(pos["rate"]))
            existing.updated_at = datetime.utcnow()
            synced += 1

    db.commit()
    return {
        "items_synced": len(item_ids),
        "positions_synced": synced,
        "positions_created": created,
    }
