from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_client_ip, get_current_token_payload, get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models import RevokedToken, User
from app.schemas.auth import (
    LoginRequest,
    LogoutResponse,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.services.audit_service import record_audit_event

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
def register_user(
    payload: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        is_active=True,
        token_version=0,
    )
    db.add(user)
    db.flush()

    record_audit_event(
        db,
        action="auth.register",
        entity_type="user",
        entity_id=user.id,
        user_id=user.id,
        details={"email": user.email},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(user)

    settings = get_settings()
    token, _jti, _exp = create_access_token(user.id, token_version=user.token_version)
    return TokenResponse(
        access_token=token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate with email and password",
)
def login_user(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenResponse:
    client_ip = get_client_ip(request)
    user = db.scalar(select(User).where(User.email == payload.email))

    if user is None or not verify_password(payload.password, user.hashed_password):
        record_audit_event(
            db,
            action="auth.login_failed",
            entity_type="user",
            entity_id=user.id if user is not None else "unknown",
            user_id=user.id if user is not None else None,
            details={"email": payload.email, "reason": "invalid_credentials"},
            ip_address=client_ip,
            commit=True,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user.is_active:
        record_audit_event(
            db,
            action="auth.login_failed",
            entity_type="user",
            entity_id=user.id,
            user_id=user.id,
            details={"email": user.email, "reason": "inactive_user"},
            ip_address=client_ip,
            commit=True,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive.",
        )

    record_audit_event(
        db,
        action="auth.login_success",
        entity_type="user",
        entity_id=user.id,
        user_id=user.id,
        details={"email": user.email},
        ip_address=client_ip,
        commit=True,
    )

    settings = get_settings()
    token, _jti, _exp = create_access_token(user.id, token_version=user.token_version)
    return TokenResponse(
        access_token=token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserResponse,
    status_code=status.HTTP_200_OK,
    summary="Return the currently authenticated user",
)
def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.post(
    "/logout",
    response_model=LogoutResponse,
    status_code=status.HTTP_200_OK,
    summary="Revoke the current JWT access token",
)
def logout_current_session(
    request: Request,
    current_user: User = Depends(get_current_user),
    token_payload: dict[str, Any] = Depends(get_current_token_payload),
    db: Session = Depends(get_db),
) -> LogoutResponse:
    jti = token_payload["jti"]
    exp_ts = int(token_payload["exp"])
    expires_at = datetime.fromtimestamp(exp_ts, tz=timezone.utc)

    existing = db.scalar(select(RevokedToken).where(RevokedToken.jti == jti))
    if existing is None:
        db.add(
            RevokedToken(
                jti=jti,
                user_id=current_user.id,
                expires_at=expires_at,
            )
        )

    record_audit_event(
        db,
        action="auth.logout",
        entity_type="user",
        entity_id=current_user.id,
        user_id=current_user.id,
        details={"jti": jti},
        ip_address=get_client_ip(request),
    )
    db.commit()
    return LogoutResponse(detail="Successfully logged out.", revoked=True)


@router.post(
    "/logout-all",
    response_model=LogoutResponse,
    status_code=status.HTTP_200_OK,
    summary="Invalidate all active JWT access tokens for the current user",
)
def logout_all_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LogoutResponse:
    current_user.token_version += 1
    record_audit_event(
        db,
        action="auth.logout_all",
        entity_type="user",
        entity_id=current_user.id,
        user_id=current_user.id,
        details={"token_version": current_user.token_version},
        ip_address=get_client_ip(request),
    )
    db.commit()
    return LogoutResponse(detail="All active sessions have been revoked.", revoked=True)
