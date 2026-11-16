from __future__ import annotations

import json
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

import app.models  # noqa: F401
from app.core.config import Settings, get_settings, normalize_database_url
from app.db.base import Base
from app.db.session import build_engine, get_db
from app.main import create_app
from app.models import Business, Transaction
from app.services import copilot_service
from app.services.copilot_context_service import build_copilot_financial_context
from app.services.demo_seed_service import reset_demo_workspaces_only, seed_demo_workspace


@pytest.fixture(autouse=True)
def _reset_caches():
    copilot_service.reset_copilot_rate_limits()
    get_settings.cache_clear()
    yield
    copilot_service.reset_copilot_rate_limits()
    get_settings.cache_clear()


@pytest.fixture()
def db_session_factory(tmp_path: Path):
    db_file = tmp_path / "checkpoint_h_e2e.db"
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


def test_database_url_normalization_and_production_security_validation() -> None:
    assert normalize_database_url("postgres://user:pass@host:5432/db") == "postgresql+psycopg://user:pass@host:5432/db"
    assert normalize_database_url("postgresql://user:pass@host:5432/db") == "postgresql+psycopg://user:pass@host:5432/db"
    assert normalize_database_url("sqlite:///./local.db") == "sqlite:///./local.db"

    # Rejects default secret in production
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        Settings(
            APP_ENV="production",
            DATABASE_URL="postgresql+psycopg://u:p@db.internal:5432/app",
            CORS_ORIGINS="https://bizpilot.vercel.app",
            JWT_SECRET_KEY="DEV_ONLY_UNSAFE_SECRET_CHANGE_BEFORE_PRODUCTION",
        ).validate_runtime_security()

    # Rejects SQLite in production without explicit override
    with pytest.raises(RuntimeError, match="SQLite"):
        Settings(
            APP_ENV="production",
            DATABASE_URL="sqlite:///./prod.db",
            CORS_ORIGINS="https://bizpilot.vercel.app",
            JWT_SECRET_KEY="A" * 48,
        ).validate_runtime_security()

    # Rejects wildcard CORS in production
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        Settings(
            APP_ENV="production",
            DATABASE_URL="postgresql+psycopg://u:p@db.internal:5432/app",
            CORS_ORIGINS="*",
            JWT_SECRET_KEY="A" * 48,
        ).validate_runtime_security()

    # Accepts valid production settings
    Settings(
        APP_ENV="production",
        DATABASE_URL="postgres://u:p@db.internal:5432/app",
        CORS_ORIGINS="https://bizpilot.vercel.app",
        JWT_SECRET_KEY="X" * 48,
    ).validate_runtime_security()


def test_health_ready_and_security_headers(client: TestClient) -> None:
    health_res = client.get("/api/v1/health")
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "ok"
    assert health_res.headers["X-Content-Type-Options"] == "nosniff"
    assert health_res.headers["X-Frame-Options"] == "DENY"
    assert health_res.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "X-Request-ID" in health_res.headers

    ready_res = client.get("/api/v1/ready", headers={"X-Request-ID": "req-probe-001"})
    assert ready_res.status_code == 200
    body = ready_res.json()
    assert body["ready"] is True
    assert body["security_config_ok"] is True
    assert body["rate_limit_backend"] in {"database", "redis"}
    assert ready_res.headers["X-Request-ID"] == "req-probe-001"


