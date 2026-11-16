from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import MembershipRole


class BusinessCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    business_type: str = Field(min_length=2, max_length=60)
    industry: str = Field(min_length=2, max_length=120)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    country: str = Field(default="India", min_length=2, max_length=80)
    business_size: str = Field(default="Small (6-20)", min_length=2, max_length=60)
    financial_year_start: str = Field(default="April", min_length=2, max_length=40)
    dashboard_preference: str = Field(default="Executive Balanced", min_length=2, max_length=60)
    timezone: str = Field(default="Asia/Kolkata", min_length=2, max_length=64)
    gst_registered: bool = True
    opening_cash_balance: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    monthly_fixed_overhead: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    credit_facility_limit: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    short_term_loan_balance: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    tax_liability_accrued: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("name", "business_type", "industry", "country", "business_size")
    @classmethod
    def strip_text(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Field value must be at least 2 characters.")
        return cleaned


class BusinessUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    business_type: str | None = Field(default=None, min_length=2, max_length=60)
    industry: str | None = Field(default=None, min_length=2, max_length=120)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    country: str | None = Field(default=None, min_length=2, max_length=80)
    business_size: str | None = Field(default=None, min_length=2, max_length=60)
    financial_year_start: str | None = Field(default=None, min_length=2, max_length=40)
    dashboard_preference: str | None = Field(default=None, min_length=2, max_length=60)
    timezone: str | None = Field(default=None, min_length=2, max_length=64)
    gst_registered: bool | None = None
    opening_cash_balance: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    monthly_fixed_overhead: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    credit_facility_limit: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    short_term_loan_balance: Decimal | None = Field(default=None, ge=Decimal("0.00"))
    tax_liability_accrued: Decimal | None = Field(default=None, ge=Decimal("0.00"))

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, value: str | None) -> str | None:
        return value.strip().upper() if value is not None else None


class BusinessSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    business_type: str
    industry: str
    currency: str
    country: str
    business_size: str
    financial_year_start: str
    dashboard_preference: str
    timezone: str
    gst_registered: bool
    opening_cash_balance: Decimal
    monthly_fixed_overhead: Decimal
    credit_facility_limit: Decimal
    short_term_loan_balance: Decimal
    tax_liability_accrued: Decimal
    is_demo_data: bool
    created_at: datetime
    updated_at: datetime
    current_user_role: MembershipRole
    permissions: list[str]


class BusinessDetailResponse(BusinessSummaryResponse):
    member_count: int


class MembershipAddRequest(BaseModel):
    email: EmailStr
    role: MembershipRole = MembershipRole.VIEWER

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class MembershipUpdateRoleRequest(BaseModel):
    role: MembershipRole


class MembershipResponse(BaseModel):
    id: str
    business_id: str
    user_id: str
    user_email: str
    user_full_name: str
    role: MembershipRole
    is_active: bool
    created_at: datetime
    updated_at: datetime


class MembershipRemoveResponse(BaseModel):
    detail: str
    membership_id: str


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str | None
    user_id: str | None
    action: str
    entity_type: str
    entity_id: str
    details: dict[str, Any] | None
    ip_address: str | None
    created_at: datetime
