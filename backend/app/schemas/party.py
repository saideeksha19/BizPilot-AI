from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.services.financial_utils import to_money


class CustomerCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    tax_id: str | None = Field(default=None, max_length=40)
    billing_address: str | None = None
    opening_balance: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Customer name cannot be blank.")
        return cleaned

    @field_validator("opening_balance", mode="before")
    @classmethod
    def quantize_opening_balance(cls, value: Decimal | int | str) -> Decimal:
        if isinstance(value, float):
            value = str(value)
        return to_money(value)


class CustomerUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    tax_id: str | None = Field(default=None, max_length=40)
    billing_address: str | None = None
    opening_balance: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Customer name cannot be blank.")
        return cleaned

    @field_validator("opening_balance", mode="before")
    @classmethod
    def quantize_opening_balance(cls, value: Decimal | int | str | None) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, float):
            value = str(value)
        return to_money(value)


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    name: str
    email: str | None
    phone: str | None
    tax_id: str | None
    billing_address: str | None
    opening_balance: Decimal
    notes: str | None
    created_at: datetime
    updated_at: datetime


class CustomerDetailResponse(CustomerResponse):
    total_invoiced: Decimal
    total_paid: Decimal
    outstanding_receivables: Decimal


class SupplierCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    tax_id: str | None = Field(default=None, max_length=40)
    address: str | None = None
    default_lead_time_days: int = Field(default=3, ge=0, le=365)
    opening_payable: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Supplier name cannot be blank.")
        return cleaned

    @field_validator("opening_payable", mode="before")
    @classmethod
    def quantize_opening_payable(cls, value: Decimal | int | str) -> Decimal:
        if isinstance(value, float):
            value = str(value)
        return to_money(value)


class SupplierUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    tax_id: str | None = Field(default=None, max_length=40)
    address: str | None = None
    default_lead_time_days: int | None = Field(default=None, ge=0, le=365)
    opening_payable: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Supplier name cannot be blank.")
        return cleaned

    @field_validator("opening_payable", mode="before")
    @classmethod
    def quantize_opening_payable(cls, value: Decimal | int | str | None) -> Decimal | None:
        if value is None:
            return None
        if isinstance(value, float):
            value = str(value)
        return to_money(value)


class SupplierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    name: str
    email: str | None
    phone: str | None
    tax_id: str | None
    address: str | None
    default_lead_time_days: int
    opening_payable: Decimal
    notes: str | None
    created_at: datetime
    updated_at: datetime