def test_full_end_to_end_reconciliation_and_isolation(
    client: TestClient,
    db_session_factory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-e2e-gemini-key")
    get_settings.cache_clear()

    def _mock_gemini(**_kwargs) -> str:
        return json.dumps(
            {
                "summary": "Reconciled liquidity is strong and inventory restock is reflected in actual cash.",
                "ai_interpretation": "Operating inflows exceed cash expenses while one invoice remains partially open.",
                "confidence": "medium",
                "primary_data_label": "ACTUAL",
                "insufficient_data": False,
                "insufficient_data_reason": None,
                "recommendations": [
                    {
                        "title": "Collect remaining invoice balance",
                        "explanation": "Following up on remaining receivable balance improves liquid reserve.",
                        "supporting_evidence": "Accounts receivable summary in verified ledger context.",
                        "relevant_amount_or_pct": "INR 2800.00",
                        "data_label": "ACTUAL",
                        "confidence": "medium",
                        "potential_impact": "Adds INR 2800.00 to operating cash.",
                        "recommended_next_step": "Record final settlement when received.",
                        "assumptions_and_limitations": "Advisory only.",
                    }
                ],
                "hypothetical_notes": ["Hiring simulation remains strictly hypothetical."],
                "follow_up_questions": ["Should we increase reorder point on rice bags?"],
                "assumptions_and_limitations": ["Decision-support only."],
            }
        )

    monkeypatch.setattr(copilot_service, "_invoke_gemini_api", _mock_gemini)

    # 1. Register Owner + Viewer users
    owner_reg = client.post(
        "/api/v1/auth/register",
        json={"email": "owner.e2e@bizpilot.example.com", "full_name": "E2E Owner", "password": "StrongPassword#1"},
    )
    assert owner_reg.status_code == 201
    owner_token = owner_reg.json()["access_token"]
    owner_headers = {"Authorization": f"Bearer {owner_token}"}

    viewer_reg = client.post(
        "/api/v1/auth/register",
        json={"email": "viewer.e2e@bizpilot.example.com", "full_name": "E2E Viewer", "password": "StrongPassword#1"},
    )
    assert viewer_reg.status_code == 201
    viewer_headers = {"Authorization": f"Bearer {viewer_reg.json()['access_token']}"}

    # 2. Verify /auth/me & Login
    assert client.get("/api/v1/auth/me", headers=owner_headers).status_code == 200
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "owner.e2e@bizpilot.example.com", "password": "StrongPassword#1"},
    )
    assert login_res.status_code == 200
    owner_headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    # 3. Create Business (Opening Cash = 100,000.00)
    biz_res = client.post(
        "/api/v1/businesses",
        headers=owner_headers,
        json={
            "name": "Apex Retail Co",
            "business_type": "Retail",
            "industry": "Consumer Goods",
            "currency": "INR",
            "opening_cash_balance": "100000.00",
            "monthly_fixed_overhead": "12000.00",
        },
    )
    assert biz_res.status_code == 201
    biz_id = biz_res.json()["id"]

    # 4. Invite Viewer and assert RBAC write denial
    invite_res = client.post(
        f"/api/v1/businesses/{biz_id}/members",
        headers=owner_headers,
        json={"email": "viewer.e2e@bizpilot.example.com", "role": "viewer"},
    )
    assert invite_res.status_code == 201
    assert (
        client.post(
            f"/api/v1/businesses/{biz_id}/customers",
            headers=viewer_headers,
            json={"name": "Unauthorized Customer"},
        ).status_code
        == 403
    )

    today = date.today()

    # 5. Create income (+25,000) & expense (-8,000) transactions
    for payload in [
        {
            "transaction_date": (today - timedelta(days=5)).isoformat(),
            "description": "Retail Counter Sales",
            "counterparty": "POS Settlement",
            "type": "income",
            "amount": "25000.00",
            "payment_method": "upi",
            "status": "completed",
        },
        {
            "transaction_date": (today - timedelta(days=3)).isoformat(),
            "description": "Shop Electricity & Fiber",
            "counterparty": "BESCOM Utilities",
            "type": "expense",
            "amount": "8000.00",
            "payment_method": "bank_transfer",
            "status": "completed",
        },
    ]:
        r = client.post(f"/api/v1/businesses/{biz_id}/transactions", headers=owner_headers, json=payload)
        assert r.status_code == 201, r.text

    # 6. Create Customer & Invoice (Subtotal 5,000 + 18% GST = 5,900)
    cust_res = client.post(
        f"/api/v1/businesses/{biz_id}/customers",
        headers=owner_headers,
        json={"name": "Northbridge Tech Park"},
    )
    assert cust_res.status_code == 201
    cust_id = cust_res.json()["id"]

    inv_res = client.post(
        f"/api/v1/businesses/{biz_id}/invoices",
        headers=owner_headers,
        json={
            "customer_id": cust_id,
            "invoice_number": "INV-E2E-001",
            "issue_date": (today - timedelta(days=4)).isoformat(),
            "due_date": (today + timedelta(days=10)).isoformat(),
            "tax_rate": "18.00",
            "status": "pending",
            "line_items": [{"description": "Pantry Bundle", "quantity": "5.000", "unit_price": "1000.00"}],
        },
    )
    assert inv_res.status_code == 201
    inv_id = inv_res.json()["id"]
    assert Decimal(inv_res.json()["total_amount"]) == Decimal("5900.00")

    # 7. Record Partial Payment (3,100.00) with idempotency replay check
    pay_payload = {
        "invoice_id": inv_id,
        "payment_reference": "UTR-E2E-3100",
        "payment_date": (today - timedelta(days=1)).isoformat(),
        "amount": "3100.00",
        "payment_method": "bank_transfer",
    }
    pay_1 = client.post(
        f"/api/v1/businesses/{biz_id}/payments",
        headers={**owner_headers, "Idempotency-Key": "idem-pay-e2e-1"},
        json=pay_payload,
    )
    assert pay_1.status_code == 201
    assert pay_1.json()["invoice_status"] == "partial"
    assert Decimal(pay_1.json()["invoice_remaining_balance"]) == Decimal("2800.00")

    pay_replay = client.post(
        f"/api/v1/businesses/{biz_id}/payments",
        headers={**owner_headers, "Idempotency-Key": "idem-pay-e2e-1"},
        json=pay_payload,
    )
    assert pay_replay.status_code == 200
    assert pay_replay.json()["id"] == pay_1.json()["id"]

    # 8. Create Supplier, Inventory Product & Restock with expense (4 units * 1,500 = 6,000)
    sup_res = client.post(
        f"/api/v1/businesses/{biz_id}/suppliers",
        headers=owner_headers,
        json={"name": "Deccan Wholesalers"},
    )
    assert sup_res.status_code == 201
    sup_id = sup_res.json()["id"]

    prod_res = client.post(
        f"/api/v1/businesses/{biz_id}/inventory/products",
        headers=owner_headers,
        json={
            "preferred_supplier_id": sup_id,
            "sku": "E2E-SKU-1",
            "name": "Filter Coffee Beans 5kg",
            "category": "Beverages",
            "unit": "packs",
            "current_stock": "6.000",
            "reorder_point": "5.000",
            "unit_cost": "1500.00",
            "selling_price": "2200.00",
        },
    )
    assert prod_res.status_code == 201
    prod_id = prod_res.json()["id"]

    restock_res = client.post(
        f"/api/v1/businesses/{biz_id}/inventory/products/{prod_id}/restock",
        headers={**owner_headers, "Idempotency-Key": "idem-restock-e2e-1"},
        json={
            "quantity": "4.000",
            "movement_date": today.isoformat(),
            "unit_cost": "1500.00",
            "payment_method": "bank_transfer",
            "record_expense": True,
        },
    )
    assert restock_res.status_code == 201
    assert Decimal(restock_res.json()["resulting_stock"]) == Decimal("10.000")

    # Exact Ledger Math Verification:
    # Opening Cash: 100,000.00
    # Inflows: 25,000.00 (POS) + 3,100.00 (Partial Invoice Payment) = 28,100.00
    # Outflows: 8,000.00 (Utilities) + 6,000.00 (Restock) = 14,000.00
    # Expected Available Cash = 100,000 + 28,100 - 14,000 = 114,100.00
    # Expected Net Cash Flow = 28,100 - 14,000 = 14,100.00
    # Expected Receivables = 5,900.00 - 3,100.00 = 2,800.00
    # Expected Inventory Value = 10 * 1,500.00 = 15,000.00
    summary = client.get(f"/api/v1/businesses/{biz_id}/financial-summary?preset=30d", headers=owner_headers).json()
    twin = client.get(f"/api/v1/businesses/{biz_id}/financial-twin", headers=owner_headers).json()
    forecast = client.get(f"/api/v1/businesses/{biz_id}/cash-flow-forecast", headers=owner_headers).json()
    health = client.get(f"/api/v1/businesses/{biz_id}/financial-health", headers=owner_headers).json()
    alerts = client.get(f"/api/v1/businesses/{biz_id}/alerts", headers=owner_headers).json()

    assert Decimal(summary["kpis"]["total_revenue"]) == Decimal("28100.00")
    assert Decimal(summary["kpis"]["total_expenses"]) == Decimal("14000.00")
    assert Decimal(summary["kpis"]["net_profit"]) == Decimal("14100.00")
    assert Decimal(summary["kpis"]["available_cash"]) == Decimal("114100.00")
    assert Decimal(summary["kpis"]["accounts_receivable"]) == Decimal("2800.00")
    assert Decimal(summary["kpis"]["inventory_valuation"]) == Decimal("15000.00")

    # Cross-module reconciliation: Summary == Twin == Forecast starting cash
    assert Decimal(twin["assets"]["available_cash"]) == Decimal(summary["kpis"]["available_cash"])
    assert Decimal(twin["assets"]["accounts_receivable"]) == Decimal(summary["kpis"]["accounts_receivable"])
    assert Decimal(twin["assets"]["inventory_valuation"]) == Decimal(summary["kpis"]["inventory_valuation"])
    assert Decimal(forecast["horizons"]["7d"]["starting_cash_balance"]) == Decimal(summary["kpis"]["available_cash"])
    assert Decimal(forecast["horizons"]["30d"]["starting_cash_balance"]) == Decimal(summary["kpis"]["available_cash"])
    assert Decimal(forecast["horizons"]["90d"]["starting_cash_balance"]) == Decimal(summary["kpis"]["available_cash"])
    assert 0 <= health["overall_score"] <= 100
    assert alerts["total"] >= 0

    # 9. What-If Simulation remains HYPOTHETICAL and does not mutate ledger
    sim_res = client.post(
        f"/api/v1/businesses/{biz_id}/simulations",
        headers=owner_headers,
        json={
            "name": "Expand Headcount",
            "sales_change_pct": "10.00",
            "additional_employees": 1,
            "avg_monthly_salary": "25000.00",
            "save": True,
        },
    )
    assert sim_res.status_code == 201
    assert sim_res.json()["data_label"] == "HYPOTHETICAL"

    summary_after_sim = client.get(f"/api/v1/businesses/{biz_id}/financial-summary?preset=30d", headers=owner_headers).json()
    assert Decimal(summary_after_sim["kpis"]["available_cash"]) == Decimal("114100.00")

    # 10. Copilot context & chat match Decimal facts strictly
    with db_session_factory() as db:
        biz_obj = db.get(Business, biz_id)
        assert biz_obj is not None
        ctx = build_copilot_financial_context(db, biz_obj, preset="30d")
        assert Decimal(ctx.context_payload["actual_metrics"]["available_cash"]) == Decimal("114100.00")

    chat_res = client.post(
        f"/api/v1/businesses/{biz_id}/copilot/chat",
        headers=owner_headers,
        json={"question": "How is our cash liquidity after the restock?"},
    )
    assert chat_res.status_code == 200
    assert chat_res.json()["structured"]["model_used"] == "gemini-4-hydrogen"

    # 11. Logout-all revokes existing JWT tokens
    assert client.post("/api/v1/auth/logout-all", headers=owner_headers).status_code == 200
    assert client.get("/api/v1/auth/me", headers=owner_headers).status_code == 401


