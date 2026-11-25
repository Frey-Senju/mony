"""
Integration tests for:
  1. Auto-categorization rules & internal transfer detection (keywords + cross-account pairing)
  2. Investments 2.0 (performance vs CDI/IBOV/IPCA, smart rebalance + targets, 12m calendar, IRPF B3)
  3. Mony IA enriched context (portfolio B3 + cashflow YTD + emergency reserve)
  4. Vercel Cron /cron/daily (auth guard + idempotent daily execution)
"""

from datetime import date, timedelta
import os
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database.base import Base, get_db
from database.models import (
    Account,
    AccountType,
    RecurringRule,
    Transaction,
    TransactionType,
    User,
)
from main import app
from utils.auth import create_access_token, hash_password


def _make_client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    db = TestingSessionLocal()
    user = User(
        id=uuid4(),
        email="pro@mony.test",
        full_name="Pro Tester",
        password_hash=hash_password("TestPass123!"),
    )
    db.add(user)
    acct_a = Account(id=uuid4(), user_id=user.id, name="Nubank Conta", type=AccountType.CHECKING, balance=5000)
    acct_b = Account(id=uuid4(), user_id=user.id, name="Inter Conta", type=AccountType.CHECKING, balance=3000)
    db.add_all([acct_a, acct_b])
    db.commit()
    token = create_access_token(str(user.id))
    return TestClient(app), db, user, acct_a, acct_b, {"Authorization": f"Bearer {token}"}


def test_rules_auto_categorize_and_internal_transfer_pairing():
    client, db, user, acct_a, acct_b, headers = _make_client()
    today = date.today()
    try:
        # 1. Seed: 1 normal expense, 1 credit card bill payment, and 1 paired transfer across Account A & B
        t_uber = Transaction(
            user_id=user.id,
            account_id=acct_a.id,
            type=TransactionType.EXPENSE,
            amount=42.50,
            description="UBER *TRIP 8921",
            transaction_date=today,
        )
        t_fatura = Transaction(
            user_id=user.id,
            account_id=acct_a.id,
            type=TransactionType.EXPENSE,
            amount=1850.00,
            description="PAGAMENTO DE FATURA NUBANK",
            transaction_date=today,
        )
        t_pix_out = Transaction(
            user_id=user.id,
            account_id=acct_a.id,
            type=TransactionType.EXPENSE,
            amount=1200.00,
            description="PIX ENVIADO CONTA PROPRIA",
            transaction_date=today,
        )
        t_pix_in = Transaction(
            user_id=user.id,
            account_id=acct_b.id,
            type=TransactionType.INCOME,
            amount=1200.00,
            description="PIX RECEBIDO",
            transaction_date=today,
        )
        db.add_all([t_uber, t_fatura, t_pix_out, t_pix_in])
        db.commit()

        # 2. Create rule UBER -> Transporte with apply_now=True
        r = client.post(
            "/rules",
            headers=headers,
            json={
                "pattern": "UBER",
                "action": "categorize",
                "category_name": "Transporte",
                "apply_now": True,
            },
        )
        assert r.status_code == 201, r.text
        applied = r.json()["applied"]
        assert applied["categorized"] >= 1
        assert applied["transfers_by_heuristic"] >= 1
        assert applied["paired_transfers_detected"] == 2

        db.expire_all()
        assert db.query(Transaction).filter(Transaction.id == t_fatura.id).first().type == TransactionType.TRANSFER
        assert db.query(Transaction).filter(Transaction.id == t_pix_out.id).first().type == TransactionType.TRANSFER
        assert db.query(Transaction).filter(Transaction.id == t_pix_in.id).first().type == TransactionType.TRANSFER

        # 3. Verify GET /rules summary
        r_list = client.get("/rules", headers=headers)
        assert r_list.status_code == 200
        assert r_list.json()["summary"]["transfers_excluded"] == 3
    finally:
        db.close()
        app.dependency_overrides.clear()


