"""EPIC-006: Add debts table and transaction tags & parent_transaction_id for split.

Revision ID: 20261126_0011
Revises: 20261125_0010
Create Date: 2026-11-26
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261126_0011"
down_revision = "20261125_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("tags", sa.JSON(), nullable=True))
    op.add_column("transactions", sa.Column("parent_transaction_id", postgresql.UUID(as_uuid=True), nullable=True))

    op.create_table(
        "debts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("debt_type", sa.String(40), nullable=False, server_default="other"),
        sa.Column("creditor", sa.String(255), nullable=True),
        sa.Column("original_amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("current_balance", sa.Numeric(15, 2), nullable=False),
        sa.Column("interest_rate_monthly", sa.Numeric(8, 4), nullable=False, server_default="0"),
        sa.Column("monthly_payment", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("remaining_installments", sa.Integer(), nullable=True),
        sa.Column("due_day", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("amortization_system", sa.String(20), nullable=False, server_default="price"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_debts_user_active", "debts", ["user_id", "is_active"])


def downgrade() -> None:
    op.drop_index("idx_debts_user_active", table_name="debts")
    op.drop_table("debts")
    op.drop_column("transactions", "parent_transaction_id")
    op.drop_column("transactions", "tags")
