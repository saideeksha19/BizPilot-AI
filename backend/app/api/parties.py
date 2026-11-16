from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import (
    TenantContext,
    get_client_ip,
    get_tenant_record_or_404,
    require_business_permission,
)
from app.core.permissions import Permission
from app.db.session import get_db
from app.models import Customer, InventoryProduct, Invoice, Payment, StockMovement, Supplier
from app.models.enums import InvoiceStatus
from app.schemas.common import PaginatedResponse
from app.schemas.party import (
    CustomerCreateRequest,
    CustomerDetailResponse,
    CustomerResponse,
    CustomerUpdateRequest,
    SupplierCreateRequest,
    SupplierResponse,
    SupplierUpdateRequest,
)
from app.services.audit_service import record_audit_event
from app.services.financial_utils import compute_total_pages, to_money

router = APIRouter(prefix="/businesses/{business_id}", tags=["customers-and-suppliers"])


# ---------------------------------------------------------------------------
# Customers
# ---------------------------------------------------------------------------


@router.get(
    "/customers",
    response_model=PaginatedResponse[CustomerResponse],
    status_code=status.HTTP_200_OK,
    summary="List and search customers for a business",
)
def list_customers(
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> PaginatedResponse[CustomerResponse]:
    stmt = select(Customer).where(Customer.business_id == ctx.business.id)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Customer.name.ilike(pattern),
                Customer.email.ilike(pattern),
                Customer.phone.ilike(pattern),
                Customer.tax_id.ilike(pattern),
            )
        )

    total = int(
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    rows = db.scalars(
        stmt.order_by(Customer.name.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedResponse(
        items=[CustomerResponse.model_validate(c) for c in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=compute_total_pages(total, page_size),
    )


@router.post(
    "/customers",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a business-scoped customer",
)
def create_customer(
    payload: CustomerCreateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> CustomerResponse:
    customer = Customer(
        business_id=ctx.business.id,
        name=payload.name,
        email=str(payload.email).lower() if payload.email else None,
        phone=payload.phone,
        tax_id=payload.tax_id,
        billing_address=payload.billing_address,
        opening_balance=payload.opening_balance,
        notes=payload.notes,
    )
    db.add(customer)
    db.flush()

    record_audit_event(
        db,
        action="customer.create",
        entity_type="customer",
        entity_id=customer.id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={"name": customer.name},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(customer)
    return CustomerResponse.model_validate(customer)


@router.get(
    "/customers/{customer_id}",
    response_model=CustomerDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve customer details with invoice receivable totals",
)
def get_customer(
    customer_id: str,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> CustomerDetailResponse:
    customer = get_tenant_record_or_404(
        db, Customer, customer_id, ctx.business.id, entity_label="Customer"
    )
    invoices = db.scalars(
        select(Invoice).where(
            Invoice.business_id == ctx.business.id,
            Invoice.customer_id == customer.id,
            Invoice.status.notin_([InvoiceStatus.DRAFT, InvoiceStatus.VOID]),
        )
    ).all()
    total_invoiced = to_money(sum((inv.total_amount for inv in invoices), Decimal("0.00")))
    total_paid = to_money(sum((inv.amount_paid for inv in invoices), Decimal("0.00")))
    outstanding = to_money(customer.opening_balance + total_invoiced - total_paid)
    base = CustomerResponse.model_validate(customer)
    return CustomerDetailResponse(
        **base.model_dump(),
        total_invoiced=total_invoiced,
        total_paid=total_paid,
        outstanding_receivables=outstanding,
    )


@router.patch(
    "/customers/{customer_id}",
    response_model=CustomerResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a customer record",
)
def update_customer(
    customer_id: str,
    payload: CustomerUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> CustomerResponse:
    customer = get_tenant_record_or_404(
        db, Customer, customer_id, ctx.business.id, entity_label="Customer"
    )
    updates = payload.model_dump(exclude_unset=True)
    if "email" in updates and updates["email"] is not None:
        updates["email"] = str(updates["email"]).lower()

    for field, value in updates.items():
        setattr(customer, field, value)

    if updates:
        record_audit_event(
            db,
            action="customer.update",
            entity_type="customer",
            entity_id=customer.id,
            user_id=ctx.user.id,
            business_id=ctx.business.id,
            details={"updated_fields": sorted(updates.keys())},
            ip_address=get_client_ip(request),
        )
        db.commit()
        db.refresh(customer)

    return CustomerResponse.model_validate(customer)


@router.delete(
    "/customers/{customer_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a customer if not referenced by invoices or payments",
)
def delete_customer(
    customer_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_DELETE)),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    customer = get_tenant_record_or_404(
        db, Customer, customer_id, ctx.business.id, entity_label="Customer"
    )

    invoice_ref = db.scalar(
        select(Invoice.id).where(
            Invoice.business_id == ctx.business.id,
            Invoice.customer_id == customer.id,
        )
    )
    payment_ref = db.scalar(
        select(Payment.id).where(
            Payment.business_id == ctx.business.id,
            Payment.customer_id == customer.id,
        )
    )
    if invoice_ref is not None or payment_ref is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a customer referenced by existing invoices or payments.",
        )

    customer_name = customer.name
    db.delete(customer)

    record_audit_event(
        db,
        action="customer.delete",
        entity_type="customer",
        entity_id=customer_id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={"name": customer_name},
        ip_address=get_client_ip(request),
    )
    db.commit()
    return {"detail": "Customer deleted.", "customer_id": customer_id}


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------


@router.get(
    "/suppliers",
    response_model=PaginatedResponse[SupplierResponse],
    status_code=status.HTTP_200_OK,
    summary="List and search suppliers for a business",
)
def list_suppliers(
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> PaginatedResponse[SupplierResponse]:
    stmt = select(Supplier).where(Supplier.business_id == ctx.business.id)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Supplier.name.ilike(pattern),
                Supplier.email.ilike(pattern),
                Supplier.phone.ilike(pattern),
                Supplier.tax_id.ilike(pattern),
            )
        )

    total = int(
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    rows = db.scalars(
        stmt.order_by(Supplier.name.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedResponse(
        items=[SupplierResponse.model_validate(s) for s in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=compute_total_pages(total, page_size),
    )


@router.post(
    "/suppliers",
    response_model=SupplierResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a business-scoped supplier",
)
def create_supplier(
    payload: SupplierCreateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> SupplierResponse:
    supplier = Supplier(
        business_id=ctx.business.id,
        name=payload.name,
        email=str(payload.email).lower() if payload.email else None,
        phone=payload.phone,
        tax_id=payload.tax_id,
        address=payload.address,
        default_lead_time_days=payload.default_lead_time_days,
        opening_payable=payload.opening_payable,
        notes=payload.notes,
    )
    db.add(supplier)
    db.flush()

    record_audit_event(
        db,
        action="supplier.create",
        entity_type="supplier",
        entity_id=supplier.id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={"name": supplier.name},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(supplier)
    return SupplierResponse.model_validate(supplier)


@router.get(
    "/suppliers/{supplier_id}",
    response_model=SupplierResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve supplier details",
)
def get_supplier(
    supplier_id: str,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> SupplierResponse:
    supplier = get_tenant_record_or_404(
        db, Supplier, supplier_id, ctx.business.id, entity_label="Supplier"
    )
    return SupplierResponse.model_validate(supplier)


@router.patch(
    "/suppliers/{supplier_id}",
    response_model=SupplierResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a supplier record",
)
def update_supplier(
    supplier_id: str,
    payload: SupplierUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> SupplierResponse:
    supplier = get_tenant_record_or_404(
        db, Supplier, supplier_id, ctx.business.id, entity_label="Supplier"
    )
    updates = payload.model_dump(exclude_unset=True)
    if "email" in updates and updates["email"] is not None:
        updates["email"] = str(updates["email"]).lower()

    for field, value in updates.items():
        setattr(supplier, field, value)

    if updates:
        record_audit_event(
            db,
            action="supplier.update",
            entity_type="supplier",
            entity_id=supplier.id,
            user_id=ctx.user.id,
            business_id=ctx.business.id,
            details={"updated_fields": sorted(updates.keys())},
            ip_address=get_client_ip(request),
        )
        db.commit()
        db.refresh(supplier)

    return SupplierResponse.model_validate(supplier)


@router.delete(
    "/suppliers/{supplier_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a supplier if not referenced by inventory products or stock movements",
)
def delete_supplier(
    supplier_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_DELETE)),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    supplier = get_tenant_record_or_404(
        db, Supplier, supplier_id, ctx.business.id, entity_label="Supplier"
    )

    movement_ref = db.scalar(
        select(StockMovement.id).where(
            StockMovement.business_id == ctx.business.id,
            StockMovement.supplier_id == supplier.id,
        )
    )
    product_ref = db.scalar(
        select(InventoryProduct.id).where(
            InventoryProduct.business_id == ctx.business.id,
            InventoryProduct.preferred_supplier_id == supplier.id,
        )
    )
    if movement_ref is not None or product_ref is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a supplier linked to inventory products or stock movements.",
        )

    supplier_name = supplier.name
    db.delete(supplier)

    record_audit_event(
        db,
        action="supplier.delete",
        entity_type="supplier",
        entity_id=supplier_id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={"name": supplier_name},
        ip_address=get_client_ip(request),
    )
    db.commit()
    return {"detail": "Supplier deleted.", "supplier_id": supplier_id}
