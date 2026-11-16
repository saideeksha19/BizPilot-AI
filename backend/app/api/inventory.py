from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.deps import (
    TenantContext,
    get_client_ip,
    get_tenant_record_or_404,
    require_business_permission,
)
from app.core.permissions import Permission
from app.db.session import get_db
from app.models import InventoryProduct, StockMovement, Supplier, Transaction
from app.models.enums import (
    PaymentMethod,
    StockMovementType,
    TransactionSource,
    TransactionStatus,
    TransactionType,
)
from app.schemas.common import PaginatedResponse
from app.schemas.inventory import (
    InventoryProductCreateRequest,
    InventoryProductDetailResponse,
    InventoryProductResponse,
    InventoryProductUpdateRequest,
    InventoryRestockRequest,
    StockMovementCreateRequest,
    StockMovementResponse,
)
from app.services.audit_service import record_audit_event
from app.services.financial_utils import (
    compute_total_pages,
    get_or_create_system_category,
    to_money,
    to_qty,
)

router = APIRouter(prefix="/businesses/{business_id}/inventory", tags=["inventory"])


def _serialize_product(product: InventoryProduct) -> InventoryProductResponse:
    stock_value = to_money(product.current_stock * product.unit_cost)
    return InventoryProductResponse(
        id=product.id,
        business_id=product.business_id,
        preferred_supplier_id=product.preferred_supplier_id,
        preferred_supplier_name=(
            product.preferred_supplier.name
            if product.preferred_supplier is not None
            else None
        ),
        sku=product.sku,
        name=product.name,
        category=product.category,
        unit=product.unit,
        current_stock=product.current_stock,
        reorder_point=product.reorder_point,
        unit_cost=product.unit_cost,
        selling_price=product.selling_price,
        stock_value=stock_value,
        is_low_stock=product.current_stock <= product.reorder_point,
        last_restocked_date=product.last_restocked_date,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


def _serialize_movement(
    movement: StockMovement, resulting_stock: Decimal | None = None
) -> StockMovementResponse:
    return StockMovementResponse(
        id=movement.id,
        business_id=movement.business_id,
        product_id=movement.product_id,
        supplier_id=movement.supplier_id,
        transaction_id=movement.transaction_id,
        movement_type=movement.movement_type,
        movement_date=movement.movement_date,
        quantity_delta=movement.quantity_delta,
        unit_cost=movement.unit_cost,
        total_cost=movement.total_cost,
        reference_code=movement.reference_code,
        idempotency_key=movement.idempotency_key,
        notes=movement.notes,
        created_at=movement.created_at,
        updated_at=movement.updated_at,
        resulting_stock=resulting_stock,
    )


def _execute_stock_movement(
    *,
    db: Session,
    ctx: TenantContext,
    request: Request,
    response: Response,
    product_id: str,
    movement_type: StockMovementType,
    quantity_delta: Decimal,
    movement_date: date,
    unit_cost: Decimal | None,
    supplier_id: str | None,
    payment_method: PaymentMethod,
    reference_code: str | None,
    record_expense: bool,
    notes: str | None,
    idem_key: str | None,
) -> StockMovementResponse:
    if idem_key is not None:
        existing_idem = db.scalar(
            select(StockMovement).where(
                StockMovement.business_id == ctx.business.id,
                StockMovement.idempotency_key == idem_key,
            )
        )
        if existing_idem is not None:
            if (
                existing_idem.product_id != product_id
                or existing_idem.movement_type != movement_type
                or existing_idem.quantity_delta != quantity_delta
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Idempotency-Key was already used with different stock movement parameters.",
                )
            prod = db.get(InventoryProduct, existing_idem.product_id)
            response.status_code = status.HTTP_200_OK
            return _serialize_movement(existing_idem, prod.current_stock if prod else None)

    product = db.scalar(
        select(InventoryProduct)
        .where(
            InventoryProduct.id == product_id,
            InventoryProduct.business_id == ctx.business.id,
        )
        .with_for_update()
    )
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory product not found in this business workspace.",
        )

    if movement_type in {StockMovementType.RESTOCK, StockMovementType.RETURN_IN} and quantity_delta <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Movement type '{movement_type.value}' requires a positive quantity_delta.",
        )
    if movement_type in {StockMovementType.SALE, StockMovementType.RETURN_OUT} and quantity_delta >= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Movement type '{movement_type.value}' requires a negative quantity_delta.",
        )
    if record_expense and movement_type != StockMovementType.RESTOCK:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Automatic expense transactions can only be recorded for 'restock' movements.",
        )

    new_stock = to_qty(product.current_stock + quantity_delta)
    if new_stock < Decimal("0.000"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Insufficient stock for '{product.name}'. "
                f"Current stock: {product.current_stock}, requested delta: {quantity_delta}."
            ),
        )

    effective_supplier_id = supplier_id or (
        product.preferred_supplier_id if movement_type == StockMovementType.RESTOCK else None
    )
    supplier_obj: Supplier | None = None
    if effective_supplier_id is not None:
        supplier_obj = get_tenant_record_or_404(
            db, Supplier, effective_supplier_id, ctx.business.id, entity_label="Supplier"
        )

    effective_unit_cost = unit_cost if unit_cost is not None else product.unit_cost
    total_cost = to_money(abs(quantity_delta) * effective_unit_cost)

    try:
        linked_tx: Transaction | None = None
        if (
            movement_type == StockMovementType.RESTOCK
            and record_expense
            and total_cost > Decimal("0.00")
        ):
            expense_cat = get_or_create_system_category(
                db,
                ctx.business.id,
                "Inventory Procurement",
                TransactionType.EXPENSE,
                is_operating=True,
            )
            linked_tx = Transaction(
                business_id=ctx.business.id,
                category_id=expense_cat.id,
                created_by_user_id=ctx.user.id,
                transaction_date=movement_date,
                description=f"Inventory Restock: {product.name} ({quantity_delta} {product.unit})"[:255],
                counterparty=supplier_obj.name if supplier_obj else product.name,
                type=TransactionType.EXPENSE,
                amount=total_cost,
                payment_method=payment_method,
                status=TransactionStatus.COMPLETED,
                source_type=TransactionSource.INVENTORY_RESTOCK,
                reference_code=reference_code or f"PO-{product.sku}"[:80],
                notes=notes,
                is_demo_data=False,
            )
            db.add(linked_tx)
            db.flush()

        movement = StockMovement(
            business_id=ctx.business.id,
            product_id=product.id,
            supplier_id=supplier_obj.id if supplier_obj else None,
            transaction_id=linked_tx.id if linked_tx else None,
            movement_type=movement_type,
            movement_date=movement_date,
            quantity_delta=quantity_delta,
            unit_cost=effective_unit_cost,
            total_cost=total_cost,
            reference_code=reference_code,
            idempotency_key=idem_key,
            notes=notes,
        )
        db.add(movement)

        product.current_stock = new_stock
        if movement_type == StockMovementType.RESTOCK:
            product.unit_cost = effective_unit_cost
            product.last_restocked_date = movement_date

        db.flush()
        record_audit_event(
            db,
            action=f"inventory.{movement_type.value}",
            entity_type="stock_movement",
            entity_id=movement.id,
            user_id=ctx.user.id,
            business_id=ctx.business.id,
            details={
                "product_id": product.id,
                "sku": product.sku,
                "quantity_delta": str(quantity_delta),
                "resulting_stock": str(new_stock),
                "total_cost": str(total_cost),
                "transaction_id": linked_tx.id if linked_tx else None,
            },
            ip_address=get_client_ip(request),
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Stock movement conflicts with an existing idempotency key or linked transaction.",
        ) from exc

    db.refresh(movement)
    db.refresh(product)
    return _serialize_movement(movement, product.current_stock)


