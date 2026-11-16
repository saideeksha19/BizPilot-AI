from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import (
    TenantContext,
    get_client_ip,
    get_current_user,
    get_tenant_record_or_404,
    require_business_permission,
)
from app.core.permissions import Permission, get_role_permissions
from app.db.session import get_db
from app.models import (
    AuditLog,
    Business,
    BusinessMembership,
    TransactionCategory,
    User,
)
from app.models.enums import MembershipRole, TransactionType
from app.schemas.business import (
    AuditLogResponse,
    BusinessCreateRequest,
    BusinessDetailResponse,
    BusinessSummaryResponse,
    BusinessUpdateRequest,
    MembershipAddRequest,
    MembershipRemoveResponse,
    MembershipResponse,
    MembershipUpdateRoleRequest,
)
from app.services.audit_service import record_audit_event

router = APIRouter(prefix="/businesses", tags=["businesses"])

DEFAULT_BUSINESS_CATEGORIES: list[tuple[str, TransactionType, bool]] = [
    ("Sales Revenue", TransactionType.INCOME, True),
    ("Invoice Settlements", TransactionType.INCOME, True),
    ("Service Income", TransactionType.INCOME, True),
    ("Inventory Procurement", TransactionType.EXPENSE, True),
    ("Payroll & Contractor Wages", TransactionType.EXPENSE, True),
    ("Rent & Utilities", TransactionType.EXPENSE, True),
    ("Marketing & Growth", TransactionType.EXPENSE, True),
    ("Software & Subscriptions", TransactionType.EXPENSE, True),
    ("Tax & Statutory Payments", TransactionType.EXPENSE, False),
    ("Loan Repayment", TransactionType.EXPENSE, False),
]


def _serialize_business_summary(
    business: Business, role: MembershipRole
) -> BusinessSummaryResponse:
    return BusinessSummaryResponse(
        id=business.id,
        name=business.name,
        business_type=business.business_type,
        industry=business.industry,
        currency=business.currency,
        country=business.country,
        business_size=business.business_size,
        financial_year_start=business.financial_year_start,
        dashboard_preference=business.dashboard_preference,
        timezone=business.timezone,
        gst_registered=business.gst_registered,
        opening_cash_balance=business.opening_cash_balance,
        monthly_fixed_overhead=business.monthly_fixed_overhead,
        credit_facility_limit=business.credit_facility_limit,
        short_term_loan_balance=business.short_term_loan_balance,
        tax_liability_accrued=business.tax_liability_accrued,
        is_demo_data=business.is_demo_data,
        created_at=business.created_at,
        updated_at=business.updated_at,
        current_user_role=role,
        permissions=get_role_permissions(role),
    )


def _serialize_business_detail(
    db: Session, business: Business, role: MembershipRole
) -> BusinessDetailResponse:
    member_count = db.scalar(
        select(func.count(BusinessMembership.id)).where(
            BusinessMembership.business_id == business.id,
            BusinessMembership.is_active.is_(True),
        )
    ) or 0
    summary = _serialize_business_summary(business, role)
    return BusinessDetailResponse(**summary.model_dump(), member_count=int(member_count))


def _serialize_membership(membership: BusinessMembership, user: User) -> MembershipResponse:
    return MembershipResponse(
        id=membership.id,
        business_id=membership.business_id,
        user_id=membership.user_id,
        user_email=user.email,
        user_full_name=user.full_name,
        role=membership.role,
        is_active=membership.is_active,
        created_at=membership.created_at,
        updated_at=membership.updated_at,
    )


def _count_active_owners(db: Session, business_id: str) -> int:
    count = db.scalar(
        select(func.count(BusinessMembership.id)).where(
            BusinessMembership.business_id == business_id,
            BusinessMembership.role == MembershipRole.OWNER,
            BusinessMembership.is_active.is_(True),
        )
    )
    return int(count or 0)


@router.get(
    "",
    response_model=list[BusinessSummaryResponse],
    status_code=status.HTTP_200_OK,
    summary="List businesses accessible to the authenticated user",
)
def list_user_businesses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[BusinessSummaryResponse]:
    stmt = (
        select(Business, BusinessMembership.role)
        .join(BusinessMembership, BusinessMembership.business_id == Business.id)
        .where(
            BusinessMembership.user_id == current_user.id,
            BusinessMembership.is_active.is_(True),
        )
        .order_by(Business.created_at.asc())
    )
    rows = db.execute(stmt).all()
    return [_serialize_business_summary(biz, role) for biz, role in rows]


