from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.core.deps import (
    TenantContext,
    get_client_ip,
    get_tenant_record_or_404,
    require_business_permission,
)
from app.core.permissions import Permission
from app.db.session import get_db
from app.models import SimulationScenario
from app.models.enums import AlertSeverity, DataLabel
from app.schemas.common import PaginatedResponse
from app.schemas.intelligence import (
    AlertAcknowledgeRequest,
    CashFlowForecastResponse,
    FinancialAlertResponse,
    FinancialHealthResponse,
    FinancialSummaryResponse,
    FinancialTwinResponse,
    SimulationCompareRequest,
    SimulationCompareResponse,
    SimulationCreateRequest,
    SimulationScenarioResponse,
)
from app.services.digital_twin_service import (
    build_cash_flow_forecast,
    build_financial_twin,
    compute_financial_health,
)
from app.services.financial_engine import compute_financial_summary
from app.services.risk_radar_service import acknowledge_alert, list_alerts
from app.services.simulation_service import (
    compare_simulation_scenarios,
    create_or_run_simulation,
    list_simulation_scenarios,
)

router = APIRouter(prefix="/businesses/{business_id}", tags=["financial-intelligence"])


def _serialize_simulation(
    *,
    business_id: str,
    scenario: SimulationScenario | None,
    payload: SimulationCreateRequest | None,
    result_snapshot: dict,
) -> SimulationScenarioResponse:
    if scenario is not None:
        return SimulationScenarioResponse(
            id=scenario.id,
            business_id=scenario.business_id,
            created_by_user_id=scenario.created_by_user_id,
            name=scenario.name,
            description=scenario.description,
            sales_change_pct=scenario.sales_change_pct,
            supplier_price_change_pct=scenario.supplier_price_change_pct,
            payment_delay_days=scenario.payment_delay_days,
            additional_employees=scenario.additional_employees,
            avg_monthly_salary=scenario.avg_monthly_salary,
            new_inventory_purchase=scenario.new_inventory_purchase,
            equipment_purchase=scenario.equipment_purchase,
            open_new_location=scenario.open_new_location,
            new_location_monthly_rent=scenario.new_location_monthly_rent,
            new_location_setup_cost=scenario.new_location_setup_cost,
            data_label=DataLabel.HYPOTHETICAL,
            result=result_snapshot,
            saved=True,
            created_at=scenario.created_at,
            updated_at=scenario.updated_at,
        )
    assert payload is not None
    return SimulationScenarioResponse(
        id=None,
        business_id=business_id,
        created_by_user_id=None,
        name=payload.name,
        description=payload.description,
        sales_change_pct=payload.sales_change_pct,
        supplier_price_change_pct=payload.supplier_price_change_pct,
        payment_delay_days=payload.payment_delay_days,
        additional_employees=payload.additional_employees,
        avg_monthly_salary=payload.avg_monthly_salary,
        new_inventory_purchase=payload.new_inventory_purchase,
        equipment_purchase=payload.equipment_purchase,
        open_new_location=payload.open_new_location,
        new_location_monthly_rent=payload.new_location_monthly_rent,
        new_location_setup_cost=payload.new_location_setup_cost,
        data_label=DataLabel.HYPOTHETICAL,
        result=result_snapshot,
        saved=False,
    )


