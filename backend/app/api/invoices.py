from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import (
    TenantContext,
    get_client_ip,
    get_tenant_record_or_404,
    require_business_permission,
)
from app.core.permissions import Permission
from app.db.session import get_db
from app.models import Customer, Invoice, InvoiceLineItem, Payment
from app.models.enums import InvoiceStatus
from app.schemas.common import PaginatedResponse
from app.schemas.invoice import (
    InvoiceCreateRequest,
    InvoiceDetailResponse,
    InvoiceLineItemResponse,
    InvoiceSummaryResponse,
    InvoiceUpdateRequest,
    PaymentResponse,
)
from app.services.audit_service import record_audit_event
from app.services.financial_utils import compute_total_pages, to_money, to_qty

router = APIRouter(prefix="/businesses/{business_id}/invoices", tags=["invoices"])

ALLOWED_CREATE_STATUSES = {
    InvoiceStatus.DRAFT,
    InvoiceStatus.PENDING,
    InvoiceStatus.OVERDUE,
}

ALLOWED_STATUS_TRANSITIONS: dict[InvoiceStatus, set[InvoiceStatus]] = {
    InvoiceStatus.DRAFT: {InvoiceStatus.DRAFT, InvoiceStatus.PENDING, InvoiceStatus.VOID},
    InvoiceStatus.PENDING: {
        InvoiceStatus.DRAFT,
        InvoiceStatus.PENDING,
        InvoiceStatus.OVERDUE,
        InvoiceStatus.VOID,
    },
    InvoiceStatus.OVERDUE: {
        InvoiceStatus.OVERDUE,
        InvoiceStatus.PENDING,
        InvoiceStatus.VOID,
    },
    InvoiceStatus.PARTIAL: {InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE},
    InvoiceStatus.PAID: {InvoiceStatus.PAID},
    InvoiceStatus.VOID: {InvoiceStatus.VOID},
}


def _compute_is_overdue(invoice: Invoice, as_of: date | None = None) -> bool:
    ref_date = as_of or date.today()
    outstanding = to_money(invoice.total_amount - invoice.amount_paid)
    if outstanding <= Decimal("0.00"):
        return False
    if invoice.status in {InvoiceStatus.DRAFT, InvoiceStatus.VOID, InvoiceStatus.PAID}:
        return False
    return invoice.status == InvoiceStatus.OVERDUE or invoice.due_date < ref_date


def _serialize_invoice_summary(invoice: Invoice) -> InvoiceSummaryResponse:
    outstanding = to_money(invoice.total_amount - invoice.amount_paid)
    return InvoiceSummaryResponse(
        id=invoice.id,
        business_id=invoice.business_id,
        customer_id=invoice.customer_id,
        customer_name=invoice.customer.name if invoice.customer is not None else "",
        invoice_number=invoice.invoice_number,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        tax_rate=invoice.tax_rate,
        subtotal=invoice.subtotal,
        tax_amount=invoice.tax_amount,
        total_amount=invoice.total_amount,
        amount_paid=invoice.amount_paid,
        outstanding_balance=outstanding,
        is_overdue=_compute_is_overdue(invoice),
        status=invoice.status,
        notes=invoice.notes,
        is_demo_data=invoice.is_demo_data,
        created_at=invoice.created_at,
        updated_at=invoice.updated_at,
    )


def _serialize_invoice_detail(invoice: Invoice) -> InvoiceDetailResponse:
    summary = _serialize_invoice_summary(invoice)
    return InvoiceDetailResponse(
        **summary.model_dump(),
        line_items=[InvoiceLineItemResponse.model_validate(li) for li in invoice.line_items],
        payments=[
            PaymentResponse(
                **PaymentResponse.model_validate(p).model_dump(
                    exclude={"invoice_status", "invoice_remaining_balance"}
                ),
                invoice_status=invoice.status,
                invoice_remaining_balance=summary.outstanding_balance,
            )
            for p in invoice.payments
        ],
    )