@router.post(
    "",
    response_model=BusinessDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new business workspace with the caller as Owner",
)
def create_business(
    payload: BusinessCreateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BusinessDetailResponse:
    business = Business(
        name=payload.name,
        business_type=payload.business_type,
        industry=payload.industry,
        currency=payload.currency,
        country=payload.country,
        business_size=payload.business_size,
        financial_year_start=payload.financial_year_start,
        dashboard_preference=payload.dashboard_preference,
        timezone=payload.timezone,
        gst_registered=payload.gst_registered,
        opening_cash_balance=payload.opening_cash_balance,
        monthly_fixed_overhead=payload.monthly_fixed_overhead,
        credit_facility_limit=payload.credit_facility_limit,
        short_term_loan_balance=payload.short_term_loan_balance,
        tax_liability_accrued=payload.tax_liability_accrued,
        is_demo_data=False,
    )
    db.add(business)
    db.flush()

    owner_membership = BusinessMembership(
        business_id=business.id,
        user_id=current_user.id,
        role=MembershipRole.OWNER,
        is_active=True,
    )
    db.add(owner_membership)

    for cat_name, cat_type, is_operating in DEFAULT_BUSINESS_CATEGORIES:
        db.add(
            TransactionCategory(
                business_id=business.id,
                name=cat_name,
                type=cat_type,
                is_operating=is_operating,
                is_system=True,
            )
        )

    record_audit_event(
        db,
        action="business.create",
        entity_type="business",
        entity_id=business.id,
        user_id=current_user.id,
        business_id=business.id,
        details={"name": business.name, "currency": business.currency},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(business)
    return _serialize_business_detail(db, business, MembershipRole.OWNER)


@router.get(
    "/{business_id}",
    response_model=BusinessDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve business workspace details",
)
def get_business_detail(
    ctx: TenantContext = Depends(require_business_permission(Permission.BUSINESS_READ)),
    db: Session = Depends(get_db),
) -> BusinessDetailResponse:
    return _serialize_business_detail(db, ctx.business, ctx.membership.role)


@router.patch(
    "/{business_id}",
    response_model=BusinessDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Update business profile and financial configuration",
)
def update_business(
    payload: BusinessUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.BUSINESS_UPDATE)),
    db: Session = Depends(get_db),
) -> BusinessDetailResponse:
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(ctx.business, field, value)

    if updates:
        record_audit_event(
            db,
            action="business.update",
            entity_type="business",
            entity_id=ctx.business.id,
            user_id=ctx.user.id,
            business_id=ctx.business.id,
            details={"updated_fields": sorted(updates.keys())},
            ip_address=get_client_ip(request),
        )
        db.commit()
        db.refresh(ctx.business)

    return _serialize_business_detail(db, ctx.business, ctx.membership.role)


@router.post(
    "/{business_id}/switch",
    response_model=BusinessDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Validate membership and switch active business workspace",
)
def switch_business_workspace(
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.BUSINESS_READ)),
    db: Session = Depends(get_db),
) -> BusinessDetailResponse:
    record_audit_event(
        db,
        action="business.switch",
        entity_type="business",
        entity_id=ctx.business.id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={"role": ctx.membership.role.value},
        ip_address=get_client_ip(request),
        commit=True,
    )
    return _serialize_business_detail(db, ctx.business, ctx.membership.role)


@router.get(
    "/{business_id}/members",
    response_model=list[MembershipResponse],
    status_code=status.HTTP_200_OK,
    summary="List active members of a business",
)
def list_business_members(
    ctx: TenantContext = Depends(require_business_permission(Permission.MEMBERSHIP_READ)),
    db: Session = Depends(get_db),
) -> list[MembershipResponse]:
    stmt = (
        select(BusinessMembership, User)
        .join(User, User.id == BusinessMembership.user_id)
        .where(
            BusinessMembership.business_id == ctx.business.id,
            BusinessMembership.is_active.is_(True),
        )
        .order_by(BusinessMembership.created_at.asc())
    )
    rows = db.execute(stmt).all()
    return [_serialize_membership(membership, user) for membership, user in rows]


