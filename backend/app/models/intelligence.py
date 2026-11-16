from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import AlertSeverity, DataLabel, enum_values
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business


class FinancialAlert(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "financial_alerts"
    __table_args__ = (
        UniqueConstraint("business_id", "dedup_key", name="uq_financial_alerts_business_dedup_key"),
        Index("ix_financial_alerts_business_sev_ack", "business_id", "severity", "is_acknowledged"),
        Index("ix_financial_alerts_business_active", "business_id", "is_active"),
    )

    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dedup_key: Mapped[str] = mapped_column(String(120), nullable=False)
    alert_type: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[str] = mapped_column(String(64), nullable=False)
    severity: Mapped[AlertSeverity] = mapped_column(
        SAEnum(AlertSeverity, native_enum=False, length=24, values_callable=enum_values),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    target_route: Mapped[str] = mapped_column(String(64), default="risk-radar", nullable=False)
    impact_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    supporting_evidence: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    recommended_action: Mapped[str] = mapped_column(Text, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    acknowledged_by_user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    business: Mapped[Business] = relationship(back_populates="financial_alerts")


class SimulationScenario(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "simulation_scenarios"
    __table_args__ = (
        CheckConstraint("payment_delay_days >= 0", name="sim_payment_delay_non_negative"),
        CheckConstraint("additional_employees >= 0", name="sim_additional_employees_non_negative"),
        CheckConstraint("avg_monthly_salary >= 0", name="sim_avg_salary_non_negative"),
        CheckConstraint("new_inventory_purchase >= 0", name="sim_inventory_purchase_non_negative"),
        CheckConstraint("equipment_purchase >= 0", name="sim_equipment_purchase_non_negative"),
        CheckConstraint("new_location_monthly_rent >= 0", name="sim_location_rent_non_negative"),
        CheckConstraint("new_location_setup_cost >= 0", name="sim_location_setup_non_negative"),
        Index("ix_simulation_scenarios_business_created", "business_id", "created_at"),
    )

    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    sales_change_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    supplier_price_change_pct: Mapped[Decimal] = mapped_column(
        Numeric(6, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    payment_delay_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    additional_employees: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_monthly_salary: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    new_inventory_purchase: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    equipment_purchase: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    open_new_location: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    new_location_monthly_rent: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    new_location_setup_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )

    data_label: Mapped[str] = mapped_column(
        String(24),
        default=DataLabel.HYPOTHETICAL.value,
        nullable=False,
    )
    result_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    business: Mapped[Business] = relationship(back_populates="simulation_scenarios")
