from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import build_engine, get_db
from app.main import create_app
from app.models import AuditLog, Transaction


@pytest.fixture()
def db_session_factory(tmp_path: Path):
    db_file = tmp_path / "checkpoint_f_test.db"
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


def _register_and_create_business(
    client: TestClient,
    email: str,
    biz_name: str,
    *,
    opening_cash: str = "100000.00",
    monthly_overhead: str = "20000.00",
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
        json={
            "name": biz_name,
            "business_type": "Retail",
            "industry": "Grocery",
            "opening_cash_balance": opening_cash,
            "monthly_fixed_overhead": monthly_overhead,
            "tax_liability_accrued": "5000.00",
        },
    )
    assert biz.status_code == 201, biz.text
    return headers, biz.json()["id"]


def test_financial_summary_partial_payment_inventory_and_no_double_counting(
    client: TestClient,
) -> None:
    headers, biz_id = _register_and_create_business(
        client,
        "owner1@bizpilot.example.com",
        "Kaveri Fresh Mart",
        opening_cash="100000.00",
        monthly_overhead="15000.00",
    )
    as_of = date(2026, 11, 15)

    # Create customer & supplier
    cust = client.post(
        f"/api/v1/businesses/{biz_id}/customers",
        headers=headers,
        json={"name": "Veridian Cafe", "opening_balance": "0.00"},
    )
    assert cust.status_code == 201
    cust_id = cust.json()["id"]

    sup = client.post(
        f"/api/v1/businesses/{biz_id}/suppliers",
        headers=headers,
        json={"name": "Deccan Grains", "opening_payable": "2500.00"},
    )
    assert sup.status_code == 201
    sup_id = sup.json()["id"]

    # Create direct cash sales income (5000.00) and operating expense (1200.00)
    tx_in = client.post(
        f"/api/v1/businesses/{biz_id}/transactions",
        headers=headers,
        json={
            "transaction_date": "2026-11-05",
            "description": "POS Retail Sales",
            "counterparty": "Walk-in Customers",
            "type": "income",
            "amount": "5000.00",
            "status": "completed",
        },
    )
    assert tx_in.status_code == 201

    tx_exp = client.post(
        f"/api/v1/businesses/{biz_id}/transactions",
        headers=headers,
        json={
            "transaction_date": "2026-11-06",
            "description": "Store Electricity",
            "counterparty": "BESCOM",
            "type": "expense",
            "amount": "1200.00",
            "status": "completed",
        },
    )
    assert tx_exp.status_code == 201

    # Create invoice totaling 10000.00 and pay 4000.00 partially
    inv = client.post(
        f"/api/v1/businesses/{biz_id}/invoices",
        headers=headers,
        json={
            "customer_id": cust_id,
            "invoice_number": "INV-1001",
            "issue_date": "2026-11-01",
            "due_date": "2026-11-25",
            "tax_rate": "0.00",
            "line_items": [{"description": "Supply Pack", "quantity": "10.000", "unit_price": "1000.00"}],
        },
    )
    assert inv.status_code == 201
    inv_id = inv.json()["id"]

    pay = client.post(
        f"/api/v1/businesses/{biz_id}/payments",
        headers={**headers, "Idempotency-Key": "pay-1001-part"},
        json={
            "invoice_id": inv_id,
            "payment_reference": "UTR-1001",
            "payment_date": "2026-11-08",
            "amount": "4000.00",
            "payment_method": "bank_transfer",
        },
    )
    assert pay.status_code == 201

    # Add inventory product & restock 5 units @ 300.00 = 1500.00 outflow + initial 10 units @ 300.00 = 3000.00
    prod = client.post(
        f"/api/v1/businesses/{biz_id}/inventory/products",
        headers=headers,
        json={
            "sku": "RICE-25KG",
            "name": "Rice Bag 25kg",
            "category": "Grains",
            "unit": "bags",
            "current_stock": "10.000",
            "reorder_point": "5.000",
            "unit_cost": "300.00",
            "selling_price": "450.00",
            "preferred_supplier_id": sup_id,
        },
    )
    assert prod.status_code == 201
    prod_id = prod.json()["id"]

    restock = client.post(
        f"/api/v1/businesses/{biz_id}/inventory/products/{prod_id}/restock",
        headers={**headers, "Idempotency-Key": "restock-1"},
        json={
            "quantity": "5.000",
            "unit_cost": "300.00",
            "movement_date": "2026-11-10",
            "supplier_id": sup_id,
            "reference_code": "PO-55",
        },
    )
    assert restock.status_code == 201

    summary_res = client.get(
        f"/api/v1/businesses/{biz_id}/financial-summary?preset=30d&as_of_date={as_of.isoformat()}",
        headers=headers,
    )
    assert summary_res.status_code == 200, summary_res.text
    kpis = summary_res.json()["kpis"]

    # Total cash inflows = 5000.00 (POS) + 4000.00 (invoice partial payment) = 9000.00 (NOT 15000.00!)
    assert Decimal(kpis["total_revenue"]) == Decimal("9000.00")
    assert Decimal(kpis["invoice_collections"]) == Decimal("4000.00")
    assert Decimal(kpis["billed_invoiced_revenue"]) == Decimal("10000.00")
    # Expenses = 1200.00 (BESCOM) + 1500.00 (inventory restock) = 2700.00
    assert Decimal(kpis["total_expenses"]) == Decimal("2700.00")
    assert Decimal(kpis["cogs_and_inventory_spend"]) == Decimal("1500.00")
    assert Decimal(kpis["gross_profit"]) == Decimal("7500.00")
    assert Decimal(kpis["net_profit"]) == Decimal("6300.00")
    # Available cash = 100000.00 + 9000.00 - 2700.00 = 106300.00
    assert Decimal(kpis["available_cash"]) == Decimal("106300.00")
    # Remaining receivable = 10000.00 - 4000.00 = 6000.00
    assert Decimal(kpis["accounts_receivable"]) == Decimal("6000.00")
    # Inventory valuation = (10 + 5) * 300.00 = 4500.00
    assert Decimal(kpis["inventory_valuation"]) == Decimal("4500.00")
    # Payables = supplier opening 2500.00 + tax 5000.00 = 7500.00
    assert Decimal(kpis["accounts_payable"]) == Decimal("7500.00")

    # Digital Twin consistency
    twin_res = client.get(
        f"/api/v1/businesses/{biz_id}/financial-twin?as_of_date={as_of.isoformat()}",
        headers=headers,
    )
    assert twin_res.status_code == 200
    twin = twin_res.json()
    assert twin["data_label"] == "ACTUAL"
    assert Decimal(twin["assets"]["total_current_assets"]) == Decimal("116800.00")
    assert Decimal(twin["liabilities"]["total_liabilities"]) == Decimal("7500.00")
    assert Decimal(twin["net_working_position"]) == Decimal("109300.00")
    labels = {pt["data_label"] for pt in twin["timeline"]}
    assert {"ACTUAL", "ESTIMATED", "FORECAST"}.issubset(labels)


