from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import AlertSeverity, ConfidenceLevel, DataLabel
from app.services.financial_utils import to_money


def _coerce_money(value: Decimal | int | str) -> Decimal:
    if isinstance(value, float):
        value = str(value)
    return to_money(value)


class FinancialWindowSchema(BaseModel):
    preset: str
    start: str
    end: str
    prev_start: str
    prev_end: str
    days: int


class FinancialKpiSchema(BaseModel):
    opening_cash_balance: Decimal
    total_revenue: Decimal
    prev_revenue: Decimal
    revenue_change_pct: Decimal | None
    billed_invoiced_revenue: Decimal
    invoice_collections: Decimal
    other_income: Decimal
    total_expenses: Decimal
    prev_expenses: Decimal
    expenses_change_pct: Decimal | None
    operating_expenses: Decimal
    non_operating_expenses: Decimal
    cogs_and_inventory_spend: Decimal
    gross_profit: Decimal
    gross_margin_pct: Decimal
    operating_profit: Decimal
    net_profit: Decimal
    prev_net_profit: Decimal
    net_profit_change_pct: Decimal | None
    net_margin_pct: Decimal
    cash_inflows: Decimal
    cash_outflows: Decimal
    net_cash_flow: Decimal
    available_cash: Decimal
    prev_available_cash: Decimal
    cash_change_pct: Decimal | None
    accounts_receivable: Decimal
    invoice_receivables: Decimal
    customer_opening_receivables: Decimal
    overdue_receivables: Decimal
    open_invoices_count: int
    overdue_invoices_count: int
    accounts_payable: Decimal
    scheduled_expense_payables: Decimal
    supplier_opening_payables: Decimal
    tax_liability_accrued: Decimal
    inventory_valuation: Decimal


class SummaryTimeSeriesPointSchema(BaseModel):
    date: str
    label: str
    revenue: Decimal
    expenses: Decimal
    profit: Decimal
    net_cash_flow: Decimal
    cumulative_cash: Decimal
    data_label: DataLabel


class CategoryBreakdownItemSchema(BaseModel):
    name: str
    value: Decimal
    share_pct: Decimal


class DataCompletenessSchema(BaseModel):
    completed_transactions_total: int
    completed_transactions_in_window: int
    invoices_count: int
    inventory_products_count: int
    has_activity: bool


class FinancialSummaryResponse(BaseModel):
    business_id: str
    currency: str
    data_label: DataLabel
    as_of_date: str
    window: FinancialWindowSchema
    kpis: FinancialKpiSchema
    time_series: list[SummaryTimeSeriesPointSchema]
    income_breakdown: list[CategoryBreakdownItemSchema]
    expense_breakdown: list[CategoryBreakdownItemSchema]
    data_completeness: DataCompletenessSchema
    accounting_assumptions: list[str]


class TwinFixedVsVariableSchema(BaseModel):
    fixed_pct: int
    variable_pct: int
    monthly_fixed_overhead: Decimal
    trailing_variable_spend: Decimal


class TwinAssetsSchema(BaseModel):
    available_cash: Decimal
    accounts_receivable: Decimal
    overdue_receivables: Decimal
    inventory_valuation: Decimal
    total_current_assets: Decimal


class TwinLiabilitiesSchema(BaseModel):
    upcoming_payables: Decimal
    tax_liability_accrued: Decimal
    short_term_loan_balance: Decimal
    credit_facility_limit: Decimal
    total_liabilities: Decimal


class TwinTimelinePointSchema(BaseModel):
    period: str
    label: str
    data_label: DataLabel
    cash_balance: Decimal
    revenue: Decimal
    expenses: Decimal
    net_profit: Decimal
    receivables: Decimal
    payables: Decimal


class TwinChangeDriverSchema(BaseModel):
    title: str
    impact: str
    data_label: DataLabel
    detail: str


class ScheduledExpenseItemSchema(BaseModel):
    transaction_id: str
    description: str
    counterparty: str
    scheduled_date: str
    amount: Decimal
    status: str


class FinancialTwinResponse(BaseModel):
    business_id: str
    currency: str
    data_label: DataLabel
    as_of_date: str
    net_working_position: Decimal
    quick_ratio: Decimal | None
    cash_runway_months: Decimal
    collection_efficiency_pct: Decimal
    fixed_vs_variable_ratio: TwinFixedVsVariableSchema
    assets: TwinAssetsSchema
    liabilities: TwinLiabilitiesSchema
    obligations_timeline: list[ScheduledExpenseItemSchema]
    timeline: list[TwinTimelinePointSchema]
    change_drivers: list[TwinChangeDriverSchema]
    forecast_confidence: ConfidenceLevel


class ForecastDailyPointSchema(BaseModel):
    date: str
    label: str
    expected_inflows: Decimal
    expected_outflows: Decimal
    net_flow: Decimal
    projected_cash_balance: Decimal
    data_label: DataLabel


class ForecastHorizonSchema(BaseModel):
    horizon_days: int
    starting_cash_balance: Decimal
    expected_cash_balance: Decimal
    expected_inflows: Decimal
    expected_outflows: Decimal
    net_cash_change: Decimal
    min_projected_cash: Decimal
    shortage_risk: bool
    shortage_dates: list[str]
    confidence: ConfidenceLevel
    series: list[ForecastDailyPointSchema]


class ExpectedIncomingInvoiceSchema(BaseModel):
    invoice_id: str
    invoice_number: str
    due_date: str
    expected_collection_date: str
    remaining_amount: Decimal
    status: str


