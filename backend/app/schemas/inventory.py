from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import PaymentMethod, StockMovementType
from app.services.financial_utils import to_money, to_qty


class InventoryProductCreateRequest(BaseModel):
    sku: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=80)
    unit: str = Field(default="units", min_length=1, max_length=32)
    preferred_supplier_id: str | None = None
    current_stock: Decimal = Field(default=Decimal("0.000"), ge=Decimal("0.000"))
    reorder_point: Decimal = Field(default=Decimal("0.000"), ge=Decimal("0.000"))
    unit_cost: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    selling_price: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))

    @field_validator("sku", "name", "category", "unit")
    @classmethod
    def clean_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be blank.")
        return cleaned

    @field_validator("current_stock", "reorder_point", mode="before")
    @classmethod
    def quantize_qty_fields(cls, value: Decimal | int | str) -> Decimal:
        if isinstance(value, float):
            value = str(value)
        return to_qty(value)

    @field_validator("unit_cost", "selling_price", mode="before")
    @classmethod
    def quantize_money_fields(cls, value: Decimal | int | str) -> Decimal:
        if isinstance(value, float):
            value = str(value)
        return to_money(value)


class InventoryProductUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    unit: str | None = Field(default=None, min_length=1, max_length=32)
    preferred_supplier_id: str | None = None
    reorder_point: Decimal | None = Field(default=None, ge=Decimal("0.000"))
    unit_cost: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    selling_price: Decimal | None = Field(default=None, ge=Decimal("0.00"))

    @field_validator("name", "category", "unit")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be blank.")
        return cleaned

    @field_validator("reorder_point", mode="before")
    @classmethod
    def quantize_qty(cls, value: Decimal | int | str | None) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, float):
            value = str(value)
        return to_qty(value)

    @field_validator("unit_cost", "selling_price", mode="before")
    @classmethod
    def quantize_money(cls, value: Decimal | int | str | None) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, float):
            value = str(value)
        return to_money(value)


class InventoryProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    preferred_supplier_id: str | None
    preferred_supplier_name: str | None = None
    sku: str
    name: str
    category: str
    unit: str
    current_stock: Decimal
    reorder_point: Decimal
    unit_cost: Decimal
    selling_price: Decimal
    stock_value: Decimal
    is_low_stock: bool
    last_restocked_date: date | None
    created_at: datetime
    updated_at: datetime


class InventoryRestockRequest(BaseModel):
    quantity: Decimal = Field(gt=Decimal("0.000"))
    unit_cost: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    movement_date: date
    supplier_id: str | None = None
    payment_method: PaymentMethod = PaymentMethod.BANK_TRANSFER
    reference_code: str | None = Field(default=None, max_length=80)
    record_expense: bool = True
    notes: str | None = None
    idempotency_key: str | None = Field(default=None, max_length=128)

    @field_validator("quantity", mode="before")
    @classmethod
    def quantize_quantity(cls, value: Decimal | int | str) -> Decimal:
        if isinstance(value, float):
            value = str(value)
        return to_qty(value)

    @field_validator("unit_cost", mode="before")
    @classmethod
    def quantize_unit_cost(cls, value: Decimal | int | str | None) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, float):
            value = str(value)
        return to_money(value)


class StockMovementCreateRequest(BaseModel):
    movement_type: StockMovementType
    quantity_delta: Decimal
    movement_date: date
    unit_cost: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    supplier_id: str | None = None
    payment_method: PaymentMethod = PaymentMethod.BANK_TRANSFER
    reference_code: str | None = Field(default=None, max_length=80)
    record_expense: bool = False
    notes: str | None = None
    idempotency_key: str | None = Field(default=None, max_length=128)

    @field_validator("quantity_delta", mode="before")
    @classmethod
    def quantize_delta(cls, value: Decimal | int | str) -> Decimal:
        if isinstance(value, float):
            value = str(value)
        qty = to_qty(value)
        if qty == Decimal("0.000"):
            raise ValueError("quantity_delta must be non-zero.")
        return qty

    @field_validator("unit_cost", mode="before")
    @classmethod
    def quantize_cost(cls, value: Decimal | int | str | None) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, float):
            value = str(value)
        return to_money(value)


class StockMovementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    product_id: str
    supplier_id: str | None
    transaction_id: str | None
    movement_type: StockMovementType
    movement_date: date
    quantity_delta: Decimal
    unit_cost: Decimal
    total_cost: Decimal
    reference_code: str | None
    idempotency_key: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    resulting_stock: Decimal | None = None


class InventoryProductDetailResponse(InventoryProductResponse):
    recent_movements: list[StockMovementResponse]
