from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog

SENSITIVE_AUDIT_KEYS = frozenset(
    {
        "password",
        "plain_password",
        "hashed_password",
        "token",
        "access_token",
        "refresh_token",
        "secret",
        "jwt_secret",
        "jwt_secret_key",
        "authorization",
        "api_key",
        "gemini_api_key",
    }
)


def sanitize_audit_details(details: dict[str, Any] | None) -> dict[str, Any] | None:
    """Recursively redact sensitive credential keys before persisting audit details."""
    if details is None:
        return None

    def _scrub(value: Any) -> Any:
        if isinstance(value, dict):
            cleaned: dict[str, Any] = {}
            for key, item in value.items():
                key_lower = str(key).lower()
                if (
                    key_lower in SENSITIVE_AUDIT_KEYS
                    or "password" in key_lower
                    or "secret" in key_lower
                    or "api_key" in key_lower
                ):
                    cleaned[str(key)] = "[REDACTED]"
                else:
                    cleaned[str(key)] = _scrub(item)
            return cleaned
        if isinstance(value, list):
            return [_scrub(entry) for entry in value]
        return value

    return _scrub(details)


def record_audit_event(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    user_id: str | None = None,
    business_id: str | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
    commit: bool = False,
) -> AuditLog:
    """Create an AuditLog entry with sanitized metadata."""
    entry = AuditLog(
        business_id=business_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=sanitize_audit_details(details),
        ip_address=ip_address,
    )
    db.add(entry)
    if commit:
        db.commit()
        db.refresh(entry)
    return entry
