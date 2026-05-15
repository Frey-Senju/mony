"""ARCH-001 cleanup: drop legacy openfinance_connections + user openfinance_* fields

Revision ID: 0002_cleanup_openfinance_legacy
Revises: 0001_baseline
Create Date: 2026-04-29 12:05:00 UTC

Removes the placeholder ``openfinance_connections`` table and the obsolete
``users.openfinance_*`` columns introduced in Story 1.2 and superseded by the
``of_institutions`` / ``of_consents`` / ``of_linked_accounts`` design from
Story 2.1.

Idempotent: uses ``IF EXISTS`` semantics so the migration is safe to apply on
clean environments where the legacy artefacts were never created (test DBs,
fresh installs).

Downgrade re-creates the legacy table and columns with their original shape so
this migration is fully reversible — but data is not restored (the table was
empty in production).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_cleanup_openfinance_legacy"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return False
    return column_name in {col["name"] for col in inspector.get_columns(table_name)}


# ---------------------------------------------------------------------------
# Upgrade — remove legacy artefacts
# ---------------------------------------------------------------------------


_LEGACY_USER_COLUMNS = (
    "openfinance_status",
    "openfinance_token",
    "openfinance_institutions",
    "openfinance_last_sync",
    "openfinance_next_sync",
)


def upgrade() -> None:
    if _has_table("openfinance_connections"):
        op.drop_table("openfinance_connections")

    for column_name in _LEGACY_USER_COLUMNS:
        if _has_column("users", column_name):
            with op.batch_alter_table("users") as batch_op:
                batch_op.drop_column(column_name)

    # Drop the legacy enum if the dialect is PostgreSQL — SQLite has no separate
    # type to clean up. Use a plain DROP TYPE IF EXISTS so the operation is
    # idempotent.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS openfinancestatus")


# ---------------------------------------------------------------------------
# Downgrade — re-create legacy table and columns (empty)
# ---------------------------------------------------------------------------


def downgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    if is_postgres:
        op.execute(
            "DO $$ BEGIN "
            "IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'openfinancestatus') THEN "
            "CREATE TYPE openfinancestatus AS ENUM "
            "('not_connected','connecting','connected','failed','expired'); "
            "END IF; END $$;"
        )

    status_type = (
        sa.Enum(
            "not_connected",
            "connecting",
            "connected",
            "failed",
            "expired",
            name="openfinancestatus",
            create_type=False,
        )
        if is_postgres
        else sa.String(length=50)
    )

    if not _has_column("users", "openfinance_status"):
        with op.batch_alter_table("users") as batch_op:
            batch_op.add_column(sa.Column("openfinance_status", status_type, nullable=True))
            batch_op.add_column(sa.Column("openfinance_token", sa.String(length=500), nullable=True))
            batch_op.add_column(sa.Column("openfinance_institutions", sa.Float(), nullable=True))
            batch_op.add_column(sa.Column("openfinance_last_sync", sa.DateTime(), nullable=True))
            batch_op.add_column(sa.Column("openfinance_next_sync", sa.DateTime(), nullable=True))

    if not _has_table("openfinance_connections"):
        op.create_table(
            "openfinance_connections",
            sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36), primary_key=True),
            sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True) if is_postgres else sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("institution_code", sa.String(length=50), nullable=False),
            sa.Column("institution_name", sa.String(length=255), nullable=False),
            sa.Column("ofbank_id", sa.String(length=100)),
            sa.Column("consent_id", sa.String(length=100)),
            sa.Column("status", status_type),
            sa.Column("connected_at", sa.DateTime()),
            sa.Column("last_synced_at", sa.DateTime()),
            sa.Column("next_sync_at", sa.DateTime()),
            sa.Column("synced_accounts", sa.Float(), default=0),
            sa.Column("synced_transactions", sa.Float(), default=0),
            sa.Column("last_error", sa.Text()),
            sa.Column("last_error_at", sa.DateTime()),
            sa.Column("error_count", sa.Float(), default=0),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("deleted_at", sa.DateTime()),
            sa.UniqueConstraint("user_id", "institution_code", name="uq_ofconnections_user_institution"),
        )
        op.create_index(
            "idx_ofconnections_user_status",
            "openfinance_connections",
            ["user_id", "status"],
        )
