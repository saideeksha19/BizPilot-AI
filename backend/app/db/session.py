from __future__ import annotations

from collections.abc import Generator
from typing import Any

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings, normalize_database_url


def build_engine(database_url: str | None = None, echo: bool | None = None) -> Engine:
    """Create a configured SQLAlchemy 2 engine for PostgreSQL or SQLite."""
    settings = get_settings()
    url = normalize_database_url(database_url or settings.normalized_database_url)
    sql_echo = settings.DB_ECHO if echo is None else echo
    is_sqlite = url.lower().startswith("sqlite")

    engine_kwargs: dict[str, Any] = {
        "echo": sql_echo,
        "future": True,
    }

    if is_sqlite:
        engine_kwargs["connect_args"] = {"check_same_thread": False}
    else:
        # Production PostgreSQL pool tuning
        engine_kwargs["pool_pre_ping"] = True
        engine_kwargs["pool_size"] = 5
        engine_kwargs["max_overflow"] = 10

    db_engine = create_engine(url, **engine_kwargs)

    if is_sqlite:
        @event.listens_for(db_engine, "connect")
        def _enable_sqlite_foreign_keys(dbapi_connection: Any, _connection_record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return db_engine


engine: Engine = build_engine()

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency providing a scoped SQLAlchemy session."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def check_database_health() -> dict[str, str | bool]:
    """Verify database connectivity via a lightweight SELECT 1 query."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "connected": True,
            "dialect": engine.dialect.name,
            "status": "ok",
        }
    except SQLAlchemyError as exc:
        return {
            "connected": False,
            "dialect": engine.dialect.name,
            "status": f"error: {exc.__class__.__name__}",
        }
