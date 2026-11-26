"""EPIC-005: origin metadata, user_edited flags, pluggy credit cards sync, recurrence signatures, and ai_suggestions table.

Revision ID: 20261125_0010
Revises: 20261125_0009
Create Date: 2026-11-25 15:30:00
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261125_0010"
down_revision = "20261125_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("user_edited", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("accounts", sa.Column("origin_metadata", sa.JSON(), nullable=True))

    op.add_column("transactions", sa.Column("user_edited", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("transactions", sa.Column("origin_metadata", sa.JSON(), nullable=True))
    op.add_column("transactions", sa.Column("ai_reviewed_at", sa.DateTime(), nullable=True))

    op.add_column("recurring_rules", sa.Column("source", sa.String(24), nullable=False, server_default="manual"))
    op.add_column("recurring_rules", sa.Column("detection_signature", sa.String(120), nullable=True))

    op.add_column("credit_cards", sa.Column("user_edited", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("credit_cards", sa.Column("external_account_id", sa.String(200), nullable=True))
    op.add_column("credit_cards", sa.Column("pluggy_balance", sa.Numeric(15, 2), nullable=True))

    op.create_table(
        "ai_suggestions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("suggestion_type", sa.String(40), nullable=False),
        sa.Column("module", sa.String(24), nullable=False, server_default="transactions"),
        sa.Column("target_entity_type", sa.String(32), nullable=True),
        sa.Column("target_entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("current_snapshot", sa.JSON(), nullable=True),
        sa.Column("proposed_patch", sa.JSON(), nullable=False),
        sa.Column("confidence", sa.Numeric(4, 2), nullable=False, server_default="0.85"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("dedup_key", sa.String(140), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("user_id", "dedup_key", name="uq_ai_suggestions_user_dedup"),
    )
    op.create_index("idx_ai_suggestions_user_status", "ai_suggestions", ["user_id", "status", "module"])


def downgrade() -> None:
    op.drop_index("idx_ai_suggestions_user_status", table_name="ai_suggestions")
    op.drop_table("ai_suggestions")
    op.drop_column("credit_cards", "pluggy_balance")
    op.drop_column("credit_cards", "external_account_id")
    op.drop_column("credit_cards", "user_edited")
    op.drop_column("recurring_rules", "detection_signature")
    op.drop_column("recurring_rules", "source")
    op.drop_column("transactions", "ai_reviewed_at")
    op.drop_column("transactions", "origin_metadata")
    op.drop_column("transactions", "user_edited")
    op.drop_column("accounts", "origin_metadata")
    op.drop_column("accounts", "user_edited")
