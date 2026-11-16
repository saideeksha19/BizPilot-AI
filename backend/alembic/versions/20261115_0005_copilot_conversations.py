"""Add copilot_conversations and copilot_messages tables for Checkpoint G Copilot.

Revision ID: 20261115_0005
Revises: 20261115_0004
Create Date: 2026-11-16 00:00:00+00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20261115_0005"
down_revision: Union[str, Sequence[str], None] = "20261115_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "copilot_conversations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column(
            "last_message_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("message_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "message_count >= 0",
            name="ck_copilot_conversations_copilot_message_count_non_negative",
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_copilot_conversations"),
    )
    op.create_index(
        "ix_copilot_conversations_business_id",
        "copilot_conversations",
        ["business_id"],
    )
    op.create_index(
        "ix_copilot_conversations_user_id",
        "copilot_conversations",
        ["user_id"],
    )
    op.create_index(
        "ix_copilot_conversations_business_user_last",
        "copilot_conversations",
        ["business_id", "user_id", "last_message_at"],
    )

    op.create_table(
        "copilot_messages",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("conversation_id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("structured_payload", sa.JSON(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "role IN ('user', 'assistant')",
            name="ck_copilot_messages_copilot_message_role_valid",
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["copilot_conversations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_copilot_messages"),
    )
    op.create_index(
        "ix_copilot_messages_conversation_id",
        "copilot_messages",
        ["conversation_id"],
    )
    op.create_index(
        "ix_copilot_messages_business_id",
        "copilot_messages",
        ["business_id"],
    )
    op.create_index(
        "ix_copilot_messages_conversation_created",
        "copilot_messages",
        ["conversation_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_copilot_messages_conversation_created", table_name="copilot_messages")
    op.drop_index("ix_copilot_messages_business_id", table_name="copilot_messages")
    op.drop_index("ix_copilot_messages_conversation_id", table_name="copilot_messages")
    op.drop_table("copilot_messages")

    op.drop_index("ix_copilot_conversations_business_user_last", table_name="copilot_conversations")
    op.drop_index("ix_copilot_conversations_user_id", table_name="copilot_conversations")
    op.drop_index("ix_copilot_conversations_business_id", table_name="copilot_conversations")
    op.drop_table("copilot_conversations")
