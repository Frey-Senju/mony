"""
Mony Valuer — Fundamentalist Valuation, B3 Opportunity Radars, Mata-Mata Comparator,
Technical Analysis (SMA 20/50/200, RSI 14, Support/Resistance), and Markets Daily Briefing.

Inspired by Adapta Valuer, built seamlessly on top of Mony's zero-key Yahoo Finance + brapi + BCB engine.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
import logging
import math
import os
from statistics import median
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
import httpx
from sqlalchemy.orm import Session

from database.base import get_db
from database.models import InvestmentAsset, MarketQuoteCache
from services.market_data import (
    classify_b3_ticker,
    get_bcb_macro_rates as get_bcb_benchmarks,
    get_quote,
    normalize_ticker,
)
from utils.auth import get_current_user_from_header
from utils.uuid_utils import parse_uuid

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/valuer", tags=["valuer"])

# ============ Curated B3 Liquid Universe (IBOV / IDIV / B.E.S.T. / IFIX) ============
# Baseline CVM-style fundamentals combined with live MarketQuoteCache / Yahoo prices whenever available.

B3_UNIVERSE: list[dict[str, Any]] = [
    # --- Bancos & Seguros (B.E.S.T.) ---
    {"ticker": "BBAS3", "name": "Banco do Brasil", "asset_class": "stock", "sector": "Bancos", "best_pillar": "Bancos", "ref_price": 27.40, "lpa": 6.45, "vpa": 31.80, "dpa_12m": 2.85, "roe": 21.2, "net_margin": 24.5, "net_debt_ebitda": 0.0, "payout": 0.45, "div_streak": 15},
    {"ticker": "ITUB4", "name": "Itaú Unibanco", "asset_class": "stock", "sector": "Bancos", "best_pillar": "Bancos", "ref_price": 34.80, "lpa": 4.10, "vpa": 19.60, "dpa_12m": 2.45, "roe": 22.1, "net_margin": 26.8, "net_debt_ebitda": 0.0, "payout": 0.60, "div_streak": 20},
    {"ticker": "BBDC4", "name": "Bradesco", "asset_class": "stock", "sector": "Bancos", "best_pillar": "Bancos", "ref_price": 13.60, "lpa": 1.85, "vpa": 15.90, "dpa_12m": 1.08, "roe": 12.4, "net_margin": 15.2, "net_debt_ebitda": 0.0, "payout": 0.58, "div_streak": 18},
    {"ticker": "SANB11", "name": "Santander Brasil", "asset_class": "stock", "sector": "Bancos", "best_pillar": "Bancos", "ref_price": 28.20, "lpa": 3.55, "vpa": 24.20, "dpa_12m": 1.82, "roe": 15.8, "net_margin": 18.0, "net_debt_ebitda": 0.0, "payout": 0.52, "div_streak": 14},
    {"ticker": "BBSE3", "name": "BB Seguridade", "asset_class": "stock", "sector": "Seguros", "best_pillar": "Seguros", "ref_price": 36.90, "lpa": 4.15, "vpa": 5.90, "dpa_12m": 3.45, "roe": 72.0, "net_margin": 58.0, "net_debt_ebitda": 0.0, "payout": 0.85, "div_streak": 11},
    {"ticker": "CXSE3", "name": "Caixa Seguridade", "asset_class": "stock", "sector": "Seguros", "best_pillar": "Seguros", "ref_price": 15.10, "lpa": 1.32, "vpa": 4.40, "dpa_12m": 1.22, "roe": 30.5, "net_margin": 51.0, "net_debt_ebitda": 0.0, "payout": 0.90, "div_streak": 5},
    # --- Energia & Saneamento & Telecom (B.E.S.T.) ---
    {"ticker": "TAEE11", "name": "Taesa", "asset_class": "stock", "sector": "Energia Elétrica", "best_pillar": "Energia", "ref_price": 34.10, "lpa": 4.20, "vpa": 20.80, "dpa_12m": 3.25, "roe": 20.1, "net_margin": 42.0, "net_debt_ebitda": 3.4, "payout": 0.78, "div_streak": 16},
    {"ticker": "ISAE4", "name": "ISA Energia Brasil", "asset_class": "stock", "sector": "Energia Elétrica", "best_pillar": "Energia", "ref_price": 24.50, "lpa": 3.85, "vpa": 28.90, "dpa_12m": 2.25, "roe": 13.8, "net_margin": 36.0, "net_debt_ebitda": 2.9, "payout": 0.62, "div_streak": 15},
    {"ticker": "CPLE6", "name": "Copel", "asset_class": "stock", "sector": "Energia Elétrica", "best_pillar": "Energia", "ref_price": 10.20, "lpa": 0.95, "vpa": 8.40, "dpa_12m": 0.68, "roe": 11.8, "net_margin": 12.6, "net_debt_ebitda": 2.1, "payout": 0.65, "div_streak": 12},
    {"ticker": "EGIE3", "name": "Engie Brasil", "asset_class": "stock", "sector": "Energia Elétrica", "best_pillar": "Energia", "ref_price": 41.20, "lpa": 4.40, "vpa": 14.90, "dpa_12m": 3.15, "roe": 31.2, "net_margin": 29.4, "net_debt_ebitda": 2.5, "payout": 0.72, "div_streak": 19},
    {"ticker": "CMIG4", "name": "Cemig", "asset_class": "stock", "sector": "Energia Elétrica", "best_pillar": "Energia", "ref_price": 11.40, "lpa": 2.15, "vpa": 9.80, "dpa_12m": 1.32, "roe": 22.0, "net_margin": 16.4, "net_debt_ebitda": 1.3, "payout": 0.60, "div_streak": 13},
    {"ticker": "ELET3", "name": "Eletrobras", "asset_class": "stock", "sector": "Energia Elétrica", "best_pillar": "Energia", "ref_price": 39.80, "lpa": 3.70, "vpa": 49.50, "dpa_12m": 1.65, "roe": 8.5, "net_margin": 19.2, "net_debt_ebitda": 1.9, "payout": 0.45, "div_streak": 8},
    {"ticker": "SAPR11", "name": "Sanepar", "asset_class": "stock", "sector": "Saneamento", "best_pillar": "Saneamento", "ref_price": 28.90, "lpa": 5.10, "vpa": 34.20, "dpa_12m": 2.18, "roe": 15.2, "net_margin": 23.5, "net_debt_ebitda": 1.6, "payout": 0.44, "div_streak": 14},
    {"ticker": "SBSP3", "name": "Sabesp", "asset_class": "stock", "sector": "Saneamento", "best_pillar": "Saneamento", "ref_price": 92.50, "lpa": 8.10, "vpa": 49.80, "dpa_12m": 3.40, "roe": 16.8, "net_margin": 21.0, "net_debt_ebitda": 1.7, "payout": 0.42, "div_streak": 14},
    {"ticker": "VIVT3", "name": "Vivo Telefônica", "asset_class": "stock", "sector": "Telecomunicações", "best_pillar": "Telecom", "ref_price": 51.30, "lpa": 3.45, "vpa": 42.10, "dpa_12m": 3.70, "roe": 8.6, "net_margin": 10.4, "net_debt_ebitda": 0.8, "payout": 0.95, "div_streak": 16},
    # --- Commodities, Indústria & Blue Chips ---
    {"ticker": "PETR4", "name": "Petrobras PN", "asset_class": "stock", "sector": "Petróleo & Gás", "best_pillar": None, "ref_price": 37.90, "lpa": 8.90, "vpa": 30.60, "dpa_12m": 5.85, "roe": 28.5, "net_margin": 23.1, "net_debt_ebitda": 0.9, "payout": 0.65, "div_streak": 7},
    {"ticker": "PRIO3", "name": "PRIO (PetroRio)", "asset_class": "stock", "sector": "Petróleo & Gás", "best_pillar": None, "ref_price": 43.20, "lpa": 5.95, "vpa": 19.40, "dpa_12m": 0.45, "roe": 31.0, "net_margin": 41.2, "net_debt_ebitda": 1.1, "payout": 0.08, "div_streak": 2},
    {"ticker": "VALE3", "name": "Vale S.A.", "asset_class": "stock", "sector": "Mineração", "best_pillar": None, "ref_price": 58.60, "lpa": 10.80, "vpa": 47.20, "dpa_12m": 5.65, "roe": 22.8, "net_margin": 24.0, "net_debt_ebitda": 0.7, "payout": 0.52, "div_streak": 10},
    {"ticker": "WEGE3", "name": "WEG S.A.", "asset_class": "stock", "sector": "Bens Industriais", "best_pillar": None, "ref_price": 52.40, "lpa": 1.48, "vpa": 4.70, "dpa_12m": 0.74, "roe": 33.4, "net_margin": 17.5, "net_debt_ebitda": -0.3, "payout": 0.50, "div_streak": 22},
    {"ticker": "KLBN11", "name": "Klabin", "asset_class": "stock", "sector": "Papel & Celulose", "best_pillar": None, "ref_price": 21.80, "lpa": 2.45, "vpa": 10.90, "dpa_12m": 1.45, "roe": 21.8, "net_margin": 14.8, "net_debt_ebitda": 3.1, "payout": 0.58, "div_streak": 12},
    {"ticker": "SUZB3", "name": "Suzano", "asset_class": "stock", "sector": "Papel & Celulose", "best_pillar": None, "ref_price": 57.90, "lpa": 7.60, "vpa": 34.50, "dpa_12m": 1.95, "roe": 21.0, "net_margin": 20.5, "net_debt_ebitda": 3.0, "payout": 0.25, "div_streak": 6},
    {"ticker": "B3SA3", "name": "B3 Brasil Bolsa Balcão", "asset_class": "stock", "sector": "Serviços Financeiros", "best_pillar": "Bancos", "ref_price": 11.10, "lpa": 0.86, "vpa": 3.65, "dpa_12m": 0.58, "roe": 23.8, "net_margin": 44.5, "net_debt_ebitda": 0.4, "payout": 0.68, "div_streak": 15},
    {"ticker": "ABEV3", "name": "Ambev", "asset_class": "stock", "sector": "Consumo & Bebidas", "best_pillar": None, "ref_price": 12.40, "lpa": 0.94, "vpa": 5.85, "dpa_12m": 0.78, "roe": 16.5, "net_margin": 18.2, "net_debt_ebitda": -0.5, "payout": 0.82, "div_streak": 17},
    {"ticker": "ITSA4", "name": "Itaúsa", "asset_class": "stock", "sector": "Holdings", "best_pillar": "Bancos", "ref_price": 10.35, "lpa": 1.45, "vpa": 8.40, "dpa_12m": 0.86, "roe": 17.5, "net_margin": 45.0, "net_debt_ebitda": 0.2, "payout": 0.59, "div_streak": 20},
    # --- FIIs IFIX (Tijolo, Papel, Logística, Shoppings, Híbrido) ---
    {"ticker": "MXRF11", "name": "Maxi Renda FII", "asset_class": "fii", "sector": "FII · Papel (CRI)", "fii_segment": "Papel", "ref_price": 9.85, "lpa": 1.18, "vpa": 9.75, "dpa_12m": 1.18, "roe": 12.1, "net_margin": 92.0, "net_debt_ebitda": 0.0, "payout": 0.96, "div_streak": 10, "vacancy_pct": 0.0},
    {"ticker": "HGLG11", "name": "Pátria Logística FII", "asset_class": "fii", "sector": "FII · Logística", "fii_segment": "Logística", "ref_price": 156.50, "lpa": 13.40, "vpa": 158.20, "dpa_12m": 13.20, "roe": 8.6, "net_margin": 88.0, "net_debt_ebitda": 0.4, "payout": 0.95, "div_streak": 12, "vacancy_pct": 5.2},
    {"ticker": "BTLG11", "name": "BTG Pactual Logística", "asset_class": "fii", "sector": "FII · Logística", "fii_segment": "Logística", "ref_price": 97.40, "lpa": 9.25, "vpa": 103.50, "dpa_12m": 9.18, "roe": 9.1, "net_margin": 89.0, "net_debt_ebitda": 0.3, "payout": 0.96, "div_streak": 8, "vacancy_pct": 2.4},
    {"ticker": "XPLG11", "name": "XP Log FII", "asset_class": "fii", "sector": "FII · Logística", "fii_segment": "Logística", "ref_price": 96.80, "lpa": 9.45, "vpa": 110.40, "dpa_12m": 9.36, "roe": 8.8, "net_margin": 87.0, "net_debt_ebitda": 0.5, "payout": 0.95, "div_streak": 7, "vacancy_pct": 3.8},
    {"ticker": "KNRI11", "name": "Kinea Renda Imobiliária", "asset_class": "fii", "sector": "FII · Híbrido", "fii_segment": "Híbrido", "ref_price": 141.20, "lpa": 12.15, "vpa": 161.90, "dpa_12m": 12.00, "roe": 7.9, "net_margin": 86.0, "net_debt_ebitda": 0.2, "payout": 0.96, "div_streak": 13, "vacancy_pct": 3.1},
    {"ticker": "XPML11", "name": "XP Malls FII", "asset_class": "fii", "sector": "FII · Shoppings", "fii_segment": "Shoppings", "ref_price": 104.60, "lpa": 11.10, "vpa": 116.80, "dpa_12m": 11.04, "roe": 9.6, "net_margin": 85.0, "net_debt_ebitda": 0.6, "payout": 0.96, "div_streak": 7, "vacancy_pct": 4.2},
    {"ticker": "VISC11", "name": "Vinci Shopping Centers", "asset_class": "fii", "sector": "FII · Shoppings", "fii_segment": "Shoppings", "ref_price": 103.80, "lpa": 10.40, "vpa": 124.20, "dpa_12m": 10.20, "roe": 8.5, "net_margin": 84.0, "net_debt_ebitda": 0.5, "payout": 0.95, "div_streak": 7, "vacancy_pct": 5.5},
    {"ticker": "KNCR11", "name": "Kinea Rendimentos (CDI)", "asset_class": "fii", "sector": "FII · Papel (CDI)", "fii_segment": "Papel", "ref_price": 103.50, "lpa": 12.40, "vpa": 101.60, "dpa_12m": 12.35, "roe": 12.2, "net_margin": 94.0, "net_debt_ebitda": 0.0, "payout": 0.97, "div_streak": 11, "vacancy_pct": 0.0},
    {"ticker": "KNIP11", "name": "Kinea Índices de Preços", "asset_class": "fii", "sector": "FII · Papel (IPCA)", "fii_segment": "Papel", "ref_price": 89.40, "lpa": 10.50, "vpa": 96.30, "dpa_12m": 10.40, "roe": 11.1, "net_margin": 93.0, "net_debt_ebitda": 0.0, "payout": 0.96, "div_streak": 8, "vacancy_pct": 0.0},
    {"ticker": "CPTS11", "name": "Capitânia Securities II", "asset_class": "fii", "sector": "FII · Papel (CRI)", "fii_segment": "Papel", "ref_price": 7.45, "lpa": 0.91, "vpa": 8.75, "dpa_12m": 0.90, "roe": 10.5, "net_margin": 90.0, "net_debt_ebitda": 0.0, "payout": 0.96, "div_streak": 9, "vacancy_pct": 0.0},
    {"ticker": "LVBI11", "name": "VBI Logístico FII", "asset_class": "fii", "sector": "FII · Logística", "fii_segment": "Logística", "ref_price": 101.20, "lpa": 10.30, "vpa": 116.50, "dpa_12m": 10.15, "roe": 8.9, "net_margin": 88.0, "net_debt_ebitda": 0.4, "payout": 0.95, "div_streak": 6, "vacancy_pct": 2.9},
    {"ticker": "TRXF11", "name": "TRX Real Estate FII", "asset_class": "fii", "sector": "FII · Renda Urbana", "fii_segment": "Tijolo", "ref_price": 102.90, "lpa": 11.35, "vpa": 106.40, "dpa_12m": 11.20, "roe": 10.7, "net_margin": 89.0, "net_debt_ebitda": 0.7, "payout": 0.96, "div_streak": 5, "vacancy_pct": 0.8},
]

UNIVERSE_BY_TICKER: dict[str, dict[str, Any]] = {item["ticker"]: item for item in B3_UNIVERSE}

_markets_cache: dict[str, Any] = {"ts": 0.0, "items": []}


# ============ Core Valuation & Scoring Engine ============


def compute_asset_valuation(
    base: dict[str, Any],
    *,
    live_price: Optional[float] = None,
    live_change_pct: Optional[float] = None,
    live_dy_12m: Optional[float] = None,
    live_pe: Optional[float] = None,
    live_pvp: Optional[float] = None,
    min_dy_bazin: float = 6.0,
    discount_rate_pct: float = 12.5,
    growth_rate_pct: Optional[float] = None,
    ipca_pct: float = 4.5,
) -> dict[str, Any]:
    """Compute Bazin, Graham, Gordon, Consensus Ceiling, Margin of Safety & 0-100 Mony Score."""
    is_fii = base.get("asset_class") == "fii"
    price = float(live_price) if live_price and live_price > 0 else float(base.get("ref_price") or 0)
    change_pct = float(live_change_pct) if live_change_pct is not None else 0.0

    # Derive fundamentals combining live multiples with CVM baseline
    lpa = float(base.get("lpa") or 0)
    vpa = float(base.get("vpa") or 0)
    dpa_12m = float(base.get("dpa_12m") or 0)

    if live_dy_12m is not None and live_dy_12m > 0 and price > 0:
        dpa_12m = round(price * (float(live_dy_12m) / 100.0), 4)
    if live_pe is not None and live_pe > 0 and price > 0 and lpa <= 0:
        lpa = round(price / float(live_pe), 4)
    if live_pvp is not None and live_pvp > 0 and price > 0 and vpa <= 0:
        vpa = round(price / float(live_pvp), 4)

    dy_12m = round((dpa_12m / price) * 100, 2) if price > 0 and dpa_12m > 0 else float(live_dy_12m or 0)
    pe_ratio = round(price / lpa, 2) if lpa > 0 else (round(float(live_pe), 2) if live_pe else None)
    pvp_ratio = round(price / vpa, 2) if vpa > 0 else (round(float(live_pvp), 2) if live_pvp else None)
    roe = float(base.get("roe") or (round((lpa / vpa) * 100, 1) if lpa > 0 and vpa > 0 else 0))
    net_margin = float(base.get("net_margin") or 0)
    net_debt_ebitda = float(base.get("net_debt_ebitda") or 0)
    payout = float(base.get("payout") or 0.5)
    div_streak = int(base.get("div_streak") or 0)

    # 1. Bazin Ceiling Price (FIIs default target 8.5% or user min_dy if higher)
    eff_min_dy = max(min_dy_bazin, 8.5) if is_fii and min_dy_bazin <= 6.5 else min_dy_bazin
    bazin_price = round(dpa_12m / (eff_min_dy / 100.0), 2) if dpa_12m > 0 and eff_min_dy > 0 else None

    # 2. Benjamin Graham Fair Value: sqrt(22.5 * LPA * VPA) for stocks; VPA (Book Value) for FIIs
    if is_fii:
        graham_price = round(vpa, 2) if vpa > 0 else None
    else:
        graham_price = round(math.sqrt(22.5 * lpa * vpa), 2) if lpa > 0 and vpa > 0 else None

    # 3. Gordon Growth Model (DDM): D1 / (k - g)
    k = max(0.08, discount_rate_pct / 100.0)
    if growth_rate_pct is not None:
        g = max(0.0, min(growth_rate_pct / 100.0, k - 0.025))
    else:
        # Cap perpetual growth g conservatively (<= 5% for stocks, <= 3.5% for FIIs)
        cap_g = 0.035 if is_fii else 0.05
        est_g = max(0.015, min(cap_g, (roe / 100.0) * max(0.05, 1.0 - payout)))
        g = min(est_g, k - 0.03)
    gordon_price = round((dpa_12m * (1.0 + g)) / (k - g), 2) if dpa_12m > 0 and (k - g) > 0.01 else None

    # Consensus Ceiling = median of available models
    models = [m for m in (bazin_price, graham_price, gordon_price) if m is not None and m > 0]
    consensus_price = round(float(median(models)), 2) if models else None

    # Margin of Safety relative to consensus ceiling
    mos_pct = round(((consensus_price - price) / consensus_price) * 100, 1) if consensus_price and consensus_price > 0 and price > 0 else 0.0
    bazin_mos_pct = round(((bazin_price - price) / bazin_price) * 100, 1) if bazin_price and bazin_price > 0 and price > 0 else 0.0
    graham_mos_pct = round(((graham_price - price) / graham_price) * 100, 1) if graham_price and graham_price > 0 and price > 0 else 0.0

    # Verdict semaphore
    if consensus_price is None:
        verdict = "neutro"
        verdict_label = "Sem Valuation"
    elif mos_pct >= 12.0:
        verdict = "barato"
        verdict_label = "Abaixo do Teto"
    elif mos_pct >= -5.0:
        verdict = "justo"
        verdict_label = "Preço Justo"
    else:
        verdict = "caro"
        verdict_label = "Acima do Teto"

    # Real yield spread over IPCA (especially valuable for FIIs & income stocks)
    real_yield_spread = round((((1.0 + dy_12m / 100.0) / (1.0 + ipca_pct / 100.0)) - 1.0) * 100, 2) if dy_12m > 0 else 0.0

    # Fundamentalist Checklist (Green/Red criteria — Adapta Valuer Mata-Mata style)
    checklist = [
        {"id": "mos", "label": "Margem de Segurança ≥ 10%", "ok": mos_pct >= 10.0, "value": f"{mos_pct:+.1f}%"},
        {"id": "dy", "label": f"DY 12m ≥ {'8%' if is_fii else '6%'}", "ok": dy_12m >= (8.0 if is_fii else 6.0), "value": f"{dy_12m:.2f}%"},
        {"id": "pvp", "label": f"P/VP ≤ {'1,00' if is_fii else '2,00'}", "ok": pvp_ratio is not None and pvp_ratio <= (1.0 if is_fii else 2.0), "value": f"{pvp_ratio:.2f}" if pvp_ratio else "—"},
        {"id": "pl", "label": "P/L ≤ 12x (ou FII eficiente)", "ok": True if is_fii else (pe_ratio is not None and 0 < pe_ratio <= 12.0), "value": f"{pe_ratio:.1f}x" if pe_ratio else "—"},
        {"id": "roe", "label": f"ROE ≥ {'8%' if is_fii else '15%'}", "ok": roe >= (8.0 if is_fii else 15.0), "value": f"{roe:.1f}%"},
        {"id": "debt", "label": "Dív.Líq/EBITDA ≤ 2,5x", "ok": net_debt_ebitda <= 2.5, "value": f"{net_debt_ebitda:.1f}x"},
        {"id": "margin", "label": "Margem Líquida ≥ 15%", "ok": net_margin >= 15.0, "value": f"{net_margin:.1f}%"},
        {"id": "streak", "label": "Consistência Dividendos ≥ 5 anos", "ok": div_streak >= 5, "value": f"{div_streak} anos"},
    ]
    passed_count = sum(1 for c in checklist if c["ok"])

    # Mony Fundamental Score (0-100)
    score_val = min(30, max(0, round(15 + mos_pct * 0.55)))
    score_dy = min(25, round(min(dy_12m, 12.0) * 1.6 + min(div_streak, 15) * 0.4))
    score_prof = min(25, round(min(roe, 25.0) * 0.7 + min(net_margin, 30.0) * 0.25))
    pvp_pts = 12 if (pvp_ratio is not None and pvp_ratio <= (1.0 if is_fii else 1.5)) else (7 if pvp_ratio is not None and pvp_ratio <= 2.5 else 3)
    debt_pts = 8 if net_debt_ebitda <= 1.5 else (5 if net_debt_ebitda <= 2.8 else 2)
    total_score = int(min(100, max(10, score_val + score_dy + score_prof + pvp_pts + debt_pts)))

    return {
        "ticker": base["ticker"],
        "name": base.get("name") or base["ticker"],
        "asset_class": base.get("asset_class") or classify_b3_ticker(base["ticker"]),
        "sector": base.get("sector") or "B3",
        "best_pillar": base.get("best_pillar"),
        "fii_segment": base.get("fii_segment"),
        "vacancy_pct": base.get("vacancy_pct"),
        "price": round(price, 2),
        "change_pct": round(change_pct, 2),
        "dpa_12m": round(dpa_12m, 2),
        "dy_12m": dy_12m,
        "pe_ratio": pe_ratio,
        "pvp_ratio": pvp_ratio,
        "lpa": round(lpa, 2),
        "vpa": round(vpa, 2),
        "roe": round(roe, 1),
        "net_margin": round(net_margin, 1),
        "net_debt_ebitda": round(net_debt_ebitda, 2),
        "payout_pct": round(payout * 100, 1),
        "div_streak": div_streak,
        "bazin_price": bazin_price,
        "graham_price": graham_price,
        "gordon_price": gordon_price,
        "consensus_price": consensus_price,
        "margin_of_safety_pct": mos_pct,
        "bazin_mos_pct": bazin_mos_pct,
        "graham_mos_pct": graham_mos_pct,
        "real_yield_spread_pct": real_yield_spread,
        "verdict": verdict,
        "verdict_label": verdict_label,
        "score": total_score,
        "checklist": checklist,
        "checklist_passed": passed_count,
        "checklist_total": len(checklist),
        "quote_source": "live" if live_price else "referencia-cvm",
    }


def _compute_technicals(dates: list[str], closes: list[float]) -> dict[str, Any]:
    """Compute SMA20, SMA50, SMA200, RSI(14), 90d Support & Resistance, and 52w range."""
    n = len(closes)
    if n == 0:
        return {
            "series": [],
            "sma20": None,
            "sma50": None,
            "sma200": None,
            "rsi14": None,
            "rsi_signal": "neutro",
            "trend": "lateral",
            "support": None,
            "resistance": None,
            "high_52w": None,
            "low_52w": None,
        }

    # Build SMA & RSI series
    gains: list[float] = [0.0]
    losses: list[float] = [0.0]
    for i in range(1, n):
        diff = closes[i] - closes[i - 1]
        gains.append(max(diff, 0.0))
        losses.append(max(-diff, 0.0))

    series: list[dict[str, Any]] = []
    rsi_vals: list[Optional[float]] = []

    for i in range(n):
        sma20 = round(sum(closes[i - 19 : i + 1]) / 20, 2) if i >= 19 else None
        sma50 = round(sum(closes[i - 49 : i + 1]) / 50, 2) if i >= 49 else None
        sma200 = round(sum(closes[i - 199 : i + 1]) / 200, 2) if i >= 199 else None

        rsi = None
        if i >= 14:
            avg_g = sum(gains[i - 13 : i + 1]) / 14.0
            avg_l = sum(losses[i - 13 : i + 1]) / 14.0
            if avg_l == 0:
                rsi = 100.0 if avg_g > 0 else 50.0
            else:
                rs = avg_g / avg_l
                rsi = round(100.0 - (100.0 / (1.0 + rs)), 1)
        rsi_vals.append(rsi)

        series.append(
            {
                "date": dates[i],
                "label": f"{dates[i][8:10]}/{dates[i][5:7]}",
                "close": round(closes[i], 2),
                "sma20": sma20,
                "sma50": sma50,
                "rsi14": rsi,
            }
        )

    last_close = closes[-1]
    last_sma20 = series[-1]["sma20"]
    last_sma50 = series[-1]["sma50"]
    last_sma200 = round(sum(closes[-200:]) / min(200, n), 2) if n >= 60 else None
    last_rsi = rsi_vals[-1]

    if last_rsi is None:
        rsi_signal = "neutro"
    elif last_rsi <= 32:
        rsi_signal = "sobrevendido"
    elif last_rsi >= 68:
        rsi_signal = "sobrecomprado"
    else:
        rsi_signal = "neutro"

    if last_sma20 and last_sma50:
        if last_close > last_sma20 > last_sma50:
            trend = "alta"
        elif last_close < last_sma20 < last_sma50:
            trend = "baixa"
        else:
            trend = "lateral"
    else:
        trend = "lateral"

    recent90 = sorted(closes[-90:])
    support = round(recent90[max(0, int(len(recent90) * 0.08))], 2)
    resistance = round(recent90[min(len(recent90) - 1, int(len(recent90) * 0.92))], 2)

    # Sample down to max ~90 points for silky-smooth chart rendering
    chart_series = series[-120:]

    return {
        "series": chart_series,
        "sma20": last_sma20,
        "sma50": last_sma50,
        "sma200": last_sma200,
        "rsi14": last_rsi,
        "rsi_signal": rsi_signal,
        "trend": trend,
        "support": support,
        "resistance": resistance,
        "high_52w": round(max(closes), 2),
        "low_52w": round(min(closes), 2),
    }


async def _fetch_yahoo_history(ticker: str, asset_class: str = "stock") -> tuple[list[str], list[float], Optional[float], Optional[float]]:
    """Fetch 1-year daily close series from Yahoo Finance for technical analysis."""
    if os.getenv("PYTEST_CURRENT_TEST"):
        return [], [], None, None
    symbol = f"{ticker}-BRL" if asset_class == "crypto" else f"{ticker}.SA"
    try:
        async with httpx.AsyncClient(
            timeout=10.0,
            headers={"User-Agent": "Mozilla/5.0 (compatible; MonyValuer/1.0)"},
        ) as client:
            resp = await client.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                params={"range": "1y", "interval": "1d", "events": "div"},
            )
            if resp.status_code != 200:
                return [], [], None, None
            res = ((resp.json().get("chart") or {}).get("result") or [])
            if not res:
                return [], [], None, None
            node = res[0]
            ts_list = node.get("timestamp") or []
            raw_closes = (((node.get("indicators") or {}).get("quote") or [{}])[0].get("close") or [])
            dates: list[str] = []
            closes: list[float] = []
            for ts, c in zip(ts_list, raw_closes):
                if c is not None and float(c) > 0:
                    dates.append(datetime.utcfromtimestamp(int(ts)).strftime("%Y-%m-%d"))
                    closes.append(float(c))
            meta = node.get("meta") or {}
            live_price = float(meta.get("regularMarketPrice")) if meta.get("regularMarketPrice") else (closes[-1] if closes else None)
            change_pct = None
            if len(closes) >= 2 and live_price:
                change_pct = round(((live_price - closes[-2]) / closes[-2]) * 100, 2)
            return dates, closes, live_price, change_pct
    except Exception as exc:  # noqa: BLE001
        logger.debug("yahoo history fetch failed for %s: %s", symbol, exc)
        return [], [], None, None


def _get_cached_quotes_map(db: Session, tickers: list[str]) -> dict[str, MarketQuoteCache]:
    if not tickers:
        return {}
    rows = db.query(MarketQuoteCache).filter(MarketQuoteCache.ticker.in_(tickers)).all()
    return {r.ticker: r for r in rows}


# ============ Endpoint 1: B3 Opportunity Radars ============


@router.get("/radar")
async def get_valuer_radar(
    preset: str = Query(default="all", pattern=r"^(all|barganha|dividendos|previdenciario|fiis)$"),
    min_dy: float = Query(default=0.0, ge=0.0, le=50.0),
    max_pl: Optional[float] = Query(default=None, ge=1.0, le=200.0),
    max_pvp: Optional[float] = Query(default=None, ge=0.1, le=50.0),
    min_roe: float = Query(default=0.0, ge=0.0, le=100.0),
    min_mos: Optional[float] = Query(default=None, ge=-100.0, le=100.0),
    min_dy_bazin: float = Query(default=6.0, ge=2.0, le=20.0),
    search: Optional[str] = Query(default=None, max_length=60),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Mony Valuer — 4 Automated B3 Opportunity Radars (Barganha, Dividendos, Previdenciário B.E.S.T., FIIs)
    with Bazin / Graham / Gordon valuation and 0-100 Fundamental Score.
    """
    uid = parse_uuid(user_id, "user_id")
    bench = await get_bcb_benchmarks()
    ipca_pct = float(bench.get("ipca") or 4.5)
    cdi_pct = float(bench.get("cdi") or 14.15)
    discount_rate = min(16.0, max(10.5, cdi_pct - 1.0))

    user_holdings = {
        a.ticker.upper()
        for a in db.query(InvestmentAsset)
        .filter(InvestmentAsset.user_id == uid, InvestmentAsset.deleted_at.is_(None), InvestmentAsset.quantity > 0)
        .all()
    }
    cache_map = _get_cached_quotes_map(db, [u["ticker"] for u in B3_UNIVERSE])

    enriched: list[dict[str, Any]] = []
    for base in B3_UNIVERSE:
        c = cache_map.get(base["ticker"])
        item = compute_asset_valuation(
            base,
            live_price=float(c.price) if c and c.price else None,
            live_change_pct=float(c.change_pct) if c and c.change_pct is not None else None,
            live_dy_12m=float(c.dy_12m) if c and c.dy_12m is not None else None,
            live_pe=float(c.pe_ratio) if c and c.pe_ratio is not None else None,
            live_pvp=float(c.pvp_ratio) if c and c.pvp_ratio is not None else None,
            min_dy_bazin=min_dy_bazin,
            discount_rate_pct=discount_rate,
            ipca_pct=ipca_pct,
        )
        item["in_portfolio"] = base["ticker"] in user_holdings
        enriched.append(item)

    # Apply preset strategy filters
    filtered = enriched
    if preset == "barganha":
        filtered = [x for x in filtered if x["asset_class"] == "stock" and x["margin_of_safety_pct"] >= 5.0 and (x["pe_ratio"] or 99) <= 14.0]
        filtered.sort(key=lambda x: (x["margin_of_safety_pct"], x["score"]), reverse=True)
    elif preset == "dividendos":
        filtered = [x for x in filtered if x["dy_12m"] >= 6.5 and x["bazin_mos_pct"] >= -5.0]
        filtered.sort(key=lambda x: (x["dy_12m"], x["bazin_mos_pct"]), reverse=True)
    elif preset == "previdenciario":
        filtered = [x for x in filtered if x["best_pillar"] is not None]
        filtered.sort(key=lambda x: (x["score"], x["dy_12m"]), reverse=True)
    elif preset == "fiis":
        filtered = [x for x in filtered if x["asset_class"] == "fii"]
        filtered.sort(key=lambda x: ((1.0 - (x["pvp_ratio"] or 1.0)) * 50 + x["dy_12m"] * 2, x["score"]), reverse=True)
    else:
        filtered.sort(key=lambda x: (x["score"], x["margin_of_safety_pct"]), reverse=True)

    # Apply user custom filters
    if min_dy > 0:
        filtered = [x for x in filtered if x["dy_12m"] >= min_dy]
    if max_pl is not None:
        filtered = [x for x in filtered if x["asset_class"] == "fii" or (x["pe_ratio"] is not None and x["pe_ratio"] <= max_pl)]
    if max_pvp is not None:
        filtered = [x for x in filtered if x["pvp_ratio"] is not None and x["pvp_ratio"] <= max_pvp]
    if min_roe > 0:
        filtered = [x for x in filtered if x["roe"] >= min_roe]
    if min_mos is not None:
        filtered = [x for x in filtered if x["margin_of_safety_pct"] >= min_mos]
    if search and search.strip():
        q = search.strip().lower()
        filtered = [
            x for x in filtered
            if q in x["ticker"].lower() or q in x["name"].lower() or q in x["sector"].lower()
        ]

    below_ceiling_count = sum(1 for x in enriched if x["verdict"] == "barato")
    avg_dy = round(sum(x["dy_12m"] for x in filtered) / len(filtered), 2) if filtered else 0.0

    return {
        "preset": preset,
        "min_dy_bazin": min_dy_bazin,
        "benchmarks": bench,
        "universe_count": len(enriched),
        "below_ceiling_count": below_ceiling_count,
        "matched_count": len(filtered),
        "avg_dy_matched": avg_dy,
        "items": filtered,
    }


