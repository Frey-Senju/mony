"""add transaction sync fields + of_sync_jobs + linked-account sync state

Revision ID: 0003_add_transaction_sync_fields
Revises: 0002_cleanup_openfinance_legacy
Create Date: 2026-04-29 12:10:00 UTC

Adds the schema needed by the Open Finance transaction sync pipeline:

* ``transactions.source`` / ``transactions.external_id`` for tracking origin.
* Partial unique index ``uix_transactions_external`` on
  ``(user_id, external_id, source)`` WHERE ``external_id IS NOT NULL`` for
  deduplication of synced transactions.
* ``of_linked_accounts.sync_status`` / ``last_sync_error`` /
  ``last_sync_attempt_at`` for per-account sync state tracking.
* ``of_sync_jobs`` table to track manual / scheduled / webhook sync jobs.

The ``source`` default is ``manual`` so existing rows continue to work as the
non-OF user-entered transactions they are.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

# revision identifiers, used by Alembic.
revision: str = "0003_add_transaction_sync_fields"
down_revision: Union[str, None] = "0002_cleanup_openfinance_legacy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PARTIAL_INDEX_NAME = "uix_transactions_external"


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table not in inspector.get_table_names():
        return False
    return column in {col["name"] for col in inspector.get_columns(table)}


def _has_table(table: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table in inspector.get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = bind.dialect.name == "postgresql"

    # ----- transactions.source / external_id -----
    if not _has_column("transactions", "source"):
        with op.batch_alter_table("transactions") as batch_op:
            batch_op.add_column(
                sa.Column(
                    "source",
                    sa.String(length=20),
                    nullable=False,
                    server_default="manual",
                )
            )
    if not _has_column("transactions", "external_id"):
        with op.batch_alter_table("transactions") as batch_op:
            batch_op.add_column(sa.Column("external_id", sa.String(length=200), nullable=True))

    op.create_index("idx_transactions_source", "transactions", ["source"], if_not_exists=True)

    if is_postgres:
        op.execute(
            f"CREATE UNIQUE INDEX IF NOT EXISTS {PARTIAL_INDEX_NAME} "
            "ON transactions (user_id, external_id, source) "
            "WHERE external_id IS NOT NULL"
        )
    else:
        # SQLite supports partial indexes via the same syntax; use plain DDL so
        # tests against the in-memory SQLite database also enforce the constraint.
        op.execute(
            f"CREATE UNIQUE INDEX IF NOT EXISTS {PARTIAL_INDEX_NAME} "
            "ON transactions (user_id, external_id, source) "
            "WHERE external_id IS NOT NULL"
        )

    # ----- of_linked_accounts sync state columns -----
    if _has_table("of_linked_accounts"):
        if not _has_column("of_linked_accounts", "sync_status"):
            with op.batch_alter_table("of_linked_accounts") as batch_op:
                batch_op.add_column(
                    sa.Column(
                        "sync_status",
                        sa.String(length=20),
                        nullable=False,
                        server_default="idle",
                    )
                )
        if not _has_column("of_linked_accounts", "last_sync_error"):
            with op.batch_alter_table("of_linked_accounts") as batch_op:
                batch_op.add_column(sa.Column("last_sync_error", sa.Text(), nullable=True))
        if not _has_column("of_linked_accounts", "last_sync_attempt_at"):
            with op.batch_alter_table("of_linked_accounts") as batch_op:
                batch_op.add_column(sa.Column("last_sync_attempt_at", sa.DateTime(), nullable=True))

    # ----- of_sync_jobs table -----
    if not _has_table("of_sync_jobs"):
        uuid_type = pg.UUID(as_uuid=True) if is_postgres else sa.String(length=36)
        op.create_table(
            "of_sync_jobs",
            sa.Column("id", uuid_type, primary_key=True),
            sa.Column("user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("linked_account_id", uuid_type, sa.ForeignKey("of_linked_accounts.id", ondelete="SET NULL"), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="queued"),
            sa.Column("trigger", sa.String(length=20), nullable=False, server_default="manual"),
            sa.Column("accounts_queued", sa.Integer(), default=0),
            sa.Column("accounts_processed", sa.Integer(), default=0),
            sa.Column("transactions_inserted", sa.Integer(), default=0),
            sa.Column("transactions_skipped", sa.Integer(), default=0),
            sa.Column("error_message", sa.Text()),
            sa.Column("started_at", sa.DateTime()),
            sa.Column("finished_at", sa.DateTime()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("idx_of_sync_jobs_user_id", "of_sync_jobs", ["user_id"])
        op.create_index("idx_of_sync_jobs_status", "of_sync_jobs", ["status"])


def downgrade() -> None:
    if _has_table("of_sync_jobs"):
        op.drop_index("idx_of_sync_jobs_status", table_name="of_sync_jobs")
        op.drop_index("idx_of_sync_jobs_user_id", table_name="of_sync_jobs")
        op.drop_table("of_sync_jobs")

    if _has_table("of_linked_accounts"):
        for col in ("last_sync_attempt_at", "last_sync_error", "sync_status"):
            if _has_column("of_linked_accounts", col):
                with op.batch_alter_table("of_linked_accounts") as batch_op:
                    batch_op.drop_column(col)

    op.execute(f"DROP INDEX IF EXISTS {PARTIAL_INDEX_NAME}")
    op.execute("DROP INDEX IF EXISTS idx_transactions_source")

    if _has_column("transactions", "external_id"):
        with op.batch_alter_table("transactions") as batch_op:
            batch_op.drop_column("external_id")
    if _has_column("transactions", "source"):
        with op.batch_alter_table("transactions") as batch_op:
            batch_op.drop_column("source")
