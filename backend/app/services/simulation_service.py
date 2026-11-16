from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Business, SimulationScenario, User
from app.models.enums import DataLabel, SimulationRiskLevel
from app.services.audit_service import record_audit_event
from app.services.financial_engine import (
    HUNDRED,
    ZERO,
    compute_financial_summary,
)
from app.services.financial_utils import compute_total_pages, to_money

ONE = Decimal("1.00")
RUNWAY_QUANT = Decimal("0.1")


def _compute_runway(cash: Decimal, monthly_burn: Decimal) -> Decimal:
    if cash <= ZERO:
        return Decimal("0.0")
    if monthly_burn <= ZERO:
        return Decimal("24.0")
    raw = (cash / monthly_burn).quantize(RUNWAY_QUANT, rounding=ROUND_HALF_UP)
    return min(Decimal("36.0"), max(Decimal("0.0"), raw))


def compute_what_if_simulation(
    db: Session,
    business: Business,
    *,
    sales_change_pct: Decimal,
    supplier_price_change_pct: Decimal,
    payment_delay_days: int,
    additional_employees: int,
    avg_monthly_salary: Decimal,
    new_inventory_purchase: Decimal,
    equipment_purchase: Decimal,
    open_new_location: bool,
    new_location_monthly_rent: Decimal,
    new_location_setup_cost: Decimal,
    as_of_date: date | None = None,
) -> dict[str, Any]:
    """Deterministic 6-month What-If financial simulation using Decimal arithmetic only."""
    summary_30 = compute_financial_summary(db, business, preset="30d", as_of_date=as_of_date)
    kpis = summary_30["kpis"]

    base_monthly_rev = to_money(kpis["total_revenue"])
    base_monthly_exp = to_money(kpis["total_expenses"])
    fixed_overhead = to_money(business.monthly_fixed_overhead)

    # Estimate variable portion vs fixed overhead without synthetic negative bases
    base_variable_exp = max(ZERO, to_money(base_monthly_exp - fixed_overhead))
    effective_base_fixed = min(fixed_overhead, base_monthly_exp) if base_monthly_exp > ZERO else fixed_overhead
    base_monthly_profit = to_money(base_monthly_rev - base_monthly_exp)

    # Apply decision levers
    sim_monthly_rev = to_money(base_monthly_rev * (ONE + (sales_change_pct / HUNDRED)))
    sim_variable_exp = to_money(base_variable_exp * (ONE + (supplier_price_change_pct / HUNDRED)))
    new_payroll = to_money(Decimal(additional_employees) * to_money(avg_monthly_salary))
    new_rent = to_money(new_location_monthly_rent) if open_new_location else ZERO

    sim_monthly_exp = to_money(effective_base_fixed + sim_variable_exp + new_payroll + new_rent)
    sim_monthly_profit = to_money(sim_monthly_rev - sim_monthly_exp)

    upfront_capex = to_money(
        to_money(new_inventory_purchase)
        + to_money(equipment_purchase)
        + (to_money(new_location_setup_cost) if open_new_location else ZERO)
    )

    # Working capital delay lockup: fraction of monthly revenue delayed in Month 1 & Month 2
    delay_ratio = min(Decimal("1.00"), Decimal(max(0, payment_delay_days)) / Decimal("30"))
    working_capital_lockup = to_money(sim_monthly_rev * delay_ratio)

    starting_cash = to_money(kpis["available_cash"])
    base_cash = starting_cash
    sim_cash = to_money(starting_cash - upfront_capex)
    min_sim_cash = sim_cash
    shortage_months: list[str] = []

    monthly_series: list[dict[str, Any]] = []
    for m_idx in range(1, 7):
        base_cash = to_money(base_cash + base_monthly_profit)
        if m_idx == 1:
            month_sim_cash_in_delta = to_money(-working_capital_lockup)
        elif m_idx == 2:
            # 60% of initial lockup catches up in month 2 when delay <= 30d, else spreads
            recovery = to_money(working_capital_lockup * Decimal("0.50"))
            month_sim_cash_in_delta = recovery if payment_delay_days <= 30 else ZERO
        else:
            month_sim_cash_in_delta = ZERO

        sim_cash = to_money(sim_cash + sim_monthly_profit + month_sim_cash_in_delta)
        if sim_cash < min_sim_cash:
            min_sim_cash = sim_cash
        if sim_cash < ZERO or (fixed_overhead > ZERO and sim_cash < fixed_overhead):
            shortage_months.append(f"M{m_idx}")

        monthly_series.append(
            {
                "month": f"M{m_idx}",
                "baseline_cash": str(base_cash),
                "simulated_cash": str(sim_cash),
                "baseline_profit": str(base_monthly_profit),
                "simulated_profit": str(sim_monthly_profit),
            }
        )

    profit_delta_monthly = to_money(sim_monthly_profit - base_monthly_profit)
    cash_delta_six_month = to_money(sim_cash - base_cash)
    revenue_impact_monthly = to_money(sim_monthly_rev - base_monthly_rev)
    expense_impact_monthly = to_money(sim_monthly_exp - base_monthly_exp)

    base_burn = max(fixed_overhead, to_money(base_monthly_exp - base_monthly_rev)) if base_monthly_profit < ZERO else fixed_overhead
    sim_burn = max(to_money(effective_base_fixed + new_rent + new_payroll), to_money(sim_monthly_exp - sim_monthly_rev)) if sim_monthly_profit < ZERO else to_money(effective_base_fixed + new_rent + new_payroll)

    runway_base = _compute_runway(starting_cash, base_burn)
    runway_sim = _compute_runway(max(ZERO, to_money(starting_cash - upfront_capex)), sim_burn)

    if min_sim_cash < ZERO:
        risk_level = SimulationRiskLevel.CRITICAL
        risk_summary = (
            f"Hypothetical cash balance turns negative (min {min_sim_cash}) due to {upfront_capex} upfront capex, working-capital delay, or negative monthly operating margin."
        )
    elif fixed_overhead > ZERO and min_sim_cash < fixed_overhead:
        risk_level = SimulationRiskLevel.HIGH
        risk_summary = (
            f"Cash cushion dips below 1x monthly fixed overhead ({fixed_overhead}) reaching {min_sim_cash} in {', '.join(shortage_months)}."
        )
    elif sim_monthly_profit < ZERO or runway_sim < Decimal("3.0"):
        risk_level = SimulationRiskLevel.MODERATE
        risk_summary = (
            f"Projected monthly profit is {sim_monthly_profit} with {runway_sim} months post-shock runway; monitor operating burn closely."
        )
    else:
        risk_level = SimulationRiskLevel.LOW
        risk_summary = (
            f"Hypothetical scenario remains cash-positive across all 6 months (ending cash {sim_cash}, runway {runway_sim} months)."
        )

    return {
        "data_label": DataLabel.HYPOTHETICAL.value,
        "currency": business.currency,
        "starting_cash": str(starting_cash),
        "upfront_outflow": str(upfront_capex),
        "baseline_monthly_revenue": str(base_monthly_rev),
        "simulated_monthly_revenue": str(sim_monthly_rev),
        "revenue_impact_monthly": str(revenue_impact_monthly),
        "baseline_monthly_expenses": str(base_monthly_exp),
        "simulated_monthly_expenses": str(sim_monthly_exp),
        "expense_impact_monthly": str(expense_impact_monthly),
        "baseline_six_month_cash": str(base_cash),
        "simulated_six_month_cash": str(sim_cash),
        "baseline_monthly_profit": str(base_monthly_profit),
        "simulated_monthly_profit": str(sim_monthly_profit),
        "profit_delta_monthly": str(profit_delta_monthly),
        "cash_delta_six_month": str(cash_delta_six_month),
        "min_simulated_cash": str(min_sim_cash),
        "shortage_months": shortage_months,
        "runway_months_baseline": str(runway_base),
        "runway_months_simulated": str(runway_sim),
        "risk_level": risk_level.value,
        "risk_summary": risk_summary,
        "monthly_series": monthly_series,
        "assumptions": [
            f"Baseline monthly revenue ({base_monthly_rev}) and expenses ({base_monthly_exp}) are anchored to trailing 30-day verified actuals.",
            "Upfront inventory, equipment, and location setup costs are deducted immediately at simulation start.",
            "Customer payment delays lock working capital proportionally during Month 1 before partial collection normalization.",
            "All outputs are hypothetical decision-support estimates and never modify ledger records.",
        ],
    }


