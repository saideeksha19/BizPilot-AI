from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
import uuid

import bcrypt
import jwt
from jwt import InvalidTokenError

from app.core.config import get_settings


class TokenVerificationError(Exception):
    """Raised when a JWT access token fails signature, expiry, or claim validation."""


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password using bcrypt with a random per-password salt."""
    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > 72:
        raise ValueError("Password exceeds the 72-byte maximum length supported by bcrypt.")
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash."""
    if not plain_password or not hashed_password:
        return False
    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > 72:
        return False
    try:
        return bcrypt.checkpw(password_bytes, hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(
    user_id: str,
    token_version: int = 0,
    expires_minutes: int | None = None,
) -> tuple[str, str, datetime]:
    """Generate a signed HS256 JWT access token along with its jti and expiration timestamp."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    ttl_minutes = (
        expires_minutes if expires_minutes is not None else settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    expires_at = now + timedelta(minutes=ttl_minutes)
    jti = str(uuid.uuid4())

    payload: dict[str, Any] = {
        "sub": user_id,
        "jti": jti,
        "tv": token_version,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    encoded = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded, jti, expires_at


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT access token."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["sub", "jti", "exp", "iat", "tv", "type"]},
        )
    except InvalidTokenError as exc:
        raise TokenVerificationError("Invalid or expired access token.") from exc

    if payload.get("type") != "access":
        raise TokenVerificationError("Invalid token type.")
    if not isinstance(payload.get("sub"), str) or not payload["sub"].strip():
        raise TokenVerificationError("Token subject missing.")
    if not isinstance(payload.get("jti"), str) or not payload["jti"].strip():
        raise TokenVerificationError("Token identifier missing.")
    if not isinstance(payload.get("tv"), int):
        raise TokenVerificationError("Token version claim invalid.")

    return payload
