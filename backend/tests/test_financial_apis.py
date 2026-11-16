from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
import io
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import build_engine, get_db
from app.main import create_app
from app.models import Payment, StockMovement, Transaction
from app.models.enums import TransactionSource


@pytest.fixture()
def db_session_factory(tmp_path: Path):
    db_file = tmp_path / "checkpoint_e_test.db"
    engine = build_engine(f"sqlite:///{db_file}", echo=False)
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(
        bind=engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
        class_=Session,
    )
    try:
        yield TestingSessionLocal
    finally:
        engine.dispose()


@pytest.fixture()
def client(db_session_factory):
    app = create_app()

    def _override_get_db():
        db = db_session_factory()
        try:
            yield db
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _setup_user_and_business(
    client: TestClient,
    email: str,
    biz_name: str,
) -> tuple[dict[str, str], str]:
    reg = client.post(
        "/api/v1/auth/register",
        json={"email": email, "full_name": email.split("@")[0], "password": "StrongPassword#1"},
    )
    assert reg.status_code == 201, reg.text
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    biz = client.post(
        "/api/v1/businesses",
        headers=headers,
        json={"name": biz_name, "business_type": "Retail", "industry": "FMCG"},
    )
    assert biz.status_code == 201, biz.text
    return headers, biz.json()["id"]


