from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import (
    PaymentMethod,
    TransactionSource,
    TransactionStatus,
    TransactionType,
)
from app.services.financial_utils import to_money


class CategoryCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    type: TransactionType
    is_operating: bool = True

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Category name cannot be blank.")
        return cleaned


class CategoryUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    type: TransactionType | None = None
    is_operating: bool | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Category name cannot be blank.")
        return cleaned


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    name: str
    type: TransactionType
    is_operating: bool
    is_system: bool
    created_at: datetime
    updated_at: datetime


class TransactionCreateRequest(BaseModel):
    transaction_date: date
    description: str = Field(min_length=1, max_length=255)
    counterparty: str = Field(min_length=1, max_length=160)
    type: TransactionType
    amount: Decimal = Field(gt=Decimal("0.00"))
    category_id: str | None = None
    payment_method: PaymentMethod = PaymentMethod.BANK_TRANSFER
    status: TransactionStatus = TransactionStatus.COMPLETED
    reference_code: str | None = Field(default=None, max_length=80)
    notes: str | None = None

    @field_validator("description", "counterparty")
    @classmethod
    def clean_non_empty(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be blank.")
        return cleaned

    @field_validator("amount", mode="before")
    @classmethod
    def quantize_amount(cls, value: Decimal | int | str) -> Decimal:
        if isinstance(value, float):
            value = str(value)
        return to_money(value)


class TransactionUpdateRequest(BaseModel):
    transaction_date: date | None = None
    description: str | None = Field(default=None, min_length=1, max_length=255)
    counterparty: str | None = Field(default=None, min_length=1, max_length=160)
    type: TransactionType | None = None
    amount: Decimal | None = Field(default=None, gt=Decimal("0.00"))
    category_id: str | None = None
    payment_method: PaymentMethod | None = None
    status: TransactionStatus | None = None
    reference_code: str | None = Field(default=None, max_length=80)
    notes: str | None = None

    @field_validator("description", "counterparty")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Field cannot be blank.")
        return cleaned

    @field_validator("amount", mode="before")
    @classmethod
    def quantize_amount(cls, value: Decimal | int | str | None) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, float):
            value = str(value)
        return to_money(value)


class TransactionReverseRequest(BaseModel):
    reversal_date: date | None = None
    reason: str = Field(min_length=3, max_length=255)

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 3:
            raise ValueError("Reversal reason must be at least 3 characters.")
        return cleaned


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    category_id: str | None
    category_name: str | None = None
    created_by_user_id: str | None
    transaction_date: date
    description: str
    counterparty: str
    type: TransactionType
    amount: Decimal
    payment_method: PaymentMethod
    status: TransactionStatus
    source_type: TransactionSource
    reference_code: str | None
    notes: str | None
    is_demo_data: bool
    created_at: datetime
    updated_at: datetime


class TransactionCsvImportResponse(BaseModel):
    imported_count: int
    created_categories: list[str]
    transaction_ids: list[str]
