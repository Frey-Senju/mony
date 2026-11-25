"""
Integration tests for Track 1 (Mobile & Daily Experience):
  1. Voice Transaction API (POST /ai/voice-transaction with transcript, rules & auto_save)
  2. Web Push Subscriptions API (VAPID key, subscribe, status, test push, unsubscribe)
  3. Dedicated Credit Cards API (CRUD, open invoice, future installments, best buy day & pay as TRANSFER)
"""

from datetime import date
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database.base import Base, get_db
from database.models import Account, AccountType, Transaction, TransactionType, User
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
        email="mobile@mony.test",
        full_name="Mobile Tester",
        password_hash=hash_password("TestPass123!"),
    )
    db.add(user)
    acct = Account(
        id=uuid4(),
        user_id=user.id,
        name="Nubank Conta",
        type=AccountType.CHECKING,
        balance=5000.00,
        is_default=True,
    )
    db.add(acct)
    db.commit()
    token = create_access_token(str(user.id))
    return TestClient(app), db, user, acct, {"Authorization": f"Bearer {token}"}


def test_voice_transaction_parse_and_autosave():
    client, db, user, acct, headers = _make_client()
    try:
        # 1. Preview only (auto_save=false)
        r1 = client.post(
            "/ai/voice-transaction",
            headers=headers,
            data={"transcript": "Gastei 48 reais e 50 no almoço no cartão Nubank", "auto_save": "false"},
        )
        assert r1.status_code == 200, r1.text
        p = r1.json()["parsed"]
        assert p["amount"] == 48.50
        assert p["payment_method"] == "credit_card"
        assert p["type"] == "expense"
        assert r1.json()["saved"] is False

        # 2. Auto-save (auto_save=true) -> persists transaction and updates balance
        r2 = client.post(
            "/ai/voice-transaction",
            headers=headers,
            data={"transcript": "Paguei 120 reais no pix de farmácia", "auto_save": "true"},
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["saved"] is True
        assert r2.json()["transaction_id"] is not None

        db.expire_all()
        updated_acct = db.query(Account).filter(Account.id == acct.id).first()
        assert float(updated_acct.balance) == 4880.0
    finally:
        db.close()
        app.dependency_overrides.clear()


def test_web_push_subscribe_status_test_and_unsubscribe(monkeypatch):
    client, db, _, _, headers = _make_client()
    try:
        monkeypatch.setenv("VAPID_PUBLIC_KEY", "test-public-key-1234567890")
        monkeypatch.setenv("VAPID_PRIVATE_KEY", "test-private-key-1234567890")

        vk = client.get("/push/vapid-public-key")
        assert vk.status_code == 200
        assert vk.json()["configured"] is True

        endpoint = "https://fcm.googleapis.com/fcm/send/sample-device-endpoint-001"
        sub = client.post(
            "/push/subscribe",
            headers=headers,
            json={
                "endpoint": endpoint,
                "keys": {"p256dh": "BEl62iUYgUivxIkv69yViEuiBIa-Ib9", "auth": "tBHItJI5svbpez7KI4CCXg"},
                "user_agent": "pytest-pwa",
            },
        )
        assert sub.status_code == 201, sub.text

        st = client.get("/push/status", headers=headers)
        assert st.status_code == 200
        assert st.json()["subscribed_devices"] == 1

        t_push = client.post("/push/test", headers=headers)
        assert t_push.status_code == 200, t_push.text
        assert t_push.json()["sent"] == 1

        unsub = client.delete(f"/push/unsubscribe?endpoint={endpoint}", headers=headers)
        assert unsub.status_code == 200
        st2 = client.get("/push/status", headers=headers)
        assert st2.json()["subscribed_devices"] == 0
    finally:
        db.close()
        app.dependency_overrides.clear()


def test_credit_cards_limits_installments_and_pay_invoice():
    client, db, user, checking, headers = _make_client()
    try:
        # 1. Create a credit card (auto-creates linked credit_card account)
        c = client.post(
            "/credit-cards",
            headers=headers,
            json={
                "name": "Nubank Ultravioleta",
                "brand": "mastercard",
                "last4": "4829",
                "credit_limit": 10000.00,
                "closing_day": 10,
                "due_day": 17,
                "color": "#7c3aed",
            },
        )
        assert c.status_code == 201, c.text
        card = c.json()
        card_id = card["id"]
        cc_account_id = card["account_id"]
        open_ym = card["open_invoice_month"]
        assert card["best_buy_day"] == 11

        # 2. Seed a 3x installment purchase on the open invoice (R$ 500 x 3 -> 500 open + 1000 future)
        db.add(
            Transaction(
                user_id=user.id,
                account_id=uuid4() if not cc_account_id else db.query(Account).filter(Account.name == "Nubank Ultravioleta").first().id,
                type=TransactionType.EXPENSE,
                amount=500.00,
                description="Notebook (1/3)",
                transaction_date=date.today(),
                statement_month=open_ym,
                payment_method="credit_card",
                installment_number=1,
                installment_total=3,
            )
        )
        db.commit()

        # 3. Verify open invoice, future installments, and available limit
        lst = client.get("/credit-cards", headers=headers)
        assert lst.status_code == 200, lst.text
        fetched = lst.json()["cards"][0]
        assert fetched["open_invoice_total"] == 500.0
        assert fetched["future_installments_total"] == 1000.0
        assert fetched["total_committed"] == 1500.0
        assert fetched["available_limit"] == 8500.0
        assert len(fetched["upcoming_invoices"]) == 6

        # 4. Pay invoice from checking -> creates TRANSFER and reduces checking balance
        pay = client.post(
            f"/credit-cards/{card_id}/pay",
            headers=headers,
            json={"source_account_id": str(checking.id), "amount": 500.00, "statement_month": open_ym},
        )
        assert pay.status_code == 200, pay.text
        assert pay.json()["new_source_balance"] == 4500.0
    finally:
        db.close()
        app.dependency_overrides.clear()