def create_or_run_simulation(
    db: Session,
    business: Business,
    user: User,
    *,
    name: str,
    description: str | None,
    sales_change_pct: Decimal,
    supplier_price_change_pct: Decimal,
    payment_delay_days: int,
    additional_employees: int,
    avg_monthly_salary: Decimal,
    new_inventory_purchase: Decimal,
    equipment_purchase: Decimal,
    open_new_location: bool,
    new_location_monthly_rent: Decimal,
    new_location_setup_cost: Decimal,
    save: bool = True,
    ip_address: str | None = None,
    as_of_date: date | None = None,
) -> tuple[SimulationScenario | None, dict[str, Any]]:
    snapshot = compute_what_if_simulation(
        db,
        business,
        sales_change_pct=sales_change_pct,
        supplier_price_change_pct=supplier_price_change_pct,
        payment_delay_days=payment_delay_days,
        additional_employees=additional_employees,
        avg_monthly_salary=avg_monthly_salary,
        new_inventory_purchase=new_inventory_purchase,
        equipment_purchase=equipment_purchase,
        open_new_location=open_new_location,
        new_location_monthly_rent=new_location_monthly_rent,
        new_location_setup_cost=new_location_setup_cost,
        as_of_date=as_of_date,
    )
    if not save:
        return None, snapshot

    scenario = SimulationScenario(
        business_id=business.id,
        created_by_user_id=user.id,
        name=name.strip(),
        description=description.strip() if description else None,
        sales_change_pct=sales_change_pct,
        supplier_price_change_pct=supplier_price_change_pct,
        payment_delay_days=payment_delay_days,
        additional_employees=additional_employees,
        avg_monthly_salary=to_money(avg_monthly_salary),
        new_inventory_purchase=to_money(new_inventory_purchase),
        equipment_purchase=to_money(equipment_purchase),
        open_new_location=open_new_location,
        new_location_monthly_rent=to_money(new_location_monthly_rent),
        new_location_setup_cost=to_money(new_location_setup_cost),
        data_label=DataLabel.HYPOTHETICAL.value,
        result_snapshot=snapshot,
    )
    db.add(scenario)
    db.flush()

    record_audit_event(
        db,
        action="simulation.create",
        entity_type="simulation_scenario",
        entity_id=scenario.id,
        user_id=user.id,
        business_id=business.id,
        details={"name": scenario.name, "risk_level": snapshot["risk_level"]},
        ip_address=ip_address,
    )
    db.commit()
    db.refresh(scenario)
    return scenario, snapshot