def test_health_score_missing_data_guardrail_and_forecast_insufficient_confidence(
    client: TestClient,
) -> None:
    headers, biz_id = _register_and_create_business(
        client,
        "empty@bizpilot.example.com",
        "Brand New Venture",
        opening_cash="0.00",
        monthly_overhead="0.00",
    )

    health_res = client.get(f"/api/v1/businesses/{biz_id}/financial-health", headers=headers)
    assert health_res.status_code == 200
    health = health_res.json()
    assert health["overall_score"] == 0
    assert health["grade"] == "Insufficient Data"
    assert health["data_completeness_pct"] == 0
    assert len(health["components"]) == 6
    assert all(c["data_available"] is False for c in health["components"])

    forecast_res = client.get(f"/api/v1/businesses/{biz_id}/cash-flow-forecast", headers=headers)
    assert forecast_res.status_code == 200
    forecast = forecast_res.json()
    assert forecast["data_label"] == "FORECAST"
    assert forecast["overall_confidence"] == "insufficient_data"
    assert set(forecast["horizons"].keys()) == {"7d", "30d", "90d"}
    assert forecast["horizons"]["7d"]["confidence"] == "insufficient_data"
    assert forecast["horizons"]["90d"]["horizon_days"] == 90


def test_risk_radar_detection_acknowledgement_and_audit_log(
    client: TestClient,
    db_session_factory,
) -> None:
    headers, biz_id = _register_and_create_business(
        client,
        "radar@bizpilot.example.com",
        "Monsoon Bistro",
        opening_cash="10000.00",
        monthly_overhead="25000.00",
    )
    as_of = date(2026, 11, 15)

    # Create overdue invoice
    cust = client.post(
        f"/api/v1/businesses/{biz_id}/customers",
        headers=headers,
        json={"name": "Corporate Catering Client"},
    )
    assert cust.status_code == 201
    inv = client.post(
        f"/api/v1/businesses/{biz_id}/invoices",
        headers=headers,
        json={
            "customer_id": cust.json()["id"],
            "invoice_number": "INV-LATE-01",
            "issue_date": "2026-10-01",
            "due_date": "2026-10-20",
            "tax_rate": "0.00",
            "line_items": [{"description": "Event Catering", "quantity": "1.000", "unit_price": "18000.00"}],
        },
    )
    assert inv.status_code == 201

    # Prior baseline expense (5000.00) vs current 30d spike + duplicate payments (12000.00 x 2 within 1 day)
    for d, amt, desc in [
        ("2026-09-20", "4000.00", "Baseline Kitchen Supply"),
        ("2026-11-10", "12000.00", "Vendor Payout A"),
        ("2026-11-11", "12000.00", "Vendor Payout A Repeat"),
    ]:
        tx = client.post(
            f"/api/v1/businesses/{biz_id}/transactions",
            headers=headers,
            json={
                "transaction_date": d,
                "description": desc,
                "counterparty": "Metro Wholesale",
                "type": "expense",
                "amount": amt,
                "status": "completed",
            },
        )
        assert tx.status_code == 201

    alerts_res = client.get(
        f"/api/v1/businesses/{biz_id}/alerts?as_of_date={as_of.isoformat()}",
        headers=headers,
    )
    assert alerts_res.status_code == 200, alerts_res.text
    alerts = alerts_res.json()["items"]
    alert_types = {a["alert_type"] for a in alerts}
    assert {"overdue_invoices", "cash_shortage", "expense_spike", "duplicate_payment_pattern"}.issubset(
        alert_types
    )

    # Neutral wording check on duplicate payment alert
    dup_alert = next(a for a in alerts if a["alert_type"] == "duplicate_payment_pattern")
    assert "fraud" not in dup_alert["title"].lower()
    assert "fraud" not in dup_alert["description"].lower()
    assert dup_alert["supporting_evidence"] is not None

    # Acknowledge alert and verify persistence & audit log
    ack_res = client.patch(
        f"/api/v1/businesses/{biz_id}/alerts/{dup_alert['id']}",
        headers=headers,
        json={"is_acknowledged": True},
    )
    assert ack_res.status_code == 200
    assert ack_res.json()["is_acknowledged"] is True

    # Re-evaluating alerts must preserve acknowledgement state
    refetched = client.get(
        f"/api/v1/businesses/{biz_id}/alerts?as_of_date={as_of.isoformat()}",
        headers=headers,
    )
    matching = next(a for a in refetched.json()["items"] if a["id"] == dup_alert["id"])
    assert matching["is_acknowledged"] is True

    with db_session_factory() as db:
        audit_count = db.scalar(
            select(func.count(AuditLog.id)).where(
                AuditLog.business_id == biz_id,
                AuditLog.action == "alert.acknowledge",
                AuditLog.entity_id == dup_alert["id"],
            )
        )
        assert audit_count == 1