@router.get(
    "",
    response_model=PaginatedResponse[InvoiceSummaryResponse],
    status_code=status.HTTP_200_OK,
    summary="List, filter, and paginate invoices",
)
def list_invoices(
    status_filter: InvoiceStatus | None = Query(default=None, alias="status"),
    customer_id: str | None = Query(default=None),
    unpaid_only: bool = Query(default=False),
    overdue_only: bool = Query(default=False),
    issue_from: date | None = Query(default=None),
    issue_to: date | None = Query(default=None),
    due_from: date | None = Query(default=None),
    due_to: date | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> PaginatedResponse[InvoiceSummaryResponse]:
    today = date.today()
    stmt = (
        select(Invoice)
        .join(Customer, Customer.id == Invoice.customer_id)
        .options(selectinload(Invoice.customer))
        .where(Invoice.business_id == ctx.business.id)
    )
    if status_filter is not None:
        stmt = stmt.where(Invoice.status == status_filter)
    if customer_id is not None:
        stmt = stmt.where(Invoice.customer_id == customer_id)
    if unpaid_only:
        stmt = stmt.where(
            Invoice.status.in_(
                [InvoiceStatus.PENDING, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE]
            ),
            Invoice.total_amount > Invoice.amount_paid,
        )
    if overdue_only:
        stmt = stmt.where(
            Invoice.status.notin_([InvoiceStatus.DRAFT, InvoiceStatus.VOID, InvoiceStatus.PAID]),
            Invoice.total_amount > Invoice.amount_paid,
            or_(Invoice.status == InvoiceStatus.OVERDUE, Invoice.due_date < today),
        )
    if issue_from is not None:
        stmt = stmt.where(Invoice.issue_date >= issue_from)
    if issue_to is not None:
        stmt = stmt.where(Invoice.issue_date <= issue_to)
    if due_from is not None:
        stmt = stmt.where(Invoice.due_date >= due_from)
    if due_to is not None:
        stmt = stmt.where(Invoice.due_date <= due_to)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Invoice.invoice_number.ilike(pattern),
                Customer.name.ilike(pattern),
                Invoice.notes.ilike(pattern),
            )
        )

    total = int(
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    rows = db.scalars(
        stmt.order_by(Invoice.due_date.asc(), Invoice.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedResponse(
        items=[_serialize_invoice_summary(inv) for inv in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=compute_total_pages(total, page_size),
    )


@router.post(
    "",
    response_model=InvoiceDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an invoice with line items (does not create a cash receipt)",
)
def create_invoice(
    payload: InvoiceCreateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> InvoiceDetailResponse:
    if payload.status not in ALLOWED_CREATE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invoices must be created as 'draft', 'pending', or 'overdue'. "
                "Use the payments endpoint to record payments."
            ),
        )

    customer = get_tenant_record_or_404(
        db, Customer, payload.customer_id, ctx.business.id, entity_label="Customer"
    )

    duplicate = db.scalar(
        select(Invoice.id).where(
            Invoice.business_id == ctx.business.id,
            Invoice.invoice_number == payload.invoice_number,
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invoice number '{payload.invoice_number}' already exists in this business.",
        )

    subtotal = Decimal("0.00")
    line_item_models: list[InvoiceLineItem] = []
    for item in payload.line_items:
        qty = to_qty(item.quantity)
        unit_price = to_money(item.unit_price)
        line_total = to_money(qty * unit_price)
        subtotal = to_money(subtotal + line_total)
        line_item_models.append(
            InvoiceLineItem(
                business_id=ctx.business.id,
                description=item.description,
                quantity=qty,
                unit_price=unit_price,
                line_total=line_total,
            )
        )

    tax_amount = to_money(subtotal * (payload.tax_rate / Decimal("100.00")))
    total_amount = to_money(subtotal + tax_amount)

    invoice = Invoice(
        business_id=ctx.business.id,
        customer_id=customer.id,
        invoice_number=payload.invoice_number,
        issue_date=payload.issue_date,
        due_date=payload.due_date,
        tax_rate=payload.tax_rate,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total_amount=total_amount,
        amount_paid=Decimal("0.00"),
        status=payload.status,
        notes=payload.notes,
        is_demo_data=False,
    )
    invoice.line_items = line_item_models
    db.add(invoice)
    db.flush()

    record_audit_event(
        db,
        action="invoice.create",
        entity_type="invoice",
        entity_id=invoice.id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={
            "invoice_number": invoice.invoice_number,
            "customer_id": customer.id,
            "total_amount": str(invoice.total_amount),
            "status": invoice.status.value,
        },
        ip_address=get_client_ip(request),
    )
    db.commit()

    created = db.scalar(
        select(Invoice)
        .options(
            selectinload(Invoice.customer),
            selectinload(Invoice.line_items),
            selectinload(Invoice.payments),
        )
        .where(and_(Invoice.id == invoice.id, Invoice.business_id == ctx.business.id))
    )
    assert created is not None
    return _serialize_invoice_detail(created)


@router.get(
    "/{invoice_id}",
    response_model=InvoiceDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve full invoice details, line items, and payments",
)
def get_invoice(
    invoice_id: str,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> InvoiceDetailResponse:
    invoice = db.scalar(
        select(Invoice)
        .options(
            selectinload(Invoice.customer),
            selectinload(Invoice.line_items),
            selectinload(Invoice.payments),
        )
        .where(Invoice.id == invoice_id, Invoice.business_id == ctx.business.id)
    )
    if invoice is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found in this business workspace.",
        )
    return _serialize_invoice_detail(invoice)


@router.patch(
    "/{invoice_id}",
    response_model=InvoiceDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Update an eligible invoice while enforcing status and payment locks",
)
def update_invoice(
    invoice_id: str,
    payload: InvoiceUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> InvoiceDetailResponse:
    invoice = db.scalar(
        select(Invoice)
        .options(
            selectinload(Invoice.customer),
            selectinload(Invoice.line_items),
            selectinload(Invoice.payments),
        )
        .where(Invoice.id == invoice_id, Invoice.business_id == ctx.business.id)
    )
    if invoice is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found in this business workspace.",
        )

    updates = payload.model_dump(exclude_unset=True)

    if invoice.status in {InvoiceStatus.PAID, InvoiceStatus.VOID}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invoices in '{invoice.status.value}' status cannot be modified.",
        )

    if "status" in updates and updates["status"] is not None:
        target_status: InvoiceStatus = updates["status"]
        if target_status in {InvoiceStatus.PARTIAL, InvoiceStatus.PAID} and target_status != invoice.status:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot manually mark an invoice partial or paid. Record a payment instead.",
            )
        allowed_targets = ALLOWED_STATUS_TRANSITIONS.get(invoice.status, set())
        if target_status not in allowed_targets:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid invoice status transition from '{invoice.status.value}' to '{target_status.value}'.",
            )
        if target_status in {InvoiceStatus.DRAFT, InvoiceStatus.VOID} and invoice.amount_paid > Decimal("0.00"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot revert to draft or void an invoice that already has recorded payments.",
            )

    financial_lock_fields = {"customer_id", "tax_rate", "line_items", "issue_date"}
    if invoice.amount_paid > Decimal("0.00") and financial_lock_fields.intersection(updates.keys()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot modify customer, issue_date, tax_rate, or line items after payments have been recorded.",
        )

    new_issue_date = updates.get("issue_date", invoice.issue_date)
    new_due_date = updates.get("due_date", invoice.due_date)
    if new_due_date < new_issue_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="due_date cannot be earlier than issue_date.",
        )

    if "customer_id" in updates and updates["customer_id"] is not None:
        get_tenant_record_or_404(
            db, Customer, updates["customer_id"], ctx.business.id, entity_label="Customer"
        )
        invoice.customer_id = updates["customer_id"]

    invoice.issue_date = new_issue_date
    invoice.due_date = new_due_date

    if "notes" in updates:
        invoice.notes = updates["notes"]
    if "status" in updates and updates["status"] is not None:
        invoice.status = updates["status"]

    if "line_items" in updates and payload.line_items is not None:
        invoice.line_items.clear()
        db.flush()
        subtotal = Decimal("0.00")
        for item in payload.line_items:
            qty = to_qty(item.quantity)
            unit_price = to_money(item.unit_price)
            line_total = to_money(qty * unit_price)
            subtotal = to_money(subtotal + line_total)
            invoice.line_items.append(
                InvoiceLineItem(
                    business_id=ctx.business.id,
                    invoice_id=invoice.id,
                    description=item.description,
                    quantity=qty,
                    unit_price=unit_price,
                    line_total=line_total,
                )
            )
        invoice.subtotal = subtotal

    if "tax_rate" in updates and payload.tax_rate is not None:
        invoice.tax_rate = payload.tax_rate

    if "line_items" in updates or "tax_rate" in updates:
        invoice.tax_amount = to_money(invoice.subtotal * (invoice.tax_rate / Decimal("100.00")))
        invoice.total_amount = to_money(invoice.subtotal + invoice.tax_amount)

    if updates:
        record_audit_event(
            db,
            action="invoice.update",
            entity_type="invoice",
            entity_id=invoice.id,
            user_id=ctx.user.id,
            business_id=ctx.business.id,
            details={"updated_fields": sorted(updates.keys()), "status": invoice.status.value},
            ip_address=get_client_ip(request),
        )
        db.commit()

    refreshed = db.scalar(
        select(Invoice)
        .options(
            selectinload(Invoice.customer),
            selectinload(Invoice.line_items),
            selectinload(Invoice.payments),
        )
        .where(Invoice.id == invoice.id, Invoice.business_id == ctx.business.id)
    )
    assert refreshed is not None
    return _serialize_invoice_detail(refreshed)


@router.delete(
    "/{invoice_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a draft invoice with no recorded payments",
)
def delete_invoice(
    invoice_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_DELETE)),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    invoice = get_tenant_record_or_404(
        db, Invoice, invoice_id, ctx.business.id, entity_label="Invoice"
    )
    if invoice.status != InvoiceStatus.DRAFT or invoice.amount_paid > Decimal("0.00"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Only unpaid draft invoices can be deleted. "
                "Issued invoices with zero payments must be transitioned to 'void' instead."
            ),
        )

    inv_num = invoice.invoice_number
    db.delete(invoice)
    record_audit_event(
        db,
        action="invoice.delete",
        entity_type="invoice",
        entity_id=invoice_id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={"invoice_number": inv_num},
        ip_address=get_client_ip(request),
    )
    db.commit()
    return {"detail": "Draft invoice deleted.", "invoice_id": invoice_id}
