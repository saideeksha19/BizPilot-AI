from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.user import User


class CopilotConversation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "copilot_conversations"
    __table_args__ = (
        CheckConstraint("message_count >= 0", name="copilot_message_count_non_negative"),
        Index(
            "ix_copilot_conversations_business_user_last",
            "business_id",
            "user_id",
            "last_message_at",
        ),
    )

    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    message_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    business: Mapped[Business] = relationship(back_populates="copilot_conversations")
    user: Mapped[User] = relationship(back_populates="copilot_conversations")
    messages: Mapped[list[CopilotMessage]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="CopilotMessage.created_at.asc()",
    )


class CopilotMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "copilot_messages"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="copilot_message_role_valid"),
        Index("ix_copilot_messages_conversation_created", "conversation_id", "created_at"),
    )

    conversation_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("copilot_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    structured_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    conversation: Mapped[CopilotConversation] = relationship(back_populates="messages")


class CopilotRateLimitEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "copilot_rate_limit_events"
    __table_args__ = (
        Index(
            "ix_copilot_rate_limit_user_business_created",
            "user_id",
            "business_id",
            "created_at",
        ),
    )

    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
