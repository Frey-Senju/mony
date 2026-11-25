"""
Pluggy Open Finance Brasil API Client (Meu Pluggy & Production Data API).

Automatically operates in:
  - LIVE mode when ``PLUGGY_CLIENT_ID`` and ``PLUGGY_CLIENT_SECRET`` are set.
  - SANDBOX simulation mode when keys are absent, so users and automated tests
    can exercise the full Connect -> Link -> Sync -> Reconnect-Dedup lifecycle
    without external credentials.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
import logging
import os
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

PLUGGY_BASE_URL = os.getenv("PLUGGY_API_URL", "https://api.pluggy.ai").rstrip("/")
HTTP_TIMEOUT = 25.0


def is_pluggy_configured() -> bool:
    return bool(
        os.getenv("PLUGGY_CLIENT_ID", "").strip()
        and os.getenv("PLUGGY_CLIENT_SECRET", "").strip()
    )


async def get_pluggy_api_key() -> str:
    """Authenticate with Pluggy API using clientId + clientSecret."""
    client_id = os.environ["PLUGGY_CLIENT_ID"].strip()
    client_secret = os.environ["PLUGGY_CLIENT_SECRET"].strip()
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        resp = await client.post(
            f"{PLUGGY_BASE_URL}/auth",
            json={"clientId": client_id, "clientSecret": client_secret},
        )
        resp.raise_for_status()
        return resp.json()["apiKey"]


async def create_connect_token(
    *,
    client_user_id: str,
    item_id: Optional[str] = None,
    webhook_url: Optional[str] = None,
    oauth_redirect_uri: Optional[str] = None,
) -> dict[str, Any]:
    """Create a Pluggy Connect Widget accessToken for the frontend."""
    if not is_pluggy_configured():
        return {
            "access_token": f"sandbox-connect-{client_user_id[:8]}",
            "mode": "sandbox",
            "item_id": item_id,
        }

    api_key = await get_pluggy_api_key()
    body: dict[str, Any] = {
        "options": {
            "clientUserId": client_user_id,
            # Let Mony's 3-layer dedup engine handle reconnections gracefully
            # instead of blocking the user with Pluggy's ITEM_USER_ALREADY_EXISTS error
            "avoidDuplicates": False,
        }
    }
    if webhook_url:
        body["options"]["webhookUrl"] = webhook_url
    if oauth_redirect_uri:
        body["options"]["oauthRedirectUri"] = oauth_redirect_uri
    if item_id:
        body["itemId"] = item_id

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        resp = await client.post(
            f"{PLUGGY_BASE_URL}/connect_token",
            headers={"X-API-KEY": api_key},
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "access_token": data["accessToken"],
            "mode": "live",
            "item_id": item_id,
        }


async def fetch_pluggy_connectors(include_sandbox: bool = False) -> list[dict[str, Any]]:
    """Return available Pluggy connectors for this application (helps UI detect MeuPluggy-only plans)."""
    if not is_pluggy_configured() or os.getenv("PYTEST_CURRENT_TEST"):
        return []
    try:
        api_key = await get_pluggy_api_key()
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(
                f"{PLUGGY_BASE_URL}/connectors",
                params={"countries": "BR", "sandbox": str(include_sandbox).lower()},
                headers={"X-API-KEY": api_key},
            )
            if resp.status_code == 200:
                return resp.json().get("results") or []
    except Exception as exc:  # noqa: BLE001
        logger.debug("Pluggy connectors lookup failed: %s", exc)
    return []


async def fetch_pluggy_item(item_id: str) -> dict[str, Any]:
    if not is_pluggy_configured() or item_id.startswith("sandbox-"):
        bank_name = "Nubank (Sandbox Pluggy)" if "nubank" in item_id.lower() else "Banco Open Finance (Sandbox)"
        return {
            "id": item_id,
            "connector": {"id": 201, "name": bank_name, "imageUrl": None},
            "status": "UPDATED",
        }
    api_key = await get_pluggy_api_key()
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        resp = await client.get(
            f"{PLUGGY_BASE_URL}/items/{item_id}",
            headers={"X-API-KEY": api_key},
        )
        resp.raise_for_status()
        return resp.json()


async def fetch_pluggy_accounts(item_id: str) -> list[dict[str, Any]]:
    if not is_pluggy_configured() or item_id.startswith("sandbox-"):
        return [
            {
                "id": f"{item_id}-chk",
                "type": "BANK",
                "subtype": "CHECKING_ACCOUNT",
                "name": "Conta Corrente Open Finance",
                "number": "0001-4829",
                "balance": 4250.80,
                "currencyCode": "BRL",
                "owner": "Titular Mony",
            },
            {
                "id": f"{item_id}-cc",
                "type": "CREDIT",
                "subtype": "CREDIT_CARD",
                "name": "Cartão Ultravioleta / Crédito",
                "number": "5502-9914",
                "balance": -1285.40,
                "currencyCode": "BRL",
                "owner": "Titular Mony",
            },
        ]

    api_key = await get_pluggy_api_key()
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        resp = await client.get(
            f"{PLUGGY_BASE_URL}/accounts",
            params={"itemId": item_id},
            headers={"X-API-KEY": api_key},
        )
        resp.raise_for_status()
        return resp.json().get("results", [])


async def fetch_pluggy_transactions(
    account_id: str,
    *,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
) -> list[dict[str, Any]]:
    if not is_pluggy_configured() or account_id.startswith("sandbox-"):
        today = date.today()
        d1 = (today - timedelta(days=2)).isoformat()
        d2 = (today - timedelta(days=5)).isoformat()
        d3 = (today - timedelta(days=1)).isoformat()
        if account_id.endswith("-cc"):
            return [
                {
                    "id": f"{account_id}-tx-1",
                    "description": "AMAZON MARKETPLACE 02/06",
                    "amount": -189.90,
                    "date": f"{d1}T12:00:00Z",
                    "currencyCode": "BRL",
                    "type": "DEBIT",
                    "paymentData": {"paymentMethod": "CREDIT_CARD"},
                    "creditCardMetadata": {"installmentNumber": 2, "totalInstallments": 6, "billId": today.strftime("%Y-%m")},
                },
                {
                    "id": f"{account_id}-tx-2",
                    "description": "UBER *TRIP",
                    "amount": -34.50,
                    "date": f"{d3}T18:30:00Z",
                    "currencyCode": "BRL",
                    "type": "DEBIT",
                    "paymentData": {"paymentMethod": "CREDIT_CARD"},
                },
            ]
        return [
            {
                "id": f"{account_id}-tx-1",
                "description": "PIX ENVIADO - SUPERMERCADO CENTRAL",
                "amount": -245.60,
                "date": f"{d1}T14:20:00Z",
                "currencyCode": "BRL",
                "type": "DEBIT",
                "paymentData": {"paymentMethod": "PIX"},
            },
            {
                "id": f"{account_id}-tx-2",
                "description": "SALARIO RECEBIDO TED",
                "amount": 6500.00,
                "date": f"{d2}T09:00:00Z",
                "currencyCode": "BRL",
                "type": "CREDIT",
                "paymentData": {"paymentMethod": "TED"},
            },
        ]

    api_key = await get_pluggy_api_key()
    all_txs: list[dict[str, Any]] = []
    page = 1
    params: dict[str, Any] = {"accountId": account_id, "pageSize": 500}
    if from_date:
        params["from"] = from_date.isoformat()
    if to_date:
        params["to"] = to_date.isoformat()

    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        while page <= 10:
            params["page"] = page
            resp = await client.get(
                f"{PLUGGY_BASE_URL}/transactions",
                params=params,
                headers={"X-API-KEY": api_key},
            )
            resp.raise_for_status()
            payload = resp.json()
            results = payload.get("results", [])
            all_txs.extend(results)
            total_pages = int(payload.get("totalPages", 1) or 1)
            if page >= total_pages or not results:
                break
            page += 1
    return all_txs


async def fetch_pluggy_investments(item_id: str) -> list[dict[str, Any]]:
    """Fetch investment positions (B3 stocks, FIIs, ETFs, Fixed Income) from Pluggy."""
    if not is_pluggy_configured() or item_id.startswith("sandbox-"):
        return [
            {
                "id": f"{item_id}-inv-petr4",
                "code": "PETR4",
                "name": "PETROBRAS PN",
                "type": "EQUITY",
                "subtype": "STOCK",
                "quantity": 100,
                "value": 36.50,
                "balance": 3650.00,
                "institution": {"name": "XP Investimentos"},
            },
            {
                "id": f"{item_id}-inv-mxrf11",
                "code": "MXRF11",
                "name": "MAXI RENDA FII",
                "type": "EQUITY",
                "subtype": "REAL_ESTATE_FUND",
                "quantity": 250,
                "value": 9.80,
                "balance": 2450.00,
                "institution": {"name": "XP Investimentos"},
            },
            {
                "id": f"{item_id}-inv-cdb",
                "code": "CDB-110CDI",
                "name": "CDB 110% CDI Liquidez Diária",
                "type": "FIXED_INCOME",
                "subtype": "CDB",
                "quantity": 1,
                "value": 10000.00,
                "balance": 10450.00,
                "rate": 110,
                "rateType": "CDI",
                "institution": {"name": "XP Investimentos"},
            },
        ]

    api_key = await get_pluggy_api_key()
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        resp = await client.get(
            f"{PLUGGY_BASE_URL}/investments",
            params={"itemId": item_id},
            headers={"X-API-KEY": api_key},
        )
        resp.raise_for_status()
        return resp.json().get("results", [])
