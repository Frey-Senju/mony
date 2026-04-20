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


class OpenFinanceStatus(str, Enum):
    """Status of Open Finance integration."""

    NOT_CONNECTED = "not_connected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    FAILED = "failed"
    EXPIRED = "expired"


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

    # Open Finance Integration (Pierre Finance feature)
    openfinance_status = Column(SQLEnum(OpenFinanceStatus), default=OpenFinanceStatus.NOT_CONNECTED)
    openfinance_token = Column(String(500))  # Encrypted OAuth token
    openfinance_institutions = Column(Float, default=0)  # Count of connected institutions
    openfinance_last_sync = Column(DateTime)
    openfinance_next_sync = Column(DateTime)

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
    openfinance_connections = relationship("OpenFinanceConnection", back_populates="user", cascade="all, delete-orphan")
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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    deleted_at = Column(DateTime, nullable=True)

    # Constraints
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_transaction_amount_positive"),
        Index("idx_transactions_user_date", "user_id", "transaction_date"),
        Index("idx_transactions_account_date", "account_id", "transaction_date"),
        Index("idx_transactions_type", "type"),
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


class OpenFinanceConnection(Base):
    """
    Open Finance integration with Brazilian banks (like Pierre Finance).

    Stores connections to institutions via Central Bank Open Finance API.
    Supports automatic transaction synchronization.
    """

    __tablename__ = "openfinance_connections"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Institution details
    institution_code = Column(String(50), nullable=False)  # ISPB code (e.g., "00000000")
    institution_name = Column(String(255), nullable=False)  # e.g., "Itaú Unibanco"

    # Authentication
    ofbank_id = Column(String(100))  # Open Finance user ID at institution
    consent_id = Column(String(100))  # Consent ID for data access

    # Status tracking
    status = Column(SQLEnum(OpenFinanceStatus), default=OpenFinanceStatus.CONNECTING)
    connected_at = Column(DateTime)
    last_synced_at = Column(DateTime)
    next_sync_at = Column(DateTime)

    # Data sync counters
    synced_accounts = Column(Float, default=0)
    synced_transactions = Column(Float, default=0)

    # Error tracking
    last_error = Column(Text)
    last_error_at = Column(DateTime)
    error_count = Column(Float, default=0)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    deleted_at = Column(DateTime, nullable=True)

    # Indexes
    __table_args__ = (
        Index("idx_ofconnections_user_status", "user_id", "status"),
        UniqueConstraint("user_id", "institution_code", name="uq_ofconnections_user_institution"),
    )

    # Relationships
    user = relationship("User", back_populates="openfinance_connections")

    def __repr__(self):
        return f"<OpenFinanceConnection {self.institution_name} ({self.status.value})>"


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
