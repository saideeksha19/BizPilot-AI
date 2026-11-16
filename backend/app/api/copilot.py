from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.core.deps import TenantContext, get_client_ip, require_business_permission
from app.core.permissions import Permission
from app.db.session import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.copilot import (
    CopilotChatRequest,
    CopilotChatResponse,
    CopilotConversationDetail,
    CopilotConversationSummary,
    CopilotDeleteResponse,
)
from app.services.copilot_service import (
    chat_with_copilot,
    delete_copilot_conversation,
    get_copilot_conversation,
    list_copilot_conversations,
)

router = APIRouter(
    prefix="/businesses/{business_id}/copilot",
    tags=["copilot"],
)


@router.post(
    "/chat",
    response_model=CopilotChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Ask the Explainable Gemini Financial Decision Copilot",
)
def copilot_chat(
    payload: CopilotChatRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> dict:
    return chat_with_copilot(
        db,
        business=ctx.business,
        user=ctx.user,
        payload=payload,
        ip_address=get_client_ip(request),
    )


@router.get(
    "/conversations",
    response_model=PaginatedResponse[CopilotConversationSummary],
    summary="List Copilot conversations for the authenticated user in this business",
)
def copilot_list_conversations(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> dict:
    return list_copilot_conversations(
        db,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/conversations/{conversation_id}",
    response_model=CopilotConversationDetail,
    summary="Retrieve a persisted Copilot conversation thread",
)
def copilot_get_conversation(
    conversation_id: str,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> object:
    return get_copilot_conversation(
        db,
        conversation_id=conversation_id,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
    )


@router.delete(
    "/conversations/{conversation_id}",
    response_model=CopilotDeleteResponse,
    summary="Delete a Copilot conversation thread without altering financial records",
)
def copilot_delete_conversation(
    conversation_id: str,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> CopilotDeleteResponse:
    delete_copilot_conversation(
        db,
        conversation_id=conversation_id,
        business_id=ctx.business.id,
        user_id=ctx.user.id,
        ip_address=get_client_ip(request),
    )
    return CopilotDeleteResponse(
        detail="Copilot conversation deleted. Financial ledger records remain unchanged.",
        conversation_id=conversation_id,
        deleted=True,
    )
