"""add recurring_rules table

Revision ID: 20261124_0006
Revises: 20261124_0005
Create Date: 2026-11-24 22:35:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261124_0006"
down_revision = "20261124_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recurring_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.Enum("income", "expense", "transfer", "investment", "refund", name="transactiontype", create_type=False), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="BRL"),
        sa.Column("description", sa.String(255), nullable=False),
        sa.Column("merchant_name", sa.String(255), nullable=True),
        sa.Column("category_name", sa.String(100), nullable=True),
        sa.Column("payment_method", sa.String(30), nullable=True),
        sa.Column("frequency", sa.String(20), nullable=False, server_default="monthly"),
        sa.Column("day_of_month", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("auto_create", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_generated_month", sa.String(7), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("amount > 0", name="ck_recurring_amount_positive"),
        sa.CheckConstraint("day_of_month >= 1 AND day_of_month <= 31", name="ck_recurring_day_range"),
    )
    op.create_index("idx_recurring_rules_user_active", "recurring_rules", ["user_id", "is_active"])


def downgrade() -> None:
    op.drop_index("idx_recurring_rules_user_active", table_name="recurring_rules")
    op.drop_table("recurring_rules")
