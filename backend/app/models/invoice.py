from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Enum as SAEnum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import InvoiceStatus, PaymentMethod, enum_values
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.party import Customer
    from app.models.transaction import Transaction


class Invoice(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("business_id", "id", name="uq_invoices_business_id_id"),
        UniqueConstraint("business_id", "invoice_number", name="business_invoice_number"),
        ForeignKeyConstraint(
            ["business_id", "customer_id"],
            ["customers.business_id", "customers.id"],
            name="fk_invoices_business_customer",
            ondelete="RESTRICT",
        ),
        CheckConstraint("tax_rate >= 0", name="invoice_tax_rate_non_negative"),
        CheckConstraint("subtotal >= 0", name="invoice_subtotal_non_negative"),
        CheckConstraint("tax_amount >= 0", name="invoice_tax_amount_non_negative"),
        CheckConstraint("total_amount >= 0", name="invoice_total_amount_non_negative"),
        CheckConstraint("amount_paid >= 0", name="invoice_amount_paid_non_negative"),
        CheckConstraint("amount_paid <= total_amount", name="invoice_paid_not_exceed_total"),
        Index("ix_invoices_business_status_due", "business_id", "status", "due_date"),
    )

    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    invoice_number: Mapped[str] = mapped_column(String(64), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)

    tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    amount_paid: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    status: Mapped[InvoiceStatus] = mapped_column(
        SAEnum(InvoiceStatus, native_enum=False, length=24, values_callable=enum_values),
        default=InvoiceStatus.PENDING,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_demo_data: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    business: Mapped[Business] = relationship(
        back_populates="invoices",
        foreign_keys=[business_id],
    )
    customer: Mapped[Customer] = relationship(
        back_populates="invoices",
        foreign_keys=[customer_id],
        overlaps="business,invoices",
    )
    line_items: Mapped[list[InvoiceLineItem]] = relationship(
        back_populates="invoice",
        cascade="all, delete-orphan",
        foreign_keys="InvoiceLineItem.invoice_id",
        overlaps="business",
    )
    payments: Mapped[list[Payment]] = relationship(
        back_populates="invoice",
        cascade="all, delete-orphan",
        foreign_keys="Payment.invoice_id",
        overlaps="business,payments",
    )


class InvoiceLineItem(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "invoice_line_items"
    __table_args__ = (
        ForeignKeyConstraint(
            ["business_id", "invoice_id"],
            ["invoices.business_id", "invoices.id"],
            name="fk_invoice_line_items_business_invoice",
            ondelete="CASCADE",
        ),
        CheckConstraint("quantity > 0", name="line_item_quantity_positive"),
        CheckConstraint("unit_price >= 0", name="line_item_unit_price_non_negative"),
        CheckConstraint("line_total >= 0", name="line_item_total_non_negative"),
        Index("ix_invoice_line_items_business_invoice", "business_id", "invoice_id"),
    )

    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invoice_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    invoice: Mapped[Invoice] = relationship(
        back_populates="line_items",
        foreign_keys=[invoice_id],
    )


class Payment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (
        UniqueConstraint("business_id", "payment_reference", name="business_payment_reference"),
        UniqueConstraint("business_id", "idempotency_key", name="uq_payments_business_idempotency_key"),
        UniqueConstraint("transaction_id", name="payment_transaction_unique"),
        ForeignKeyConstraint(
            ["business_id", "invoice_id"],
            ["invoices.business_id", "invoices.id"],
            name="fk_payments_business_invoice",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["business_id", "customer_id"],
            ["customers.business_id", "customers.id"],
            name="fk_payments_business_customer",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["business_id", "transaction_id"],
            ["transactions.business_id", "transactions.id"],
            name="fk_payments_business_transaction",
            ondelete="NO ACTION",
        ),
        CheckConstraint("amount > 0", name="payment_amount_positive"),
        Index("ix_payments_business_invoice", "business_id", "invoice_id"),
        Index("ix_payments_business_date", "business_id", "payment_date"),
    )

    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invoice_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    customer_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    transaction_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("transactions.id", ondelete="SET NULL"),
        nullable=True,
    )
    payment_reference: Mapped[str] = mapped_column(String(80), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(
        SAEnum(PaymentMethod, native_enum=False, length=24, values_callable=enum_values),
        default=PaymentMethod.BANK_TRANSFER,
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    business: Mapped[Business] = relationship(
        back_populates="payments",
        foreign_keys=[business_id],
    )
    invoice: Mapped[Invoice] = relationship(
        back_populates="payments",
        foreign_keys=[invoice_id],
        overlaps="business,payments",
    )
    customer: Mapped[Customer] = relationship(
        back_populates="payments",
        foreign_keys=[customer_id],
        overlaps="business,invoice,payments",
    )
    transaction: Mapped[Transaction | None] = relationship(
        back_populates="linked_payment",
        foreign_keys=[transaction_id],
        overlaps="business,customer,invoice,payments",
    )