def test_demo_seeder_and_reset_never_touch_real_businesses(db_session_factory) -> None:
    with db_session_factory() as db:
        real_biz = Business(
            name="Real Production Tenant",
            business_type="Service",
            industry="Software",
            currency="USD",
            country="United States",
            business_size="Small (6-20)",
            opening_cash_balance=Decimal("50000.00"),
            monthly_fixed_overhead=Decimal("8000.00"),
            is_demo_data=False,
        )
        db.add(real_biz)
        db.flush()
        db.add(
            Transaction(
                business_id=real_biz.id,
                transaction_date=date.today(),
                description="Real Customer Payment",
                counterparty="Acme Corp",
                type="income",
                amount=Decimal("12500.00"),
                payment_method="bank_transfer",
                status="completed",
                source_type="manual",
                is_demo_data=False,
            )
        )
        db.commit()
        real_biz_id = real_biz.id

        # Seed demo workspace
        seeded = seed_demo_workspace(db, reset_existing=False)
        assert seeded["status"] == "seeded"
        assert len(seeded["business_ids"]) == 2

        # Re-seed with reset_existing=True
        reseeded = seed_demo_workspace(db, reset_existing=True)
        assert reseeded["status"] == "seeded"
        assert reseeded["deleted_demo_businesses"] == 2

        # Reset demo only
        deleted = reset_demo_workspaces_only(db)
        assert deleted == 2

        # Real business & its transaction are 100% preserved
        preserved_biz = db.get(Business, real_biz_id)
        assert preserved_biz is not None
        assert preserved_biz.name == "Real Production Tenant"
        preserved_txs = list(
            db.scalars(select(Transaction).where(Transaction.business_id == real_biz_id)).all()
        )
        assert len(preserved_txs) == 1
        assert preserved_txs[0].amount == Decimal("12500.00")
