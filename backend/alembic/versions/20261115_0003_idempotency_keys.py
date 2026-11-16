"""Add business-scoped idempotency keys to payments and stock_movements.

Revision ID: 20261115_0003
Revises: 20261115_0002
Create Date: 2026-11-15 23:40:00+00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20261115_0003"
down_revision: Union[str, Sequence[str], None] = "20261115_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("payments") as batch_op:
        batch_op.add_column(sa.Column("idempotency_key", sa.String(length=128), nullable=True))
        batch_op.create_unique_constraint(
            "uq_payments_business_idempotency_key",
            ["business_id", "idempotency_key"],
        )

    with op.batch_alter_table("stock_movements") as batch_op:
        batch_op.add_column(sa.Column("idempotency_key", sa.String(length=128), nullable=True))
        batch_op.create_unique_constraint(
            "uq_stock_movements_business_idempotency_key",
            ["business_id", "idempotency_key"],
        )


def downgrade() -> None:
    with op.batch_alter_table("stock_movements") as batch_op:
        batch_op.drop_constraint("uq_stock_movements_business_idempotency_key", type_="unique")
        batch_op.drop_column("idempotency_key")

    with op.batch_alter_table("payments") as batch_op:
        batch_op.drop_constraint("uq_payments_business_idempotency_key", type_="unique")
        batch_op.drop_column("idempotency_key")
