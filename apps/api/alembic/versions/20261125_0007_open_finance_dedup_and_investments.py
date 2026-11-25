"""add open finance dedup columns and B3 investment portfolio tables

Revision ID: 20261125_0007
Revises: 20261124_0006
Create Date: 2026-11-25 09:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261125_0007"
down_revision = "20261124_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transactions", sa.Column("dedup_hash", sa.String(64), nullable=True))
    op.create_index("idx_transactions_user_dedup_hash", "transactions", ["user_id", "dedup_hash"])

    op.add_column("of_linked_accounts", sa.Column("provider", sa.String(20), nullable=False, server_default="sandbox"))
    op.add_column("of_linked_accounts", sa.Column("external_item_id", sa.String(200), nullable=True))
    op.add_column("of_linked_accounts", sa.Column("account_fingerprint", sa.String(128), nullable=True))
    op.add_column(
        "of_linked_accounts",
        sa.Column("mony_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True),
    )

    op.create_table(
        "investment_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ticker", sa.String(24), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("asset_class", sa.String(24), nullable=False, server_default="stock"),
        sa.Column("sector", sa.String(100), nullable=True),
        sa.Column("broker", sa.String(100), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="BRL"),
        sa.Column("quantity", sa.Numeric(18, 6), nullable=False, server_default="0"),
        sa.Column("average_price", sa.Numeric(15, 4), nullable=False, server_default="0"),
        sa.Column("indexer", sa.String(20), nullable=True),
        sa.Column("indexer_rate", sa.Numeric(8, 4), nullable=True),
        sa.Column("maturity_date", sa.Date(), nullable=True),
        sa.Column("external_id", sa.String(200), nullable=True),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
    op.create_index("idx_inv_assets_user_ticker", "investment_assets", ["user_id", "ticker"])
    op.create_index("idx_inv_assets_user_class", "investment_assets", ["user_id", "asset_class"])

    op.create_table(
        "investment_trades",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("investment_assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("operation", sa.String(16), nullable=False, server_default="buy"),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 6), nullable=False),
        sa.Column("unit_price", sa.Numeric(15, 4), nullable=False, server_default="0"),
        sa.Column("fees", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("broker", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("dedup_hash", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("idx_inv_trades_asset_date", "investment_trades", ["asset_id", "trade_date"])
    op.create_index("idx_inv_trades_user_dedup", "investment_trades", ["user_id", "dedup_hash"])

    op.create_table(
        "investment_dividends",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("investment_assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dividend_type", sa.String(24), nullable=False, server_default="dividend"),
        sa.Column("ex_date", sa.Date(), nullable=True),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("amount_per_share", sa.Numeric(15, 6), nullable=True),
        sa.Column("total_amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("dedup_hash", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("idx_inv_dividends_user_pay", "investment_dividends", ["user_id", "payment_date"])
    op.create_index("idx_inv_dividends_user_dedup", "investment_dividends", ["user_id", "dedup_hash"])

    op.create_table(
        "market_quotes_cache",
        sa.Column("ticker", sa.String(24), primary_key=True),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column("price", sa.Numeric(15, 4), nullable=False),
        sa.Column("previous_close", sa.Numeric(15, 4), nullable=True),
        sa.Column("change_pct", sa.Numeric(8, 4), nullable=True),
        sa.Column("dy_12m", sa.Numeric(8, 4), nullable=True),
        sa.Column("pe_ratio", sa.Numeric(10, 4), nullable=True),
        sa.Column("pvp_ratio", sa.Numeric(10, 4), nullable=True),
        sa.Column("sector", sa.String(100), nullable=True),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("source", sa.String(32), nullable=False, server_default="yahoo"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("market_quotes_cache")
    op.drop_table("investment_dividends")
    op.drop_table("investment_trades")
    op.drop_table("investment_assets")
    op.drop_column("of_linked_accounts", "mony_account_id")
    op.drop_column("of_linked_accounts", "account_fingerprint")
    op.drop_column("of_linked_accounts", "external_item_id")
    op.drop_column("of_linked_accounts", "provider")
    op.drop_index("idx_transactions_user_dedup_hash", table_name="transactions")
    op.drop_column("transactions", "dedup_hash")