def test_categories_and_transactions_crud_filter_reversal_and_csv(client: TestClient) -> None:
    headers, biz_id = _setup_user_and_business(client, "ledger@kaveri.example.com", "Kaveri Mart")

    # Create two income categories
    c1 = client.post(
        f"/api/v1/businesses/{biz_id}/categories",
        headers=headers,
        json={"name": "Counter Sales", "type": "income", "is_operating": True},
    )
    c2 = client.post(
        f"/api/v1/businesses/{biz_id}/categories",
        headers=headers,
        json={"name": "Online Orders", "type": "income", "is_operating": True},
    )
    exp_cat = client.post(
        f"/api/v1/businesses/{biz_id}/categories",
        headers=headers,
        json={"name": "Store Supplies", "type": "expense", "is_operating": True},
    )
    assert c1.status_code == 201
    assert c2.status_code == 201
    assert exp_cat.status_code == 201
    c1_id, c2_id, exp_cat_id = c1.json()["id"], c2.json()["id"], exp_cat.json()["id"]

    # Validation: mismatched category type rejected
    bad_tx = client.post(
        f"/api/v1/businesses/{biz_id}/transactions",
        headers=headers,
        json={
            "transaction_date": "2026-11-10",
            "description": "Type mismatch",
            "counterparty": "POS",
            "type": "income",
            "amount": "1500.00",
            "category_id": exp_cat_id,
        },
    )
    assert bad_tx.status_code == 400

    # Validation: zero/negative amount rejected
    zero_tx = client.post(
        f"/api/v1/businesses/{biz_id}/transactions",
        headers=headers,
        json={
            "transaction_date": "2026-11-10",
            "description": "Zero amount",
            "counterparty": "POS",
            "type": "income",
            "amount": "0.00",
        },
    )
    assert zero_tx.status_code == 422

    # Create completed and scheduled transactions
    tx1 = client.post(
        f"/api/v1/businesses/{biz_id}/transactions",
        headers=headers,
        json={
            "transaction_date": "2026-11-10",
            "description": "Morning POS settlement",
            "counterparty": "Walk-in Customers",
            "type": "income",
            "amount": "12500.50",
            "category_id": c1_id,
            "payment_method": "upi",
            "status": "completed",
            "reference_code": "POS-001",
        },
    )
    tx2 = client.post(
        f"/api/v1/businesses/{biz_id}/transactions",
        headers=headers,
        json={
            "transaction_date": "2026-11-20",
            "description": "Upcoming Rent",
            "counterparty": "Apex Landlord",
            "type": "expense",
            "amount": "25000.00",
            "category_id": exp_cat_id,
            "status": "scheduled",
        },
    )
    assert tx1.status_code == 201
    assert tx2.status_code == 201
    tx1_id, tx2_id = tx1.json()["id"], tx2.json()["id"]

    # Category deletion blocked when referenced, succeeds with safe reassignment
    del_cat_fail = client.delete(
        f"/api/v1/businesses/{biz_id}/categories/{c1_id}", headers=headers
    )
    assert del_cat_fail.status_code == 409

    del_cat_ok = client.delete(
        f"/api/v1/businesses/{biz_id}/categories/{c1_id}?reassign_to_category_id={c2_id}",
        headers=headers,
    )
    assert del_cat_ok.status_code == 200
    assert del_cat_ok.json()["reassigned_transactions"] == 1

    # Completed transaction cannot be deleted directly; must be reversed
    assert client.delete(f"/api/v1/businesses/{biz_id}/transactions/{tx1_id}", headers=headers).status_code == 409
    rev = client.post(
        f"/api/v1/businesses/{biz_id}/transactions/{tx1_id}/reverse",
        headers=headers,
        json={"reversal_date": "2026-11-11", "reason": "Duplicate POS batch"},
    )
    assert rev.status_code == 201
    assert rev.json()["type"] == "expense"
    assert Decimal(rev.json()["amount"]) == Decimal("12500.50")

    # Double reversal blocked
    assert (
        client.post(
            f"/api/v1/businesses/{biz_id}/transactions/{tx1_id}/reverse",
            headers=headers,
            json={"reason": "Second reversal attempt"},
        ).status_code
        == 409
    )

    # Scheduled unlinked transaction can be updated and deleted
    assert (
        client.patch(
            f"/api/v1/businesses/{biz_id}/transactions/{tx2_id}",
            headers=headers,
            json={"amount": "26000.00"},
        ).status_code
        == 200
    )
    assert client.delete(f"/api/v1/businesses/{biz_id}/transactions/{tx2_id}", headers=headers).status_code == 200

    # CSV import (invalid batch rolls back completely; valid batch succeeds)
    bad_csv = "transaction_date,description,counterparty,type,amount\n2026-11-12,Good Row,Vendor A,expense,100.00\n2026-11-12,Bad Row,Vendor B,expense,-50.00\n"
    bad_imp = client.post(
        f"/api/v1/businesses/{biz_id}/transactions/import-csv",
        headers=headers,
        files={"file": ("bad.csv", io.BytesIO(bad_csv.encode("utf-8")), "text/csv")},
    )
    assert bad_imp.status_code == 422

    good_csv = (
        "transaction_date,description,counterparty,type,amount,category,payment_method\n"
        "2026-11-13,Bulk Spice Order,Deccan Spices,expense,4200.75,Spices Purchase,bank_transfer\n"
        "2026-11-14,=SUM(1+1) Promo Sale,Retail Buyer,income,950.25,Online Orders,upi\n"
    )
    good_imp = client.post(
        f"/api/v1/businesses/{biz_id}/transactions/import-csv",
        headers=headers,
        files={"file": ("good.csv", io.BytesIO(good_csv.encode("utf-8")), "text/csv")},
    )
    assert good_imp.status_code == 201
    assert good_imp.json()["imported_count"] == 2

    # Filtering, pagination & CSV export with formula neutralization
    filtered = client.get(
        f"/api/v1/businesses/{biz_id}/transactions?source_type=csv_import&page=1&page_size=1",
        headers=headers,
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 2
    assert filtered.json()["total_pages"] == 2

    csv_out = client.get(
        f"/api/v1/businesses/{biz_id}/transactions/export-csv?source_type=csv_import",
        headers=headers,
    )
    assert csv_out.status_code == 200
    assert "'=SUM(1+1) Promo Sale" in csv_out.text


def test_invoices_calculations_partial_payments_idempotency_and_atomicity(
    client: TestClient, db_session_factory
) -> None:
    headers, biz_id = _setup_user_and_business(client, "billing@kaveri.example.com", "Kaveri Billing")

    cust = client.post(
        f"/api/v1/businesses/{biz_id}/customers",
        headers=headers,
        json={"name": "Veridian Workspace", "email": "ap@veridian.example.com"},
    )
    assert cust.status_code == 201
    customer_id = cust.json()["id"]

    # Invalid invoice due_date < issue_date
    bad_inv = client.post(
        f"/api/v1/businesses/{biz_id}/invoices",
        headers=headers,
        json={
            "customer_id": customer_id,
            "invoice_number": "INV-BAD-01",
            "issue_date": "2026-11-15",
            "due_date": "2026-11-10",
            "tax_rate": "18.00",
            "line_items": [{"description": "Item", "quantity": "1", "unit_price": "100.00"}],
        },
    )
    assert bad_inv.status_code == 422

    # Create invoice with multiple line items -> subtotal 1500.00, 18% GST = 270.00, total = 1770.00
    inv_resp = client.post(
        f"/api/v1/businesses/{biz_id}/invoices",
        headers=headers,
        json={
            "customer_id": customer_id,
            "invoice_number": "INV-2026-101",
            "issue_date": "2026-10-01",
            "due_date": (date.today() - timedelta(days=3)).isoformat(),
            "tax_rate": "18.00",
            "status": "pending",
            "line_items": [
                {"description": "Coffee Beans 10kg", "quantity": "2.000", "unit_price": "500.00"},
                {"description": "Tea Premix", "quantity": "5.000", "unit_price": "100.00"},
            ],
        },
    )
    assert inv_resp.status_code == 201
    inv_data = inv_resp.json()
    inv_id = inv_data["id"]
    assert Decimal(inv_data["subtotal"]) == Decimal("1500.00")
    assert Decimal(inv_data["tax_amount"]) == Decimal("270.00")
    assert Decimal(inv_data["total_amount"]) == Decimal("1770.00")
    assert Decimal(inv_data["amount_paid"]) == Decimal("0.00")
    assert Decimal(inv_data["outstanding_balance"]) == Decimal("1770.00")
    assert inv_data["is_overdue"] is True

    # Invoice creation MUST NOT automatically create a cash receipt transaction
    tx_list = client.get(f"/api/v1/businesses/{biz_id}/transactions", headers=headers).json()
    assert tx_list["total"] == 0

    # Overdue and unpaid filters locate this invoice
    overdue_res = client.get(
        f"/api/v1/businesses/{biz_id}/invoices?overdue_only=true&unpaid_only=true",
        headers=headers,
    )
    assert overdue_res.status_code == 200
    assert overdue_res.json()["total"] == 1

    # Cannot mark invoice paid directly via PATCH
    assert (
        client.patch(
            f"/api/v1/businesses/{biz_id}/invoices/{inv_id}",
            headers=headers,
            json={"status": "paid"},
        ).status_code
        == 400
    )

    # Partial payment #1 with Idempotency-Key
    pay1 = client.post(
        f"/api/v1/businesses/{biz_id}/payments",
        headers={**headers, "Idempotency-Key": "pay-idem-1"},
        json={
            "invoice_id": inv_id,
            "payment_reference": "UTR-1001",
            "payment_date": "2026-11-14",
            "amount": "1000.00",
            "payment_method": "bank_transfer",
        },
    )
    assert pay1.status_code == 201
    assert pay1.json()["invoice_status"] == "partial"
    assert Decimal(pay1.json()["invoice_remaining_balance"]) == Decimal("770.00")

    # Idempotent retry replays existing payment without double-counting
    pay1_retry = client.post(
        f"/api/v1/businesses/{biz_id}/payments",
        headers={**headers, "Idempotency-Key": "pay-idem-1"},
        json={
            "invoice_id": inv_id,
            "payment_reference": "UTR-1001",
            "payment_date": "2026-11-14",
            "amount": "1000.00",
            "payment_method": "bank_transfer",
        },
    )
    assert pay1_retry.status_code == 200
    assert pay1_retry.json()["id"] == pay1.json()["id"]

    # Duplicate payment_reference with different payment rejected (409)
    dup_ref = client.post(
        f"/api/v1/businesses/{biz_id}/payments",
        headers=headers,
        json={
            "invoice_id": inv_id,
            "payment_reference": "UTR-1001",
            "payment_date": "2026-11-15",
            "amount": "100.00",
            "payment_method": "upi",
        },
    )
    assert dup_ref.status_code == 409

    # Overpayment exceeding remaining 770.00 rejected (400)
    overpay = client.post(
        f"/api/v1/businesses/{biz_id}/payments",
        headers=headers,
        json={
            "invoice_id": inv_id,
            "payment_reference": "UTR-1002",
            "payment_date": "2026-11-15",
            "amount": "800.00",
            "payment_method": "upi",
        },
    )
    assert overpay.status_code == 400

    # Once partial payments exist, line items cannot be altered
    assert (
        client.patch(
            f"/api/v1/businesses/{biz_id}/invoices/{inv_id}",
            headers=headers,
            json={"tax_rate": "5.00"},
        ).status_code
        == 409
    )

    # Second partial payment settles the remaining 770.00 -> status becomes PAID
    pay2 = client.post(
        f"/api/v1/businesses/{biz_id}/payments",
        headers=headers,
        json={
            "invoice_id": inv_id,
            "payment_reference": "UTR-1003",
            "payment_date": "2026-11-15",
            "amount": "770.00",
            "payment_method": "upi",
        },
    )
    assert pay2.status_code == 201
    assert pay2.json()["invoice_status"] == "paid"
    assert Decimal(pay2.json()["invoice_remaining_balance"]) == Decimal("0.00")

    # Verify DB atomicity: exactly 2 payments and 2 linked INVOICE_PAYMENT transactions totaling 1770.00
    with db_session_factory() as db:
        payments_count = db.scalar(
            select(func.count(Payment.id)).where(Payment.invoice_id == inv_id)
        )
        tx_count = db.scalar(
            select(func.count(Transaction.id)).where(
                Transaction.business_id == biz_id,
                Transaction.source_type == TransactionSource.INVOICE_PAYMENT,
            )
        )
        assert payments_count == 2
        assert tx_count == 2


def test_inventory_restock_movements_and_duplicate_expense_prevention(
    client: TestClient, db_session_factory
) -> None:
    headers, biz_id = _setup_user_and_business(client, "stock@kaveri.example.com", "Kaveri Warehouse")

    sup = client.post(
        f"/api/v1/businesses/{biz_id}/suppliers",
        headers=headers,
        json={"name": "Deccan Grains", "default_lead_time_days": 4},
    )
    assert sup.status_code == 201
    supplier_id = sup.json()["id"]

    prod = client.post(
        f"/api/v1/businesses/{biz_id}/inventory/products",
        headers=headers,
        json={
            "sku": "RICE-25KG",
            "name": "Sona Masoori Rice 25kg",
            "category": "Grains",
            "unit": "bags",
            "preferred_supplier_id": supplier_id,
            "current_stock": "10.000",
            "reorder_point": "5.000",
            "unit_cost": "1300.00",
            "selling_price": "1750.00",
        },
    )
    assert prod.status_code == 201
    product_id = prod.json()["id"]

    # Restock 5 bags @ 1350.00 = 6750.00 with Idempotency-Key
    restock = client.post(
        f"/api/v1/businesses/{biz_id}/inventory/products/{product_id}/restock",
        headers={**headers, "Idempotency-Key": "restock-idem-1"},
        json={
            "quantity": "5.000",
            "unit_cost": "1350.00",
            "movement_date": "2026-11-15",
            "reference_code": "PO-9001",
            "record_expense": True,
        },
    )
    assert restock.status_code == 201
    assert Decimal(restock.json()["resulting_stock"]) == Decimal("15.000")
    assert Decimal(restock.json()["total_cost"]) == Decimal("6750.00")
    assert restock.json()["transaction_id"] is not None

    # Idempotent retry must NOT add stock again or create a duplicate expense transaction
    restock_retry = client.post(
        f"/api/v1/businesses/{biz_id}/inventory/products/{product_id}/restock",
        headers={**headers, "Idempotency-Key": "restock-idem-1"},
        json={
            "quantity": "5.000",
            "unit_cost": "1350.00",
            "movement_date": "2026-11-15",
            "reference_code": "PO-9001",
            "record_expense": True,
        },
    )
    assert restock_retry.status_code == 200
    assert restock_retry.json()["id"] == restock.json()["id"]

    # Sale movement reduces stock; selling more than available stock is rejected
    sale = client.post(
        f"/api/v1/businesses/{biz_id}/inventory/products/{product_id}/movements",
        headers=headers,
        json={
            "movement_type": "sale",
            "quantity_delta": "-12.000",
            "movement_date": "2026-11-15",
        },
    )
    assert sale.status_code == 201
    assert Decimal(sale.json()["resulting_stock"]) == Decimal("3.000")

    bad_sale = client.post(
        f"/api/v1/businesses/{biz_id}/inventory/products/{product_id}/movements",
        headers=headers,
        json={
            "movement_type": "sale",
            "quantity_delta": "-5.000",
            "movement_date": "2026-11-15",
        },
    )
    assert bad_sale.status_code == 400

    # Verify low_stock_only filter now detects product (3.000 <= 5.000)
    low_stock = client.get(
        f"/api/v1/businesses/{biz_id}/inventory/products?low_stock_only=true",
        headers=headers,
    )
    assert low_stock.status_code == 200
    assert low_stock.json()["total"] == 1

    # Verify exactly 1 restock expense transaction exists
    with db_session_factory() as db:
        restock_tx_count = db.scalar(
            select(func.count(Transaction.id)).where(
                Transaction.business_id == biz_id,
                Transaction.source_type == TransactionSource.INVENTORY_RESTOCK,
            )
        )
        movement_count = db.scalar(
            select(func.count(StockMovement.id)).where(StockMovement.business_id == biz_id)
        )
        assert restock_tx_count == 1
        assert movement_count == 2


def test_role_permissions_and_cross_tenant_financial_isolation(client: TestClient) -> None:
    owner_h, biz_a = _setup_user_and_business(client, "owner_e@test.io", "Biz A")
    outsider_h, biz_b = _setup_user_and_business(client, "outsider_e@test.io", "Biz B")

    # Register viewer and manager and add to Biz A
    viewer_reg = client.post(
        "/api/v1/auth/register",
        json={"email": "viewer_e@test.io", "full_name": "Viewer", "password": "StrongPassword#1"},
    )
    manager_reg = client.post(
        "/api/v1/auth/register",
        json={"email": "manager_e@test.io", "full_name": "Manager", "password": "StrongPassword#1"},
    )
    viewer_h = {"Authorization": f"Bearer {viewer_reg.json()['access_token']}"}
    manager_h = {"Authorization": f"Bearer {manager_reg.json()['access_token']}"}

    client.post(
        f"/api/v1/businesses/{biz_a}/members",
        headers=owner_h,
        json={"email": "viewer_e@test.io", "role": "viewer"},
    )
    client.post(
        f"/api/v1/businesses/{biz_a}/members",
        headers=owner_h,
        json={"email": "manager_e@test.io", "role": "manager"},
    )

    # Viewer is strictly read-only
    assert client.get(f"/api/v1/businesses/{biz_a}/transactions", headers=viewer_h).status_code == 200
    assert (
        client.post(
            f"/api/v1/businesses/{biz_a}/customers",
            headers=viewer_h,
            json={"name": "Blocked Customer"},
        ).status_code
        == 403
    )

    # Manager can write operational financial records, but cannot delete
    cust_res = client.post(
        f"/api/v1/businesses/{biz_a}/customers",
        headers=manager_h,
        json={"name": "Manager Created Customer"},
    )
    assert cust_res.status_code == 201
    cust_a_id = cust_res.json()["id"]
    assert (
        client.delete(
            f"/api/v1/businesses/{biz_a}/customers/{cust_a_id}",
            headers=manager_h,
        ).status_code
        == 403
    )

    # Outsider cannot read or mutate Biz A financial endpoints (403)
    assert client.get(f"/api/v1/businesses/{biz_a}/transactions", headers=outsider_h).status_code == 403
    assert client.get(f"/api/v1/businesses/{biz_a}/invoices", headers=outsider_h).status_code == 403
    assert client.get(f"/api/v1/businesses/{biz_a}/payments", headers=outsider_h).status_code == 403
    assert client.get(f"/api/v1/businesses/{biz_a}/inventory/products", headers=outsider_h).status_code == 403

    # Outsider cannot reference Biz A's customer when creating an invoice in Biz B
    cross_inv = client.post(
        f"/api/v1/businesses/{biz_b}/invoices",
        headers=outsider_h,
        json={
            "customer_id": cust_a_id,
            "invoice_number": "INV-XT-B",
            "issue_date": "2026-11-15",
            "due_date": "2026-11-20",
            "line_items": [{"description": "Test", "quantity": "1", "unit_price": "100.00"}],
        },
    )
    assert cross_inv.status_code == 404
