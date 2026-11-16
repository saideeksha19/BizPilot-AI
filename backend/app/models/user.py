from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.audit import AuditLog
    from app.models.auth import RevokedToken
    from app.models.business import BusinessMembership
    from app.models.copilot import CopilotConversation


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    memberships: Mapped[list[BusinessMembership]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    audit_logs: Mapped[list[AuditLog]] = relationship(back_populates="user")
    revoked_tokens: Mapped[list[RevokedToken]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    copilot_conversations: Mapped[list[CopilotConversation]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
