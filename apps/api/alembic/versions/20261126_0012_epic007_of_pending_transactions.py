"""EPIC-007: Add of_pending_transactions approval queue for Open Finance.

Revision ID: 20261126_0012
Revises: 20261126_0011
Create Date: 2026-11-26
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261126_0012"
down_revision = "20261126_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "of_pending_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("linked_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("of_linked_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("mony_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("external_id", sa.String(200), nullable=True),
        sa.Column("dedup_hash", sa.String(64), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="BRL"),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("merchant_name", sa.String(255), nullable=True),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("statement_month", sa.String(7), nullable=True),
        sa.Column("payment_method", sa.String(30), nullable=True),
        sa.Column("installment_number", sa.Integer(), nullable=True),
        sa.Column("installment_total", sa.Integer(), nullable=True),
        sa.Column("suggested_category_name", sa.String(100), nullable=True),
        sa.Column("origin_metadata", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("approved_transaction_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("user_id", "dedup_hash", name="uq_of_pending_user_dedup"),
    )
    op.create_index("idx_of_pending_user_status", "of_pending_transactions", ["user_id", "status"])


def downgrade() -> None:
    op.drop_index("idx_of_pending_user_status", table_name="of_pending_transactions")
    op.drop_table("of_pending_transactions")
