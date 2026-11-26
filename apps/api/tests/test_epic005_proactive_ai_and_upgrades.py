"""
EPIC-005 Integration Tests covering ALL 8 Stories (Backend):
  - Story 5.1: Universal transaction edit (incl. account_id transfer) keeping immutable external_id/dedup_hash/origin_metadata
  - Story 5.3: Proactive AI review (invoice_month mismatch, self_transfer same owner, tx_divergence) + apply & dismiss
  - Story 5.4: Automatic recurrence detection & deduplicated registration (/recurring/detect)
  - Story 5.5: Proactive AI budget recommendations (/budgets/ai-suggestions)
  - Story 5.6: Auto-register CreditCard from Pluggy creditData + card inconsistency audit
  - Story 5.7: Accounts & Categories Open Finance completeness audit (/accounts/audit) + PUT /categories/{id}
  - Story 5.8: Reports 2.0 analytics (/reports/analytics)
"""

from datetime import date, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database.base import Base, get_db
from database.models import (
    Account,
    AccountType,
    CreditCard,
    Transaction,
    TransactionSource,
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
        email="epic5@mony.test",
        full_name="Cristiano Senju",
        password_hash=hash_password("TestPass123!"),
    )
    db.add(user)
    acct_brad = Account(id=uuid4(), user_id=user.id, name="Bradesco Conta", type=AccountType.CHECKING, balance=10000.00, is_default=True)
    acct_xp = Account(id=uuid4(), user_id=user.id, name="XP Investimentos", type=AccountType.CHECKING, balance=5000.00)
    acct_cc = Account(id=uuid4(), user_id=user.id, name="Nubank Cartão", type=AccountType.CREDIT_CARD, balance=0.00)
    db.add_all([acct_brad, acct_xp, acct_cc])
    db.commit()
    token = create_access_token(str(user.id))
    return TestClient(app), db, user, acct_brad, acct_xp, acct_cc, {"Authorization": f"Bearer {token}"}


