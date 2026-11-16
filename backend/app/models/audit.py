from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, utc_now

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.user import User


class AuditLog(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_business_created", "business_id", "created_at"),
        Index("ix_audit_logs_entity", "entity_type", "entity_id"),
    )

    business_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(64), nullable=False)
    details: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        server_default=func.now(),
        nullable=False,
    )

    business: Mapped[Business | None] = relationship(back_populates="audit_logs")
    user: Mapped[User | None] = relationship(back_populates="audit_logs")
