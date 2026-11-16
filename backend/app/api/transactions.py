from __future__ import annotations

import csv
from datetime import date
import io

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.deps import (
    TenantContext,
    get_client_ip,
    get_tenant_record_or_404,
    require_business_permission,
)
from app.core.permissions import Permission
from app.db.session import get_db
from app.models import Payment, StockMovement, Transaction, TransactionCategory
from app.models.enums import (
    PaymentMethod,
    TransactionSource,
    TransactionStatus,
    TransactionType,
)
from app.schemas.common import PaginatedResponse
from app.schemas.transaction import (
    TransactionCreateRequest,
    TransactionCsvImportResponse,
    TransactionResponse,
    TransactionReverseRequest,
    TransactionUpdateRequest,
)
from app.services.audit_service import record_audit_event
from app.services.financial_utils import (
    compute_total_pages,
    csv_safe_cell,
    parse_decimal_strict,
)

router = APIRouter(prefix="/businesses/{business_id}/transactions", tags=["transactions"])


def _serialize_transaction(tx: Transaction) -> TransactionResponse:
    return TransactionResponse(
        id=tx.id,
        business_id=tx.business_id,
        category_id=tx.category_id,
        category_name=tx.category.name if tx.category is not None else None,
        created_by_user_id=tx.created_by_user_id,
        transaction_date=tx.transaction_date,
        description=tx.description,
        counterparty=tx.counterparty,
        type=tx.type,
        amount=tx.amount,
        payment_method=tx.payment_method,
        status=tx.status,
        source_type=tx.source_type,
        reference_code=tx.reference_code,
        notes=tx.notes,
        is_demo_data=tx.is_demo_data,
        created_at=tx.created_at,
        updated_at=tx.updated_at,
    )


def _validate_category_for_tx(
    db: Session,
    business_id: str,
    category_id: str | None,
    tx_type: TransactionType,
) -> TransactionCategory | None:
    if category_id is None:
        return None
    category = get_tenant_record_or_404(
        db,
        TransactionCategory,
        category_id,
        business_id,
        entity_label="Category",
    )
    if category.type != tx_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Category '{category.name}' is of type '{category.type.value}' "
                f"and cannot be assigned to a '{tx_type.value}' transaction."
            ),
        )
    return category


def _build_filtered_tx_query(
    business_id: str,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    category_id: str | None = None,
    type: TransactionType | None = None,
    tx_status: TransactionStatus | None = None,
    source_type: TransactionSource | None = None,
    search: str | None = None,
):
    stmt = (
        select(Transaction)
        .options(selectinload(Transaction.category))
        .where(Transaction.business_id == business_id)
    )
    if start_date is not None:
        stmt = stmt.where(Transaction.transaction_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(Transaction.transaction_date <= end_date)
    if category_id is not None:
        stmt = stmt.where(Transaction.category_id == category_id)
    if type is not None:
        stmt = stmt.where(Transaction.type == type)
    if tx_status is not None:
        stmt = stmt.where(Transaction.status == tx_status)
    if source_type is not None:
        stmt = stmt.where(Transaction.source_type == source_type)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Transaction.description.ilike(pattern),
                Transaction.counterparty.ilike(pattern),
                Transaction.reference_code.ilike(pattern),
                Transaction.notes.ilike(pattern),
            )
        )
    return stmt


