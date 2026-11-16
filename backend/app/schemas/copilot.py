from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import ConfidenceLevel, DataLabel


class CopilotChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1500)
    conversation_id: str | None = Field(default=None, max_length=36)
    preset: Literal["7d", "30d", "90d"] = "30d"

    @field_validator("question")
    @classmethod
    def clean_question(cls, value: str) -> str:
        cleaned = " ".join(value.strip().split())
        if not cleaned:
            raise ValueError("Question cannot be blank.")
        return cleaned

    @field_validator("conversation_id")
    @classmethod
    def clean_conversation_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class CopilotComputedFactSchema(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=80)
    numeric_value: Decimal | None = None
    data_label: DataLabel
    source: str = Field(min_length=1, max_length=64)


class CopilotRecommendationSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=180)
    explanation: str = Field(min_length=1, max_length=1200)
    supporting_evidence: str = Field(min_length=1, max_length=600)
    relevant_amount_or_pct: str | None = Field(default=None, max_length=80)
    data_label: DataLabel
    confidence: ConfidenceLevel
    potential_impact: str = Field(min_length=1, max_length=400)
    recommended_next_step: str = Field(min_length=1, max_length=400)
    assumptions_and_limitations: str = Field(min_length=1, max_length=400)

    @field_validator(
        "title",
        "explanation",
        "supporting_evidence",
        "potential_impact",
        "recommended_next_step",
        "assumptions_and_limitations",
    )
    @classmethod
    def strip_non_empty(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Recommendation field cannot be empty.")
        return cleaned

    @field_validator("relevant_amount_or_pct")
    @classmethod
    def strip_optional_amount(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class CopilotGeminiOutput(BaseModel):
    """Strict structured JSON schema required from the Gemini provider."""

    model_config = ConfigDict(extra="forbid")

    summary: str = Field(min_length=1, max_length=2000)
    ai_interpretation: str = Field(min_length=1, max_length=4000)
    confidence: ConfidenceLevel
    primary_data_label: DataLabel
    insufficient_data: bool = False
    insufficient_data_reason: str | None = Field(default=None, max_length=600)
    recommendations: list[CopilotRecommendationSchema] = Field(default_factory=list, max_length=6)
    hypothetical_notes: list[str] = Field(default_factory=list, max_length=5)
    follow_up_questions: list[str] = Field(default_factory=list, max_length=5)
    assumptions_and_limitations: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("summary", "ai_interpretation")
    @classmethod
    def clean_narrative(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Narrative field cannot be blank.")
        return cleaned

    @field_validator("hypothetical_notes", "follow_up_questions", "assumptions_and_limitations")
    @classmethod
    def clean_string_lists(cls, items: list[str]) -> list[str]:
        cleaned_items: list[str] = []
        for item in items:
            text = str(item).strip()
            if text:
                cleaned_items.append(text[:450])
        return cleaned_items


class CopilotStructuredResponse(BaseModel):
    summary: str
    ai_interpretation: str
    confidence: ConfidenceLevel
    primary_data_label: DataLabel
    insufficient_data: bool
    insufficient_data_reason: str | None = None
    computed_facts: list[CopilotComputedFactSchema]
    recommendations: list[CopilotRecommendationSchema]
    hypothetical_notes: list[str]
    follow_up_questions: list[str]
    assumptions_and_limitations: list[str]
    generation_mode: Literal["gemini"] = "gemini"
    model_used: str
    context_as_of_date: str
    window_preset: str
    safety_notice: str


class CopilotMessageResponse(BaseModel):
    id: str
    conversation_id: str
    business_id: str
    role: Literal["user", "assistant"]
    content: str
    structured_payload: CopilotStructuredResponse | None = None
    created_at: datetime


class CopilotConversationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    user_id: str
    title: str
    message_count: int
    last_message_at: datetime
    created_at: datetime
    updated_at: datetime


class CopilotConversationDetail(CopilotConversationSummary):
    messages: list[CopilotMessageResponse]


class CopilotChatResponse(BaseModel):
    conversation: CopilotConversationSummary
    user_message: CopilotMessageResponse
    assistant_message: CopilotMessageResponse
    structured: CopilotStructuredResponse


class CopilotDeleteResponse(BaseModel):
    detail: str
    conversation_id: str
    deleted: bool = True
