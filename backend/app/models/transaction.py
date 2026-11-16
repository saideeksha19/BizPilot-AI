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
from app.models.enums import (
    PaymentMethod,
    TransactionSource,
    TransactionStatus,
    TransactionType,
    enum_values,
)
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.inventory import StockMovement
    from app.models.invoice import Payment


class TransactionCategory(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "transaction_categories"
    __table_args__ = (
        UniqueConstraint("business_id", "id", name="uq_transaction_categories_business_id_id"),
        UniqueConstraint("business_id", "name", "type", name="business_category_name_type"),
        Index("ix_transaction_categories_business_type", "business_id", "type"),
    )

    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    type: Mapped[TransactionType] = mapped_column(
        SAEnum(TransactionType, native_enum=False, length=24, values_callable=enum_values),
        nullable=False,
    )
    is_operating: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    business: Mapped[Business] = relationship(
        back_populates="categories",
        foreign_keys=[business_id],
    )
    transactions: Mapped[list[Transaction]] = relationship(
        back_populates="category",
        foreign_keys="Transaction.category_id",
        overlaps="business,transactions",
    )


class Transaction(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        UniqueConstraint("business_id", "id", name="uq_transactions_business_id_id"),
        ForeignKeyConstraint(
            ["business_id", "category_id"],
            ["transaction_categories.business_id", "transaction_categories.id"],
            name="fk_transactions_business_category",
            ondelete="NO ACTION",
        ),
        CheckConstraint("amount > 0", name="transaction_amount_positive"),
        Index("ix_transactions_business_date", "business_id", "transaction_date"),
        Index("ix_transactions_business_type_status", "business_id", "type", "status"),
    )

    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("transaction_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_user_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    counterparty: Mapped[str] = mapped_column(String(160), nullable=False)
    type: Mapped[TransactionType] = mapped_column(
        SAEnum(TransactionType, native_enum=False, length=24, values_callable=enum_values),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(
        SAEnum(PaymentMethod, native_enum=False, length=24, values_callable=enum_values),
        default=PaymentMethod.BANK_TRANSFER,
        nullable=False,
    )
    status: Mapped[TransactionStatus] = mapped_column(
        SAEnum(TransactionStatus, native_enum=False, length=24, values_callable=enum_values),
        default=TransactionStatus.COMPLETED,
        nullable=False,
    )
    source_type: Mapped[TransactionSource] = mapped_column(
        SAEnum(TransactionSource, native_enum=False, length=32, values_callable=enum_values),
        default=TransactionSource.MANUAL,
        nullable=False,
    )
    reference_code: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_demo_data: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    business: Mapped[Business] = relationship(
        back_populates="transactions",
        foreign_keys=[business_id],
    )
    category: Mapped[TransactionCategory | None] = relationship(
        back_populates="transactions",
        foreign_keys=[category_id],
        overlaps="business,transactions",
    )
    linked_payment: Mapped[Payment | None] = relationship(
        back_populates="transaction",
        uselist=False,
        foreign_keys="Payment.transaction_id",
        overlaps="business,customer,invoice,payments",
    )
    linked_stock_movement: Mapped[StockMovement | None] = relationship(
        back_populates="transaction",
        uselist=False,
        foreign_keys="StockMovement.transaction_id",
        overlaps="business,product,supplier,stock_movements",
    )