@router.get(
    "",
    response_model=PaginatedResponse[TransactionResponse],
    status_code=status.HTTP_200_OK,
    summary="List, search, filter, and paginate business transactions",
)
def list_transactions(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    category_id: str | None = Query(default=None),
    type: TransactionType | None = Query(default=None),
    status_filter: TransactionStatus | None = Query(default=None, alias="status"),
    source_type: TransactionSource | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> PaginatedResponse[TransactionResponse]:
    base_stmt = _build_filtered_tx_query(
        ctx.business.id,
        start_date=start_date,
        end_date=end_date,
        category_id=category_id,
        type=type,
        tx_status=status_filter,
        source_type=source_type,
        search=search,
    )

    count_stmt = select(func.count()).select_from(base_stmt.order_by(None).subquery())
    total = int(db.scalar(count_stmt) or 0)

    items_stmt = (
        base_stmt.order_by(
            Transaction.transaction_date.desc(), Transaction.created_at.desc()
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = db.scalars(items_stmt).all()
    return PaginatedResponse(
        items=[_serialize_transaction(tx) for tx in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=compute_total_pages(total, page_size),
    )


@router.post(
    "",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a manual ledger transaction",
)
def create_transaction(
    payload: TransactionCreateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> TransactionResponse:
    category = _validate_category_for_tx(
        db, ctx.business.id, payload.category_id, payload.type
    )

    tx = Transaction(
        business_id=ctx.business.id,
        category_id=category.id if category is not None else None,
        created_by_user_id=ctx.user.id,
        transaction_date=payload.transaction_date,
        description=payload.description,
        counterparty=payload.counterparty,
        type=payload.type,
        amount=payload.amount,
        payment_method=payload.payment_method,
        status=payload.status,
        source_type=TransactionSource.MANUAL,
        reference_code=payload.reference_code,
        notes=payload.notes,
        is_demo_data=False,
    )
    db.add(tx)
    db.flush()

    record_audit_event(
        db,
        action="transaction.create",
        entity_type="transaction",
        entity_id=tx.id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={
            "type": tx.type.value,
            "amount": str(tx.amount),
            "status": tx.status.value,
        },
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(tx)
    if category is not None:
        tx.category = category
    return _serialize_transaction(tx)


@router.get(
    "/export-csv",
    status_code=status.HTTP_200_OK,
    summary="Export filtered business transactions to CSV",
)
def export_transactions_csv(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    category_id: str | None = Query(default=None),
    type: TransactionType | None = Query(default=None),
    status_filter: TransactionStatus | None = Query(default=None, alias="status"),
    source_type: TransactionSource | None = Query(default=None),
    search: str | None = Query(default=None),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    stmt = _build_filtered_tx_query(
        ctx.business.id,
        start_date=start_date,
        end_date=end_date,
        category_id=category_id,
        type=type,
        tx_status=status_filter,
        source_type=source_type,
        search=search,
    ).order_by(Transaction.transaction_date.desc(), Transaction.created_at.desc())

    rows = db.scalars(stmt).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "id",
            "transaction_date",
            "description",
            "counterparty",
            "category",
            "type",
            "amount",
            "payment_method",
            "status",
            "source_type",
            "reference_code",
            "notes",
        ]
    )
    for tx in rows:
        writer.writerow(
            [
                tx.id,
                tx.transaction_date.isoformat(),
                csv_safe_cell(tx.description),
                csv_safe_cell(tx.counterparty),
                csv_safe_cell(tx.category.name if tx.category else ""),
                tx.type.value,
                f"{tx.amount:.2f}",
                tx.payment_method.value,
                tx.status.value,
                tx.source_type.value,
                csv_safe_cell(tx.reference_code),
                csv_safe_cell(tx.notes),
            ]
        )

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="transactions_{ctx.business.id[:8]}.csv"'
        },
    )


@router.post(
    "/import-csv",
    response_model=TransactionCsvImportResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Import transactions from a CSV file atomically",
)
async def import_transactions_csv(
    request: Request,
    file: UploadFile = File(...),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> TransactionCsvImportResponse:
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded CSV file is empty.",
        )
    try:
        csv_text = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV file must be UTF-8 encoded.",
        ) from exc

    reader = csv.DictReader(io.StringIO(csv_text))
    if not reader.fieldnames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV header row is missing.",
        )

    normalized_headers = {h.strip().lower() for h in reader.fieldnames if h}
    has_date_col = "transaction_date" in normalized_headers or "date" in normalized_headers
    required = {"description", "counterparty", "type", "amount"}
    if not has_date_col or not required.issubset(normalized_headers):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "CSV must contain headers: transaction_date (or date), "
                "description, counterparty, type, amount."
            ),
        )

    existing_cats = db.scalars(
        select(TransactionCategory).where(TransactionCategory.business_id == ctx.business.id)
    ).all()
    cat_lookup: dict[tuple[str, TransactionType], TransactionCategory] = {
        (cat.name.lower(), cat.type): cat for cat in existing_cats
    }
    created_categories: list[str] = []
    created_tx_ids: list[str] = []
    row_errors: list[str] = []

    rows_data = list(reader)
    if not rows_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV contains no data rows.",
        )

    for idx, raw_row in enumerate(rows_data, start=2):
        row = {(k.strip().lower() if k else ""): (v.strip() if v else "") for k, v in raw_row.items()}
        try:
            date_str = row.get("transaction_date") or row.get("date") or ""
            tx_date = date.fromisoformat(date_str)
            description = row.get("description", "")
            counterparty = row.get("counterparty", "")
            if not description or not counterparty:
                raise ValueError("description and counterparty are required.")

            tx_type = TransactionType(row.get("type", "").lower())
            amount = parse_decimal_strict(row.get("amount", ""), scale="money")
            if amount <= 0:
                raise ValueError("amount must be greater than 0.")

            pm_raw = (row.get("payment_method") or "bank_transfer").lower().replace(" ", "_").replace("-", "_")
            payment_method = PaymentMethod(pm_raw)

            status_raw = (row.get("status") or "completed").lower()
            tx_status = TransactionStatus(status_raw)

            cat_name = row.get("category") or ""
            category_id: str | None = None
            if cat_name:
                key = (cat_name.lower(), tx_type)
                cat_obj = cat_lookup.get(key)
                if cat_obj is None:
                    cat_obj = TransactionCategory(
                        business_id=ctx.business.id,
                        name=cat_name[:80],
                        type=tx_type,
                        is_operating=True,
                        is_system=False,
                    )
                    db.add(cat_obj)
                    db.flush()
                    cat_lookup[key] = cat_obj
                    created_categories.append(cat_obj.name)
                category_id = cat_obj.id

            tx = Transaction(
                business_id=ctx.business.id,
                category_id=category_id,
                created_by_user_id=ctx.user.id,
                transaction_date=tx_date,
                description=description[:255],
                counterparty=counterparty[:160],
                type=tx_type,
                amount=amount,
                payment_method=payment_method,
                status=tx_status,
                source_type=TransactionSource.CSV_IMPORT,
                reference_code=(row.get("reference_code") or row.get("reference") or None),
                notes=row.get("notes") or None,
                is_demo_data=False,
            )
            db.add(tx)
            db.flush()
            created_tx_ids.append(tx.id)
        except (ValueError, KeyError) as exc:
            row_errors.append(f"Row {idx}: {exc}")

    if row_errors:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "CSV import failed validation.", "errors": row_errors[:20]},
        )

    record_audit_event(
        db,
        action="transaction.csv_import",
        entity_type="business",
        entity_id=ctx.business.id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={
            "imported_count": len(created_tx_ids),
            "created_categories": created_categories,
        },
        ip_address=get_client_ip(request),
    )
    db.commit()
    return TransactionCsvImportResponse(
        imported_count=len(created_tx_ids),
        created_categories=created_categories,
        transaction_ids=created_tx_ids,
    )