def test_investments_pro_endpoints_and_ai_portfolio_context():
    client, db, user, acct_a, _, headers = _make_client()
    today = date.today()
    try:
        # 1. Buy PETR4 (300 @ R$30) and MXRF11 (500 @ R$10), sell 100 PETR4 @ R$38 (exempt < 20k)
        r1 = client.post(
            "/investments/trades",
            headers=headers,
            json={
                "ticker": "PETR4",
                "name": "Petrobras PN",
                "asset_class": "stock",
                "operation": "buy",
                "trade_date": f"{today.year}-01-15",
                "quantity": 300,
                "unit_price": 30.00,
                "fees": 0,
            },
        )
        assert r1.status_code == 201, r1.text

        r2 = client.post(
            "/investments/trades",
            headers=headers,
            json={
                "ticker": "MXRF11",
                "name": "Maxi Renda FII",
                "asset_class": "fii",
                "operation": "buy",
                "trade_date": f"{today.year}-02-10",
                "quantity": 500,
                "unit_price": 10.00,
                "fees": 0,
            },
        )
        assert r2.status_code == 201, r2.text

        r3 = client.post(
            "/investments/trades",
            headers=headers,
            json={
                "ticker": "PETR4",
                "asset_class": "stock",
                "operation": "sell",
                "trade_date": f"{today.year}-03-20",
                "quantity": 100,
                "unit_price": 38.00,
                "fees": 0,
            },
        )
        assert r3.status_code == 201, r3.text

        r4 = client.post(
            "/investments/dividends",
            headers=headers,
            json={
                "ticker": "MXRF11",
                "dividend_type": "fii_yield",
                "payment_date": f"{today.year}-03-15",
                "total_amount": 55.00,
            },
        )
        assert r4.status_code == 201, r4.text

        # 2. Performance vs CDI / IBOV / IPCA
        perf = client.get("/investments/performance", headers=headers)
        assert perf.status_code == 200, perf.text
        assert len(perf.json()["series"]) == 12
        assert "cdi_12m_pct" in perf.json()["summary"]

        # 3. Save Targets & Rebalance
        t_res = client.put(
            "/investments/targets",
            headers=headers,
            json={"targets": {"stock": 40, "fii": 35, "fixed_income": 25, "etf": 0, "bdr": 0, "crypto": 0}},
        )
        assert t_res.status_code == 200, t_res.text

        reb = client.get("/investments/rebalance?contribution=2000", headers=headers)
        assert reb.status_code == 200, reb.text
        total_suggested = sum(row["suggested_contribution"] for row in reb.json()["plan"])
        assert abs(total_suggested - 2000.0) <= 0.1

        # 4. Dividends Calendar 12m
        cal = client.get("/investments/dividends/calendar", headers=headers)
        assert cal.status_code == 200, cal.text
        assert len(cal.json()["months"]) == 12
        assert cal.json()["annual_projected"] > 0

        # 5. IRPF B3 Tax Report
        tax = client.get(f"/investments/tax-report?year={today.year}", headers=headers)
        assert tax.status_code == 200, tax.text
        tdata = tax.json()
        assert len(tdata["bens_e_direitos"]) == 2
        march = next(m for m in tdata["monthly_sales"] if m["month"] == 3)
        assert march["stock_sales"] == 3800.0
        assert march["stock_gain"] == 800.0
        assert march["stock_exempt_20k"] is True
        assert march["darf_estimated"] == 0.0
        assert tdata["income_summary"]["fii_yields_exempt"] == 55.0

        # 6. Mony IA Chat grounded on B3 Portfolio
        chat = client.post("/ai/chat", headers=headers, json={"message": "Analise minha carteira B3 e dividendos"})
        assert chat.status_code == 200, chat.text
        reply = chat.json()["reply"]
        assert "PETR4" in reply or "MXRF11" in reply or "Carteira" in reply
    finally:
        db.close()
        app.dependency_overrides.clear()


def test_cron_daily_auth_and_recurring_generation(monkeypatch):
    client, db, user, acct_a, _, _ = _make_client()
    today = date.today()
    try:
        monkeypatch.setenv("CRON_SECRET", "super-secret-cron-token-123")

        # Unauthorized without Bearer
        r_unauth = client.get("/cron/daily")
        assert r_unauth.status_code == 401

        # Seed a due recurring rule for today
        rec = RecurringRule(
            user_id=user.id,
            account_id=acct_a.id,
            type=TransactionType.EXPENSE,
            amount=150.00,
            description="Internet Fibra",
            category_name="Moradia",
            day_of_month=max(1, today.day),
            is_active=True,
            auto_create=True,
        )
        db.add(rec)
        db.commit()

        # Run cron #1 -> generates 1 recurring transaction
        r_ok = client.get("/cron/daily", headers={"Authorization": "Bearer super-secret-cron-token-123"})
        assert r_ok.status_code == 200, r_ok.text
        body1 = r_ok.json()
        assert body1["recurring_generated"] == 1
        assert body1["alerts_users_checked"] >= 1

        # Run cron #2 -> idempotent (0 duplicate recurring generated)
        r_ok2 = client.get("/cron/daily", headers={"Authorization": "Bearer super-secret-cron-token-123"})
        assert r_ok2.status_code == 200
        assert r_ok2.json()["recurring_generated"] == 0
    finally:
        db.close()
        app.dependency_overrides.clear()