# ============ Endpoint 2: Mata-Mata Comparator (up to 12 assets) ============


@router.get("/compare")
async def compare_assets_matamata(
    tickers: str = Query(..., description="Comma-separated tickers, up to 12"),
    min_dy_bazin: float = Query(default=6.0, ge=2.0, le=20.0),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Mony Valuer — Mata-Mata side-by-side fundamentalist showdown (2 to 12 B3 assets).
    Highlights row winners and declares the overall champion.
    """
    _ = parse_uuid(user_id, "user_id")
    raw_list = [normalize_ticker(t) for t in tickers.split(",") if normalize_ticker(t)]
    unique_tickers = list(dict.fromkeys(raw_list))[:12]
    if len(unique_tickers) < 2:
        raise HTTPException(status_code=400, detail="Informe pelo menos 2 tickers para o Mata-Mata.")

    bench = await get_bcb_benchmarks()
    ipca_pct = float(bench.get("ipca") or 4.5)
    cdi_pct = float(bench.get("cdi") or 14.15)
    discount_rate = min(16.0, max(10.5, cdi_pct - 1.0))

    cache_map = _get_cached_quotes_map(db, unique_tickers)
    compared: list[dict[str, Any]] = []

    for tk in unique_tickers:
        base = UNIVERSE_BY_TICKER.get(tk)
        c = cache_map.get(tk)
        live_q = None
        if base is None and c is None:
            live_q = await get_quote(db, tk)
        if base is None:
            ac = classify_b3_ticker(tk)
            base = {
                "ticker": tk,
                "name": (c.name if c else (live_q["name"] if live_q else tk)),
                "asset_class": ac,
                "sector": (c.sector if c else (live_q.get("sector") if live_q else "B3")),
                "ref_price": float(c.price) if c and c.price else (float(live_q["price"]) if live_q else 0.0),
                "lpa": 0.0,
                "vpa": 0.0,
                "dpa_12m": 0.0,
                "roe": 0.0,
                "net_margin": 0.0,
                "net_debt_ebitda": 0.0,
                "payout": 0.5,
                "div_streak": 0,
            }
        val = compute_asset_valuation(
            base,
            live_price=float(c.price) if c and c.price else (float(live_q["price"]) if live_q else None),
            live_change_pct=float(c.change_pct) if c and c.change_pct is not None else (float(live_q["change_pct"]) if live_q else None),
            live_dy_12m=float(c.dy_12m) if c and c.dy_12m is not None else (live_q.get("dy_12m") if live_q else None),
            live_pe=float(c.pe_ratio) if c and c.pe_ratio is not None else (live_q.get("pe_ratio") if live_q else None),
            live_pvp=float(c.pvp_ratio) if c and c.pvp_ratio is not None else (live_q.get("pvp_ratio") if live_q else None),
            min_dy_bazin=min_dy_bazin,
            discount_rate_pct=discount_rate,
            ipca_pct=ipca_pct,
        )
        compared.append(val)

    # Determine winner per metric row
    def _best(key: str, higher_is_better: bool = True) -> Optional[str]:
        candidates = [(x["ticker"], x.get(key)) for x in compared if x.get(key) is not None and (higher_is_better or float(x.get(key)) > 0)]
        if not candidates:
            return None
        chosen = max(candidates, key=lambda pair: float(pair[1])) if higher_is_better else min(candidates, key=lambda pair: float(pair[1]))
        return chosen[0]

    row_winners = {
        "score": _best("score", True),
        "margin_of_safety_pct": _best("margin_of_safety_pct", True),
        "dy_12m": _best("dy_12m", True),
        "pe_ratio": _best("pe_ratio", False),
        "pvp_ratio": _best("pvp_ratio", False),
        "roe": _best("roe", True),
        "net_margin": _best("net_margin", True),
        "net_debt_ebitda": _best("net_debt_ebitda", False),
        "div_streak": _best("div_streak", True),
    }

    # Count trophies per asset
    trophies: dict[str, int] = {x["ticker"]: 0 for x in compared}
    for winner_tk in row_winners.values():
        if winner_tk and winner_tk in trophies:
            trophies[winner_tk] += 1

    for x in compared:
        x["trophies"] = trophies[x["ticker"]]

    champion = max(compared, key=lambda x: (x["trophies"], x["score"], x["margin_of_safety_pct"]))

    return {
        "count": len(compared),
        "min_dy_bazin": min_dy_bazin,
        "champion_ticker": champion["ticker"],
        "champion_name": champion["name"],
        "champion_score": champion["score"],
        "champion_trophies": champion["trophies"],
        "row_winners": row_winners,
        "assets": compared,
    }


# ============ Endpoint 3: Asset Dossier + Live Technical Analysis ============


@router.get("/asset/{ticker}")
async def get_asset_dossier(
    ticker: str,
    min_dy_bazin: float = Query(default=6.0, ge=2.0, le=20.0),
    discount_rate: float = Query(default=12.5, ge=6.0, le=25.0),
    growth_rate: Optional[float] = Query(default=None, ge=0.0, le=12.0),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Full Asset Dossier: Bazin/Graham/Gordon Valuation + Live 1Y Chart with SMA20/50/200,
    RSI(14), Automatic Support/Resistance, Fundamental Checklist & User Portfolio Position.
    """
    uid = parse_uuid(user_id, "user_id")
    tk = normalize_ticker(ticker)
    if not tk:
        raise HTTPException(status_code=400, detail="Ticker inválido.")

    bench = await get_bcb_benchmarks()
    ipca_pct = float(bench.get("ipca") or 4.5)

    base = UNIVERSE_BY_TICKER.get(tk)
    cached = db.query(MarketQuoteCache).filter(MarketQuoteCache.ticker == tk).first()
    ac = (base["asset_class"] if base else classify_b3_ticker(tk))

    dates, closes, hist_price, hist_change = await _fetch_yahoo_history(tk, asset_class=ac)
    live_quote = await get_quote(db, tk, asset_class=ac) if not hist_price else None

    if base is None:
        base = {
            "ticker": tk,
            "name": (cached.name if cached else (live_quote["name"] if live_quote else tk)),
            "asset_class": ac,
            "sector": (cached.sector if cached else (live_quote.get("sector") if live_quote else "B3")),
            "ref_price": float(hist_price or (cached.price if cached else 0) or (live_quote["price"] if live_quote else 0)),
            "lpa": 0.0,
            "vpa": 0.0,
            "dpa_12m": 0.0,
            "roe": 0.0,
            "net_margin": 0.0,
            "net_debt_ebitda": 0.0,
            "payout": 0.5,
            "div_streak": 0,
        }

    valuation = compute_asset_valuation(
        base,
        live_price=hist_price or (float(cached.price) if cached and cached.price else (live_quote["price"] if live_quote else None)),
        live_change_pct=hist_change if hist_change is not None else (float(cached.change_pct) if cached and cached.change_pct is not None else None),
        live_dy_12m=float(cached.dy_12m) if cached and cached.dy_12m is not None else (live_quote.get("dy_12m") if live_quote else None),
        live_pe=float(cached.pe_ratio) if cached and cached.pe_ratio is not None else (live_quote.get("pe_ratio") if live_quote else None),
        live_pvp=float(cached.pvp_ratio) if cached and cached.pvp_ratio is not None else (live_quote.get("pvp_ratio") if live_quote else None),
        min_dy_bazin=min_dy_bazin,
        discount_rate_pct=discount_rate,
        growth_rate_pct=growth_rate,
        ipca_pct=ipca_pct,
    )

    technicals = _compute_technicals(dates, closes)

    # Check if user owns this asset
    holding = (
        db.query(InvestmentAsset)
        .filter(
            InvestmentAsset.user_id == uid,
            InvestmentAsset.ticker == tk,
            InvestmentAsset.deleted_at.is_(None),
            InvestmentAsset.quantity > 0,
        )
        .first()
    )
    position = None
    if holding:
        qty = float(holding.quantity or 0)
        avg_px = float(holding.average_price or 0)
        cur_px = valuation["price"] or avg_px
        position = {
            "quantity": qty,
            "average_price": round(avg_px, 2),
            "current_value": round(qty * cur_px, 2),
            "gain_pct": round(((cur_px - avg_px) / avg_px) * 100, 2) if avg_px > 0 else 0.0,
        }

    return {
        "valuation": valuation,
        "technicals": technicals,
        "position": position,
        "benchmarks": bench,
    }


# ============ Endpoint 4: Markets & Daily Briefing ============


MARKET_INDICATORS = [
    {"id": "ibov", "symbol": "^BVSP", "label": "IBOVESPA", "unit": "pts", "group": "Brasil", "fallback": 128500.0},
    {"id": "ifix", "symbol": "XFIX11.SA", "label": "IFIX (ETF)", "unit": "R$", "group": "Brasil", "fallback": 11.40},
    {"id": "usd", "symbol": "USDBRL=X", "label": "Dólar (USD/BRL)", "unit": "R$", "group": "Câmbio", "fallback": 5.75},
    {"id": "eur", "symbol": "EURBRL=X", "label": "Euro (EUR/BRL)", "unit": "R$", "group": "Câmbio", "fallback": 6.18},
    {"id": "sp500", "symbol": "^GSPC", "label": "S&P 500", "unit": "pts", "group": "Global", "fallback": 5980.0},
    {"id": "nasdaq", "symbol": "^IXIC", "label": "NASDAQ", "unit": "pts", "group": "Global", "fallback": 19150.0},
    {"id": "btc", "symbol": "BTC-BRL", "label": "Bitcoin (BRL)", "unit": "R$", "group": "Cripto", "fallback": 540000.0},
    {"id": "gold", "symbol": "GC=F", "label": "Ouro (USD/oz)", "unit": "US$", "group": "Global", "fallback": 2650.0},
]


async def _fetch_single_market_index(spec: dict[str, Any]) -> dict[str, Any]:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return {**spec, "price": spec["fallback"], "change_pct": 0.0, "live": False}
    try:
        async with httpx.AsyncClient(
            timeout=7.0,
            headers={"User-Agent": "Mozilla/5.0 (compatible; MonyMarkets/1.0)"},
        ) as client:
            resp = await client.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{spec['symbol']}",
                params={"range": "5d", "interval": "1d"},
            )
            if resp.status_code == 200:
                res = ((resp.json().get("chart") or {}).get("result") or [])
                if res:
                    meta = res[0].get("meta") or {}
                    price = meta.get("regularMarketPrice")
                    closes = [c for c in (((res[0].get("indicators") or {}).get("quote") or [{}])[0].get("close") or []) if c is not None]
                    prev = closes[-2] if len(closes) >= 2 else meta.get("chartPreviousClose")
                    if price and float(price) > 0:
                        chg = round(((float(price) - float(prev)) / float(prev)) * 100, 2) if prev and float(prev) > 0 else 0.0
                        return {**spec, "price": round(float(price), 2), "change_pct": chg, "live": True}
    except Exception:  # noqa: BLE001
        pass
    return {**spec, "price": spec["fallback"], "change_pct": 0.0, "live": False}


