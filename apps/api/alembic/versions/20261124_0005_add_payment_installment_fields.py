"""Add payment_method, installment, and invoice statement_month columns to transactions.

Revision ID: 0005_payment_installments
Revises: 0004_add_budgets
Create Date: 2026-11-24
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_payment_installments"
down_revision = "0004_add_budgets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("transactions")}

    if "payment_method" not in existing:
        op.add_column("transactions", sa.Column("payment_method", sa.String(length=30), nullable=True))
    if "installment_number" not in existing:
        op.add_column("transactions", sa.Column("installment_number", sa.Integer(), nullable=True))
    if "installment_total" not in existing:
        op.add_column("transactions", sa.Column("installment_total", sa.Integer(), nullable=True))
    if "statement_month" not in existing:
        op.add_column("transactions", sa.Column("statement_month", sa.String(length=7), nullable=True))
    if "original_purchase_date" not in existing:
        op.add_column("transactions", sa.Column("original_purchase_date", sa.Date(), nullable=True))


def downgrade() -> None:
    for col in (
        "original_purchase_date",
        "statement_month",
        "installment_total",
        "installment_number",
        "payment_method",
    ):
        op.drop_column("transactions", col)
