"""baseline pre Story 2.2

Revision ID: 0001_baseline
Revises:
Create Date: 2026-04-29 12:00:00 UTC

This is a no-op migration that establishes the Alembic baseline for the Mony
schema as it stood at the end of Story 2.1. The schema itself is created by
``Base.metadata.create_all`` in ``database.base.create_tables``; this revision
simply marks the head so subsequent Story 2.2 migrations have a parent.

Run ``alembic stamp 0001_baseline`` against any existing database that already
has the Story 2.1 schema before applying later revisions.
"""
from __future__ import annotations

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
