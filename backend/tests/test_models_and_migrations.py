from __future__ import annotations

import configparser
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import Numeric, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import build_engine
from app.models import (
    AuditLog,
    Business,
    BusinessMembership,
    CopilotConversation,
    CopilotMessage,
    CopilotRateLimitEvent,
    Customer,
    FinancialAlert,
    InventoryProduct,
    Invoice,
    InvoiceLineItem,
    InvoiceStatus,
    MembershipRole,
    Payment,
    PaymentMethod,
    SimulationScenario,
    StockMovement,
    StockMovementType,
    Supplier,
    Transaction,
    TransactionCategory,
    TransactionSource,
    TransactionStatus,
    TransactionType,
    User,
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]

EXPECTED_TABLES = {
    "users",
    "businesses",
    "business_memberships",
    "transaction_categories",
    "transactions",
    "customers",
    "suppliers",
    "invoices",
    "invoice_line_items",
    "payments",
    "inventory_products",
    "stock_movements",
    "audit_logs",
    "revoked_tokens",
    "financial_alerts",
    "simulation_scenarios",
    "copilot_conversations",
    "copilot_messages",
    "copilot_rate_limit_events",
}


@pytest.fixture()
def sqlite_engine(tmp_path: Path):
    db_file = tmp_path / "test_schema.db"
    engine = build_engine(f"sqlite:///{db_file}", echo=False)
    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        engine.dispose()


def test_all_models_registered_in_metadata() -> None:
    registered = set(Base.metadata.tables.keys())
    assert EXPECTED_TABLES.issubset(registered)


def test_monetary_columns_use_numeric_14_2() -> None:
    monetary_columns = [
        (Business, ["opening_cash_balance", "monthly_fixed_overhead", "credit_facility_limit", "short_term_loan_balance", "tax_liability_accrued"]),
        (Customer, ["opening_balance"]),
        (Supplier, ["opening_payable"]),
        (Transaction, ["amount"]),
        (Invoice, ["subtotal", "tax_amount", "total_amount", "amount_paid"]),
        (InvoiceLineItem, ["unit_price", "line_total"]),
        (Payment, ["amount"]),
        (InventoryProduct, ["unit_cost", "selling_price"]),
        (StockMovement, ["unit_cost", "total_cost"]),
        (FinancialAlert, ["impact_amount"]),
        (SimulationScenario, ["avg_monthly_salary", "new_inventory_purchase", "equipment_purchase", "new_location_monthly_rent", "new_location_setup_cost"]),
    ]
    for model, cols in monetary_columns:
        table = model.__table__
        for col_name in cols:
            col_type = table.c[col_name].type
            assert isinstance(col_type, Numeric), f"{model.__name__}.{col_name} must be Numeric"
            assert col_type.precision == 14
            assert col_type.scale == 2


def test_sqlite_schema_creation_and_foreign_keys(sqlite_engine) -> None:
    inspector = inspect(sqlite_engine)
    tables = set(inspector.get_table_names())
    assert EXPECTED_TABLES.issubset(tables)

    invoice_fks = {fk["referred_table"] for fk in inspector.get_foreign_keys("invoices")}
    assert {"businesses", "customers"}.issubset(invoice_fks)

    payment_fks = {fk["referred_table"] for fk in inspector.get_foreign_keys("payments")}
    assert {"businesses", "invoices", "customers", "transactions"}.issubset(payment_fks)

    movement_fks = {fk["referred_table"] for fk in inspector.get_foreign_keys("stock_movements")}
    assert {"businesses", "inventory_products", "suppliers", "transactions"}.issubset(movement_fks)


