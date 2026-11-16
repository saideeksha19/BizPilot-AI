"""Add copilot_rate_limit_events table for multi-instance sliding-window throttling.

Revision ID: 20261115_0006
Revises: 20261115_0005
Create Date: 2026-11-16 01:00:00+00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20261115_0006"
down_revision: Union[str, Sequence[str], None] = "20261115_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "copilot_rate_limit_events",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_copilot_rate_limit_events"),
    )
    op.create_index(
        "ix_copilot_rate_limit_events_business_id",
        "copilot_rate_limit_events",
        ["business_id"],
    )
    op.create_index(
        "ix_copilot_rate_limit_events_user_id",
        "copilot_rate_limit_events",
        ["user_id"],
    )
    op.create_index(
        "ix_copilot_rate_limit_user_business_created",
        "copilot_rate_limit_events",
        ["user_id", "business_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_copilot_rate_limit_user_business_created",
        table_name="copilot_rate_limit_events",
    )
    op.drop_index(
        "ix_copilot_rate_limit_events_user_id",
        table_name="copilot_rate_limit_events",
    )
    op.drop_index(
        "ix_copilot_rate_limit_events_business_id",
        table_name="copilot_rate_limit_events",
    )
    op.drop_table("copilot_rate_limit_events")