class CashFlowForecastResponse(BaseModel):
    business_id: str
    currency: str
    data_label: DataLabel
    as_of_date: str
    generated_at: str
    overall_confidence: ConfidenceLevel
    observed_payment_delay_days: int | None
    historical_sample_transactions: int
    historical_span_days: int
    data_quality_notes: list[str]
    assumptions: list[str]
    horizons: dict[str, ForecastHorizonSchema]
    expected_incoming_invoices: list[ExpectedIncomingInvoiceSchema]
    upcoming_scheduled_expenses: list[ScheduledExpenseItemSchema]


class HealthComponentSchema(BaseModel):
    key: str
    label: str
    weight: int
    score: int
    weighted_contribution: Decimal
    data_available: bool
    underlying_metric: str
    explanation: str


class FinancialHealthResponse(BaseModel):
    business_id: str
    currency: str
    data_label: DataLabel
    as_of_date: str
    overall_score: int
    grade: str
    data_completeness_pct: int
    runway_months: Decimal
    net_margin_pct: Decimal
    components: list[HealthComponentSchema]
    missing_data_notes: list[str]


class FinancialAlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    business_id: str
    dedup_key: str
    alert_type: str
    category: str
    severity: AlertSeverity
    title: str
    description: str
    target_route: str
    impact_amount: Decimal | None
    supporting_evidence: dict[str, Any] | None
    recommended_action: str
    detected_at: datetime
    is_active: bool
    is_acknowledged: bool
    acknowledged_at: datetime | None
    acknowledged_by_user_id: str | None
    created_at: datetime
    updated_at: datetime


class AlertAcknowledgeRequest(BaseModel):
    is_acknowledged: bool


class SimulationCreateRequest(BaseModel):
    name: str = Field(default="Custom Scenario", min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    sales_change_pct: Decimal = Field(default=Decimal("0.00"), ge=Decimal("-95.00"), le=Decimal("300.00"))
    supplier_price_change_pct: Decimal = Field(default=Decimal("0.00"), ge=Decimal("-80.00"), le=Decimal("300.00"))
    payment_delay_days: int = Field(default=0, ge=0, le=180)
    additional_employees: int = Field(default=0, ge=0, le=500)
    avg_monthly_salary: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    new_inventory_purchase: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    equipment_purchase: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    open_new_location: bool = False
    new_location_monthly_rent: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    new_location_setup_cost: Decimal = Field(default=Decimal("0.00"), ge=Decimal("0.00"))
    save: bool = True

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Scenario name cannot be blank.")
        return cleaned

    @field_validator(
        "sales_change_pct",
        "supplier_price_change_pct",
        "avg_monthly_salary",
        "new_inventory_purchase",
        "equipment_purchase",
        "new_location_monthly_rent",
        "new_location_setup_cost",
        mode="before",
    )
    @classmethod
    def quantize_money_fields(cls, value: Decimal | int | str) -> Decimal:
        return _coerce_money(value)


class SimulationMonthlySeriesSchema(BaseModel):
    month: str
    baseline_cash: Decimal
    simulated_cash: Decimal
    baseline_profit: Decimal
    simulated_profit: Decimal


class SimulationResultSchema(BaseModel):
    data_label: DataLabel
    currency: str
    starting_cash: Decimal
    upfront_outflow: Decimal
    baseline_monthly_revenue: Decimal
    simulated_monthly_revenue: Decimal
    revenue_impact_monthly: Decimal
    baseline_monthly_expenses: Decimal
    simulated_monthly_expenses: Decimal
    expense_impact_monthly: Decimal
    baseline_six_month_cash: Decimal
    simulated_six_month_cash: Decimal
    baseline_monthly_profit: Decimal
    simulated_monthly_profit: Decimal
    profit_delta_monthly: Decimal
    cash_delta_six_month: Decimal
    min_simulated_cash: Decimal
    shortage_months: list[str]
    runway_months_baseline: Decimal
    runway_months_simulated: Decimal
    risk_level: str
    risk_summary: str
    monthly_series: list[SimulationMonthlySeriesSchema]
    assumptions: list[str]


class SimulationScenarioResponse(BaseModel):
    id: str | None = None
    business_id: str
    created_by_user_id: str | None = None
    name: str
    description: str | None = None
    sales_change_pct: Decimal
    supplier_price_change_pct: Decimal
    payment_delay_days: int
    additional_employees: int
    avg_monthly_salary: Decimal
    new_inventory_purchase: Decimal
    equipment_purchase: Decimal
    open_new_location: bool
    new_location_monthly_rent: Decimal
    new_location_setup_cost: Decimal
    data_label: DataLabel
    result: SimulationResultSchema
    saved: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SimulationCompareRequest(BaseModel):
    scenario_ids: list[str] = Field(min_length=2, max_length=5)


class SimulationCompareItemSchema(BaseModel):
    id: str
    name: str
    data_label: DataLabel
    simulated_six_month_cash: Decimal
    cash_delta_six_month: Decimal
    simulated_monthly_profit: Decimal
    profit_delta_monthly: Decimal
    runway_months_simulated: Decimal
    risk_level: str
    monthly_series: list[SimulationMonthlySeriesSchema]


class SimulationCompareResponse(BaseModel):
    business_id: str
    currency: str
    data_label: DataLabel
    scenarios: list[SimulationCompareItemSchema]
    best_ending_cash_scenario_id: str
    best_monthly_profit_scenario_id: str