def test_unique_constraints_and_accounting_relationships(sqlite_engine) -> None:
    with Session(sqlite_engine) as session:
        user = User(
            email="owner@kaveri.example.com",
            full_name="Ananya Deshmukh",
            hashed_password="hashed-password-placeholder",
        )
        biz = Business(
            name="Kaveri Fresh Mart",
            business_type="Grocery",
            industry="Daily Essentials",
            currency="INR",
            country="India",
            business_size="Small (6-20)",
            opening_cash_balance=Decimal("100000.00"),
            monthly_fixed_overhead=Decimal("25000.00"),
        )
        session.add_all([user, biz])
        session.flush()

        membership = BusinessMembership(
            business_id=biz.id,
            user_id=user.id,
            role=MembershipRole.OWNER,
        )
        customer = Customer(business_id=biz.id, name="Veridian Workspace")
        supplier = Supplier(business_id=biz.id, name="Deccan Grain Distributors")
        category = TransactionCategory(
            business_id=biz.id,
            name="Invoice Settlements",
            type=TransactionType.INCOME,
        )
        session.add_all([membership, customer, supplier, category])
        session.flush()

        invoice = Invoice(
            business_id=biz.id,
            customer_id=customer.id,
            invoice_number="INV-2026-001",
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 15),
            tax_rate=Decimal("18.00"),
            subtotal=Decimal("1000.00"),
            tax_amount=Decimal("180.00"),
            total_amount=Decimal("1180.00"),
            amount_paid=Decimal("500.00"),
            status=InvoiceStatus.PARTIAL,
        )
        session.add(invoice)
        session.flush()

        line_item = InvoiceLineItem(
            business_id=biz.id,
            invoice_id=invoice.id,
            description="Pantry Supply",
            quantity=Decimal("2.000"),
            unit_price=Decimal("500.00"),
            line_total=Decimal("1000.00"),
        )
        tx = Transaction(
            business_id=biz.id,
            category_id=category.id,
            created_by_user_id=user.id,
            transaction_date=date(2026, 11, 10),
            description="Partial payment for INV-2026-001",
            counterparty=customer.name,
            type=TransactionType.INCOME,
            amount=Decimal("500.00"),
            payment_method=PaymentMethod.BANK_TRANSFER,
            status=TransactionStatus.COMPLETED,
            source_type=TransactionSource.INVOICE_PAYMENT,
        )
        session.add_all([line_item, tx])
        session.flush()

        payment = Payment(
            business_id=biz.id,
            invoice_id=invoice.id,
            customer_id=customer.id,
            transaction_id=tx.id,
            payment_reference="UTR-90001",
            payment_date=date(2026, 11, 10),
            amount=Decimal("500.00"),
            payment_method=PaymentMethod.BANK_TRANSFER,
        )
        product = InventoryProduct(
            business_id=biz.id,
            preferred_supplier_id=supplier.id,
            sku="KFM-RICE-25",
            name="Sona Masoori Rice 25kg",
            category="Grains",
            unit="bags",
            current_stock=Decimal("10.000"),
            reorder_point=Decimal("5.000"),
            unit_cost=Decimal("1300.00"),
            selling_price=Decimal("1750.00"),
        )
        session.add_all([payment, product])
        session.flush()

        movement = StockMovement(
            business_id=biz.id,
            product_id=product.id,
            supplier_id=supplier.id,
            movement_type=StockMovementType.RESTOCK,
            movement_date=date(2026, 11, 11),
            quantity_delta=Decimal("5.000"),
            unit_cost=Decimal("1300.00"),
            total_cost=Decimal("6500.00"),
            reference_code="PO-101",
        )
        audit = AuditLog(
            business_id=biz.id,
            user_id=user.id,
            action="create",
            entity_type="invoice",
            entity_id=invoice.id,
            details={"invoice_number": invoice.invoice_number},
        )
        session.add_all([movement, audit])
        session.commit()

        # Duplicate payment reference within same business must violate UniqueConstraint
        dup_payment = Payment(
            business_id=biz.id,
            invoice_id=invoice.id,
            customer_id=customer.id,
            payment_reference="UTR-90001",
            payment_date=date(2026, 11, 11),
            amount=Decimal("100.00"),
            payment_method=PaymentMethod.UPI,
        )
        session.add(dup_payment)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        # Duplicate invoice number within same business must fail
        dup_invoice = Invoice(
            business_id=biz.id,
            customer_id=customer.id,
            invoice_number="INV-2026-001",
            issue_date=date(2026, 11, 2),
            due_date=date(2026, 11, 16),
            subtotal=Decimal("100.00"),
            tax_amount=Decimal("0.00"),
            total_amount=Decimal("100.00"),
        )
        session.add(dup_invoice)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


def test_alembic_configuration_and_initial_revision() -> None:
    ini_path = BACKEND_ROOT / "alembic.ini"
    assert ini_path.exists()

    parser = configparser.ConfigParser()
    parser.read(ini_path)
    assert parser.get("alembic", "script_location") == "alembic"

    alembic_cfg = Config(str(ini_path))
    alembic_cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    script = ScriptDirectory.from_config(alembic_cfg)
    revisions = list(script.walk_revisions())
    assert len(revisions) == 6
    assert {rev.revision for rev in revisions} == {
        "20261115_0001",
        "20261115_0002",
        "20261115_0003",
        "20261115_0004",
        "20261115_0005",
        "20261115_0006",
    }
    assert script.get_current_head() == "20261115_0006"
