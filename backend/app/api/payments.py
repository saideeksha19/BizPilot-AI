from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import (
    TenantContext,
    get_client_ip,
    get_tenant_record_or_404,
    require_business_permission,
)
from app.core.permissions import Permission
from app.db.session import get_db
from app.models import Customer, Invoice, Payment, Transaction
from app.models.enums import (
    InvoiceStatus,
    PaymentMethod,
    TransactionSource,
    TransactionStatus,
    TransactionType,
)
from app.schemas.common import PaginatedResponse
from app.schemas.invoice import PaymentCreateRequest, PaymentResponse
from app.services.audit_service import record_audit_event
from app.services.financial_utils import (
    compute_total_pages,
    get_or_create_system_category,
    to_money,
)

router = APIRouter(prefix="/businesses/{business_id}/payments", tags=["payments"])


def _serialize_payment(payment: Payment, invoice: Invoice | None = None) -> PaymentResponse:
    remaining = (
        to_money(invoice.total_amount - invoice.amount_paid)
        if invoice is not None
        else None
    )
    return PaymentResponse(
        id=payment.id,
        business_id=payment.business_id,
        invoice_id=payment.invoice_id,
        customer_id=payment.customer_id,
        transaction_id=payment.transaction_id,
        payment_reference=payment.payment_reference,
        idempotency_key=payment.idempotency_key,
        payment_date=payment.payment_date,
        amount=payment.amount,
        payment_method=payment.payment_method,
        notes=payment.notes,
        created_at=payment.created_at,
        updated_at=payment.updated_at,
        invoice_status=invoice.status if invoice is not None else None,
        invoice_remaining_balance=remaining,
    )


