from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
import json
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

import app.models  # noqa: F401
from app.core.config import get_settings
from app.core.security import create_access_token
from app.db.base import Base
from app.db.session import build_engine, get_db
from app.main import create_app
from app.models import (
    AuditLog,
    Business,
    BusinessMembership,
    Customer,
    Invoice,
    InvoiceStatus,
    MembershipRole,
    Payment,
    PaymentMethod,
    Transaction,
    TransactionCategory,
    TransactionType,
    User,
)

BACKEND_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture()
def db_session_factory(tmp_path: Path):
    db_file = tmp_path / "checkpoint_d_test.db"
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


def _register_and_auth(
    client: TestClient, email: str, full_name: str, password: str = "StrongPass123!"
) -> tuple[dict[str, str], dict]:
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": email, "full_name": full_name, "password": password},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    headers = {"Authorization": f"Bearer {body['access_token']}"}
    return headers, body


def test_alembic_upgrades_and_downgrades_cleanly_on_sqlite(tmp_path: Path, monkeypatch) -> None:
    db_file = tmp_path / "alembic_upgrade.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_file}")
    get_settings.cache_clear()

    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "20261115_0001")
    command.upgrade(cfg, "head")

    get_settings.cache_clear()


def test_registration_login_and_current_user(client: TestClient, db_session_factory) -> None:
    headers, reg_body = _register_and_auth(client, "Ananya@Kaveri.in", "Ananya Deshmukh", "SecretPass#99")
    assert reg_body["user"]["email"] == "ananya@kaveri.in"
    assert reg_body["token_type"] == "bearer"

    # Password is never stored in plaintext
    with db_session_factory() as db:
        user = db.scalar(select(User).where(User.email == "ananya@kaveri.in"))
        assert user is not None
        assert user.hashed_password != "SecretPass#99"
        assert user.hashed_password.startswith("$2")

    # Duplicate email rejected
    dup_resp = client.post(
        "/api/v1/auth/register",
        json={"email": "ananya@kaveri.in", "full_name": "Duplicate", "password": "SecretPass#99"},
    )
    assert dup_resp.status_code == 409

    # Invalid email rejected
    bad_email = client.post(
        "/api/v1/auth/register",
        json={"email": "not-an-email", "full_name": "Bad Email", "password": "SecretPass#99"},
    )
    assert bad_email.status_code == 422

    # Login succeeds
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "ANANYA@kaveri.in", "password": "SecretPass#99"},
    )
    assert login_resp.status_code == 200
    assert login_resp.json()["user"]["id"] == reg_body["user"]["id"]

    # /auth/me returns authenticated user
    me_resp = client.get("/api/v1/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "ananya@kaveri.in"


def test_invalid_credentials_jwt_validation_and_logout_invalidation(
    client: TestClient,
) -> None:
    headers, body = _register_and_auth(client, "rohan@bizpilot.example.com", "Rohan Kulkarni", "ValidPass123!")
    user_id = body["user"]["id"]

    # Wrong password -> 401
    bad_login = client.post(
        "/api/v1/auth/login",
        json={"email": "rohan@bizpilot.example.com", "password": "WrongPassword!"},
    )
    assert bad_login.status_code == 401

    # Missing/malformed JWT -> 401
    assert client.get("/api/v1/auth/me").status_code == 401
    assert (
        client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.jwt.token"}).status_code
        == 401
    )

    # Expired JWT -> 401
    expired_token, _jti, _exp = create_access_token(user_id=user_id, expires_minutes=-5)
    assert (
        client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired_token}"}).status_code
        == 401
    )

    # Single-session logout revokes current token jti
    logout_resp = client.post("/api/v1/auth/logout", headers=headers)
    assert logout_resp.status_code == 200
    assert logout_resp.json()["revoked"] is True
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401

    # Re-login and test logout-all token_version invalidation
    login2 = client.post(
        "/api/v1/auth/login",
        json={"email": "rohan@bizpilot.example.com", "password": "ValidPass123!"},
    )
    assert login2.status_code == 200
    headers2 = {"Authorization": f"Bearer {login2.json()['access_token']}"}
    assert client.post("/api/v1/auth/logout-all", headers=headers2).status_code == 200
    assert client.get("/api/v1/auth/me", headers=headers2).status_code == 401


