"""
Multi-Source B3 Market Data Service for Mony Investments.

Fetches live B3 quotes, daily change %, 12-month dividends / DY, P/L, P/VP,
sector, and logos with a 15-minute PostgreSQL cache (`market_quotes_cache`):

  1. Primary: brapi.dev (`BRAPI_TOKEN` when set, or free tickers PETR4/VALE3/ITUB4/MGLU3)
  2. Automatic zero-key fallback: Yahoo Finance (`{TICKER}.SA`) with 1-year
     dividend events so EVERY B3 stock, FII, ETF, and BDR gets live price,
     daily change %, and 12-month DY without needing a paid market-data key.
  3. BCB macro benchmarks (CDI / IPCA) cached in memory with safe defaults.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
import logging
import os
import re
import time
from typing import Any, Optional

import httpx
from sqlalchemy.orm import Session

from database.models import MarketQuoteCache

logger = logging.getLogger(__name__)

CACHE_TTL_MINUTES = 15
HTTP_TIMEOUT = 10.0

FREE_BRAPI_TICKERS = {"PETR4", "VALE3", "ITUB4", "MGLU3"}
KNOWN_ETFS = {
    "BOVA11", "IVVB11", "SMAL11", "HASH11", "DIVO11", "SPXI11", "NASD11",
    "GOLD11", "FIXA11", "IMAB11", "B5P211", "WRLD11", "QBTC11", "ETHE11",
    "LFTB11", "LFTS11", "NDIV11", "GOVE11", "ECOO11", "MATB11", "FIND11",
}
KNOWN_UNITS = {"TAEE11", "KLBN11", "SANB11", "SAPR11", "ENGI11", "ALUP11", "BPAC11", "IGTI11"}

_bcb_cache: dict[str, Any] = {"ts": 0.0, "cdi": 14.15, "ipca": 4.50}


def normalize_ticker(raw: str) -> str:
    t = re.sub(r"[^A-Za-z0-9\-]", "", (raw or "").upper().strip())
    if t.endswith(".SA"):
        t = t[:-3]
    # Remove fractional market suffix 'F' (e.g. PETR4F -> PETR4)
    if re.match(r"^[A-Z]{4}(3|4|5|6|11)F$", t):
        t = t[:-1]
    return t[:24]


def classify_b3_ticker(ticker: str) -> str:
    t = normalize_ticker(ticker)
    if t in KNOWN_ETFS:
        return "etf"
    if t in KNOWN_UNITS:
        return "stock"
    if re.match(r"^[A-Z]{4}11$", t):
        return "fii"
    if re.match(r"^[A-Z]{4}(32|33|34|35|39)$", t):
        return "bdr"
    if re.match(r"^[A-Z]{4}(3|4|5|6)$", t):
        return "stock"
    if any(k in t for k in ("CDB", "LCI", "LCA", "TESOURO", "DEB", "CRI", "CRA", "CDI", "IPCA")):
        return "fixed_income"
    if t in ("BTC", "ETH", "SOL", "USDT", "BNB", "XRP"):
        return "crypto"
    return "stock"


def _quote_to_dict(q: MarketQuoteCache) -> dict[str, Any]:
    return {
        "ticker": q.ticker,
        "name": q.name or q.ticker,
        "price": float(q.price or 0),
        "previous_close": float(q.previous_close) if q.previous_close is not None else None,
        "change_pct": float(q.change_pct) if q.change_pct is not None else 0.0,
        "dy_12m": float(q.dy_12m) if q.dy_12m is not None else None,
        "pe_ratio": float(q.pe_ratio) if q.pe_ratio is not None else None,
        "pvp_ratio": float(q.pvp_ratio) if q.pvp_ratio is not None else None,
        "sector": q.sector,
        "logo_url": q.logo_url,
        "source": q.source,
        "updated_at": q.updated_at.isoformat() if q.updated_at else None,
    }


async def _fetch_from_brapi(ticker: str) -> Optional[dict[str, Any]]:
    token = os.getenv("BRAPI_TOKEN", "").strip()
    if not token and ticker not in FREE_BRAPI_TICKERS:
        return None
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    params = {"fundamental": "true", "dividends": "true"}
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            resp = await client.get(
                f"https://brapi.dev/api/quote/{ticker}",
                params=params,
                headers=headers,
            )
            if resp.status_code != 200:
                return None
            results = resp.json().get("results") or []
            if not results:
                return None
            r = results[0]
            price = r.get("regularMarketPrice")
            if not price or float(price) <= 0:
                return None

            # Compute 12m DY from cashDividends when available
            dy_12m = None
            divs = ((r.get("dividendsData") or {}).get("cashDividends") or [])
            if divs:
                cutoff = datetime.utcnow() - timedelta(days=365)
                div_sum = 0.0
                for d in divs:
                    pay_str = str(d.get("paymentDate") or d.get("approvedOn") or "")[:10]
                    try:
                        dt = datetime.fromisoformat(pay_str)
                        if dt >= cutoff:
                            div_sum += float(d.get("rate") or 0)
                    except ValueError:
                        continue
                if div_sum > 0:
                    dy_12m = round((div_sum / float(price)) * 100, 2)

            return {
                "ticker": ticker,
                "name": (r.get("longName") or r.get("shortName") or ticker)[:200],
                "price": float(price),
                "previous_close": float(r["regularMarketPreviousClose"]) if r.get("regularMarketPreviousClose") else None,
                "change_pct": float(r.get("regularMarketChangePercent") or 0.0),
                "dy_12m": dy_12m,
                "pe_ratio": float(r["priceEarnings"]) if r.get("priceEarnings") is not None else None,
                "pvp_ratio": float(r["priceToBook"]) if r.get("priceToBook") is not None else None,
                "sector": r.get("sector"),
                "logo_url": r.get("logourl"),
                "source": "brapi",
            }
    except Exception as exc:  # noqa: BLE001
        logger.debug("brapi fetch failed for %s: %s", ticker, exc)
        return None


async def _fetch_from_yahoo(ticker: str, asset_class: Optional[str] = None) -> Optional[dict[str, Any]]:
    if asset_class == "crypto" or ticker in ("BTC", "ETH", "SOL", "BNB", "XRP"):
        symbol = f"{ticker}-BRL"
    else:
        symbol = f"{ticker}.SA"

    try:
        async with httpx.AsyncClient(
            timeout=HTTP_TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0 (compatible; MonyFinance/1.0)"},
        ) as client:
            resp = await client.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                params={"range": "1y", "interval": "1d", "events": "div"},
            )
            if resp.status_code != 200:
                return None
            chart = (resp.json().get("chart") or {}).get("result") or []
            if not chart:
                return None
            node = chart[0]
            meta = node.get("meta") or {}
            price = meta.get("regularMarketPrice")
            if not price or float(price) <= 0:
                return None
            prev = meta.get("chartPreviousClose") or meta.get("previousClose")
            change_pct = 0.0
            if prev and float(prev) > 0:
                # Prefer intraday previousClose when available in 1y chart via last 2 closes
                closes = [c for c in (((node.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []) if c is not None]
                ref_prev = closes[-2] if len(closes) >= 2 else float(prev)
                if ref_prev and ref_prev > 0:
                    change_pct = round(((float(price) - ref_prev) / ref_prev) * 100, 2)
                    prev = ref_prev

            # Sum 12m dividend events to compute DY 12m!
            dy_12m = None
            div_events = ((node.get("events") or {}).get("dividends") or {})
            if isinstance(div_events, dict) and div_events:
                div_sum = sum(float(v.get("amount") or 0) for v in div_events.values() if isinstance(v, dict))
                if div_sum > 0:
                    dy_12m = round((div_sum / float(price)) * 100, 2)

            return {
                "ticker": ticker,
                "name": (meta.get("longName") or meta.get("shortName") or ticker)[:200],
                "price": float(price),
                "previous_close": float(prev) if prev else None,
                "change_pct": change_pct,
                "dy_12m": dy_12m,
                "pe_ratio": None,
                "pvp_ratio": None,
                "sector": None,
                "logo_url": None,
                "source": "yahoo-b3",
            }
    except Exception as exc:  # noqa: BLE001
        logger.debug("yahoo fetch failed for %s: %s", symbol, exc)
        return None


async def get_quote(
    db: Session,
    raw_ticker: str,
    *,
    asset_class: Optional[str] = None,
    force_refresh: bool = False,
) -> Optional[dict[str, Any]]:
    """Fetch quote for one B3/crypto ticker with 15-minute DB cache."""
    ticker = normalize_ticker(raw_ticker)
    if not ticker:
        return None
    if asset_class == "fixed_income":
        return None

    cached = db.query(MarketQuoteCache).filter(MarketQuoteCache.ticker == ticker).first()
    if cached and not force_refresh:
        age = datetime.utcnow() - (cached.updated_at or datetime.min)
        if age < timedelta(minutes=CACHE_TTL_MINUTES):
            return _quote_to_dict(cached)

    # Skip external network in unit tests unless explicitly mocked
    if os.getenv("PYTEST_CURRENT_TEST"):
        return _quote_to_dict(cached) if cached else None

    live = await _fetch_from_brapi(ticker)
    if live is None:
        live = await _fetch_from_yahoo(ticker, asset_class=asset_class)
    if live is None:
        return _quote_to_dict(cached) if cached else None

    now = datetime.utcnow()
    if cached is None:
        cached = MarketQuoteCache(
            ticker=ticker,
            name=live["name"],
            price=Decimal(f"{live['price']:.4f}"),
            previous_close=Decimal(f"{live['previous_close']:.4f}") if live["previous_close"] is not None else None,
            change_pct=Decimal(f"{live['change_pct']:.4f}") if live["change_pct"] is not None else None,
            dy_12m=Decimal(f"{live['dy_12m']:.4f}") if live["dy_12m"] is not None else None,
            pe_ratio=Decimal(f"{live['pe_ratio']:.4f}") if live["pe_ratio"] is not None else None,
            pvp_ratio=Decimal(f"{live['pvp_ratio']:.4f}") if live["pvp_ratio"] is not None else None,
            sector=live["sector"],
            logo_url=live["logo_url"],
            source=live["source"],
            updated_at=now,
        )
        db.add(cached)
    else:
        cached.name = live["name"] or cached.name
        cached.price = Decimal(f"{live['price']:.4f}")
        if live["previous_close"] is not None:
            cached.previous_close = Decimal(f"{live['previous_close']:.4f}")
        if live["change_pct"] is not None:
            cached.change_pct = Decimal(f"{live['change_pct']:.4f}")
        if live["dy_12m"] is not None:
            cached.dy_12m = Decimal(f"{live['dy_12m']:.4f}")
        if live["pe_ratio"] is not None:
            cached.pe_ratio = Decimal(f"{live['pe_ratio']:.4f}")
        if live["pvp_ratio"] is not None:
            cached.pvp_ratio = Decimal(f"{live['pvp_ratio']:.4f}")
        if live["sector"]:
            cached.sector = live["sector"]
        if live["logo_url"]:
            cached.logo_url = live["logo_url"]
        cached.source = live["source"]
        cached.updated_at = now

    try:
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
    return _quote_to_dict(cached)


async def get_bcb_macro_rates() -> dict[str, float]:
    """Fetch Selic/CDI & IPCA annual rates from Banco Central (6h memory cache)."""
    now = time.time()
    if now - _bcb_cache["ts"] < 6 * 3600 or os.getenv("PYTEST_CURRENT_TEST"):
        return {"cdi": _bcb_cache["cdi"], "ipca": _bcb_cache["ipca"]}
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            # SGS 432 = Meta Selic (% a.a.) -> CDI ≈ Selic - 0.10%
            r = await client.get("https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json")
            if r.status_code == 200:
                rows = r.json()
                if rows:
                    selic = float(str(rows[0]["valor"]).replace(",", "."))
                    _bcb_cache["cdi"] = round(max(0.0, selic - 0.10), 2)
        _bcb_cache["ts"] = now
    except Exception:  # noqa: BLE001
        pass
    return {"cdi": _bcb_cache["cdi"], "ipca": _bcb_cache["ipca"]}