@router.get(
    "/financial-summary",
    response_model=FinancialSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute authoritative period KPIs, time series, and category breakdowns",
)
def get_financial_summary(
    preset: str = Query(default="30d", pattern="^(7d|30d|90d|custom)$"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    as_of_date: date | None = Query(default=None),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> FinancialSummaryResponse:
    if preset == "custom" and (start_date is None or end_date is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date and end_date are required when preset='custom'.",
        )
    try:
        summary = compute_financial_summary(
            db,
            ctx.business,
            preset=preset,
            start_date=start_date,
            end_date=end_date,
            as_of_date=as_of_date,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return FinancialSummaryResponse.model_validate(summary)


@router.get(
    "/financial-twin",
    response_model=FinancialTwinResponse,
    status_code=status.HTTP_200_OK,
    summary="Build the business Financial Digital Twin across assets, liabilities, and timeline",
)
def get_financial_twin(
    as_of_date: date | None = Query(default=None),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> FinancialTwinResponse:
    twin = build_financial_twin(db, ctx.business, as_of_date=as_of_date)
    return FinancialTwinResponse.model_validate(twin)


@router.get(
    "/cash-flow-forecast",
    response_model=CashFlowForecastResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate 7d, 30d, and 90d deterministic cash-flow forecasts with confidence scoring",
)
def get_cash_flow_forecast(
    as_of_date: date | None = Query(default=None),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> CashFlowForecastResponse:
    forecast = build_cash_flow_forecast(db, ctx.business, as_of_date=as_of_date)
    return CashFlowForecastResponse.model_validate(forecast)


@router.get(
    "/financial-health",
    response_model=FinancialHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute transparent 0-100 Financial Health Score with component explanations",
)
def get_financial_health(
    as_of_date: date | None = Query(default=None),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> FinancialHealthResponse:
    health = compute_financial_health(db, ctx.business, as_of_date=as_of_date)
    return FinancialHealthResponse.model_validate(health)


@router.get(
    "/alerts",
    response_model=PaginatedResponse[FinancialAlertResponse],
    status_code=status.HTTP_200_OK,
    summary="Evaluate Risk Radar rules and list persisted financial alerts",
)
def get_business_alerts(
    severity: AlertSeverity | None = Query(default=None),
    is_acknowledged: bool | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    refresh: bool = Query(default=True),
    as_of_date: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> PaginatedResponse[FinancialAlertResponse]:
    result = list_alerts(
        db,
        ctx.business,
        severity=severity,
        is_acknowledged=is_acknowledged,
        include_inactive=include_inactive,
        page=page,
        page_size=page_size,
        refresh=refresh,
        as_of_date=as_of_date,
    )
    return PaginatedResponse(
        items=[FinancialAlertResponse.model_validate(item) for item in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        total_pages=result["total_pages"],
    )


@router.patch(
    "/alerts/{alert_id}",
    response_model=FinancialAlertResponse,
    status_code=status.HTTP_200_OK,
    summary="Acknowledge or reopen a Risk Radar financial alert",
)
def patch_business_alert(
    alert_id: str,
    payload: AlertAcknowledgeRequest,
    request: Request,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> FinancialAlertResponse:
    alert = acknowledge_alert(
        db,
        ctx.business,
        alert_id,
        ctx.user,
        is_acknowledged=payload.is_acknowledged,
        ip_address=get_client_ip(request),
    )
    return FinancialAlertResponse.model_validate(alert)


@router.post(
    "/simulations",
    response_model=SimulationScenarioResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Run a hypothetical What-If simulation and optionally persist it",
)
def post_simulation(
    payload: SimulationCreateRequest,
    request: Request,
    response: Response,
    as_of_date: date | None = Query(default=None),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_WRITE)),
    db: Session = Depends(get_db),
) -> SimulationScenarioResponse:
    scenario, snapshot = create_or_run_simulation(
        db,
        ctx.business,
        ctx.user,
        name=payload.name,
        description=payload.description,
        sales_change_pct=payload.sales_change_pct,
        supplier_price_change_pct=payload.supplier_price_change_pct,
        payment_delay_days=payload.payment_delay_days,
        additional_employees=payload.additional_employees,
        avg_monthly_salary=payload.avg_monthly_salary,
        new_inventory_purchase=payload.new_inventory_purchase,
        equipment_purchase=payload.equipment_purchase,
        open_new_location=payload.open_new_location,
        new_location_monthly_rent=payload.new_location_monthly_rent,
        new_location_setup_cost=payload.new_location_setup_cost,
        save=payload.save,
        ip_address=get_client_ip(request),
        as_of_date=as_of_date,
    )
    if not payload.save:
        response.status_code = status.HTTP_200_OK
    return _serialize_simulation(
        business_id=ctx.business.id,
        scenario=scenario,
        payload=payload,
        result_snapshot=snapshot,
    )


@router.get(
    "/simulations",
    response_model=PaginatedResponse[SimulationScenarioResponse],
    status_code=status.HTTP_200_OK,
    summary="List saved hypothetical simulation scenarios for a business",
)
def get_simulations(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> PaginatedResponse[SimulationScenarioResponse]:
    result = list_simulation_scenarios(db, ctx.business.id, page=page, page_size=page_size)
    return PaginatedResponse(
        items=[
            _serialize_simulation(
                business_id=ctx.business.id,
                scenario=row,
                payload=None,
                result_snapshot=row.result_snapshot,
            )
            for row in result["items"]
        ],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        total_pages=result["total_pages"],
    )


@router.post(
    "/simulations/compare",
    response_model=SimulationCompareResponse,
    status_code=status.HTTP_200_OK,
    summary="Compare 2 to 5 saved hypothetical simulation scenarios side by side",
)
def compare_simulations(
    payload: SimulationCompareRequest,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> SimulationCompareResponse:
    result = compare_simulation_scenarios(db, ctx.business, payload.scenario_ids)
    return SimulationCompareResponse.model_validate(result)


@router.get(
    "/simulations/{simulation_id}",
    response_model=SimulationScenarioResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve a saved hypothetical simulation scenario by ID",
)
def get_simulation_detail(
    simulation_id: str,
    ctx: TenantContext = Depends(require_business_permission(Permission.FINANCIAL_READ)),
    db: Session = Depends(get_db),
) -> SimulationScenarioResponse:
    scenario = get_tenant_record_or_404(
        db,
        SimulationScenario,
        simulation_id,
        ctx.business.id,
        entity_label="Simulation scenario",
    )
    return _serialize_simulation(
        business_id=ctx.business.id,
        scenario=scenario,
        payload=None,
        result_snapshot=scenario.result_snapshot,
    )