def test_inactive_user_rejected_on_login_and_existing_token(
    client: TestClient, db_session_factory
) -> None:
    headers, body = _register_and_auth(client, "inactive@bizpilot.example.com", "Inactive User")
    user_id = body["user"]["id"]

    with db_session_factory() as db:
        user = db.get(User, user_id)
        assert user is not None
        user.is_active = False
        db.commit()

    # Existing token must be rejected
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 403

    # Login must be rejected
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "inactive@bizpilot.example.com", "password": "StrongPass123!"},
    )
    assert login_resp.status_code == 403


def test_all_four_roles_rbac_and_last_owner_protection(client: TestClient) -> None:
    owner_h, owner_body = _register_and_auth(client, "owner@rbac.example.com", "Owner User")
    admin_h, _ = _register_and_auth(client, "admin@rbac.example.com", "Admin User")
    manager_h, _ = _register_and_auth(client, "manager@rbac.example.com", "Manager User")
    viewer_h, _ = _register_and_auth(client, "viewer@rbac.example.com", "Viewer User")

    biz_resp = client.post(
        "/api/v1/businesses",
        headers=owner_h,
        json={
            "name": "RBAC Spice Co",
            "business_type": "Retail",
            "industry": "Food & Beverage",
            "currency": "INR",
            "opening_cash_balance": "500000.00",
        },
    )
    assert biz_resp.status_code == 201
    biz_id = biz_resp.json()["id"]
    assert biz_resp.json()["current_user_role"] == "owner"

    # Owner adds Admin, Manager, Viewer
    add_admin = client.post(
        f"/api/v1/businesses/{biz_id}/members",
        headers=owner_h,
        json={"email": "admin@rbac.example.com", "role": "admin"},
    )
    add_manager = client.post(
        f"/api/v1/businesses/{biz_id}/members",
        headers=owner_h,
        json={"email": "manager@rbac.example.com", "role": "manager"},
    )
    add_viewer = client.post(
        f"/api/v1/businesses/{biz_id}/members",
        headers=owner_h,
        json={"email": "viewer@rbac.example.com", "role": "viewer"},
    )
    assert add_admin.status_code == 201
    assert add_manager.status_code == 201
    assert add_viewer.status_code == 201

    admin_mid = add_admin.json()["id"]
    manager_mid = add_manager.json()["id"]
    viewer_mid = add_viewer.json()["id"]

    # Fetch owner's membership_id
    members_list = client.get(f"/api/v1/businesses/{biz_id}/members", headers=owner_h).json()
    owner_mid = next(m["id"] for m in members_list if m["user_id"] == owner_body["user"]["id"])

    # Viewer: read-only
    assert client.get(f"/api/v1/businesses/{biz_id}", headers=viewer_h).status_code == 200
    assert client.get(f"/api/v1/businesses/{biz_id}/members", headers=viewer_h).status_code == 200
    assert (
        client.patch(f"/api/v1/businesses/{biz_id}", headers=viewer_h, json={"name": "Hacked"}).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/v1/businesses/{biz_id}/members",
            headers=viewer_h,
            json={"email": "someone@rbac.example.com", "role": "viewer"},
        ).status_code
        == 403
    )
    assert client.get(f"/api/v1/businesses/{biz_id}/audit-logs", headers=viewer_h).status_code == 403

    # Manager: cannot edit business settings, cannot manage memberships, cannot view audit logs
    assert client.get(f"/api/v1/businesses/{biz_id}", headers=manager_h).status_code == 200
    assert (
        client.patch(f"/api/v1/businesses/{biz_id}", headers=manager_h, json={"name": "Nope"}).status_code
        == 403
    )
    assert (
        client.patch(
            f"/api/v1/businesses/{biz_id}/members/{viewer_mid}",
            headers=manager_h,
            json={"role": "admin"},
        ).status_code
        == 403
    )
    assert client.delete(f"/api/v1/businesses/{biz_id}/members/{viewer_mid}", headers=manager_h).status_code == 403
    assert client.get(f"/api/v1/businesses/{biz_id}/audit-logs", headers=manager_h).status_code == 403

    # Admin: can update business and non-owner roles, read audit logs; CANNOT touch or assign Owner
    assert (
        client.patch(
            f"/api/v1/businesses/{biz_id}",
            headers=admin_h,
            json={"name": "RBAC Spice Co Updated"},
        ).status_code
        == 200
    )
    assert client.get(f"/api/v1/businesses/{biz_id}/audit-logs", headers=admin_h).status_code == 200
    assert (
        client.patch(
            f"/api/v1/businesses/{biz_id}/members/{viewer_mid}",
            headers=admin_h,
            json={"role": "manager"},
        ).status_code
        == 200
    )
    # Admin cannot promote anyone to owner or demote/remove existing owner
    assert (
        client.patch(
            f"/api/v1/businesses/{biz_id}/members/{manager_mid}",
            headers=admin_h,
            json={"role": "owner"},
        ).status_code
        == 403
    )
    assert (
        client.patch(
            f"/api/v1/businesses/{biz_id}/members/{owner_mid}",
            headers=admin_h,
            json={"role": "viewer"},
        ).status_code
        == 403
    )
    assert client.delete(f"/api/v1/businesses/{biz_id}/members/{owner_mid}", headers=admin_h).status_code == 403

    # Last-owner protection (even Owner cannot demote or remove last owner)
    assert (
        client.patch(
            f"/api/v1/businesses/{biz_id}/members/{owner_mid}",
            headers=owner_h,
            json={"role": "admin"},
        ).status_code
        == 400
    )
    assert client.delete(f"/api/v1/businesses/{biz_id}/members/{owner_mid}", headers=owner_h).status_code == 400

    # Owner promotes Admin -> second Owner; now first Owner can step down cleanly
    promote_resp = client.patch(
        f"/api/v1/businesses/{biz_id}/members/{admin_mid}",
        headers=owner_h,
        json={"role": "owner"},
    )
    assert promote_resp.status_code == 200
    demote_first = client.patch(
        f"/api/v1/businesses/{biz_id}/members/{owner_mid}",
        headers=owner_h,
        json={"role": "admin"},
    )
    assert demote_first.status_code == 200

    # New sole owner is protected
    assert client.delete(f"/api/v1/businesses/{biz_id}/members/{admin_mid}", headers=admin_h).status_code == 400


