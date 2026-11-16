from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
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
from app.models.enums import StockMovementType, enum_values
from app.models.mixins import TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.business import Business
    from app.models.party import Supplier
    from app.models.transaction import Transaction


class InventoryProduct(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "inventory_products"
    __table_args__ = (
        UniqueConstraint("business_id", "id", name="uq_inventory_products_business_id_id"),
        UniqueConstraint("business_id", "sku", name="business_product_sku"),
        ForeignKeyConstraint(
            ["business_id", "preferred_supplier_id"],
            ["suppliers.business_id", "suppliers.id"],
            name="fk_inventory_products_business_supplier",
            ondelete="NO ACTION",
        ),
        CheckConstraint("current_stock >= 0", name="product_stock_non_negative"),
        CheckConstraint("reorder_point >= 0", name="product_reorder_non_negative"),
        CheckConstraint("unit_cost >= 0", name="product_unit_cost_non_negative"),
        CheckConstraint("selling_price >= 0", name="product_selling_price_non_negative"),
        Index("ix_inventory_products_business_category", "business_id", "category"),
    )

    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    preferred_supplier_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("suppliers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sku: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    unit: Mapped[str] = mapped_column(String(32), default="units", nullable=False)
    current_stock: Mapped[Decimal] = mapped_column(
        Numeric(12, 3),
        default=Decimal("0.000"),
        nullable=False,
    )
    reorder_point: Mapped[Decimal] = mapped_column(
        Numeric(12, 3),
        default=Decimal("0.000"),
        nullable=False,
    )
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    selling_price: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    last_restocked_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    business: Mapped[Business] = relationship(
        back_populates="inventory_products",
        foreign_keys=[business_id],
    )
    preferred_supplier: Mapped[Supplier | None] = relationship(
        back_populates="inventory_products",
        foreign_keys=[preferred_supplier_id],
        overlaps="business,inventory_products",
    )
    movements: Mapped[list[StockMovement]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        foreign_keys="StockMovement.product_id",
        overlaps="business,stock_movements",
    )


class StockMovement(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "stock_movements"
    __table_args__ = (
        UniqueConstraint("transaction_id", name="stock_movement_transaction_unique"),
        UniqueConstraint(
            "business_id",
            "idempotency_key",
            name="uq_stock_movements_business_idempotency_key",
        ),
        ForeignKeyConstraint(
            ["business_id", "product_id"],
            ["inventory_products.business_id", "inventory_products.id"],
            name="fk_stock_movements_business_product",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["business_id", "supplier_id"],
            ["suppliers.business_id", "suppliers.id"],
            name="fk_stock_movements_business_supplier",
            ondelete="NO ACTION",
        ),
        ForeignKeyConstraint(
            ["business_id", "transaction_id"],
            ["transactions.business_id", "transactions.id"],
            name="fk_stock_movements_business_transaction",
            ondelete="NO ACTION",
        ),
        CheckConstraint("quantity_delta != 0", name="stock_movement_quantity_non_zero"),
        CheckConstraint("unit_cost >= 0", name="stock_movement_unit_cost_non_negative"),
        CheckConstraint("total_cost >= 0", name="stock_movement_total_cost_non_negative"),
        Index("ix_stock_movements_business_product", "business_id", "product_id"),
        Index("ix_stock_movements_business_date", "business_id", "movement_date"),
    )

    business_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("businesses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("inventory_products.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    supplier_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("suppliers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    transaction_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("transactions.id", ondelete="SET NULL"),
        nullable=True,
    )
    movement_type: Mapped[StockMovementType] = mapped_column(
        SAEnum(StockMovementType, native_enum=False, length=24, values_callable=enum_values),
        nullable=False,
    )
    movement_date: Mapped[date] = mapped_column(Date, nullable=False)
    quantity_delta: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    total_cost: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        default=Decimal("0.00"),
        nullable=False,
    )
    reference_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    business: Mapped[Business] = relationship(
        back_populates="stock_movements",
        foreign_keys=[business_id],
    )
    product: Mapped[InventoryProduct] = relationship(
        back_populates="movements",
        foreign_keys=[product_id],
        overlaps="business,stock_movements",
    )
    supplier: Mapped[Supplier | None] = relationship(
        back_populates="stock_movements",
        foreign_keys=[supplier_id],
        overlaps="business,product,stock_movements",
    )
    transaction: Mapped[Transaction | None] = relationship(
        back_populates="linked_stock_movement",
        foreign_keys=[transaction_id],
        overlaps="business,product,supplier,stock_movements",
    )
