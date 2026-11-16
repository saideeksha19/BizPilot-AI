from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.businesses import DEFAULT_BUSINESS_CATEGORIES
from app.core.security import hash_password
from app.models import (
    Business,
    BusinessMembership,
    Customer,
    InventoryProduct,
    Invoice,
    InvoiceLineItem,
    Payment,
    StockMovement,
    Supplier,
    Transaction,
    TransactionCategory,
    User,
)
from app.models.enums import (
    InvoiceStatus,
    MembershipRole,
    PaymentMethod,
    StockMovementType,
    TransactionSource,
    TransactionStatus,
    TransactionType,
)
from app.services.financial_utils import to_money

DEMO_OWNER_EMAIL = "demo.owner@bizpilot-demo.local"
DEMO_MANAGER_EMAIL = "demo.finance@bizpilot-demo.local"
DEMO_PRIMARY_BUSINESS_NAME = "Kaveri Fresh Mart (Demo)"
DEMO_SECONDARY_BUSINESS_NAME = "Studio Aether Advisory (Demo)"


def reset_demo_workspaces_only(db: Session) -> int:
    """Safely delete ONLY synthetic demo businesses (`is_demo_data=True`).

    Production/user businesses (`is_demo_data=False`) are strictly verified
    untouched before and after deletion.
    """
    real_count_before = int(
        db.scalar(select(func.count(Business.id)).where(Business.is_demo_data.is_(False))) or 0
    )
    demo_businesses = list(
        db.scalars(select(Business).where(Business.is_demo_data.is_(True))).all()
    )
    deleted_count = 0
    for biz in demo_businesses:
        if not biz.is_demo_data:
            raise ValueError(f"Refusing to delete non-demo business {biz.id}")
        db.delete(biz)
        deleted_count += 1

    db.flush()
    real_count_after = int(
        db.scalar(select(func.count(Business.id)).where(Business.is_demo_data.is_(False))) or 0
    )
    if real_count_after != real_count_before:
        db.rollback()
        raise RuntimeError("Safety invariant violated during demo workspace reset.")
    db.commit()
    return deleted_count


