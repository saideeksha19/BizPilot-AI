from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.config import get_settings
from app.db.session import check_database_health

router = APIRouter(tags=["Health"])


class HealthDatabaseInfo(BaseModel):
    connected: bool
    dialect: str
    status: str


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    environment: str
    timestamp: str
    database: HealthDatabaseInfo


class ReadyResponse(BaseModel):
    ready: bool
    status: str
    service: str
    version: str
    environment: str
    timestamp: str
    database: HealthDatabaseInfo
    security_config_ok: bool
    gemini_configured: bool
    rate_limit_backend: str


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service and database health check",
)
def health_check() -> JSONResponse | HealthResponse:
    """Return service metadata and live database connectivity status."""
    settings = get_settings()
    db_info = check_database_health()
    is_healthy = bool(db_info["connected"])

    payload = HealthResponse(
        status="ok" if is_healthy else "degraded",
        service=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
        timestamp=datetime.now(timezone.utc).isoformat(),
        database=HealthDatabaseInfo(
            connected=is_healthy,
            dialect=str(db_info["dialect"]),
            status=str(db_info["status"]),
        ),
    )

    if not is_healthy:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=payload.model_dump(),
        )
    return payload


@router.get(
    "/ready",
    response_model=ReadyResponse,
    summary="Production readiness probe (database, security config, and backend integrations)",
)
def readiness_check() -> JSONResponse | ReadyResponse:
    """Verify database connectivity and runtime security configuration before serving traffic."""
    settings = get_settings()
    db_info = check_database_health()
    db_ok = bool(db_info["connected"])

    security_ok = True
    try:
        settings.validate_runtime_security()
    except RuntimeError:
        security_ok = False

    is_ready = db_ok and security_ok
    payload = ReadyResponse(
        ready=is_ready,
        status="ready" if is_ready else "not_ready",
        service=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.APP_ENV,
        timestamp=datetime.now(timezone.utc).isoformat(),
        database=HealthDatabaseInfo(
            connected=db_ok,
            dialect=str(db_info["dialect"]),
            status=str(db_info["status"]),
        ),
        security_config_ok=security_ok,
        gemini_configured=settings.is_gemini_configured,
        rate_limit_backend="redis" if settings.REDIS_URL else "database",
    )

    if not is_ready:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=payload.model_dump(),
        )
    return payload
