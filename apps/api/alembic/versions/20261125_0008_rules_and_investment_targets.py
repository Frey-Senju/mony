"""Add category_rules and investment_targets tables.

Revision ID: 20261125_0008
Revises: 20261125_0007
Create Date: 2026-11-25 11:45:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261125_0008"
down_revision = "20261125_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "category_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pattern", sa.String(120), nullable=False),
        sa.Column("match_field", sa.String(20), nullable=False, server_default="any"),
        sa.Column("action", sa.String(24), nullable=False, server_default="categorize"),
        sa.Column("category_name", sa.String(100), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("matches_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("idx_category_rules_user_active", "category_rules", ["user_id", "is_active", "priority"])

    op.create_table(
        "investment_targets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("asset_class", sa.String(24), nullable=False),
        sa.Column("target_pct", sa.Numeric(6, 2), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "asset_class", name="uq_inv_targets_user_class"),
    )
    op.create_index("idx_inv_targets_user", "investment_targets", ["user_id"])


def downgrade() -> None:
    op.drop_index("idx_inv_targets_user", table_name="investment_targets")
    op.drop_table("investment_targets")
    op.drop_index("idx_category_rules_user_active", table_name="category_rules")
    op.drop_table("category_rules")