def test_simulation_persistence_comparison_and_no_ledger_mutation(
    client: TestClient,
    db_session_factory,
) -> None:
    headers, biz_id = _register_and_create_business(
        client,
        "sim@bizpilot.example.com",
        "Aura Studio",
        opening_cash="200000.00",
        monthly_overhead="20000.00",
    )
    as_of = date(2026, 11, 15)

    client.post(
        f"/api/v1/businesses/{biz_id}/transactions",
        headers=headers,
        json={
            "transaction_date": "2026-11-05",
            "description": "Retainer Revenue",
            "counterparty": "Client A",
            "type": "income",
            "amount": "90000.00",
            "status": "completed",
        },
    )
    client.post(
        f"/api/v1/businesses/{biz_id}/transactions",
        headers=headers,
        json={
            "transaction_date": "2026-11-06",
            "description": "Studio Rent & Ops",
            "counterparty": "Landlord",
            "type": "expense",
            "amount": "40000.00",
            "status": "completed",
        },
    )

    with db_session_factory() as db:
        tx_count_before = db.scalar(
            select(func.count(Transaction.id)).where(Transaction.business_id == biz_id)
        )

    sim_a = client.post(
        f"/api/v1/businesses/{biz_id}/simulations?as_of_date={as_of.isoformat()}",
        headers=headers,
        json={
            "name": "Moderate Growth",
            "sales_change_pct": "20.00",
            "supplier_price_change_pct": "5.00",
            "payment_delay_days": 0,
            "additional_employees": 1,
            "avg_monthly_salary": "15000.00",
            "new_inventory_purchase": "0.00",
            "equipment_purchase": "10000.00",
            "open_new_location": False,
            "new_location_monthly_rent": "0.00",
            "new_location_setup_cost": "0.00",
            "save": True,
        },
    )
    assert sim_a.status_code == 201, sim_a.text
    body_a = sim_a.json()
    assert body_a["data_label"] == "HYPOTHETICAL"
    assert body_a["result"]["data_label"] == "HYPOTHETICAL"
    assert Decimal(body_a["result"]["simulated_monthly_revenue"]) == Decimal("108000.00")

    sim_b = client.post(
        f"/api/v1/businesses/{biz_id}/simulations?as_of_date={as_of.isoformat()}",
        headers=headers,
        json={
            "name": "Aggressive Expansion",
            "sales_change_pct": "-10.00",
            "supplier_price_change_pct": "15.00",
            "payment_delay_days": 30,
            "additional_employees": 4,
            "avg_monthly_salary": "25000.00",
            "new_inventory_purchase": "50000.00",
            "equipment_purchase": "80000.00",
            "open_new_location": True,
            "new_location_monthly_rent": "30000.00",
            "new_location_setup_cost": "100000.00",
            "save": True,
        },
    )
    assert sim_b.status_code == 201
    body_b = sim_b.json()
    assert body_b["result"]["risk_level"] == "Critical"

    # List & Get
    listed = client.get(f"/api/v1/businesses/{biz_id}/simulations", headers=headers)
    assert listed.status_code == 200
    assert listed.json()["total"] == 2

    fetched = client.get(
        f"/api/v1/businesses/{biz_id}/simulations/{body_a['id']}", headers=headers
    )
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "Moderate Growth"

    # Compare
    compared = client.post(
        f"/api/v1/businesses/{biz_id}/simulations/compare",
        headers=headers,
        json={"scenario_ids": [body_a["id"], body_b["id"]]},
    )
    assert compared.status_code == 200
    cmp_json = compared.json()
    assert cmp_json["data_label"] == "HYPOTHETICAL"
    assert cmp_json["best_ending_cash_scenario_id"] == body_a["id"]

    # Confirm zero mutation of actual transactions
    with db_session_factory() as db:
        tx_count_after = db.scalar(
            select(func.count(Transaction.id)).where(Transaction.business_id == biz_id)
        )
        assert tx_count_after == tx_count_before