def _get_or_create_demo_user(
    db: Session,
    *,
    email: str,
    full_name: str,
    password: str,
) -> User:
    existing = db.scalar(select(User).where(User.email == email.lower()))
    if existing is not None:
        return existing
    user = User(
        email=email.lower(),
        full_name=full_name,
        hashed_password=hash_password(password),
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def _seed_categories(db: Session, business_id: str) -> dict[tuple[str, TransactionType], TransactionCategory]:
    lookup: dict[tuple[str, TransactionType], TransactionCategory] = {}
    for name, tx_type, is_operating in DEFAULT_BUSINESS_CATEGORIES:
        cat = TransactionCategory(
            business_id=business_id,
            name=name,
            type=tx_type,
            is_operating=is_operating,
            is_system=True,
        )
        db.add(cat)
        db.flush()
        lookup[(name, tx_type)] = cat
    return lookup


def seed_demo_workspace(
    db: Session,
    *,
    reset_existing: bool = False,
    owner_email: str = DEMO_OWNER_EMAIL,
    owner_password: str = "DemoPilot#2026",
    as_of_date: date | None = None,
) -> dict[str, Any]:
    """Idempotently seed a synthetic, isolated demo workspace (`is_demo_data=True`).

    Never touches non-demo businesses (`is_demo_data=False`).
    """
    ref_date = as_of_date or date.today()
    deleted_demo_count = 0
    if reset_existing:
        deleted_demo_count = reset_demo_workspaces_only(db)

    existing_demo = list(
        db.scalars(select(Business).where(Business.is_demo_data.is_(True))).all()
    )
    if existing_demo and not reset_existing:
        return {
            "status": "already_seeded",
            "deleted_demo_businesses": deleted_demo_count,
            "business_ids": [biz.id for biz in existing_demo],
            "business_names": [biz.name for biz in existing_demo],
            "demo_owner_email": owner_email.lower(),
        }

    owner = _get_or_create_demo_user(
        db,
        email=owner_email,
        full_name="Ananya Deshmukh (Demo)",
        password=owner_password,
    )
    finance_mgr = _get_or_create_demo_user(
        db,
        email=DEMO_MANAGER_EMAIL,
        full_name="Rohan Kulkarni (Demo)",
        password=owner_password,
    )

    # 1. Primary Retail / Grocery Demo Business
    retail_biz = Business(
        name=DEMO_PRIMARY_BUSINESS_NAME,
        business_type="Grocery",
        industry="Retail & Daily Essentials",
        currency="INR",
        country="India",
        business_size="Small (6-20)",
        financial_year_start="April",
        dashboard_preference="Executive Balanced",
        timezone="Asia/Kolkata",
        gst_registered=True,
        opening_cash_balance=Decimal("180000.00"),
        monthly_fixed_overhead=Decimal("42000.00"),
        credit_facility_limit=Decimal("150000.00"),
        short_term_loan_balance=Decimal("35000.00"),
        tax_liability_accrued=Decimal("14200.00"),
        is_demo_data=True,
    )
    db.add(retail_biz)
    db.flush()

    db.add_all(
        [
            BusinessMembership(
                business_id=retail_biz.id,
                user_id=owner.id,
                role=MembershipRole.OWNER,
                is_active=True,
            ),
            BusinessMembership(
                business_id=retail_biz.id,
                user_id=finance_mgr.id,
                role=MembershipRole.ADMIN,
                is_active=True,
            ),
        ]
    )
    cats = _seed_categories(db, retail_biz.id)

    cust_veridian = Customer(
        business_id=retail_biz.id,
        name="Veridian Co-Working Pantry",
        email="ap@veridian-demo.example",
        opening_balance=Decimal("0.00"),
        notes="Synthetic demo B2B pantry account",
    )
    cust_horizon = Customer(
        business_id=retail_biz.id,
        name="Horizon Apartments Association",
        email="treasurer@horizon-demo.example",
        opening_balance=Decimal("0.00"),
        notes="Synthetic demo residential association",
    )
    sup_deccan = Supplier(
        business_id=retail_biz.id,
        name="Deccan Grain Distributors",
        email="orders@deccan-demo.example",
        default_lead_time_days=4,
        opening_payable=Decimal("0.00"),
    )
    sup_malabar = Supplier(
        business_id=retail_biz.id,
        name="Malabar Cold Chain",
        email="dispatch@malabar-demo.example",
        default_lead_time_days=2,
        opening_payable=Decimal("0.00"),
    )
    db.add_all([cust_veridian, cust_horizon, sup_deccan, sup_malabar])
    db.flush()

    sales_cat = cats[("Sales Revenue", TransactionType.INCOME)]
    inv_settle_cat = cats[("Invoice Settlements", TransactionType.INCOME)]
    rent_cat = cats[("Rent & Utilities", TransactionType.EXPENSE)]
    payroll_cat = cats[("Payroll & Contractor Wages", TransactionType.EXPENSE)]
    proc_cat = cats[("Inventory Procurement", TransactionType.EXPENSE)]

    # Deterministic 30-day cash activity
    tx_rows = [
        Transaction(
            business_id=retail_biz.id,
            category_id=sales_cat.id,
            created_by_user_id=owner.id,
            transaction_date=ref_date - timedelta(days=24),
            description="POS Retail Settlement — Week 1",
            counterparty="Walk-in Retail Customers",
            type=TransactionType.INCOME,
            amount=Decimal("64500.00"),
            payment_method=PaymentMethod.UPI,
            status=TransactionStatus.COMPLETED,
            source_type=TransactionSource.MANUAL,
            reference_code="DEMO-POS-W1",
            is_demo_data=True,
        ),
        Transaction(
            business_id=retail_biz.id,
            category_id=sales_cat.id,
            created_by_user_id=owner.id,
            transaction_date=ref_date - timedelta(days=17),
            description="POS Retail Settlement — Week 2",
            counterparty="Walk-in Retail Customers",
            type=TransactionType.INCOME,
            amount=Decimal("71200.00"),
            payment_method=PaymentMethod.CARD,
            status=TransactionStatus.COMPLETED,
            source_type=TransactionSource.MANUAL,
            reference_code="DEMO-POS-W2",
            is_demo_data=True,
        ),
        Transaction(
            business_id=retail_biz.id,
            category_id=sales_cat.id,
            created_by_user_id=owner.id,
            transaction_date=ref_date - timedelta(days=9),
            description="POS Retail Settlement — Week 3",
            counterparty="Walk-in Retail Customers",
            type=TransactionType.INCOME,
            amount=Decimal("68900.00"),
            payment_method=PaymentMethod.UPI,
            status=TransactionStatus.COMPLETED,
            source_type=TransactionSource.MANUAL,
            reference_code="DEMO-POS-W3",
            is_demo_data=True,
        ),
        Transaction(
            business_id=retail_biz.id,
            category_id=sales_cat.id,
            created_by_user_id=owner.id,
            transaction_date=ref_date - timedelta(days=2),
            description="POS Retail Settlement — Week 4",
            counterparty="Walk-in Retail Customers",
            type=TransactionType.INCOME,
            amount=Decimal("58400.00"),
            payment_method=PaymentMethod.UPI,
            status=TransactionStatus.COMPLETED,
            source_type=TransactionSource.MANUAL,
            reference_code="DEMO-POS-W4",
            is_demo_data=True,
        ),
        Transaction(
            business_id=retail_biz.id,
            category_id=rent_cat.id,
            created_by_user_id=owner.id,
            transaction_date=ref_date - timedelta(days=20),
            description="Storefront Lease & Cold Storage Power",
            counterparty="Indiranagar Commercial Trust",
            type=TransactionType.EXPENSE,
            amount=Decimal("28500.00"),
            payment_method=PaymentMethod.BANK_TRANSFER,
            status=TransactionStatus.COMPLETED,
            source_type=TransactionSource.MANUAL,
            reference_code="DEMO-RENT-01",
            is_demo_data=True,
        ),
        Transaction(
            business_id=retail_biz.id,
            category_id=payroll_cat.id,
            created_by_user_id=owner.id,
            transaction_date=ref_date - timedelta(days=12),
            description="Store Staff Payroll Cycle",
            counterparty="Kaveri Retail Staff",
            type=TransactionType.EXPENSE,
            amount=Decimal("46000.00"),
            payment_method=PaymentMethod.BANK_TRANSFER,
            status=TransactionStatus.COMPLETED,
            source_type=TransactionSource.MANUAL,
            reference_code="DEMO-PAY-01",
            is_demo_data=True,
        ),
    ]
    db.add_all(tx_rows)
    db.flush()

    # Overdue Invoice (triggers Risk Radar receivable alert)
    inv_overdue = Invoice(
        business_id=retail_biz.id,
        customer_id=cust_horizon.id,
        invoice_number="DEMO-INV-2026-01",
        issue_date=ref_date - timedelta(days=34),
        due_date=ref_date - timedelta(days=11),
        tax_rate=Decimal("18.00"),
        subtotal=Decimal("24000.00"),
        tax_amount=Decimal("4320.00"),
        total_amount=Decimal("28320.00"),
        amount_paid=Decimal("0.00"),
        status=InvoiceStatus.OVERDUE,
        notes="Monthly bulk staples order — overdue follow-up",
        is_demo_data=True,
    )
    inv_overdue.line_items = [
        InvoiceLineItem(
            business_id=retail_biz.id,
            description="Bulk Staples & Pantry Supplies",
            quantity=Decimal("12.000"),
            unit_price=Decimal("2000.00"),
            line_total=Decimal("24000.00"),
        )
    ]

    # Partially Paid Invoice with reconciled Payment + Ledger Transaction
    inv_partial = Invoice(
        business_id=retail_biz.id,
        customer_id=cust_veridian.id,
        invoice_number="DEMO-INV-2026-02",
        issue_date=ref_date - timedelta(days=15),
        due_date=ref_date + timedelta(days=10),
        tax_rate=Decimal("18.00"),
        subtotal=Decimal("30000.00"),
        tax_amount=Decimal("5400.00"),
        total_amount=Decimal("35400.00"),
        amount_paid=Decimal("20000.00"),
        status=InvoiceStatus.PARTIAL,
        notes="Partial settlement received via NEFT",
        is_demo_data=True,
    )
    inv_partial.line_items = [
        InvoiceLineItem(
            business_id=retail_biz.id,
            description="Monthly Office Beverage & Dry Goods",
            quantity=Decimal("30.000"),
            unit_price=Decimal("1000.00"),
            line_total=Decimal("30000.00"),
        )
    ]
    db.add_all([inv_overdue, inv_partial])
    db.flush()

    payment_tx = Transaction(
        business_id=retail_biz.id,
        category_id=inv_settle_cat.id,
        created_by_user_id=owner.id,
        transaction_date=ref_date - timedelta(days=5),
        description=f"Invoice Payment — {inv_partial.invoice_number}",
        counterparty=cust_veridian.name,
        type=TransactionType.INCOME,
        amount=Decimal("20000.00"),
        payment_method=PaymentMethod.BANK_TRANSFER,
        status=TransactionStatus.COMPLETED,
        source_type=TransactionSource.INVOICE_PAYMENT,
        reference_code="DEMO-UTR-8810",
        is_demo_data=True,
    )
    db.add(payment_tx)
    db.flush()

    db.add(
        Payment(
            business_id=retail_biz.id,
            invoice_id=inv_partial.id,
            customer_id=cust_veridian.id,
            transaction_id=payment_tx.id,
            payment_reference="DEMO-UTR-8810",
            idempotency_key="demo-seed-payment-01",
            payment_date=ref_date - timedelta(days=5),
            amount=Decimal("20000.00"),
            payment_method=PaymentMethod.BANK_TRANSFER,
            notes="Initial partial settlement",
        )
    )

    # Inventory SKUs (1 healthy, 1 low stock to populate Risk Radar)
    prod_rice = InventoryProduct(
        business_id=retail_biz.id,
        preferred_supplier_id=sup_deccan.id,
        sku="DEMO-RICE-25",
        name="Sona Masoori Rice 25kg",
        category="Grains & Staples",
        unit="bags",
        current_stock=Decimal("28.000"),
        reorder_point=Decimal("10.000"),
        unit_cost=Decimal("1350.00"),
        selling_price=Decimal("1780.00"),
        last_restocked_date=ref_date - timedelta(days=6),
    )
    prod_milk = InventoryProduct(
        business_id=retail_biz.id,
        preferred_supplier_id=sup_malabar.id,
        sku="DEMO-DAIRY-A2",
        name="Organic A2 Milk Crate (12L)",
        category="Dairy & Perishables",
        unit="crates",
        current_stock=Decimal("4.000"),
        reorder_point=Decimal("12.000"),
        unit_cost=Decimal("820.00"),
        selling_price=Decimal("1120.00"),
        last_restocked_date=ref_date - timedelta(days=14),
    )
    db.add_all([prod_rice, prod_milk])
    db.flush()

    restock_total = to_money(Decimal("20.000") * Decimal("1350.00"))
    restock_tx = Transaction(
        business_id=retail_biz.id,
        category_id=proc_cat.id,
        created_by_user_id=owner.id,
        transaction_date=ref_date - timedelta(days=6),
        description="Inventory Restock: Sona Masoori Rice 25kg (20.000 bags)",
        counterparty=sup_deccan.name,
        type=TransactionType.EXPENSE,
        amount=restock_total,
        payment_method=PaymentMethod.BANK_TRANSFER,
        status=TransactionStatus.COMPLETED,
        source_type=TransactionSource.INVENTORY_RESTOCK,
        reference_code="DEMO-PO-RICE-01",
        is_demo_data=True,
    )
    db.add(restock_tx)
    db.flush()

    db.add(
        StockMovement(
            business_id=retail_biz.id,
            product_id=prod_rice.id,
            supplier_id=sup_deccan.id,
            transaction_id=restock_tx.id,
            movement_type=StockMovementType.RESTOCK,
            movement_date=ref_date - timedelta(days=6),
            quantity_delta=Decimal("20.000"),
            unit_cost=Decimal("1350.00"),
            total_cost=restock_total,
            reference_code="DEMO-PO-RICE-01",
            idempotency_key="demo-seed-restock-01",
            notes="Initial demo workspace procurement",
        )
    )

    # 2. Secondary Service Business (to demonstrate multi-business workspace switching)
    advisory_biz = Business(
        name=DEMO_SECONDARY_BUSINESS_NAME,
        business_type="Service",
        industry="B2B Consulting",
        currency="USD",
        country="United States",
        business_size="Micro (1-5)",
        financial_year_start="January",
        dashboard_preference="Cash Preservation",
        timezone="America/New_York",
        gst_registered=False,
        opening_cash_balance=Decimal("42000.00"),
        monthly_fixed_overhead=Decimal("5500.00"),
        credit_facility_limit=Decimal("25000.00"),
        short_term_loan_balance=Decimal("0.00"),
        tax_liability_accrued=Decimal("3100.00"),
        is_demo_data=True,
    )
    db.add(advisory_biz)
    db.flush()
    db.add(
        BusinessMembership(
            business_id=advisory_biz.id,
            user_id=owner.id,
            role=MembershipRole.OWNER,
            is_active=True,
        )
    )
    adv_cats = _seed_categories(db, advisory_biz.id)
    db.add_all(
        [
            Transaction(
                business_id=advisory_biz.id,
                category_id=adv_cats[("Service Income", TransactionType.INCOME)].id,
                created_by_user_id=owner.id,
                transaction_date=ref_date - timedelta(days=10),
                description="Monthly Fractional CFO Retainer",
                counterparty="Northstar SaaS Inc.",
                type=TransactionType.INCOME,
                amount=Decimal("9500.00"),
                payment_method=PaymentMethod.BANK_TRANSFER,
                status=TransactionStatus.COMPLETED,
                source_type=TransactionSource.MANUAL,
                reference_code="DEMO-ADV-01",
                is_demo_data=True,
            ),
            Transaction(
                business_id=advisory_biz.id,
                category_id=adv_cats[("Software & Subscriptions", TransactionType.EXPENSE)].id,
                created_by_user_id=owner.id,
                transaction_date=ref_date - timedelta(days=7),
                description="Cloud & Analytics Stack",
                counterparty="Cloud Ops Vendor",
                type=TransactionType.EXPENSE,
                amount=Decimal("1850.00"),
                payment_method=PaymentMethod.CARD,
                status=TransactionStatus.COMPLETED,
                source_type=TransactionSource.MANUAL,
                reference_code="DEMO-ADV-02",
                is_demo_data=True,
            ),
        ]
    )

    db.commit()
    return {
        "status": "seeded",
        "deleted_demo_businesses": deleted_demo_count,
        "business_ids": [retail_biz.id, advisory_biz.id],
        "business_names": [retail_biz.name, advisory_biz.name],
        "demo_owner_email": owner.email,
    }