@router.get("/markets")
async def get_markets_and_briefing(
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """
    Mony Valuer — Markets & Daily Briefing:
    Live global indices, FX, crypto, BCB macro benchmarks (CDI/IPCA/Real Rate)
    + personalized daily briefing of the user's portfolio & ceiling alerts.
    """
    uid = parse_uuid(user_id, "user_id")
    bench = await get_bcb_benchmarks()
    cdi = float(bench.get("cdi") or 14.15)
    ipca = float(bench.get("ipca") or 4.50)
    real_rate = round((((1.0 + cdi / 100.0) / (1.0 + ipca / 100.0)) - 1.0) * 100, 2)

    now = time.time()
    if now - _markets_cache["ts"] > 600 or not _markets_cache["items"]:
        results = await asyncio.gather(*[_fetch_single_market_index(s) for s in MARKET_INDICATORS])
        _markets_cache["items"] = list(results)
        _markets_cache["ts"] = now

    # Portfolio daily briefing + ceiling opportunities
    holdings = (
        db.query(InvestmentAsset)
        .filter(InvestmentAsset.user_id == uid, InvestmentAsset.deleted_at.is_(None), InvestmentAsset.quantity > 0)
        .all()
    )
    tickers = [h.ticker.upper() for h in holdings]
    cache_map = _get_cached_quotes_map(db, tickers)

    movers: list[dict[str, Any]] = []
    below_ceiling_holdings: list[dict[str, Any]] = []
    for h in holdings:
        tk = h.ticker.upper()
        c = cache_map.get(tk)
        cur_px = float(c.price) if c and c.price else float(h.average_price or 0)
        chg = float(c.change_pct) if c and c.change_pct is not None else 0.0
        movers.append({"ticker": tk, "name": h.name, "price": round(cur_px, 2), "change_pct": round(chg, 2)})

        base = UNIVERSE_BY_TICKER.get(tk)
        if base:
            v = compute_asset_valuation(
                base,
                live_price=cur_px if cur_px > 0 else None,
                live_change_pct=chg,
                live_dy_12m=float(c.dy_12m) if c and c.dy_12m is not None else None,
                ipca_pct=ipca,
            )
            if v["verdict"] == "barato":
                below_ceiling_holdings.append(
                    {
                        "ticker": tk,
                        "name": v["name"],
                        "price": v["price"],
                        "consensus_price": v["consensus_price"],
                        "margin_of_safety_pct": v["margin_of_safety_pct"],
                        "dy_12m": v["dy_12m"],
                    }
                )

    top_gainers = sorted([m for m in movers if m["change_pct"] > 0], key=lambda x: x["change_pct"], reverse=True)[:4]
    top_losers = sorted([m for m in movers if m["change_pct"] < 0], key=lambda x: x["change_pct"])[:4]
    below_ceiling_holdings.sort(key=lambda x: x["margin_of_safety_pct"], reverse=True)

    # Top 3 market bargains right now (outside or inside portfolio)
    all_universe_cache = _get_cached_quotes_map(db, [u["ticker"] for u in B3_UNIVERSE])
    top_bargains = sorted(
        [
            compute_asset_valuation(
                u,
                live_price=float(all_universe_cache[u["ticker"]].price) if u["ticker"] in all_universe_cache and all_universe_cache[u["ticker"]].price else None,
                ipca_pct=ipca,
            )
            for u in B3_UNIVERSE
        ],
        key=lambda x: (x["margin_of_safety_pct"], x["score"]),
        reverse=True,
    )[:5]

    return {
        "updated_at": datetime.utcnow().isoformat(),
        "macro": {
            "cdi_annual_pct": cdi,
            "ipca_annual_pct": ipca,
            "real_interest_pct": real_rate,
            "monthly_100k_cdi_gross": round(100_000 * ((1 + cdi / 100) ** (1 / 12) - 1), 2),
            "monthly_100k_real": round(100_000 * ((1 + real_rate / 100) ** (1 / 12) - 1), 2),
        },
        "indices": _markets_cache["items"],
        "briefing": {
            "portfolio_count": len(holdings),
            "top_gainers": top_gainers,
            "top_losers": top_losers,
            "below_ceiling_holdings": below_ceiling_holdings[:5],
            "top_market_bargains": [
                {
                    "ticker": b["ticker"],
                    "name": b["name"],
                    "asset_class": b["asset_class"],
                    "price": b["price"],
                    "consensus_price": b["consensus_price"],
                    "margin_of_safety_pct": b["margin_of_safety_pct"],
                    "dy_12m": b["dy_12m"],
                    "score": b["score"],
                }
                for b in top_bargains
            ],
        },
    }


# ============ Endpoint 5: Portfolio Valuation Map (for Investments & Rebalance Valuer Mode) ============


@router.get("/portfolio-valuation")
async def get_portfolio_valuation(
    min_dy_bazin: float = Query(default=6.0, ge=2.0, le=20.0),
    user_id: str = Depends(get_current_user_from_header),
    db: Session = Depends(get_db),
):
    """Returns Bazin/Graham/Consensus ceiling & Margin of Safety for each ticker in the user's portfolio."""
    uid = parse_uuid(user_id, "user_id")
    bench = await get_bcb_benchmarks()
    ipca_pct = float(bench.get("ipca") or 4.5)
    cdi_pct = float(bench.get("cdi") or 14.15)
    discount_rate = min(16.0, max(10.5, cdi_pct - 1.0))

    holdings = (
        db.query(InvestmentAsset)
        .filter(InvestmentAsset.user_id == uid, InvestmentAsset.deleted_at.is_(None), InvestmentAsset.quantity > 0)
        .all()
    )
    tickers = [h.ticker.upper() for h in holdings]
    cache_map = _get_cached_quotes_map(db, tickers)

    by_ticker: dict[str, dict[str, Any]] = {}
    ranked_opportunities: list[dict[str, Any]] = []

    for h in holdings:
        tk = h.ticker.upper()
        if h.asset_class == "fixed_income":
            continue
        c = cache_map.get(tk)
        base = UNIVERSE_BY_TICKER.get(tk) or {
            "ticker": tk,
            "name": h.name,
            "asset_class": h.asset_class,
            "sector": h.sector or "B3",
            "ref_price": float(c.price) if c and c.price else float(h.average_price or 0),
            "lpa": 0.0,
            "vpa": 0.0,
            "dpa_12m": 0.0,
            "roe": 0.0,
            "net_margin": 0.0,
            "net_debt_ebitda": 0.0,
            "payout": 0.5,
            "div_streak": 0,
        }
        v = compute_asset_valuation(
            base,
            live_price=float(c.price) if c and c.price else float(h.average_price or 0),
            live_change_pct=float(c.change_pct) if c and c.change_pct is not None else None,
            live_dy_12m=float(c.dy_12m) if c and c.dy_12m is not None else None,
            live_pe=float(c.pe_ratio) if c and c.pe_ratio is not None else None,
            live_pvp=float(c.pvp_ratio) if c and c.pvp_ratio is not None else None,
            min_dy_bazin=min_dy_bazin,
            discount_rate_pct=discount_rate,
            ipca_pct=ipca_pct,
        )
        by_ticker[tk] = v
        ranked_opportunities.append(v)

    ranked_opportunities.sort(key=lambda x: (x["margin_of_safety_pct"], x["score"]), reverse=True)
    return {
        "count": len(by_ticker),
        "by_ticker": by_ticker,
        "top_buy_priority": ranked_opportunities[:8],
    }
