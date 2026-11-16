from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, TypeVar

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import Permission, has_permission
from app.core.security import TokenVerificationError, decode_access_token
from app.db.session import get_db
from app.models import Business, BusinessMembership, RevokedToken, User

ModelT = TypeVar("ModelT")

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class TenantContext:
    """Verified authenticated user, target business, and active membership."""

    user: User
    business: Business
    membership: BusinessMembership


def get_client_ip(request: Request) -> str | None:
    """Extract client IP address safely for audit logging."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        first_ip = forwarded.split(",")[0].strip()
        if first_ip:
            return first_ip[:64]
    if request.client and request.client.host:
        return request.client.host[:64]
    return None


def get_current_token_payload(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    """Decode Bearer JWT token from Authorization header."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided.",
        )
    try:
        return decode_access_token(credentials.credentials)
    except TokenVerificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc


def get_current_user(
    db: Session = Depends(get_db),
    payload: dict[str, Any] = Depends(get_current_token_payload),
) -> User:
    """Resolve and validate the currently authenticated active user."""
    user_id = payload["sub"]
    jti = payload["jti"]
    token_version = payload["tv"]

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found for token.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )

    if user.token_version != token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has been invalidated.",
        )

    revoked = db.scalar(select(RevokedToken.id).where(RevokedToken.jti == jti))
    if revoked is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has been revoked.",
        )

    return user


def get_business_context(
    business_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantContext:
    """Verify active business membership for the requested business_id."""
    stmt = (
        select(BusinessMembership, Business)
        .join(Business, Business.id == BusinessMembership.business_id)
        .where(
            BusinessMembership.business_id == business_id,
            BusinessMembership.user_id == current_user.id,
            BusinessMembership.is_active.is_(True),
        )
    )
    row = db.execute(stmt).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this business workspace.",
        )

    membership, business = row
    return TenantContext(user=current_user, business=business, membership=membership)


def require_business_permission(permission: Permission) -> Callable[..., TenantContext]:
    """Dependency factory enforcing both business membership and RBAC permission."""

    def _dependency(ctx: TenantContext = Depends(get_business_context)) -> TenantContext:
        if not has_permission(ctx.membership.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{ctx.membership.role.value}' lacks permission '{permission.value}'.",
            )
        return ctx

    return _dependency


def get_tenant_record_or_404(
    db: Session,
    model: type[ModelT],
    record_id: str,
    business_id: str,
    entity_label: str = "Record",
) -> ModelT:
    """Fetch a business-owned record strictly scoped by (id, business_id)."""
    stmt = select(model).where(
        getattr(model, "id") == record_id,
        getattr(model, "business_id") == business_id,
    )
    record = db.scalar(stmt)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{entity_label} not found in this business workspace.",
        )
    return record