@router.get(
    "",
    response_model=PaginatedResponse[PaymentResponse],
    status_code=status.HTTP_200_OK,
    summary="List and filter invoice payments for a business",
)
def list_payments(
    invoice_id: str | None = Query(default=None),
    customer_id: str | None = Query(default=None),
    payment_method: PaymentMethod | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> PaginatedResponse[PaymentResponse]:
    stmt = select(Payment).where(Payment.business_id == ctx.business.id)
    if invoice_id is not None:
        stmt = stmt.where(Payment.invoice_id == invoice_id)
    if customer_id is not None:
        stmt = stmt.where(Payment.customer_id == customer_id)
    if payment_method is not None:
        stmt = stmt.where(Payment.payment_method == payment_method)
    if date_from is not None:
        stmt = stmt.where(Payment.payment_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Payment.payment_date <= date_to)

    total = int(
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    rows = db.scalars(
        stmt.order_by(Payment.payment_date.desc(), Payment.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedResponse(
        items=[_serialize_payment(p) for p in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=compute_total_pages(total, page_size),
    )


@router.post(
    "",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a full or partial invoice payment atomically with idempotency support",
)
def create_payment(
    payload: PaymentCreateRequest,
    request: Request,
    response: Response,
    header_idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> PaymentResponse:
    idem_key = (
        header_idempotency_key.strip()
        if header_idempotency_key and header_idempotency_key.strip()
        else (payload.idempotency_key.strip() if payload.idempotency_key else None)
    )

    # 1. Idempotent replay verification
    if idem_key is not None:
        existing_idem = db.scalar(
            select(Payment).where(
                Payment.business_id == ctx.business.id,
                Payment.idempotency_key == idem_key,
            )
        )
        if existing_idem is not None:
            if (
                existing_idem.invoice_id != payload.invoice_id
                or existing_idem.amount != payload.amount
                or existing_idem.payment_method != payload.payment_method
                or existing_idem.payment_reference != payload.payment_reference
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Idempotency-Key was already used with different payment parameters.",
                )
            linked_invoice = db.get(Invoice, existing_idem.invoice_id)
            response.status_code = status.HTTP_200_OK
            return _serialize_payment(existing_idem, linked_invoice)

    # 2. Prevent duplicate payment reference within the business
    existing_ref = db.scalar(
        select(Payment.id).where(
            Payment.business_id == ctx.business.id,
            Payment.payment_reference == payload.payment_reference,
        )
    )
    if existing_ref is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Payment reference '{payload.payment_reference}' has already been recorded.",
        )

    # 3. Lock target invoice scoped strictly to this business
    invoice = db.scalar(
        select(Invoice)
        .where(
            Invoice.id == payload.invoice_id,
            Invoice.business_id == ctx.business.id,
        )
        .with_for_update()
    )
    if invoice is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found in this business workspace.",
        )

    if invoice.status in {InvoiceStatus.DRAFT, InvoiceStatus.VOID, InvoiceStatus.PAID}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot record payment for an invoice in '{invoice.status.value}' status.",
        )

    remaining_balance = to_money(invoice.total_amount - invoice.amount_paid)
    if payload.amount > remaining_balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Payment amount ({payload.amount:.2f}) exceeds remaining "
                f"invoice balance ({remaining_balance:.2f})."
            ),
        )

    customer = get_tenant_record_or_404(
        db, Customer, invoice.customer_id, ctx.business.id, entity_label="Customer"
    )

    try:
        # 4. Create authoritative cash receipt transaction in ledger
        category = get_or_create_system_category(
            db,
            ctx.business.id,
            "Invoice Settlements",
            TransactionType.INCOME,
            is_operating=True,
        )
        ledger_tx = Transaction(
            business_id=ctx.business.id,
            category_id=category.id,
            created_by_user_id=ctx.user.id,
            transaction_date=payload.payment_date,
            description=f"Invoice Payment — {invoice.invoice_number}"[:255],
            counterparty=customer.name,
            type=TransactionType.INCOME,
            amount=payload.amount,
            payment_method=payload.payment_method,
            status=TransactionStatus.COMPLETED,
            source_type=TransactionSource.INVOICE_PAYMENT,
            reference_code=payload.payment_reference,
            notes=payload.notes,
            is_demo_data=invoice.is_demo_data,
        )
        db.add(ledger_tx)
        db.flush()

        # 5. Create payment linked to invoice & ledger transaction
        payment = Payment(
            business_id=ctx.business.id,
            invoice_id=invoice.id,
            customer_id=customer.id,
            transaction_id=ledger_tx.id,
            payment_reference=payload.payment_reference,
            idempotency_key=idem_key,
            payment_date=payload.payment_date,
            amount=payload.amount,
            payment_method=payload.payment_method,
            notes=payload.notes,
        )
        db.add(payment)

        # 6. Update invoice amount_paid and status atomically
        new_paid = to_money(invoice.amount_paid + payload.amount)
        invoice.amount_paid = new_paid
        if new_paid >= invoice.total_amount:
            invoice.status = InvoiceStatus.PAID
        else:
            invoice.status = InvoiceStatus.PARTIAL

        db.flush()
        record_audit_event(
            db,
            action="payment.create",
            entity_type="payment",
            entity_id=payment.id,
            user_id=ctx.user.id,
            business_id=ctx.business.id,
            details={
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "transaction_id": ledger_tx.id,
                "payment_reference": payment.payment_reference,
                "amount": str(payment.amount),
                "new_invoice_status": invoice.status.value,
            },
            ip_address=get_client_ip(request),
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payment conflicts with an existing payment reference or idempotency key.",
        ) from exc

    db.refresh(payment)
    db.refresh(invoice)
    return _serialize_payment(payment, invoice)


@router.get(
    "/{payment_id}",
    response_model=PaymentResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve a single payment record",
)
def get_payment(
    payment_id: str,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> PaymentResponse:
    payment = get_tenant_record_or_404(
        db, Payment, payment_id, ctx.business.id, entity_label="Payment"
    )
    invoice = db.get(Invoice, payment.invoice_id)
    return _serialize_payment(payment, invoice)