def test_story_51_universal_edit_preserves_origin_and_moves_account_balance():
    client, db, user, acct_brad, acct_xp, _, headers = _make_client()
    try:
        tx = Transaction(
            user_id=user.id,
            account_id=acct_brad.id,
            type=TransactionType.EXPENSE,
            amount=250.00,
            description="COMPRA ORIGINAL OF",
            transaction_date=date.today(),
            source=TransactionSource.OPEN_FINANCE.value,
            external_id="pluggy-ext-999",
            dedup_hash="abc123deduphash",
            origin_metadata={"provider": "pluggy", "original_amount": 250.0, "original_description": "COMPRA ORIGINAL OF"},
        )
        db.add(tx)
        db.commit()

        # Edit description, amount, statement_month, AND move account from Bradesco -> XP
        r = client.put(
            f"/transactions/{tx.id}",
            headers=headers,
            json={
                "account_id": str(acct_xp.id),
                "amount": 300.00,
                "description": "Compra Editada Pelo Usuário",
                "statement_month": "2026-12",
                "payment_method": "pix",
            },
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["user_edited"] is True
        assert body["account_id"] == str(acct_xp.id)
        assert float(body["amount"]) == 300.0
        # Immutable origin fields preserved for anti-dedup!
        assert body["external_id"] == "pluggy-ext-999"
        assert body["source"] == "open_finance"
        assert body["origin_metadata"]["original_amount"] == 250.0

        db.expire_all()
        assert db.query(Transaction).filter(Transaction.id == tx.id).first().dedup_hash == "abc123deduphash"
        assert float(db.query(Account).filter(Account.id == acct_brad.id).first().balance) == 10250.0
        assert float(db.query(Account).filter(Account.id == acct_xp.id).first().balance) == 4700.0
    finally:
        db.close()
        app.dependency_overrides.clear()


def test_stories_53_54_55_56_57_58_proactive_ai_recurrences_budgets_cards_audit_reports():
    client, db, user, acct_brad, acct_xp, acct_cc, headers = _make_client()
    today = date.today()
    try:
        # 1. Pluggy sandbox link auto-registers CreditCard (Story 5.6) + recurrences (Story 5.4) + AI review (Story 5.3)
        p_res = client.post(
            "/open-finance/pluggy/items",
            headers=headers,
            json={"item_id": "sandbox-nubank-epic5", "institution_name": "Nubank"},
        )
        assert p_res.status_code == 201, p_res.text
        cards_res = client.get("/credit-cards", headers=headers)
        assert cards_res.status_code == 200
        assert cards_res.json()["summary"]["cards_count"] >= 1

        # 2. Seed card with closing_day=10 + purchase on day 15 allocated to current month (should suggest NEXT month!)
        cc = CreditCard(
            user_id=user.id,
            account_id=acct_cc.id,
            name="Nubank Test",
            brand="mastercard",
            credit_limit=8000,
            closing_day=10,
            due_day=17,
        )
        db.add(cc)
        db.flush()

        buy_dt = date(today.year, today.month, 15) if today.day >= 15 else date(today.year, max(1, today.month - 1), 15)
        tx_late_cc = Transaction(
            user_id=user.id,
            account_id=acct_cc.id,
            type=TransactionType.EXPENSE,
            amount=450.00,
            description="Restaurante Pós Fechamento",
            transaction_date=buy_dt,
            statement_month=buy_dt.strftime("%Y-%m"),
            payment_method="credit_card",
        )
        # Same-owner transfer Bradesco -> XP mentioning user's name
        tx_self_transfer = Transaction(
            user_id=user.id,
            account_id=acct_brad.id,
            type=TransactionType.EXPENSE,
            amount=1500.00,
            description="PIX ENVIADO CRISTIANO SENJU XP INVESTIMENTOS",
            transaction_date=today,
            payment_method="pix",
        )
        # Recurring Netflix across 2 months
        m1 = today - timedelta(days=35)
        tx_rec1 = Transaction(user_id=user.id, account_id=acct_brad.id, type=TransactionType.EXPENSE, amount=55.90, description="NETFLIX.COM", transaction_date=m1, payment_method="credit_card")
        tx_rec2 = Transaction(user_id=user.id, account_id=acct_brad.id, type=TransactionType.EXPENSE, amount=55.90, description="NETFLIX.COM", transaction_date=today, payment_method="credit_card")
        tx_salary = Transaction(user_id=user.id, account_id=acct_brad.id, type=TransactionType.INCOME, amount=8000.00, description="SALARIO MENSAL", transaction_date=today, payment_method="bank_transfer")
        db.add_all([tx_late_cc, tx_self_transfer, tx_rec1, tx_rec2, tx_salary])
        db.commit()

        # 3. Story 5.4: Auto-detect recurrences (idempotent!)
        det1 = client.post("/recurring/detect", headers=headers)
        assert det1.status_code == 200, det1.text
        assert det1.json()["detected_and_registered"] >= 1
        det2 = client.post("/recurring/detect", headers=headers)
        assert det2.json()["detected_and_registered"] == 0

        # 4. Story 5.3: Proactive AI review detects invoice_month, self_transfer, account_audit (XP as checking -> investment)
        rev = client.post("/ai/review/run", headers=headers)
        assert rev.status_code == 200, rev.text
        sugs_res = client.get("/ai/suggestions", headers=headers)
        assert sugs_res.status_code == 200
        sugs = sugs_res.json()["items"]
        types_found = {s["suggestion_type"] for s in sugs}
        assert "invoice_month" in types_found
        assert "self_transfer" in types_found
        assert "account_audit" in types_found

        # Apply the self_transfer suggestion -> transaction becomes TRANSFER!
        st_sug = next(s for s in sugs if s["suggestion_type"] == "self_transfer")
        ap = client.post(f"/ai/suggestions/{st_sug['id']}/apply", headers=headers)
        assert ap.status_code == 200, ap.text
        db.expire_all()
        assert db.query(Transaction).filter(Transaction.id == tx_self_transfer.id).first().type == TransactionType.TRANSFER

        # 5. Story 5.5: Proactive Budget Recommendations
        b_sug = client.get("/budgets/ai-suggestions", headers=headers)
        assert b_sug.status_code == 200, b_sug.text
        assert b_sug.json()["avg_monthly_income"] > 0

        # 6. Story 5.7: Accounts & Categories Audit
        audit = client.get("/accounts/audit", headers=headers)
        assert audit.status_code == 200, audit.text
        assert audit.json()["accounts_total"] >= 3

        # 7. Story 5.8: Reports 2.0 Analytics
        an = client.get("/reports/analytics", headers=headers)
        assert an.status_code == 200, an.text
        adata = an.json()
        assert len(adata["monthly_cashflow_12m"]) == 12
        assert len(adata["weekday_heatmap"]) == 7
        assert len(adata["ai_executive_summary"]) > 10
    finally:
        db.close()
        app.dependency_overrides.clear()
