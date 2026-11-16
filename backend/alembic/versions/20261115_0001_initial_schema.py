"""Initial normalized financial schema for BizPilot AI.

Revision ID: 20261115_0001
Revises:
Create Date: 2026-11-15 23:20:00+00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20261115_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "businesses",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("business_type", sa.String(length=60), nullable=False),
        sa.Column("industry", sa.String(length=120), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("country", sa.String(length=80), nullable=False),
        sa.Column("business_size", sa.String(length=60), nullable=False),
        sa.Column("financial_year_start", sa.String(length=40), nullable=False),
        sa.Column("dashboard_preference", sa.String(length=60), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("gst_registered", sa.Boolean(), nullable=False),
        sa.Column("opening_cash_balance", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("monthly_fixed_overhead", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("credit_facility_limit", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("short_term_loan_balance", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("tax_liability_accrued", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("is_demo_data", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("opening_cash_balance >= 0", name=op.f("ck_businesses_opening_cash_non_negative")),
        sa.CheckConstraint("monthly_fixed_overhead >= 0", name=op.f("ck_businesses_monthly_overhead_non_negative")),
        sa.CheckConstraint("credit_facility_limit >= 0", name=op.f("ck_businesses_credit_limit_non_negative")),
        sa.CheckConstraint("short_term_loan_balance >= 0", name=op.f("ck_businesses_loan_balance_non_negative")),
        sa.CheckConstraint("tax_liability_accrued >= 0", name=op.f("ck_businesses_tax_liability_non_negative")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_businesses")),
    )
    op.create_index(op.f("ix_businesses_name"), "businesses", ["name"], unique=False)

    op.create_table(
        "business_memberships",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.Enum("owner", "admin", "manager", "viewer", name="membershiprole", native_enum=False, length=24), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], name=op.f("fk_business_memberships_business_id_businesses"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_business_memberships_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_business_memberships")),
        sa.UniqueConstraint("business_id", "user_id", name="business_user"),
    )
    op.create_index(op.f("ix_business_memberships_business_id"), "business_memberships", ["business_id"], unique=False)
    op.create_index(op.f("ix_business_memberships_user_id"), "business_memberships", ["user_id"], unique=False)
    op.create_index("ix_business_memberships_user_business", "business_memberships", ["user_id", "business_id"], unique=False)

    op.create_table(
        "transaction_categories",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("type", sa.Enum("income", "expense", name="transactiontype", native_enum=False, length=24), nullable=False),
        sa.Column("is_operating", sa.Boolean(), nullable=False),
        sa.Column("is_system", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], name=op.f("fk_transaction_categories_business_id_businesses"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transaction_categories")),
        sa.UniqueConstraint("business_id", "name", "type", name="business_category_name_type"),
    )
    op.create_index(op.f("ix_transaction_categories_business_id"), "transaction_categories", ["business_id"], unique=False)
    op.create_index("ix_transaction_categories_business_type", "transaction_categories", ["business_id", "type"], unique=False)

    op.create_table(
        "customers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("tax_id", sa.String(length=40), nullable=True),
        sa.Column("billing_address", sa.Text(), nullable=True),
        sa.Column("opening_balance", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("opening_balance >= 0", name=op.f("ck_customers_customer_opening_balance_non_negative")),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], name=op.f("fk_customers_business_id_businesses"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customers")),
    )
    op.create_index(op.f("ix_customers_business_id"), "customers", ["business_id"], unique=False)
    op.create_index("ix_customers_business_name", "customers", ["business_id", "name"], unique=False)

    op.create_table(
        "suppliers",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("tax_id", sa.String(length=40), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("default_lead_time_days", sa.Integer(), nullable=False),
        sa.Column("opening_payable", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("opening_payable >= 0", name=op.f("ck_suppliers_supplier_opening_payable_non_negative")),
        sa.CheckConstraint("default_lead_time_days >= 0", name=op.f("ck_suppliers_supplier_lead_time_non_negative")),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], name=op.f("fk_suppliers_business_id_businesses"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_suppliers")),
    )
    op.create_index(op.f("ix_suppliers_business_id"), "suppliers", ["business_id"], unique=False)
    op.create_index("ix_suppliers_business_name", "suppliers", ["business_id", "name"], unique=False)

    op.create_table(
        "transactions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("category_id", sa.String(length=36), nullable=True),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("counterparty", sa.String(length=160), nullable=False),
        sa.Column("type", sa.Enum("income", "expense", name="transactiontype", native_enum=False, length=24), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("payment_method", sa.Enum("upi", "bank_transfer", "card", "cash", "auto_debit", "cheque", "other", name="paymentmethod", native_enum=False, length=24), nullable=False),
        sa.Column("status", sa.Enum("completed", "pending", "scheduled", "void", name="transactionstatus", native_enum=False, length=24), nullable=False),
        sa.Column("source_type", sa.Enum("manual", "invoice_payment", "inventory_restock", "csv_import", "demo_seed", name="transactionsource", native_enum=False, length=32), nullable=False),
        sa.Column("reference_code", sa.String(length=80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_demo_data", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount > 0", name=op.f("ck_transactions_transaction_amount_positive")),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], name=op.f("fk_transactions_business_id_businesses"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["transaction_categories.id"], name=op.f("fk_transactions_category_id_transaction_categories"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], name=op.f("fk_transactions_created_by_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transactions")),
    )
    op.create_index(op.f("ix_transactions_business_id"), "transactions", ["business_id"], unique=False)
    op.create_index(op.f("ix_transactions_category_id"), "transactions", ["category_id"], unique=False)
    op.create_index(op.f("ix_transactions_reference_code"), "transactions", ["reference_code"], unique=False)
    op.create_index("ix_transactions_business_date", "transactions", ["business_id", "transaction_date"], unique=False)
    op.create_index("ix_transactions_business_type_status", "transactions", ["business_id", "type", "status"], unique=False)

    op.create_table(
        "invoices",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("customer_id", sa.String(length=36), nullable=False),
        sa.Column("invoice_number", sa.String(length=64), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("tax_rate", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("subtotal", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("tax_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("amount_paid", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("status", sa.Enum("draft", "pending", "partial", "paid", "overdue", "void", name="invoicestatus", native_enum=False, length=24), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_demo_data", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("tax_rate >= 0", name=op.f("ck_invoices_invoice_tax_rate_non_negative")),
        sa.CheckConstraint("subtotal >= 0", name=op.f("ck_invoices_invoice_subtotal_non_negative")),
        sa.CheckConstraint("tax_amount >= 0", name=op.f("ck_invoices_invoice_tax_amount_non_negative")),
        sa.CheckConstraint("total_amount >= 0", name=op.f("ck_invoices_invoice_total_amount_non_negative")),
        sa.CheckConstraint("amount_paid >= 0", name=op.f("ck_invoices_invoice_amount_paid_non_negative")),
        sa.CheckConstraint("amount_paid <= total_amount", name=op.f("ck_invoices_invoice_paid_not_exceed_total")),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], name=op.f("fk_invoices_business_id_businesses"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], name=op.f("fk_invoices_customer_id_customers"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoices")),
        sa.UniqueConstraint("business_id", "invoice_number", name="business_invoice_number"),
    )
    op.create_index(op.f("ix_invoices_business_id"), "invoices", ["business_id"], unique=False)
    op.create_index(op.f("ix_invoices_customer_id"), "invoices", ["customer_id"], unique=False)
    op.create_index("ix_invoices_business_status_due", "invoices", ["business_id", "status", "due_date"], unique=False)

    op.create_table(
        "invoice_line_items",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("invoice_id", sa.String(length=36), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("line_total", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("quantity > 0", name=op.f("ck_invoice_line_items_line_item_quantity_positive")),
        sa.CheckConstraint("unit_price >= 0", name=op.f("ck_invoice_line_items_line_item_unit_price_non_negative")),
        sa.CheckConstraint("line_total >= 0", name=op.f("ck_invoice_line_items_line_item_total_non_negative")),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], name=op.f("fk_invoice_line_items_business_id_businesses"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], name=op.f("fk_invoice_line_items_invoice_id_invoices"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_invoice_line_items")),
    )
    op.create_index(op.f("ix_invoice_line_items_business_id"), "invoice_line_items", ["business_id"], unique=False)
    op.create_index(op.f("ix_invoice_line_items_invoice_id"), "invoice_line_items", ["invoice_id"], unique=False)
    op.create_index("ix_invoice_line_items_business_invoice", "invoice_line_items", ["business_id", "invoice_id"], unique=False)

    op.create_table(
        "payments",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("invoice_id", sa.String(length=36), nullable=False),
        sa.Column("customer_id", sa.String(length=36), nullable=False),
        sa.Column("transaction_id", sa.String(length=36), nullable=True),
        sa.Column("payment_reference", sa.String(length=80), nullable=False),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("payment_method", sa.Enum("upi", "bank_transfer", "card", "cash", "auto_debit", "cheque", "other", name="paymentmethod", native_enum=False, length=24), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount > 0", name=op.f("ck_payments_payment_amount_positive")),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], name=op.f("fk_payments_business_id_businesses"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], name=op.f("fk_payments_customer_id_customers"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], name=op.f("fk_payments_invoice_id_invoices"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], name=op.f("fk_payments_transaction_id_transactions"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payments")),
        sa.UniqueConstraint("business_id", "payment_reference", name="business_payment_reference"),
        sa.UniqueConstraint("transaction_id", name="payment_transaction_unique"),
    )
    op.create_index(op.f("ix_payments_business_id"), "payments", ["business_id"], unique=False)
    op.create_index(op.f("ix_payments_customer_id"), "payments", ["customer_id"], unique=False)
    op.create_index(op.f("ix_payments_invoice_id"), "payments", ["invoice_id"], unique=False)
    op.create_index("ix_payments_business_invoice", "payments", ["business_id", "invoice_id"], unique=False)
    op.create_index("ix_payments_business_date", "payments", ["business_id", "payment_date"], unique=False)

    op.create_table(
        "inventory_products",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("preferred_supplier_id", sa.String(length=36), nullable=True),
        sa.Column("sku", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("unit", sa.String(length=32), nullable=False),
        sa.Column("current_stock", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("reorder_point", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("unit_cost", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("selling_price", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("last_restocked_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("current_stock >= 0", name=op.f("ck_inventory_products_product_stock_non_negative")),
        sa.CheckConstraint("reorder_point >= 0", name=op.f("ck_inventory_products_product_reorder_non_negative")),
        sa.CheckConstraint("unit_cost >= 0", name=op.f("ck_inventory_products_product_unit_cost_non_negative")),
        sa.CheckConstraint("selling_price >= 0", name=op.f("ck_inventory_products_product_selling_price_non_negative")),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], name=op.f("fk_inventory_products_business_id_businesses"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["preferred_supplier_id"], ["suppliers.id"], name=op.f("fk_inventory_products_preferred_supplier_id_suppliers"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventory_products")),
        sa.UniqueConstraint("business_id", "sku", name="business_product_sku"),
    )
    op.create_index(op.f("ix_inventory_products_business_id"), "inventory_products", ["business_id"], unique=False)
    op.create_index(op.f("ix_inventory_products_preferred_supplier_id"), "inventory_products", ["preferred_supplier_id"], unique=False)
    op.create_index("ix_inventory_products_business_category", "inventory_products", ["business_id", "category"], unique=False)

    op.create_table(
        "stock_movements",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("product_id", sa.String(length=36), nullable=False),
        sa.Column("supplier_id", sa.String(length=36), nullable=True),
        sa.Column("transaction_id", sa.String(length=36), nullable=True),
        sa.Column("movement_type", sa.Enum("restock", "sale", "adjustment", "return_in", "return_out", name="stockmovementtype", native_enum=False, length=24), nullable=False),
        sa.Column("movement_date", sa.Date(), nullable=False),
        sa.Column("quantity_delta", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("unit_cost", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("total_cost", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("reference_code", sa.String(length=80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("quantity_delta != 0", name=op.f("ck_stock_movements_stock_movement_quantity_non_zero")),
        sa.CheckConstraint("unit_cost >= 0", name=op.f("ck_stock_movements_stock_movement_unit_cost_non_negative")),
        sa.CheckConstraint("total_cost >= 0", name=op.f("ck_stock_movements_stock_movement_total_cost_non_negative")),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], name=op.f("fk_stock_movements_business_id_businesses"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["product_id"], ["inventory_products.id"], name=op.f("fk_stock_movements_product_id_inventory_products"), ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"], name=op.f("fk_stock_movements_supplier_id_suppliers"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"], name=op.f("fk_stock_movements_transaction_id_transactions"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_stock_movements")),
        sa.UniqueConstraint("transaction_id", name="stock_movement_transaction_unique"),
    )
    op.create_index(op.f("ix_stock_movements_business_id"), "stock_movements", ["business_id"], unique=False)
    op.create_index(op.f("ix_stock_movements_product_id"), "stock_movements", ["product_id"], unique=False)
    op.create_index(op.f("ix_stock_movements_supplier_id"), "stock_movements", ["supplier_id"], unique=False)
    op.create_index("ix_stock_movements_business_product", "stock_movements", ["business_id", "product_id"], unique=False)
    op.create_index("ix_stock_movements_business_date", "stock_movements", ["business_id", "movement_date"], unique=False)

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=True),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("entity_type", sa.String(length=64), nullable=False),
        sa.Column("entity_id", sa.String(length=64), nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], name=op.f("fk_audit_logs_business_id_businesses"), ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_audit_logs_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index(op.f("ix_audit_logs_business_id"), "audit_logs", ["business_id"], unique=False)
    op.create_index(op.f("ix_audit_logs_user_id"), "audit_logs", ["user_id"], unique=False)
    op.create_index("ix_audit_logs_business_created", "audit_logs", ["business_id", "created_at"], unique=False)
    op.create_index("ix_audit_logs_entity", "audit_logs", ["entity_type", "entity_id"], unique=False)


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("stock_movements")
    op.drop_table("inventory_products")
    op.drop_table("payments")
    op.drop_table("invoice_line_items")
    op.drop_table("invoices")
    op.drop_table("transactions")
    op.drop_table("suppliers")
    op.drop_table("customers")
    op.drop_table("transaction_categories")
    op.drop_table("business_memberships")
    op.drop_table("businesses")
    op.drop_table("users")