def list_simulation_scenarios(
    db: Session,
    business_id: str,
    *,
    page: int = 1,
    page_size: int = 25,
) -> dict[str, Any]:
    stmt = select(SimulationScenario).where(SimulationScenario.business_id == business_id)
    total = int(
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    items = list(
        db.scalars(
            stmt.order_by(SimulationScenario.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
    )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": compute_total_pages(total, page_size),
    }


def compare_simulation_scenarios(
    db: Session,
    business: Business,
    scenario_ids: list[str],
) -> dict[str, Any]:
    unique_ids = list(dict.fromkeys(scenario_ids))
    rows = list(
        db.scalars(
            select(SimulationScenario).where(
                SimulationScenario.business_id == business.id,
                SimulationScenario.id.in_(unique_ids),
            )
        ).all()
    )
    by_id = {row.id: row for row in rows}
    missing = [sid for sid in unique_ids if sid not in by_id]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more requested simulation scenarios were not found in this business workspace.",
        )

    ordered = [by_id[sid] for sid in unique_ids]
    compared = []
    for row in ordered:
        snap = row.result_snapshot
        compared.append(
            {
                "id": row.id,
                "name": row.name,
                "data_label": row.data_label,
                "simulated_six_month_cash": Decimal(str(snap["simulated_six_month_cash"])),
                "cash_delta_six_month": Decimal(str(snap["cash_delta_six_month"])),
                "simulated_monthly_profit": Decimal(str(snap["simulated_monthly_profit"])),
                "profit_delta_monthly": Decimal(str(snap["profit_delta_monthly"])),
                "runway_months_simulated": Decimal(str(snap["runway_months_simulated"])),
                "risk_level": snap["risk_level"],
                "monthly_series": snap["monthly_series"],
            }
        )

    best_cash = max(compared, key=lambda c: c["simulated_six_month_cash"])
    best_profit = max(compared, key=lambda c: c["simulated_monthly_profit"])

    return {
        "business_id": business.id,
        "currency": business.currency,
        "data_label": DataLabel.HYPOTHETICAL.value,
        "scenarios": compared,
        "best_ending_cash_scenario_id": best_cash["id"],
        "best_monthly_profit_scenario_id": best_profit["id"],
    }
