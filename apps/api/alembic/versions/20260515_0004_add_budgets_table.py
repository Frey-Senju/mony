"""add budgets table

Revision ID: 0004_add_budgets_table
Revises: 0003_add_transaction_sync_fields
Create Date: 2026-05-15 00:00:00 UTC

New table ``budgets`` for Story 2.3 — per-category monthly spending limits.
Idempotent: checks for table existence before creating.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0004_add_budgets_table"
down_revision: Union[str, None] = "0003_add_transaction_sync_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table: str) -> bool:
    bind = op.get_bind()
    return table in sa.inspect(bind).get_table_names()


def upgrade() -> None:
    if _has_table("budgets"):
        return

    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"
    uuid_type = pg.UUID(as_uuid=True) if is_postgres else sa.String(length=36)

    op.create_table(
        "budgets",
        sa.Column("id", uuid_type, primary_key=True),
        sa.Column(
            "user_id",
            uuid_type,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("category", sa.String(length=100), nullable=False),
        sa.Column(
            "limit_amount",
            sa.Numeric(12, 2),
            sa.CheckConstraint("limit_amount > 0", name="ck_budget_limit_positive"),
            nullable=False,
        ),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="BRL"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("user_id", "category", name="uq_budget_user_category"),
    )
    op.create_index("ix_budgets_user_id", "budgets", ["user_id"])


def downgrade() -> None:
    if not _has_table("budgets"):
        return
    op.drop_index("ix_budgets_user_id", table_name="budgets")
    op.drop_table("budgets")