def test_unauthorized_access_business_switching_and_cross_tenant_isolation(
    client: TestClient, db_session_factory
) -> None:
    alice_h, _ = _register_and_auth(client, "alice@tenant.example.com", "Alice")
    bob_h, _ = _register_and_auth(client, "bob@tenant.example.com", "Bob")

    biz_a1 = client.post(
        "/api/v1/businesses",
        headers=alice_h,
        json={"name": "Alice Retail", "business_type": "Retail", "industry": "Apparel"},
    ).json()
    biz_a2 = client.post(
        "/api/v1/businesses",
        headers=alice_h,
        json={"name": "Alice Foods", "business_type": "Restaurant", "industry": "Dining"},
    ).json()
    biz_b = client.post(
        "/api/v1/businesses",
        headers=bob_h,
        json={"name": "Bob Logistics", "business_type": "Service Business", "industry": "Logistics"},
    ).json()

    # Listing businesses isolates strictly to member businesses
    alice_list = client.get("/api/v1/businesses", headers=alice_h).json()
    assert {b["id"] for b in alice_list} == {biz_a1["id"], biz_a2["id"]}
    bob_list = client.get("/api/v1/businesses", headers=bob_h).json()
    assert {b["id"] for b in bob_list} == {biz_b["id"]}

    # Alice can switch between her two businesses; Bob cannot access or switch to Alice's
    assert client.post(f"/api/v1/businesses/{biz_a2['id']}/switch", headers=alice_h).status_code == 200
    assert client.post(f"/api/v1/businesses/{biz_a1['id']}/switch", headers=bob_h).status_code == 403
    assert client.get(f"/api/v1/businesses/{biz_a1['id']}", headers=bob_h).status_code == 403
    assert client.get(f"/api/v1/businesses/{biz_a1['id']}/members", headers=bob_h).status_code == 403

    # Cross-tenant membership ID manipulation must return 404 and leave Bob's membership untouched
    bob_members = client.get(f"/api/v1/businesses/{biz_b['id']}/members", headers=bob_h).json()
    bob_membership_id = bob_members[0]["id"]
    assert (
        client.patch(
            f"/api/v1/businesses/{biz_a1['id']}/members/{bob_membership_id}",
            headers=alice_h,
            json={"role": "viewer"},
        ).status_code
        == 404
    )
    assert (
        client.delete(
            f"/api/v1/businesses/{biz_a1['id']}/members/{bob_membership_id}",
            headers=alice_h,
        ).status_code
        == 404
    )

    # DB-level composite foreign-key isolation blocks cross-tenant FK links
    with db_session_factory() as db:
        cat_b = db.scalar(
            select(TransactionCategory).where(TransactionCategory.business_id == biz_b["id"])
        )
        assert cat_b is not None

        bad_tx = Transaction(
            business_id=biz_a1["id"],
            category_id=cat_b.id,
            transaction_date=date(2026, 11, 15),
            description="Cross-tenant category attempt",
            counterparty="Test",
            type=TransactionType.EXPENSE,
            amount=Decimal("100.00"),
            payment_method=PaymentMethod.UPI,
        )
        db.add(bad_tx)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        cust_b = Customer(business_id=biz_b["id"], name="Bob Customer")
        db.add(cust_b)
        db.commit()
        db.refresh(cust_b)

        bad_inv = Invoice(
            business_id=biz_a1["id"],
            customer_id=cust_b.id,
            invoice_number="INV-XT-001",
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 15),
            subtotal=Decimal("500.00"),
            tax_amount=Decimal("0.00"),
            total_amount=Decimal("500.00"),
            status=InvoiceStatus.PENDING,
        )
        db.add(bad_inv)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        inv_b = Invoice(
            business_id=biz_b["id"],
            customer_id=cust_b.id,
            invoice_number="INV-B-001",
            issue_date=date(2026, 11, 1),
            due_date=date(2026, 11, 15),
            subtotal=Decimal("500.00"),
            tax_amount=Decimal("0.00"),
            total_amount=Decimal("500.00"),
            status=InvoiceStatus.PENDING,
        )
        db.add(inv_b)
        db.flush()

        bad_payment = Payment(
            business_id=biz_a1["id"],
            invoice_id=inv_b.id,
            customer_id=cust_b.id,
            payment_reference="PAY-XT-1",
            payment_date=date(2026, 11, 12),
            amount=Decimal("100.00"),
            payment_method=PaymentMethod.BANK_TRANSFER,
        )
        db.add(bad_payment)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_audit_events_recorded_without_sensitive_secrets(
    client: TestClient, db_session_factory
) -> None:
    secret_pwd = "SuperSecretPwd#2026"
    owner_h, _ = _register_and_auth(client, "auditor@bizpilot.example.com", "Audit Owner", secret_pwd)
    _register_and_auth(client, "member@bizpilot.example.com", "Member User", "AnotherPass#2026")

    # Trigger failed login & successful login
    client.post(
        "/api/v1/auth/login",
        json={"email": "auditor@bizpilot.example.com", "password": "WrongPassword!"},
    )
    client.post(
        "/api/v1/auth/login",
        json={"email": "auditor@bizpilot.example.com", "password": secret_pwd},
    )

    biz = client.post(
        "/api/v1/businesses",
        headers=owner_h,
        json={"name": "Audit Co", "business_type": "Startup", "industry": "SaaS"},
    ).json()
    biz_id = biz["id"]

    client.post(f"/api/v1/businesses/{biz_id}/switch", headers=owner_h)
    add_res = client.post(
        f"/api/v1/businesses/{biz_id}/members",
        headers=owner_h,
        json={"email": "member@bizpilot.example.com", "role": "viewer"},
    ).json()
    client.patch(
        f"/api/v1/businesses/{biz_id}/members/{add_res['id']}",
        headers=owner_h,
        json={"role": "manager"},
    )
    client.delete(f"/api/v1/businesses/{biz_id}/members/{add_res['id']}", headers=owner_h)
    client.post("/api/v1/auth/logout", headers=owner_h)

    with db_session_factory() as db:
        all_logs = db.scalars(select(AuditLog)).all()
        actions = {log.action for log in all_logs}
        expected_actions = {
            "auth.register",
            "auth.login_failed",
            "auth.login_success",
            "auth.logout",
            "business.create",
            "business.switch",
            "membership.add",
            "membership.role_update",
            "membership.remove",
        }
        assert expected_actions.issubset(actions)

        serialized = json.dumps([log.details for log in all_logs])
        assert secret_pwd not in serialized
        assert "AnotherPass#2026" not in serialized
        assert "WrongPassword!" not in serialized
        assert get_settings().JWT_SECRET_KEY not in serialized