@router.get(
    "/{transaction_id}",
    response_model=TransactionResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve a single transaction",
)
def get_transaction(
    transaction_id: str,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> TransactionResponse:
    tx = get_tenant_record_or_404(
        db, Transaction, transaction_id, ctx.business.id, entity_label="Transaction"
    )
    return _serialize_transaction(tx)


@router.patch(
    "/{transaction_id}",
    response_model=TransactionResponse,
    status_code=status.HTTP_200_OK,
    summary="Update an eligible transaction",
)
def update_transaction(
    transaction_id: str,
    payload: TransactionUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> TransactionResponse:
    tx = get_tenant_record_or_404(
        db, Transaction, transaction_id, ctx.business.id, entity_label="Transaction"
    )
    updates = payload.model_dump(exclude_unset=True)

    linked_payment = db.scalar(
        select(Payment.id).where(Payment.transaction_id == tx.id)
    )
    linked_movement = db.scalar(
        select(StockMovement.id).where(StockMovement.transaction_id == tx.id)
    )
    is_linked = linked_payment is not None or linked_movement is not None

    restricted_financial_fields = {"amount", "type", "status", "transaction_date"}
    if is_linked and restricted_financial_fields.intersection(updates.keys()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cannot modify amount, type, status, or date of a ledger entry linked "
                "to an invoice payment or inventory restock."
            ),
        )

    if tx.status in {TransactionStatus.COMPLETED, TransactionStatus.VOID} and (
        {"amount", "type", "status"}.intersection(updates.keys())
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Completed or voided transactions cannot have amount, type, or status altered. "
                "Use the reversal endpoint to offset a completed entry."
            ),
        )

    target_type = updates.get("type", tx.type)
    target_category_id = updates.get("category_id", tx.category_id)
    if "category_id" in updates or "type" in updates:
        _validate_category_for_tx(db, ctx.business.id, target_category_id, target_type)

    for field, value in updates.items():
        setattr(tx, field, value)

    if updates:
        record_audit_event(
            db,
            action="transaction.update",
            entity_type="transaction",
            entity_id=tx.id,
            user_id=ctx.user.id,
            business_id=ctx.business.id,
            details={"updated_fields": sorted(updates.keys())},
            ip_address=get_client_ip(request),
        )
        db.commit()
        db.refresh(tx)

    return _serialize_transaction(tx)