@router.get(
    "/products",
    response_model=PaginatedResponse[InventoryProductResponse],
    status_code=status.HTTP_200_OK,
    summary="List, search, and filter inventory products",
)
def list_products(
    search: str | None = Query(default=None),
    category: str | None = Query(default=None),
    low_stock_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> PaginatedResponse[InventoryProductResponse]:
    stmt = (
        select(InventoryProduct)
        .options(selectinload(InventoryProduct.preferred_supplier))
        .where(InventoryProduct.business_id == ctx.business.id)
    )
    if category and category.strip():
        stmt = stmt.where(InventoryProduct.category == category.strip())
    if low_stock_only:
        stmt = stmt.where(InventoryProduct.current_stock <= InventoryProduct.reorder_point)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                InventoryProduct.sku.ilike(pattern),
                InventoryProduct.name.ilike(pattern),
                InventoryProduct.category.ilike(pattern),
            )
        )

    total = int(
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    rows = db.scalars(
        stmt.order_by(InventoryProduct.name.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedResponse(
        items=[_serialize_product(p) for p in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=compute_total_pages(total, page_size),
    )


@router.post(
    "/products",
    response_model=InventoryProductResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new inventory product",
)
def create_product(
    payload: InventoryProductCreateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> InventoryProductResponse:
    existing_sku = db.scalar(
        select(InventoryProduct.id).where(
            InventoryProduct.business_id == ctx.business.id,
            InventoryProduct.sku == payload.sku,
        )
    )
    if existing_sku is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"SKU '{payload.sku}' already exists in this business.",
        )

    supplier_obj: Supplier | None = None
    if payload.preferred_supplier_id is not None:
        supplier_obj = get_tenant_record_or_404(
            db,
            Supplier,
            payload.preferred_supplier_id,
            ctx.business.id,
            entity_label="Preferred supplier",
        )

    product = InventoryProduct(
        business_id=ctx.business.id,
        preferred_supplier_id=supplier_obj.id if supplier_obj else None,
        sku=payload.sku,
        name=payload.name,
        category=payload.category,
        unit=payload.unit,
        current_stock=payload.current_stock,
        reorder_point=payload.reorder_point,
        unit_cost=payload.unit_cost,
        selling_price=payload.selling_price,
    )
    db.add(product)
    db.flush()

    record_audit_event(
        db,
        action="inventory.product_create",
        entity_type="inventory_product",
        entity_id=product.id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={"sku": product.sku, "name": product.name},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(product)
    product.preferred_supplier = supplier_obj
    return _serialize_product(product)


@router.get(
    "/products/{product_id}",
    response_model=InventoryProductDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve inventory product details and recent stock movements",
)
def get_product(
    product_id: str,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> InventoryProductDetailResponse:
    product = db.scalar(
        select(InventoryProduct)
        .options(selectinload(InventoryProduct.preferred_supplier))
        .where(
            InventoryProduct.id == product_id,
            InventoryProduct.business_id == ctx.business.id,
        )
    )
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory product not found in this business workspace.",
        )

    movements = db.scalars(
        select(StockMovement)
        .where(
            StockMovement.business_id == ctx.business.id,
            StockMovement.product_id == product.id,
        )
        .order_by(StockMovement.movement_date.desc(), StockMovement.created_at.desc())
        .limit(50)
    ).all()

    base = _serialize_product(product)
    return InventoryProductDetailResponse(
        **base.model_dump(),
        recent_movements=[_serialize_movement(m) for m in movements],
    )


@router.patch(
    "/products/{product_id}",
    response_model=InventoryProductResponse,
    status_code=status.HTTP_200_OK,
    summary="Update inventory product metadata (stock quantities must change via stock movements)",
)
def update_product(
    product_id: str,
    payload: InventoryProductUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> InventoryProductResponse:
    product = db.scalar(
        select(InventoryProduct)
        .options(selectinload(InventoryProduct.preferred_supplier))
        .where(
            InventoryProduct.id == product_id,
            InventoryProduct.business_id == ctx.business.id,
        )
    )
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Inventory product not found in this business workspace.",
        )

    updates = payload.model_dump(exclude_unset=True)
    if "preferred_supplier_id" in updates and updates["preferred_supplier_id"] is not None:
        get_tenant_record_or_404(
            db,
            Supplier,
            updates["preferred_supplier_id"],
            ctx.business.id,
            entity_label="Preferred supplier",
        )

    for field, value in updates.items():
        setattr(product, field, value)

    if updates:
        record_audit_event(
            db,
            action="inventory.product_update",
            entity_type="inventory_product",
            entity_id=product.id,
            user_id=ctx.user.id,
            business_id=ctx.business.id,
            details={"updated_fields": sorted(updates.keys())},
            ip_address=get_client_ip(request),
        )
        db.commit()
        db.refresh(product)

    return _serialize_product(product)


@router.get(
    "/movements",
    response_model=PaginatedResponse[StockMovementResponse],
    status_code=status.HTTP_200_OK,
    summary="List and filter stock movements for a business",
)
def list_movements(
    product_id: str | None = Query(default=None),
    movement_type: StockMovementType | None = Query(default=None),
    supplier_id: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> PaginatedResponse[StockMovementResponse]:
    stmt = select(StockMovement).where(StockMovement.business_id == ctx.business.id)
    if product_id is not None:
        stmt = stmt.where(StockMovement.product_id == product_id)
    if movement_type is not None:
        stmt = stmt.where(StockMovement.movement_type == movement_type)
    if supplier_id is not None:
        stmt = stmt.where(StockMovement.supplier_id == supplier_id)
    if date_from is not None:
        stmt = stmt.where(StockMovement.movement_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(StockMovement.movement_date <= date_to)

    total = int(
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    rows = db.scalars(
        stmt.order_by(StockMovement.movement_date.desc(), StockMovement.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedResponse(
        items=[_serialize_movement(m) for m in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=compute_total_pages(total, page_size),
    )


@router.post(
    "/products/{product_id}/restock",
    response_model=StockMovementResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Restock inventory and optionally create a single linked procurement expense transaction",
)
def restock_product(
    product_id: str,
    payload: InventoryRestockRequest,
    request: Request,
    response: Response,
    header_idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> StockMovementResponse:
    idem_key = (
        header_idempotency_key.strip()
        if header_idempotency_key and header_idempotency_key.strip()
        else (payload.idempotency_key.strip() if payload.idempotency_key else None)
    )
    return _execute_stock_movement(
        db=db,
        ctx=ctx,
        request=request,
        response=response,
        product_id=product_id,
        movement_type=StockMovementType.RESTOCK,
        quantity_delta=payload.quantity,
        movement_date=payload.movement_date,
        unit_cost=payload.unit_cost,
        supplier_id=payload.supplier_id,
        payment_method=payload.payment_method,
        reference_code=payload.reference_code,
        record_expense=payload.record_expense,
        notes=payload.notes,
        idem_key=idem_key,
    )


@router.post(
    "/products/{product_id}/movements",
    response_model=StockMovementResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a stock movement (sale, adjustment, return_in, return_out, or restock)",
)
def record_stock_movement(
    product_id: str,
    payload: StockMovementCreateRequest,
    request: Request,
    response: Response,
    header_idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> StockMovementResponse:
    idem_key = (
        header_idempotency_key.strip()
        if header_idempotency_key and header_idempotency_key.strip()
        else (payload.idempotency_key.strip() if payload.idempotency_key else None)
    )
    return _execute_stock_movement(
        db=db,
        ctx=ctx,
        request=request,
        response=response,
        product_id=product_id,
        movement_type=payload.movement_type,
        quantity_delta=payload.quantity_delta,
        movement_date=payload.movement_date,
        unit_cost=payload.unit_cost,
        supplier_id=payload.supplier_id,
        payment_method=payload.payment_method,
        reference_code=payload.reference_code,
        record_expense=payload.record_expense,
        notes=payload.notes,
        idem_key=idem_key,
    )
