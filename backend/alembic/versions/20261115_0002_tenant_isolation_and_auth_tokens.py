"""Add composite tenant-isolation foreign keys and auth token revocation support.

Revision ID: 20261115_0002
Revises: 20261115_0001
Create Date: 2026-11-15 23:30:00+00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20261115_0002"
down_revision: Union[str, Sequence[str], None] = "20261115_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add token_version column to users for global session revocation
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("token_version", sa.Integer(), server_default="0", nullable=False)
        )

    # 2. Create revoked_tokens table for per-JWT logout invalidation
    op.create_table(
        "revoked_tokens",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_revoked_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_revoked_tokens")),
    )
    op.create_index(op.f("ix_revoked_tokens_jti"), "revoked_tokens", ["jti"], unique=True)
    op.create_index(op.f("ix_revoked_tokens_user_id"), "revoked_tokens", ["user_id"], unique=False)
    op.create_index(op.f("ix_revoked_tokens_expires_at"), "revoked_tokens", ["expires_at"], unique=False)

    # 3. Add composite unique keys (business_id, id) on tenant-owned parent tables
    with op.batch_alter_table("transaction_categories") as batch_op:
        batch_op.create_unique_constraint(
            "uq_transaction_categories_business_id_id", ["business_id", "id"]
        )

    with op.batch_alter_table("customers") as batch_op:
        batch_op.create_unique_constraint("uq_customers_business_id_id", ["business_id", "id"])

    with op.batch_alter_table("suppliers") as batch_op:
        batch_op.create_unique_constraint("uq_suppliers_business_id_id", ["business_id", "id"])

    with op.batch_alter_table("transactions") as batch_op:
        batch_op.create_unique_constraint("uq_transactions_business_id_id", ["business_id", "id"])

    with op.batch_alter_table("invoices") as batch_op:
        batch_op.create_unique_constraint("uq_invoices_business_id_id", ["business_id", "id"])

    with op.batch_alter_table("inventory_products") as batch_op:
        batch_op.create_unique_constraint(
            "uq_inventory_products_business_id_id", ["business_id", "id"]
        )

    # 4. Enforce same-business integrity at DB level via composite foreign keys
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.create_foreign_key(
            "fk_transactions_business_category",
            "transaction_categories",
            ["business_id", "category_id"],
            ["business_id", "id"],
            ondelete="NO ACTION",
        )

    with op.batch_alter_table("invoices") as batch_op:
        batch_op.create_foreign_key(
            "fk_invoices_business_customer",
            "customers",
            ["business_id", "customer_id"],
            ["business_id", "id"],
            ondelete="RESTRICT",
        )

    with op.batch_alter_table("invoice_line_items") as batch_op:
        batch_op.create_foreign_key(
            "fk_invoice_line_items_business_invoice",
            "invoices",
            ["business_id", "invoice_id"],
            ["business_id", "id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table("payments") as batch_op:
        batch_op.create_foreign_key(
            "fk_payments_business_invoice",
            "invoices",
            ["business_id", "invoice_id"],
            ["business_id", "id"],
            ondelete="CASCADE",
        )
        batch_op.create_foreign_key(
            "fk_payments_business_customer",
            "customers",
            ["business_id", "customer_id"],
            ["business_id", "id"],
            ondelete="RESTRICT",
        )
        batch_op.create_foreign_key(
            "fk_payments_business_transaction",
            "transactions",
            ["business_id", "transaction_id"],
            ["business_id", "id"],
            ondelete="NO ACTION",
        )

    with op.batch_alter_table("inventory_products") as batch_op:
        batch_op.create_foreign_key(
            "fk_inventory_products_business_supplier",
            "suppliers",
            ["business_id", "preferred_supplier_id"],
            ["business_id", "id"],
            ondelete="NO ACTION",
        )

    with op.batch_alter_table("stock_movements") as batch_op:
        batch_op.create_foreign_key(
            "fk_stock_movements_business_product",
            "inventory_products",
            ["business_id", "product_id"],
            ["business_id", "id"],
            ondelete="CASCADE",
        )
        batch_op.create_foreign_key(
            "fk_stock_movements_business_supplier",
            "suppliers",
            ["business_id", "supplier_id"],
            ["business_id", "id"],
            ondelete="NO ACTION",
        )
        batch_op.create_foreign_key(
            "fk_stock_movements_business_transaction",
            "transactions",
            ["business_id", "transaction_id"],
            ["business_id", "id"],
            ondelete="NO ACTION",
        )


def downgrade() -> None:
    with op.batch_alter_table("stock_movements") as batch_op:
        batch_op.drop_constraint("fk_stock_movements_business_transaction", type_="foreignkey")
        batch_op.drop_constraint("fk_stock_movements_business_supplier", type_="foreignkey")
        batch_op.drop_constraint("fk_stock_movements_business_product", type_="foreignkey")

    with op.batch_alter_table("inventory_products") as batch_op:
        batch_op.drop_constraint("fk_inventory_products_business_supplier", type_="foreignkey")

    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_constraint("fk_payments_business_transaction", type_="foreignkey")
        batch_op.drop_constraint("fk_payments_business_customer", type_="foreignkey")
        batch_op.drop_constraint("fk_payments_business_invoice", type_="foreignkey")

    with op.batch_alter_table("invoice_line_items") as batch_op:
        batch_op.drop_constraint("fk_invoice_line_items_business_invoice", type_="foreignkey")

    with op.batch_alter_table("invoices") as batch_op:
        batch_op.drop_constraint("fk_invoices_business_customer", type_="foreignkey")

    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_constraint("fk_transactions_business_category", type_="foreignkey")

    with op.batch_alter_table("inventory_products") as batch_op:
        batch_op.drop_constraint("uq_inventory_products_business_id_id", type_="unique")

    with op.batch_alter_table("invoices") as batch_op:
        batch_op.drop_constraint("uq_invoices_business_id_id", type_="unique")

    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_constraint("uq_transactions_business_id_id", type_="unique")

    with op.batch_alter_table("suppliers") as batch_op:
        batch_op.drop_constraint("uq_suppliers_business_id_id", type_="unique")

    with op.batch_alter_table("customers") as batch_op:
        batch_op.drop_constraint("uq_customers_business_id_id", type_="unique")

    with op.batch_alter_table("transaction_categories") as batch_op:
        batch_op.drop_constraint("uq_transaction_categories_business_id_id", type_="unique")

    op.drop_index(op.f("ix_revoked_tokens_expires_at"), table_name="revoked_tokens")
    op.drop_index(op.f("ix_revoked_tokens_user_id"), table_name="revoked_tokens")
    op.drop_index(op.f("ix_revoked_tokens_jti"), table_name="revoked_tokens")
    op.drop_table("revoked_tokens")

    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("token_version")
