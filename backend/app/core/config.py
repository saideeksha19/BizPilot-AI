from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def normalize_database_url(url: str) -> str:
    """Normalize PostgreSQL URLs (e.g. Render postgres:// or postgresql://) to psycopg v3."""
    cleaned = url.strip()
    if cleaned.startswith("postgres://"):
        return "postgresql+psycopg://" + cleaned[len("postgres://") :]
    if cleaned.startswith("postgresql://"):
        return "postgresql+psycopg://" + cleaned[len("postgresql://") :]
    return cleaned


class Settings(BaseSettings):
    """Application settings loaded from environment variables and backend/.env."""

    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_NAME: str = "BizPilot AI API"
    APP_VERSION: str = "1.0.0"
    APP_ENV: Literal["development", "test", "staging", "production"] = "development"
    DEBUG: bool = True
    LOG_LEVEL: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    DATABASE_URL: str = Field(
        default="sqlite:///./bizpilot_dev.db",
        description="SQLAlchemy database connection string (PostgreSQL or SQLite fallback).",
    )
    DB_ECHO: bool = False
    ALLOW_SQLITE_IN_PRODUCTION: bool = Field(
        default=False,
        description="Explicit override only if running production mode on SQLite intentionally.",
    )

    JWT_SECRET_KEY: str = Field(
        default="DEV_ONLY_UNSAFE_SECRET_CHANGE_BEFORE_PRODUCTION",
        description="Secret key used to sign JWT access tokens.",
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60, ge=5, le=10080)

    CORS_ORIGINS: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        description="Comma-separated list or JSON array of allowed CORS origins.",
    )
    TRUSTED_HOSTS: str = Field(
        default="*",
        description="Comma-separated list of trusted Host header patterns for production.",
    )
    PROXY_HEADERS_ENABLED: bool = True

    REDIS_URL: str | None = Field(
        default=None,
        description="Optional Redis connection URL for multi-instance sliding-window rate limiting.",
    )

    GEMINI_API_KEY: str | None = Field(
        default=None,
        description="Google Gemini API key used strictly on the backend.",
    )
    GEMINI_MODEL: str = Field(
        default="gemini-4-hydrogen",
        description="Configured Gemini model identifier for Copilot generation.",
    )
    GEMINI_TIMEOUT_SECONDS: float = Field(
        default=25.0,
        ge=2.0,
        le=120.0,
        description="Upstream timeout in seconds for Gemini generation calls.",
    )
    GEMINI_MAX_OUTPUT_CHARS: int = Field(
        default=16000,
        ge=1000,
        le=65000,
        description="Maximum accepted JSON payload character length from Gemini.",
    )
    COPILOT_RATE_LIMIT_REQUESTS: int = Field(
        default=20,
        ge=1,
        le=500,
        description="Maximum Copilot chat requests per user/business within the sliding window.",
    )
    COPILOT_RATE_LIMIT_WINDOW_SECONDS: int = Field(
        default=60,
        ge=10,
        le=3600,
        description="Sliding window duration in seconds for Copilot rate limiting.",
    )
    COPILOT_MAX_QUESTION_CHARS: int = Field(
        default=1500,
        ge=50,
        le=4000,
        description="Maximum allowed character length for a user Copilot question.",
    )
    COPILOT_MAX_CONVERSATION_MESSAGES: int = Field(
        default=40,
        ge=4,
        le=200,
        description="Maximum persisted messages allowed per Copilot conversation thread.",
    )
    COPILOT_HISTORY_WINDOW: int = Field(
        default=10,
        ge=2,
        le=30,
        description="Maximum prior messages passed as conversation history context to Gemini.",
    )

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("DATABASE_URL must not be empty.")
        return normalize_database_url(cleaned)

    @field_validator("GEMINI_API_KEY")
    @classmethod
    def normalize_gemini_api_key(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned or cleaned in {"MY_GEMINI_API_KEY", "REPLACE_WITH_GEMINI_API_KEY"}:
            return None
        return cleaned

    @field_validator("REDIS_URL")
    @classmethod
    def normalize_redis_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("GEMINI_MODEL")
    @classmethod
    def validate_gemini_model(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("GEMINI_MODEL must not be empty.")
        return cleaned

    @property
    def is_gemini_configured(self) -> bool:
        return bool(self.GEMINI_API_KEY)

    @property
    def normalized_database_url(self) -> str:
        return normalize_database_url(self.DATABASE_URL)

    @property
    def cors_origins_list(self) -> list[str]:
        raw = self.CORS_ORIGINS.strip()
        if not raw:
            return []
        if raw.startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(origin).strip() for origin in parsed if str(origin).strip()]
            except json.JSONDecodeError:
                pass
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @property
    def trusted_hosts_list(self) -> list[str]:
        raw = self.TRUSTED_HOSTS.strip()
        if not raw:
            return ["*"]
        return [host.strip() for host in raw.split(",") if host.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.normalized_database_url.lower().startswith("sqlite")

    def validate_runtime_security(self) -> None:
        if self.APP_ENV == "production":
            if (
                "CHANGE_ME" in self.JWT_SECRET_KEY
                or "DEV_ONLY" in self.JWT_SECRET_KEY
                or "REPLACE_WITH" in self.JWT_SECRET_KEY
                or len(self.JWT_SECRET_KEY) < 32
            ):
                raise RuntimeError(
                    "Invalid JWT_SECRET_KEY for production environment. "
                    "Set a random secret of at least 32 characters."
                )
            if self.is_sqlite and not self.ALLOW_SQLITE_IN_PRODUCTION:
                raise RuntimeError(
                    "SQLite cannot be used in production unless ALLOW_SQLITE_IN_PRODUCTION=true. "
                    "Configure PostgreSQL via DATABASE_URL."
                )
            origins = self.cors_origins_list
            if not origins or "*" in origins:
                raise RuntimeError(
                    "CORS_ORIGINS must list explicit frontend origins (never '*' or empty) in production."
                )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
