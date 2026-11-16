from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import InvoiceStatus, PaymentMethod
from app.services.financial_utils import to_money, to_qty


class InvoiceLineItemCreateRequest(BaseModel):
    description: str = Field(min_length=1, max_length=255)
    quantity: Decimal = Field(gt=Decimal("0.000"))
    unit_price: Decimal = Field(ge=Decimal("0.00"))

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Line item description cannot be blank.")
        return cleaned

    @field_validator("quantity", mode="before")
    @classmethod
    def quantize_quantity(cls, value: Decimal | int | str) -> Decimal:
        if isinstance(value, float):
            value = str(value)
        return to_qty(value)

    @field_validator("unit_price", mode="before")
    @classmethod
    def quantize_unit_price(cls, value: Decimal | int | str) -> Decimal:
        if isinstance(value, float):
            value = str(value)
        return to_money(value)


class InvoiceLineItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    invoice_id: str
    description: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal


class InvoiceCreateRequest(BaseModel):
    customer_id: str
    invoice_number: str = Field(min_length=1, max_length=64)
    issue_date: date
    due_date: date
    tax_rate: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"), le=Decimal("100.00"))
    status: InvoiceStatus = InvoiceStatus.PENDING
    notes: str | None = None
    line_items: list[InvoiceLineItemCreateRequest] = Field(min_length=1)

    @field_validator("invoice_number")
    @classmethod
    def clean_invoice_number(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Invoice number cannot be blank.")
        return cleaned

    @field_validator("tax_rate", mode="before")
    @classmethod
    def quantize_tax_rate(cls, value: Decimal | int | str) -> Decimal:
        if isinstance(value, float):
            value = str(value)
        return to_money(value)

    @model_validator(mode="after")
    def validate_dates(self) -> "InvoiceCreateRequest":
        if self.due_date < self.issue_date:
            raise ValueError("due_date cannot be earlier than issue_date.")
        return self


class InvoiceUpdateRequest(BaseModel):
    customer_id: str | None = None
    issue_date: date | None = None
    due_date: date | None = None
    tax_rate: Decimal | None = Field(default=None, ge=Decimal("0.00"), le=Decimal("100.00"))
    status: InvoiceStatus | None = None
    notes: str | None = None
    line_items: list[InvoiceLineItemCreateRequest] | None = Field(default=None, min_length=1)

    @field_validator("tax_rate", mode="before")
    @classmethod
    def quantize_tax_rate(cls, value: Decimal | int | str | None) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, float):
            value = str(value)
        return to_money(value)


class PaymentCreateRequest(BaseModel):
    invoice_id: str
    payment_reference: str = Field(min_length=1, max_length=80)
    payment_date: date
    amount: Decimal = Field(gt=Decimal("0.00"))
    payment_method: PaymentMethod = PaymentMethod.BANK_TRANSFER
    notes: str | None = None
    idempotency_key: str | None = Field(default=None, max_length=128)

    @field_validator("payment_reference")
    @classmethod
    def clean_reference(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("payment_reference cannot be blank.")
        return cleaned

    @field_validator("amount", mode="before")
    @classmethod
    def quantize_amount(cls, value: Decimal | int | str) -> Decimal:
        if isinstance(value, float):
            value = str(value)
        return to_money(value)


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    invoice_id: str
    customer_id: str
    transaction_id: str | None
    payment_reference: str
    idempotency_key: str | None
    payment_date: date
    amount: Decimal
    payment_method: PaymentMethod
    notes: str | None
    created_at: datetime
    updated_at: datetime
    invoice_status: InvoiceStatus | None = None
    invoice_remaining_balance: Decimal | None = None


class InvoiceSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    customer_id: str
    customer_name: str
    invoice_number: str
    issue_date: date
    due_date: date
    tax_rate: Decimal
    subtotal: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    amount_paid: Decimal
    outstanding_balance: Decimal
    is_overdue: bool
    status: InvoiceStatus
    notes: str | None
    is_demo_data: bool
    created_at: datetime
    updated_at: datetime


class InvoiceDetailResponse(InvoiceSummaryResponse):
    line_items: list[InvoiceLineItemResponse]
    payments: list[PaymentResponse]
