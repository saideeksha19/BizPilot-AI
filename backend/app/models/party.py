from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.inventory import InventoryProduct, StockMovement
    from app.models.invoice import Invoice, Payment


class Customer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("business_id", "id", name="uq_customers_business_id_id"),
        Index("ix_customers_business_name", "business_id", "name"),
        CheckConstraint("opening_balance >= 0", name="customer_opening_balance_non_negative"),
    )

    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    billing_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    opening_balance: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    business: Mapped[Business] = relationship(
        back_populates="customers",
        foreign_keys=[business_id],
    )
    invoices: Mapped[list[Invoice]] = relationship(
        back_populates="customer",
        foreign_keys="Invoice.customer_id",
        overlaps="business,invoices",
    )
    payments: Mapped[list[Payment]] = relationship(
        back_populates="customer",
        foreign_keys="Payment.customer_id",
        overlaps="business,payments",
    )


class Supplier(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "suppliers"
    __table_args__ = (
        UniqueConstraint("business_id", "id", name="uq_suppliers_business_id_id"),
        Index("ix_suppliers_business_name", "business_id", "name"),
        CheckConstraint("opening_payable >= 0", name="supplier_opening_payable_non_negative"),
        CheckConstraint("default_lead_time_days >= 0", name="supplier_lead_time_non_negative"),
    )

    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_lead_time_days: Mapped[int] = mapped_column(default=3, nullable=False)
    opening_payable: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    business: Mapped[Business] = relationship(
        back_populates="suppliers",
        foreign_keys=[business_id],
    )
    inventory_products: Mapped[list[InventoryProduct]] = relationship(
        back_populates="preferred_supplier",
        foreign_keys="InventoryProduct.preferred_supplier_id",
        overlaps="business,inventory_products",
    )
    stock_movements: Mapped[list[StockMovement]] = relationship(
        back_populates="supplier",
        foreign_keys="StockMovement.supplier_id",
        overlaps="business,product,stock_movements",
    )
