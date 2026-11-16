"""Add financial_alerts and simulation_scenarios tables for Checkpoint F intelligence.

Revision ID: 20261115_0004
Revises: 20261115_0003
Create Date: 2026-11-15 23:55:00+00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20261115_0004"
down_revision: Union[str, Sequence[str], None] = "20261115_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ALERT_SEVERITY_ENUM = sa.Enum(
    "critical", "warning", "advisory", name="alertseverity", native_enum=False, length=24
)


def upgrade() -> None:
    op.create_table(
        "financial_alerts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("dedup_key", sa.String(length=120), nullable=False),
        sa.Column("alert_type", sa.String(length=64), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("severity", ALERT_SEVERITY_ENUM, nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("target_route", sa.String(length=64), nullable=False),
        sa.Column("impact_amount", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("supporting_evidence", sa.JSON(), nullable=True),
        sa.Column("recommended_action", sa.Text(), nullable=False),
        sa.Column(
            "detected_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_acknowledged", sa.Boolean(), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by_user_id", sa.String(length=36), nullable=True),
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
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["acknowledged_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_financial_alerts"),
        sa.UniqueConstraint("business_id", "dedup_key", name="uq_financial_alerts_business_dedup_key"),
    )
    op.create_index("ix_financial_alerts_business_id", "financial_alerts", ["business_id"])
    op.create_index(
        "ix_financial_alerts_business_sev_ack",
        "financial_alerts",
        ["business_id", "severity", "is_acknowledged"],
    )
    op.create_index(
        "ix_financial_alerts_business_active",
        "financial_alerts",
        ["business_id", "is_active"],
    )

    op.create_table(
        "simulation_scenarios",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("business_id", sa.String(length=36), nullable=False),
        sa.Column("created_by_user_id", sa.String(length=36), nullable=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sales_change_pct", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column("supplier_price_change_pct", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column("payment_delay_days", sa.Integer(), nullable=False),
        sa.Column("additional_employees", sa.Integer(), nullable=False),
        sa.Column("avg_monthly_salary", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("new_inventory_purchase", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("equipment_purchase", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("open_new_location", sa.Boolean(), nullable=False),
        sa.Column("new_location_monthly_rent", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("new_location_setup_cost", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("data_label", sa.String(length=24), nullable=False),
        sa.Column("result_snapshot", sa.JSON(), nullable=False),
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
        sa.CheckConstraint("payment_delay_days >= 0", name="ck_simulation_scenarios_sim_payment_delay_non_negative"),
        sa.CheckConstraint("additional_employees >= 0", name="ck_simulation_scenarios_sim_additional_employees_non_negative"),
        sa.CheckConstraint("avg_monthly_salary >= 0", name="ck_simulation_scenarios_sim_avg_salary_non_negative"),
        sa.CheckConstraint("new_inventory_purchase >= 0", name="ck_simulation_scenarios_sim_inventory_purchase_non_negative"),
        sa.CheckConstraint("equipment_purchase >= 0", name="ck_simulation_scenarios_sim_equipment_purchase_non_negative"),
        sa.CheckConstraint("new_location_monthly_rent >= 0", name="ck_simulation_scenarios_sim_location_rent_non_negative"),
        sa.CheckConstraint("new_location_setup_cost >= 0", name="ck_simulation_scenarios_sim_location_setup_non_negative"),
        sa.ForeignKeyConstraint(["business_id"], ["businesses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name="pk_simulation_scenarios"),
    )
    op.create_index("ix_simulation_scenarios_business_id", "simulation_scenarios", ["business_id"])
    op.create_index(
        "ix_simulation_scenarios_business_created",
        "simulation_scenarios",
        ["business_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_simulation_scenarios_business_created", table_name="simulation_scenarios")
    op.drop_index("ix_simulation_scenarios_business_id", table_name="simulation_scenarios")
    op.drop_table("simulation_scenarios")

    op.drop_index("ix_financial_alerts_business_active", table_name="financial_alerts")
    op.drop_index("ix_financial_alerts_business_sev_ack", table_name="financial_alerts")
    op.drop_index("ix_financial_alerts_business_id", table_name="financial_alerts")
    op.drop_table("financial_alerts")
