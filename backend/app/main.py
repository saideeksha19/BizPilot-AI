from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.auth import router as auth_router
from app.api.businesses import router as businesses_router
from app.api.categories import router as categories_router
from app.api.copilot import router as copilot_router
from app.api.health import router as health_router
from app.api.intelligence import router as intelligence_router
from app.api.inventory import router as inventory_router
from app.api.invoices import router as invoices_router
from app.api.parties import router as parties_router
from app.api.payments import router as payments_router
from app.api.transactions import router as transactions_router
from app.core.config import get_settings
from app.db.session import engine

logger = logging.getLogger("bizpilot.backend")


def _configure_logging(level_name: str) -> None:
    level = getattr(logging, level_name.upper(), logging.INFO)
    root_logger = logging.getLogger()
    if not root_logger.handlers:
        logging.basicConfig(
            level=level,
            format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        )
    else:
        root_logger.setLevel(level)
    logger.setLevel(level)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup and shutdown lifecycle hooks."""
    settings = get_settings()
    _configure_logging(settings.LOG_LEVEL)
    settings.validate_runtime_security()
    logger.info(
        "Starting %s v%s (env=%s, dialect=%s, gemini=%s)",
        settings.APP_NAME,
        settings.APP_VERSION,
        settings.APP_ENV,
        engine.dialect.name,
        settings.is_gemini_configured,
    )
    yield
    engine.dispose()
    logger.info("Disposed SQLAlchemy engine and shut down %s", settings.APP_NAME)


def create_app() -> FastAPI:
    """Construct and configure the FastAPI application instance."""
    settings = get_settings()
    _configure_logging(settings.LOG_LEVEL)

    application = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="Backend financial engine and multi-tenant API for BizPilot AI.",
        docs_url="/api/docs" if settings.APP_ENV != "production" else None,
        redoc_url="/api/redoc" if settings.APP_ENV != "production" else None,
        openapi_url="/api/openapi.json" if settings.APP_ENV != "production" else None,
        lifespan=lifespan,
    )

    # Trusted hosts protection when explicitly restricted in production
    trusted_hosts = settings.trusted_hosts_list
    if trusted_hosts and "*" not in trusted_hosts:
        application.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)

    # Environment-driven CORS configuration
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.middleware("http")
    async def request_context_and_security_headers(request: Request, call_next):
        incoming_id = request.headers.get("X-Request-ID", "").strip()
        request_id = (
            incoming_id
            if incoming_id and len(incoming_id) <= 64 and incoming_id.isascii()
            else uuid4().hex
        )
        started = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - started) * 1000, 2)

        response.headers["X-Request-ID"] = request_id
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=()",
        )
        if settings.APP_ENV == "production":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )

        logger.info(
            "request_id=%s method=%s path=%s status=%s duration_ms=%.2f",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response

    # Global structured error handlers
    @application.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            headers=exc.headers,
            content={
                "error": {
                    "code": "http_error",
                    "message": exc.detail,
                }
            },
        )

    @application.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "Request validation failed.",
                    "details": jsonable_encoder(exc.errors()),
                }
            },
        )

    @application.exception_handler(SQLAlchemyError)
    async def sqlalchemy_exception_handler(
        _request: Request, exc: SQLAlchemyError
    ) -> JSONResponse:
        logger.exception("Database error occurred: %s", exc.__class__.__name__)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "database_error",
                    "message": "A database error occurred while processing your request.",
                }
            },
        )

    @application.exception_handler(Exception)
    async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled server exception: %s", exc.__class__.__name__)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "internal_server_error",
                    "message": "An unexpected internal error occurred.",
                }
            },
        )

    # Versioned API routes
    for prefix in ("/api", "/api/v1"):
        application.include_router(health_router, prefix=prefix)
        application.include_router(auth_router, prefix=prefix)
        application.include_router(businesses_router, prefix=prefix)
        application.include_router(categories_router, prefix=prefix)
        application.include_router(transactions_router, prefix=prefix)
        application.include_router(parties_router, prefix=prefix)
        application.include_router(invoices_router, prefix=prefix)
        application.include_router(payments_router, prefix=prefix)
        application.include_router(inventory_router, prefix=prefix)
        application.include_router(intelligence_router, prefix=prefix)
        application.include_router(copilot_router, prefix=prefix)

    return application


app = create_app()
