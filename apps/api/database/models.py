"""
SQLAlchemy ORM models for Mony financial dashboard application.
"""

from datetime import datetime
from decimal import Decimal
from enum import Enum
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


# ============================================================================
# Enums
# ============================================================================


class AccountType(str, Enum):
    """Account types available to users."""

    CHECKING = "checking"
    SAVINGS = "savings"
    CREDIT_CARD = "credit_card"
    INVESTMENT = "investment"
    CASH = "cash"


class TransactionType(str, Enum):
    """Transaction types."""

    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"
    INVESTMENT = "investment"
    REFUND = "refund"


class TransactionSource(str, Enum):
    """Origin of a transaction record."""

    MANUAL = "manual"
    OPEN_FINANCE = "open_finance"


class LinkedAccountSyncStatus(str, Enum):
    """Sync status of an Open Finance linked account."""

    IDLE = "idle"
    SYNCING = "syncing"
    ERROR = "error"


class SyncJobStatus(str, Enum):
    """Status of a transaction sync job."""

    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class LimitType(str, Enum):
    """Spending limit types."""

    CATEGORY = "category"
    ACCOUNT = "account"
    TOTAL = "total"


class LimitPeriod(str, Enum):
    """Spending limit periods."""

    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class NotificationType(str, Enum):
    """Notification types."""

    LIMIT_ALERT = "limit_alert"
    GOAL_PROGRESS = "goal_progress"
    DAILY_SUMMARY = "daily_summary"
    CUSTOM = "custom"


class UserPlan(str, Enum):
    """User subscription plans (like Pierre Finance)."""

    BASIC = "basic"  # Free tier
    PRO = "pro"  # Professional
    PREMIUM = "premium"  # Enterprise


# ============================================================================
# Models
# ============================================================================


