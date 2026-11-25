"""Add credit_cards and push_subscriptions tables.

Revision ID: 20261125_0009
Revises: 20261125_0008
Create Date: 2026-11-25 12:10:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261125_0009"
down_revision = "20261125_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credit_cards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("brand", sa.String(30), nullable=False, server_default="mastercard"),
        sa.Column("last4", sa.String(4), nullable=True),
        sa.Column("credit_limit", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("closing_day", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("due_day", sa.Integer(), nullable=False, server_default="17"),
        sa.Column("color", sa.String(24), nullable=False, server_default="#6366f1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("closing_day >= 1 AND closing_day <= 31", name="ck_cc_closing_day"),
        sa.CheckConstraint("due_day >= 1 AND due_day <= 31", name="ck_cc_due_day"),
    )
    op.create_index("idx_credit_cards_user", "credit_cards", ["user_id", "is_active"])

    op.create_table(
        "push_subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "endpoint", name="uq_push_sub_user_endpoint"),
    )
    op.create_index("idx_push_sub_user_active", "push_subscriptions", ["user_id", "is_active"])


def downgrade() -> None:
    op.drop_index("idx_push_sub_user_active", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
    op.drop_index("idx_credit_cards_user", table_name="credit_cards")
    op.drop_table("credit_cards")