@router.post(
    "/{business_id}/members",
    response_model=MembershipResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add or invite a registered user to a business with a role",
)
def add_business_member(
    payload: MembershipAddRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.MEMBERSHIP_INVITE)),
    db: Session = Depends(get_db),
) -> MembershipResponse:
    if payload.role == MembershipRole.OWNER and ctx.membership.role != MembershipRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a business owner can assign the owner role.",
        )

    target_user = db.scalar(select(User).where(User.email == payload.email))
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No registered user found with this email.",
        )
    if not target_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add an inactive user to a business.",
        )

    existing = db.scalar(
        select(BusinessMembership).where(
            BusinessMembership.business_id == ctx.business.id,
            BusinessMembership.user_id == target_user.id,
        )
    )
    if existing is not None and existing.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this business.",
        )

    if existing is not None:
        existing.role = payload.role
        existing.is_active = True
        membership = existing
    else:
        membership = BusinessMembership(
            business_id=ctx.business.id,
            user_id=target_user.id,
            role=payload.role,
            is_active=True,
        )
        db.add(membership)

    db.flush()
    record_audit_event(
        db,
        action="membership.add",
        entity_type="business_membership",
        entity_id=membership.id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={
            "target_user_id": target_user.id,
            "target_email": target_user.email,
            "assigned_role": payload.role.value,
        },
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(membership)
    return _serialize_membership(membership, target_user)


@router.patch(
    "/{business_id}/members/{membership_id}",
    response_model=MembershipResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a business member's role",
)
def update_member_role(
    membership_id: str,
    payload: MembershipUpdateRoleRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.MEMBERSHIP_UPDATE_ROLE)),
    db: Session = Depends(get_db),
) -> MembershipResponse:
    target = get_tenant_record_or_404(
        db,
        BusinessMembership,
        membership_id,
        ctx.business.id,
        entity_label="Membership",
    )
    if not target.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membership not found in this business workspace.",
        )

    if ctx.membership.role != MembershipRole.OWNER and (
        target.role == MembershipRole.OWNER or payload.role == MembershipRole.OWNER
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a business owner can modify or assign the owner role.",
        )

    if target.role == MembershipRole.OWNER and payload.role != MembershipRole.OWNER:
        if _count_active_owners(db, ctx.business.id) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot demote the last remaining business owner.",
            )

    old_role = target.role
    target.role = payload.role
    target_user = db.get(User, target.user_id)
    assert target_user is not None

    record_audit_event(
        db,
        action="membership.role_update",
        entity_type="business_membership",
        entity_id=target.id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={
            "target_user_id": target.user_id,
            "old_role": old_role.value,
            "new_role": payload.role.value,
        },
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(target)
    return _serialize_membership(target, target_user)


@router.delete(
    "/{business_id}/members/{membership_id}",
    response_model=MembershipRemoveResponse,
    status_code=status.HTTP_200_OK,
    summary="Remove a member from a business",
)
def remove_business_member(
    membership_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.MEMBERSHIP_REMOVE)),
    db: Session = Depends(get_db),
) -> MembershipRemoveResponse:
    target = get_tenant_record_or_404(
        db,
        BusinessMembership,
        membership_id,
        ctx.business.id,
        entity_label="Membership",
    )
    if not target.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membership not found in this business workspace.",
        )

    if ctx.membership.role != MembershipRole.OWNER and target.role == MembershipRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a business owner can remove an owner.",
        )

    if target.role == MembershipRole.OWNER and _count_active_owners(db, ctx.business.id) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the last remaining business owner.",
        )

    removed_user_id = target.user_id
    removed_role = target.role.value
    db.delete(target)

    record_audit_event(
        db,
        action="membership.remove",
        entity_type="business_membership",
        entity_id=membership_id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={
            "removed_user_id": removed_user_id,
            "removed_role": removed_role,
        },
        ip_address=get_client_ip(request),
    )
    db.commit()
    return MembershipRemoveResponse(
        detail="Membership removed.",
        membership_id=membership_id,
    )


@router.get(
    "/{business_id}/audit-logs",
    response_model=list[AuditLogResponse],
    status_code=status.HTTP_200_OK,
    summary="List recent security and operational audit events for a business",
)
def list_business_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    ctx: TenantContext = Depends(require_business_permission(Permission.AUDIT_READ)),
    db: Session = Depends(get_db),
) -> list[AuditLogResponse]:
    stmt = (
        select(AuditLog)
        .where(AuditLog.business_id == ctx.business.id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    logs = db.scalars(stmt).all()
    return [AuditLogResponse.model_validate(entry) for entry in logs]
