from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.deps import (
    TenantContext,
    get_client_ip,
    get_tenant_record_or_404,
    require_business_permission,
)
from app.core.permissions import Permission
from app.db.session import get_db
from app.models import Transaction, TransactionCategory
from app.models.enums import TransactionType
from app.schemas.transaction import (
    CategoryCreateRequest,
    CategoryResponse,
    CategoryUpdateRequest,
)
from app.services.audit_service import record_audit_event

router = APIRouter(prefix="/businesses/{business_id}/categories", tags=["categories"])


@router.get(
    "",
    response_model=list[CategoryResponse],
    status_code=status.HTTP_200_OK,
    summary="List transaction categories for a business",
)
def list_categories(
    type: TransactionType | None = Query(default=None),
    is_operating: bool | None = Query(default=None),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> list[CategoryResponse]:
    stmt = select(TransactionCategory).where(
        TransactionCategory.business_id == ctx.business.id
    )
    if type is not None:
        stmt = stmt.where(TransactionCategory.type == type)
    if is_operating is not None:
        stmt = stmt.where(TransactionCategory.is_operating == is_operating)
    stmt = stmt.order_by(TransactionCategory.type.asc(), TransactionCategory.name.asc())
    categories = db.scalars(stmt).all()
    return [CategoryResponse.model_validate(cat) for cat in categories]


@router.post(
    "",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new transaction category",
)
def create_category(
    payload: CategoryCreateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> CategoryResponse:
    existing = db.scalar(
        select(TransactionCategory).where(
            TransactionCategory.business_id == ctx.business.id,
            func.lower(TransactionCategory.name) == payload.name.lower(),
            TransactionCategory.type == payload.type,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A category with this name and type already exists in this business.",
        )

    category = TransactionCategory(
        business_id=ctx.business.id,
        name=payload.name,
        type=payload.type,
        is_operating=payload.is_operating,
        is_system=False,
    )
    db.add(category)
    db.flush()

    record_audit_event(
        db,
        action="category.create",
        entity_type="transaction_category",
        entity_id=category.id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={"name": category.name, "type": category.type.value},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(category)
    return CategoryResponse.model_validate(category)


@router.patch(
    "/{category_id}",
    response_model=CategoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a transaction category",
)
def update_category(
    category_id: str,
    payload: CategoryUpdateRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> CategoryResponse:
    category = get_tenant_record_or_404(
        db,
        TransactionCategory,
        category_id,
        ctx.business.id,
        entity_label="Category",
    )

    new_name = payload.name if payload.name is not None else category.name
    new_type = payload.type if payload.type is not None else category.type

    if new_type != category.type:
        linked_tx_count = db.scalar(
            select(func.count(Transaction.id)).where(
                Transaction.business_id == ctx.business.id,
                Transaction.category_id == category.id,
            )
        ) or 0
        if linked_tx_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change type of a category referenced by existing transactions.",
            )

    duplicate = db.scalar(
        select(TransactionCategory).where(
            TransactionCategory.business_id == ctx.business.id,
            TransactionCategory.id != category.id,
            func.lower(TransactionCategory.name) == new_name.lower(),
            TransactionCategory.type == new_type,
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another category with this name and type already exists.",
        )

    category.name = new_name
    category.type = new_type
    if payload.is_operating is not None:
        category.is_operating = payload.is_operating

    record_audit_event(
        db,
        action="category.update",
        entity_type="transaction_category",
        entity_id=category.id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={"name": category.name, "type": category.type.value},
        ip_address=get_client_ip(request),
    )
    db.commit()
    db.refresh(category)
    return CategoryResponse.model_validate(category)


@router.delete(
    "/{category_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a category if unused or safely reassign its transactions",
)
def delete_category(
    category_id: str,
    request: Request,
    reassign_to_category_id: str | None = Query(default=None),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_DELETE)),
    db: Session = Depends(get_db),
) -> dict[str, str | int]:
    category = get_tenant_record_or_404(
        db,
        TransactionCategory,
        category_id,
        ctx.business.id,
        entity_label="Category",
    )

    tx_count = int(
        db.scalar(
            select(func.count(Transaction.id)).where(
                Transaction.business_id == ctx.business.id,
                Transaction.category_id == category.id,
            )
        )
        or 0
    )

    reassigned_count = 0
    if tx_count > 0:
        if not reassign_to_category_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Category is referenced by existing transactions. "
                    "Provide reassign_to_category_id of the same type before deleting."
                ),
            )
        if reassign_to_category_id == category.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reassign transactions to the same category being deleted.",
            )
        target = get_tenant_record_or_404(
            db,
            TransactionCategory,
            reassign_to_category_id,
            ctx.business.id,
            entity_label="Replacement category",
        )
        if target.type != category.type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Replacement category must have the same transaction type.",
            )
        db.execute(
            update(Transaction)
            .where(
                Transaction.business_id == ctx.business.id,
                Transaction.category_id == category.id,
            )
            .values(category_id=target.id)
        )
        reassigned_count = tx_count

    deleted_name = category.name
    db.delete(category)

    record_audit_event(
        db,
        action="category.delete",
        entity_type="transaction_category",
        entity_id=category_id,
        user_id=ctx.user.id,
        business_id=ctx.business.id,
        details={
            "name": deleted_name,
            "reassigned_to": reassign_to_category_id,
            "reassigned_transactions": reassigned_count,
        },
        ip_address=get_client_ip(request),
    )
    db.commit()
    return {
        "detail": "Category deleted.",
        "category_id": category_id,
        "reassigned_transactions": reassigned_count,
    }
