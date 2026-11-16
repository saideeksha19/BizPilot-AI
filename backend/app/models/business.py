from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import MembershipRole, enum_values
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.audit import AuditLog
    from app.models.copilot import CopilotConversation
    from app.models.intelligence import FinancialAlert, SimulationScenario
    from app.models.inventory import InventoryProduct, StockMovement
    from app.models.invoice import Invoice, Payment
    from app.models.party import Customer, Supplier
    from app.models.transaction import Transaction, TransactionCategory
    from app.models.user import User


class Business(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "businesses"
    __table_args__ = (
        CheckConstraint("opening_cash_balance >= 0", name="opening_cash_non_negative"),
        CheckConstraint("monthly_fixed_overhead >= 0", name="monthly_overhead_non_negative"),
        CheckConstraint("credit_facility_limit >= 0", name="credit_limit_non_negative"),
        CheckConstraint("short_term_loan_balance >= 0", name="loan_balance_non_negative"),
        CheckConstraint("tax_liability_accrued >= 0", name="tax_liability_non_negative"),
    )

    name: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    business_type: Mapped[str] = mapped_column(String(60), nullable=False)
    industry: Mapped[str] = mapped_column(String(120), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    country: Mapped[str] = mapped_column(String(80), default="India", nullable=False)
    business_size: Mapped[str] = mapped_column(String(60), nullable=False)
    financial_year_start: Mapped[str] = mapped_column(String(40), default="April", nullable=False)
    dashboard_preference: Mapped[str] = mapped_column(
        String(60),
        default="Executive Balanced",
        nullable=False,
    )
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata", nullable=False)
    gst_registered: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    opening_cash_balance: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    monthly_fixed_overhead: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    credit_facility_limit: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    short_term_loan_balance: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    tax_liability_accrued: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    is_demo_data: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    memberships: Mapped[list[BusinessMembership]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )
    categories: Mapped[list[TransactionCategory]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )
    transactions: Mapped[list[Transaction]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )
    customers: Mapped[list[Customer]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )
    suppliers: Mapped[list[Supplier]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )
    invoices: Mapped[list[Invoice]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )
    payments: Mapped[list[Payment]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )
    inventory_products: Mapped[list[InventoryProduct]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )
    stock_movements: Mapped[list[StockMovement]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )
    audit_logs: Mapped[list[AuditLog]] = relationship(back_populates="business")
    financial_alerts: Mapped[list[FinancialAlert]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )
    simulation_scenarios: Mapped[list[SimulationScenario]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )
    copilot_conversations: Mapped[list[CopilotConversation]] = relationship(
        back_populates="business",
        cascade="all, delete-orphan",
    )


class BusinessMembership(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "business_memberships"
    __table_args__ = (
        UniqueConstraint("business_id", "user_id", name="business_user"),
        Index("ix_business_memberships_user_business", "user_id", "business_id"),
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
    role: Mapped[MembershipRole] = mapped_column(
        SAEnum(MembershipRole, native_enum=False, length=24, values_callable=enum_values),
        default=MembershipRole.VIEWER,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    business: Mapped[Business] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")