class User(Base):
    """User account model."""

    __tablename__ = "users"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(20))
    preferred_currency = Column(String(3), default="BRL")
    timezone = Column(String(50), default="America/Sao_Paulo")
    is_email_verified = Column(Boolean, default=False)

    # Subscription Plan (Pierre Finance like)
    plan = Column(SQLEnum(UserPlan), default=UserPlan.BASIC)
    plan_started_at = Column(DateTime, default=datetime.utcnow)
    plan_expires_at = Column(DateTime)  # NULL = no expiration

    # Security
    last_login_at = Column(DateTime)
    last_login_ip = Column(String(45))
    two_factor_enabled = Column(Boolean, default=False)
    two_factor_secret = Column(String(32))

    # Account Lockout (after 5 failed login attempts)
    is_locked = Column(Boolean, default=False)
    locked_until = Column(DateTime, nullable=True)
    failed_login_attempts = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    deleted_at = Column(DateTime, nullable=True, index=True)

    # Relationships
    accounts = relationship("Account", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user", cascade="all, delete-orphan")
    categories = relationship("Category", back_populates="user", cascade="all, delete-orphan")
    spending_limits = relationship("SpendingLimit", back_populates="user", cascade="all, delete-orphan")
    goals = relationship("Goal", back_populates="user", cascade="all, delete-orphan")
    receipts = relationship("Receipt", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    audit_log = relationship("AuditLog", back_populates="user", cascade="all, delete-orphan")
    subscription_history = relationship("SubscriptionHistory", back_populates="user", cascade="all, delete-orphan")

    @hybrid_property
    def is_plan_active(self):
        """Check if subscription plan is currently active."""
        if self.plan_expires_at is None:
            return True
        return self.plan_expires_at > datetime.utcnow()

    def __repr__(self):
        return f"<User {self.email} ({self.plan.value})>"


class Account(Base):
    """User account (checking, savings, credit card, etc.)."""

    __tablename__ = "accounts"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    type = Column(SQLEnum(AccountType), nullable=False)
    balance = Column(Numeric(15, 2), default=0.00)
    currency = Column(String(3), default="BRL")
    icon = Column(String(50))
    color = Column(String(7))
    is_default = Column(Boolean, default=False)
    sort_order = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    deleted_at = Column(DateTime, nullable=True)

    # Indexes
    __table_args__ = (
        Index("idx_accounts_user_id", "user_id"),
        Index("idx_accounts_user_default", "user_id", "is_default"),
        UniqueConstraint("user_id", "name", name="uq_accounts_user_name"),
    )

    # Relationships
    user = relationship("User", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account")

    def __repr__(self):
        return f"<Account {self.name} ({self.type.value})>"


class Category(Base):
    """Hierarchical transaction categories."""

    __tablename__ = "categories"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    name = Column(String(100), nullable=False)
    slug = Column(String(100))
    description = Column(Text)
    icon = Column(String(50))
    color = Column(String(7))
    is_system = Column(Boolean, default=False)
    parent_id = Column(PG_UUID(as_uuid=True), ForeignKey("categories.id"))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    deleted_at = Column(DateTime, nullable=True)

    # Indexes
    __table_args__ = (
        Index("idx_categories_user_id", "user_id"),
        Index("idx_categories_parent_id", "parent_id"),
        UniqueConstraint("user_id", "slug", name="uq_categories_user_slug"),
    )

    # Relationships
    user = relationship("User", back_populates="categories")
    transactions = relationship("TransactionCategory", back_populates="category")
    parent = relationship("Category", remote_side=[id], backref="subcategories")

    def __repr__(self):
        return f"<Category {self.name}>"


class Transaction(Base):
    """Financial transaction (income, expense, transfer, etc.)."""

    __tablename__ = "transactions"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(
        PG_UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="RESTRICT"), nullable=False
    )
    type = Column(SQLEnum(TransactionType), nullable=False)
    amount = Column(Numeric(15, 2), nullable=False)
    currency = Column(String(3), default="BRL")
    description = Column(String(255), nullable=False)
    notes = Column(Text)
    transaction_date = Column(Date, nullable=False)
    merchant_name = Column(String(255))
    is_recurring = Column(Boolean, default=False)
    recurring_pattern = Column(String(50))
    is_reconciled = Column(Boolean, default=False)

    # Origin tracking — `manual` for user-entered, `open_finance` for synced via OF API.
    # external_id is the bank-side transaction ID; populated only when source != manual.
    source = Column(String(20), nullable=False, default=TransactionSource.MANUAL.value)
    external_id = Column(String(200), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    deleted_at = Column(DateTime, nullable=True)

    # Constraints
    # Note: The dedup uniqueness on (user_id, external_id, source) WHERE external_id IS NOT NULL
    # is enforced via a partial unique index created in the Alembic migration — partial indexes
    # cannot be expressed via SQLAlchemy's UniqueConstraint declaratively in a portable way.
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_transaction_amount_positive"),
        Index("idx_transactions_user_date", "user_id", "transaction_date"),
        Index("idx_transactions_account_date", "account_id", "transaction_date"),
        Index("idx_transactions_type", "type"),
        Index("idx_transactions_source", "source"),
    )

    # Relationships
    user = relationship("User", back_populates="transactions")
    account = relationship("Account", back_populates="transactions")
    categories = relationship("TransactionCategory", back_populates="transaction", cascade="all, delete-orphan")
    receipt = relationship("Receipt", back_populates="transaction", uselist=False)

    def __repr__(self):
        return f"<Transaction {self.type.value} {self.amount} {self.currency}>"


class TransactionCategory(Base):
    """Junction table for transaction-category many-to-many relationship."""

    __tablename__ = "transaction_categories"

    transaction_id = Column(
        PG_UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    category_id = Column(
        PG_UUID(as_uuid=True),
        ForeignKey("categories.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    percentage = Column(Numeric(5, 2), default=100.00)

    # Constraints
    __table_args__ = (CheckConstraint("percentage > 0 AND percentage <= 100", name="ck_percentage_range"),)

    # Relationships
    transaction = relationship("Transaction", back_populates="categories")
    category = relationship("Category", back_populates="transactions")

    def __repr__(self):
        return f"<TransactionCategory {self.percentage}%>"


class SpendingLimit(Base):
    """User-defined spending limits with alerts."""

    __tablename__ = "spending_limits"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category_id = Column(PG_UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"))
    limit_type = Column(SQLEnum(LimitType), nullable=False)
    period = Column(SQLEnum(LimitPeriod), default=LimitPeriod.MONTHLY)
    limit_amount = Column(Numeric(15, 2), nullable=False)
    current_spent = Column(Numeric(15, 2), default=0.00)
    alert_threshold = Column(Numeric(5, 2), default=80.00)
    is_active = Column(Boolean, default=True)
    start_date = Column(Date)
    end_date = Column(Date)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Constraints
    __table_args__ = (
        CheckConstraint("limit_amount > 0", name="ck_limit_amount_positive"),
        CheckConstraint("alert_threshold > 0 AND alert_threshold <= 100", name="ck_alert_threshold_range"),
        Index("idx_spending_limits_user_active", "user_id", "is_active"),
        Index("idx_spending_limits_period", "period"),
    )

    # Relationships
    user = relationship("User", back_populates="spending_limits")
    category = relationship("Category")

    @hybrid_property
    def percentage_used(self):
        """Calculate percentage of limit used."""
        if self.limit_amount == 0:
            return 0
        return (float(self.current_spent) / float(self.limit_amount)) * 100

    def __repr__(self):
        return f"<SpendingLimit {self.period.value} {self.limit_amount} {self.percentage_used:.1f}%>"


class Goal(Base):
    """Savings goals with progress tracking."""

    __tablename__ = "goals"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    target_amount = Column(Numeric(15, 2), nullable=False)
    current_amount = Column(Numeric(15, 2), default=0.00)
    currency = Column(String(3), default="BRL")
    category_id = Column(PG_UUID(as_uuid=True), ForeignKey("categories.id"))
    target_date = Column(Date)
    icon = Column(String(50))
    color = Column(String(7))
    is_active = Column(Boolean, default=True)
    achieved_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Constraints
    __table_args__ = (
        CheckConstraint("target_amount > 0", name="ck_goal_target_positive"),
        CheckConstraint("current_amount >= 0", name="ck_goal_current_non_negative"),
        Index("idx_goals_user_active", "user_id", "is_active"),
        Index("idx_goals_target_date", "target_date"),
    )

    # Relationships
    user = relationship("User", back_populates="goals")
    category = relationship("Category")

    @hybrid_property
    def percentage_achieved(self):
        """Calculate percentage of goal achieved."""
        if self.target_amount == 0:
            return 0
        return (float(self.current_amount) / float(self.target_amount)) * 100

    def __repr__(self):
        return f"<Goal {self.name} {self.percentage_achieved:.1f}%>"


class Receipt(Base):
    """Receipt image and OCR-extracted data."""

    __tablename__ = "receipts"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    transaction_id = Column(
        PG_UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE")
    )
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String(255))
    file_size = Column(Float)
    mime_type = Column(String(50))
    extracted_data = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Indexes
    __table_args__ = (
        Index("idx_receipts_transaction_id", "transaction_id"),
        Index("idx_receipts_user_id", "user_id"),
    )

    # Relationships
    transaction = relationship("Transaction", back_populates="receipt")
    user = relationship("User", back_populates="receipts")

    def __repr__(self):
        return f"<Receipt {self.id}>"


class Notification(Base):
    """User notifications for alerts, goals, etc."""

    __tablename__ = "notifications"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(SQLEnum(NotificationType), default=NotificationType.CUSTOM)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    related_entity_type = Column(String(50))
    related_entity_id = Column(PG_UUID(as_uuid=True))
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime)

    # Indexes
    __table_args__ = (
        Index("idx_notifications_user_read", "user_id", "is_read"),
        Index("idx_notifications_created_at", "created_at"),
    )

    # Relationships
    user = relationship("User", back_populates="notifications")

    def __repr__(self):
        return f"<Notification {self.type.value}>"


class AuditLog(Base):
    """Audit trail for user actions."""

    __tablename__ = "audit_log"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(PG_UUID(as_uuid=True))
    action = Column(String(50), nullable=False)
    old_values = Column(JSON)
    new_values = Column(JSON)
    ip_address = Column(String(45))
    user_agent = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Indexes
    __table_args__ = (
        Index("idx_audit_log_user_created", "user_id", "created_at"),
        Index("idx_audit_log_entity", "entity_type", "entity_id"),
    )

    # Relationships
    user = relationship("User", back_populates="audit_log")

    def __repr__(self):
        return f"<AuditLog {self.entity_type} {self.action}>"


class OFInstitution(Base):
    """
    Open Finance sandbox institutions available for account linking.
    Seeded at startup from data/sandbox_institutions.json.
    """

    __tablename__ = "of_institutions"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    external_id = Column(String(50), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    logo_url = Column(Text)
    authorization_server_url = Column(Text, nullable=False)
    token_endpoint = Column(Text, nullable=False)
    accounts_endpoint = Column(Text, nullable=False)
    is_sandbox = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    consents = relationship("OFConsent", back_populates="institution")
    linked_accounts = relationship("OFLinkedAccount", back_populates="institution")

    def __repr__(self):
        return f"<OFInstitution {self.name}>"


class ConsentStatus(str, Enum):
    """Status of an Open Finance consent request."""

    PENDING = "PENDING"
    AUTHORIZED = "AUTHORIZED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"


class OFConsent(Base):
    """
    Open Finance consent request tracking.
    Represents one OAuth2 authorization flow attempt.
    """

    __tablename__ = "of_consents"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    institution_id = Column(PG_UUID(as_uuid=True), ForeignKey("of_institutions.id"), nullable=False)
    external_consent_id = Column(String(200))
    status = Column(SQLEnum(ConsentStatus), default=ConsentStatus.PENDING, nullable=False)
    permissions = Column(JSON, default=list)
    state_token = Column(String(64), nullable=False)
    authorization_url = Column(Text, nullable=False)
    access_token_encrypted = Column(Text)
    refresh_token_encrypted = Column(Text)
    token_expires_at = Column(DateTime)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_of_consents_user_id", "user_id"),
        Index("idx_of_consents_state_token", "state_token"),
        Index("idx_of_consents_status", "status"),
    )

    # Relationships
    user = relationship("User")
    institution = relationship("OFInstitution", back_populates="consents")
    linked_account = relationship("OFLinkedAccount", back_populates="consent", uselist=False)

    def __repr__(self):
        return f"<OFConsent {self.status.value}>"


class OFLinkedAccount(Base):
    """
    Bank account linked via Open Finance consent flow.
    Created after a consent is authorized and accounts fetched.
    """

    __tablename__ = "of_linked_accounts"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    consent_id = Column(PG_UUID(as_uuid=True), ForeignKey("of_consents.id"), nullable=False)
    institution_id = Column(PG_UUID(as_uuid=True), ForeignKey("of_institutions.id"), nullable=False)
    external_account_id = Column(String(200), nullable=False)
    account_type = Column(String(50))
    account_number_last4 = Column(String(4))
    owner_name = Column(String(200))
    currency = Column(String(3), default="BRL")
    is_active = Column(Boolean, default=True)
    last_sync_at = Column(DateTime)

    # Sync state tracking — added in Story 2.2
    sync_status = Column(
        String(20), nullable=False, default=LinkedAccountSyncStatus.IDLE.value
    )
    last_sync_error = Column(Text, nullable=True)
    last_sync_attempt_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_of_linked_accounts_user_id", "user_id"),
        UniqueConstraint("user_id", "institution_id", "external_account_id", name="uq_of_linked_accounts"),
    )

    # Relationships
    user = relationship("User")
    consent = relationship("OFConsent", back_populates="linked_account")
    institution = relationship("OFInstitution", back_populates="linked_accounts")

    def __repr__(self):
        return f"<OFLinkedAccount {self.account_number_last4} ({self.account_type})>"


class OFSyncJob(Base):
    """
    Tracks an Open Finance transaction sync job (manual or scheduled).

    A single sync_id may fan out to multiple linked accounts; this table records
    the parent job. Per-account results are aggregated in `accounts_processed`,
    `transactions_inserted`, `transactions_skipped`, etc.
    """

    __tablename__ = "of_sync_jobs"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    linked_account_id = Column(
        PG_UUID(as_uuid=True),
        ForeignKey("of_linked_accounts.id", ondelete="SET NULL"),
        nullable=True,
    )

    status = Column(String(20), nullable=False, default=SyncJobStatus.QUEUED.value)
    trigger = Column(String(20), nullable=False, default="manual")  # manual | scheduled | webhook

    accounts_queued = Column(Integer, default=0)
    accounts_processed = Column(Integer, default=0)
    transactions_inserted = Column(Integer, default=0)
    transactions_skipped = Column(Integer, default=0)
    error_message = Column(Text)

    started_at = Column(DateTime)
    finished_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        Index("idx_of_sync_jobs_user_id", "user_id"),
        Index("idx_of_sync_jobs_status", "status"),
    )

    def __repr__(self):
        return f"<OFSyncJob {self.id} {self.status}>"


class SubscriptionHistory(Base):
    """Track subscription plan changes for billing and analytics."""

    __tablename__ = "subscription_history"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Plan change details
    plan_from = Column(SQLEnum(UserPlan), nullable=False)
    plan_to = Column(SQLEnum(UserPlan), nullable=False)

    # Payment info
    amount_paid = Column(Numeric(15, 2))  # NULL if free tier
    currency = Column(String(3), default="BRL")
    payment_method = Column(String(50))  # credit_card, debit_card, pix, etc
    payment_status = Column(String(50), default="completed")  # completed, failed, pending

    # Subscription period
    started_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime)  # NULL for lifetime or active

    # Metadata
    billing_period = Column(String(20))  # monthly, yearly, lifetime
    auto_renew = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Indexes
    __table_args__ = (
        Index("idx_subscription_user_created", "user_id", "created_at"),
    )

    # Relationships
    user = relationship("User", back_populates="subscription_history")

    def __repr__(self):
        return f"<SubscriptionHistory {self.plan_from.value} → {self.plan_to.value}>"


class Budget(Base):
    """Monthly spending budget per category."""

    __tablename__ = "budgets"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category = Column(String(100), nullable=False)
    limit_amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="BRL")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        CheckConstraint("limit_amount > 0", name="ck_budget_limit_positive"),
        UniqueConstraint("user_id", "category", name="uq_budget_user_category"),
        Index("ix_budgets_user_id", "user_id"),
    )

    user = relationship("User")

    def __repr__(self):
        return f"<Budget {self.category} {self.limit_amount}>"