def test_cross_tenant_isolation_and_viewer_rbac(client: TestClient) -> None:
    owner_a_headers, biz_a = _register_and_create_business(
        client, "ownera@bizpilot.example.com", "Tenant A"
    )
    owner_b_headers, biz_b = _register_and_create_business(
        client, "ownerb@bizpilot.example.com", "Tenant B"
    )

    # Register viewer and invite into Tenant A
    viewer_reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": "viewer@bizpilot.example.com",
            "full_name": "Viewer User",
            "password": "StrongPassword#1",
        },
    )
    assert viewer_reg.status_code == 201
    viewer_headers = {"Authorization": f"Bearer {viewer_reg.json()['access_token']}"}
    add_member = client.post(
        f"/api/v1/businesses/{biz_a}/members",
        headers=owner_a_headers,
        json={"email": "viewer@bizpilot.example.com", "role": "viewer"},
    )
    assert add_member.status_code == 201

    # Save simulation in Tenant A
    sim_a = client.post(
        f"/api/v1/businesses/{biz_a}/simulations",
        headers=owner_a_headers,
        json={"name": "A Only Scenario", "save": True},
    )
    assert sim_a.status_code == 201
    sim_a_id = sim_a.json()["id"]

    # Create overdue invoice in Tenant A so an alert exists
    cust_a = client.post(
        f"/api/v1/businesses/{biz_a}/customers",
        headers=owner_a_headers,
        json={"name": "Late Customer"},
    )
    client.post(
        f"/api/v1/businesses/{biz_a}/invoices",
        headers=owner_a_headers,
        json={
            "customer_id": cust_a.json()["id"],
            "invoice_number": "INV-A-1",
            "issue_date": "2026-09-01",
            "due_date": "2026-09-10",
            "tax_rate": "0.00",
            "line_items": [{"description": "Service", "quantity": "1.000", "unit_price": "5000.00"}],
        },
    )
    alerts_a = client.get(f"/api/v1/businesses/{biz_a}/alerts", headers=owner_a_headers)
    alert_a_id = alerts_a.json()["items"][0]["id"]

    # Viewer can read intelligence & alerts
    assert client.get(f"/api/v1/businesses/{biz_a}/financial-summary", headers=viewer_headers).status_code == 200
    assert client.get(f"/api/v1/businesses/{biz_a}/alerts", headers=viewer_headers).status_code == 200

    # Viewer CANNOT acknowledge alerts or create/save simulations
    assert (
        client.patch(
            f"/api/v1/businesses/{biz_a}/alerts/{alert_a_id}",
            headers=viewer_headers,
            json={"is_acknowledged": True},
        ).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/businesses/{biz_a}/simulations",
            headers=viewer_headers,
            json={"name": "Viewer Sim", "save": True},
        ).status_code
        == 403
    )

    # Tenant B owner CANNOT read Tenant A summary, simulation, or alert
    assert client.get(f"/api/v1/businesses/{biz_a}/financial-summary", headers=owner_b_headers).status_code == 403
    assert client.get(f"/api/v1/businesses/{biz_b}/simulations/{sim_a_id}", headers=owner_b_headers).status_code == 404
    assert (
        client.patch(
            f"/api/v1/businesses/{biz_b}/alerts/{alert_a_id}",
            headers=owner_b_headers,
            json={"is_acknowledged": True},
        ).status_code
        == 404
    )