@router.delete(
    "/{transaction_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a non-settled, unlinked transaction",
)
def delete_transaction(
    transaction_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_DELETE)),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    tx = get_tenant_record_or_404(
        db, Transaction, transaction_id, ctx.business.id, entity_label="Transaction"
    )

    linked_payment = db.scalar(select(Payment.id).where(Payment.transaction_id == tx.id))
    linked_movement = db.scalar(
        select(StockMovement.id).where(StockMovement.transaction_id == tx.id)
    )
    if linked_payment is not None or linked_movement is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a transaction linked to an invoice payment or stock movement.",
        )

    if tx.status in {TransactionStatus.COMPLETED, TransactionStatus.VOID}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Historical completed or voided transactions cannot be erased. "
                "Use POST /transactions/{id}/reverse to record an offsetting reversal entry."
            ),
        )

    tx_amount = str(tx.amount)
    tx_type = tx.type.value
    db.delete(tx)

    record_audit_event(
        db,
        action="transaction.delete",
        entity_type="transaction",
        entity_id=transaction_id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={"amount": tx_amount, "type": tx_type},
        ip_address=get_client_ip(request),
    )
    db.commit()
    return {"detail": "Pending/scheduled transaction deleted.", "transaction_id": transaction_id}


@router.post(
    "/{transaction_id}/reverse",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an offsetting reversal transaction for a completed ledger entry",
)
def reverse_transaction(
    transaction_id: str,
    payload: TransactionReverseRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> TransactionResponse:
    original = get_tenant_record_or_404(
        db, Transaction, transaction_id, ctx.business.id, entity_label="Transaction"
    )

    if original.status != TransactionStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only completed transactions can be reversed.",
        )

    linked_payment = db.scalar(
        select(Payment.id).where(Payment.transaction_id == original.id)
    )
    linked_movement = db.scalar(
        select(StockMovement.id).where(StockMovement.transaction_id == original.id)
    )
    if linked_payment is not None or linked_movement is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Transactions tied to invoice payments or stock movements cannot be reversed directly here.",
        )

    reversal_ref = f"REV-{original.id}"
    already_reversed = db.scalar(
        select(Transaction.id).where(
            Transaction.business_id == ctx.business.id,
            Transaction.reference_code == reversal_ref,
        )
    )
    if already_reversed is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This transaction has already been reversed.",
        )

    reversal_type = (
        TransactionType.EXPENSE
        if original.type == TransactionType.INCOME
        else TransactionType.INCOME
    )
    reversal_tx = Transaction(
        business_id=ctx.business.id,
        category_id=None,
        created_by_user_id=ctx.user.id,
        transaction_date=payload.reversal_date or date.today(),
        description=f"Reversal: {original.description}"[:255],
        counterparty=original.counterparty,
        type=reversal_type,
        amount=original.amount,
        payment_method=original.payment_method,
        status=TransactionStatus.COMPLETED,
        source_type=TransactionSource.MANUAL,
        reference_code=reversal_ref[:80],
        notes=f"Reverses transaction {original.id}. Reason: {payload.reason}",
        is_demo_data=original.is_demo_data,
    )
    db.add(reversal_tx)
    db.flush()

    record_audit_event(
        db,
        action="transaction.reverse",
        entity_type="transaction",
        entity_id=reversal_tx.id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={
            "reversed_transaction_id": original.id,
            "amount": str(reversal_tx.amount),
            "reversal_type": reversal_tx.type.value,
            "reason": payload.reason,
        },
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(reversal_tx)
    return _serialize_transaction(reversal_tx)
