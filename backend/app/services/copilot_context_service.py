from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models import Business
from app.models.enums import ConfidenceLevel, DataLabel
from app.services.digital_twin_service import build_cash_flow_forecast, build_financial_twin, compute_financial_health
from app.services.financial_engine import (
    ZERO,
    compute_financial_summary_from_dataset,
    load_business_dataset,
)
from app.services.financial_utils import to_money
from app.services.risk_radar_service import list_alerts
from app.services.simulation_service import list_simulation_scenarios

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")


def _sanitize_text(value: str | None, max_len: int = 120) -> str:
    if not value:
        return ""
    cleaned = _CONTROL_CHARS_RE.sub(" ", str(value))
    cleaned = " ".join(cleaned.strip().split())
    return cleaned[:max_len]


def _money_str(value: Any) -> str:
    return str(to_money(value if value is not None else ZERO))


@dataclass(frozen=True)
class CopilotFinancialContext:
    business_id: str
    currency: str
    as_of_date: str
    window_preset: str
    insufficient_data: bool
    insufficient_data_reasons: list[str]
    context_payload: dict[str, Any]
    computed_facts: list[dict[str, Any]]


def build_copilot_financial_context(
    db: Session,
    business: Business,
    *,
    preset: str = "30d",
    as_of_date: date | None = None,
) -> CopilotFinancialContext:
    """Assemble authoritative Decimal financial context without PII or full-ledger dumps."""
    dataset = load_business_dataset(db, business, as_of_date=as_of_date)
    summary_selected = compute_financial_summary_from_dataset(dataset, preset=preset)
    summary_30 = (
        summary_selected
        if preset == "30d"
        else compute_financial_summary_from_dataset(dataset, preset="30d")
    )
    summary_90 = (
        summary_selected
        if preset == "90d"
        else compute_financial_summary_from_dataset(dataset, preset="90d")
    )

    twin = build_financial_twin(db, business, as_of_date=dataset.as_of)
    forecast = build_cash_flow_forecast(db, business, as_of_date=dataset.as_of, dataset=dataset)
    health = compute_financial_health(db, business, as_of_date=dataset.as_of, dataset=dataset)
    alerts_page = list_alerts(db, business, page=1, page_size=12, refresh=True, as_of_date=dataset.as_of)
    scenarios_page = list_simulation_scenarios(db, business.id, page=1, page_size=3)

    k_sel = summary_selected["kpis"]
    k_30 = summary_30["kpis"]
    k_90 = summary_90["kpis"]
    completeness = summary_selected["data_completeness"]

    low_stock_items = [
        {
            "sku": _sanitize_text(p.sku, 40),
            "name": _sanitize_text(p.name, 80),
            "current_stock": str(p.current_stock),
            "reorder_point": str(p.reorder_point),
            "unit": _sanitize_text(p.unit, 20),
            "lead_time_days": (
                p.preferred_supplier.default_lead_time_days
                if p.preferred_supplier is not None
                else 3
            ),
        }
        for p in dataset.products
        if p.current_stock <= p.reorder_point
    ][:8]

    active_alerts = [
        {
            "alert_type": _sanitize_text(a.alert_type, 64),
            "category": _sanitize_text(a.category, 64),
            "severity": a.severity.value,
            "title": _sanitize_text(a.title, 160),
            "impact_amount": _money_str(a.impact_amount) if a.impact_amount is not None else None,
            "is_acknowledged": bool(a.is_acknowledged),
            "recommended_action": _sanitize_text(a.recommended_action, 200),
            "data_label": DataLabel.ACTUAL.value,
        }
        for a in alerts_page["items"]
    ]

    recent_scenarios = []
    for s in scenarios_page["items"]:
        snap = s.result_snapshot or {}
        recent_scenarios.append(
            {
                "name": _sanitize_text(s.name, 100),
                "data_label": DataLabel.HYPOTHETICAL.value,
                "sales_change_pct": str(s.sales_change_pct),
                "supplier_price_change_pct": str(s.supplier_price_change_pct),
                "additional_employees": s.additional_employees,
                "simulated_six_month_cash": str(snap.get("simulated_six_month_cash", "0.00")),
                "cash_delta_six_month": str(snap.get("cash_delta_six_month", "0.00")),
                "simulated_monthly_profit": str(snap.get("simulated_monthly_profit", "0.00")),
                "risk_level": _sanitize_text(str(snap.get("risk_level", "Unknown")), 32),
            }
        )

    insufficient_reasons: list[str] = []
    if not completeness["has_activity"]:
        insufficient_reasons.append(
            "No completed ledger transactions or issued invoices exist yet for this business."
        )
    if forecast["overall_confidence"] == ConfidenceLevel.INSUFFICIENT_DATA.value:
        insufficient_reasons.append(
            f"Forecast baseline has only {forecast['historical_sample_transactions']} completed transaction(s) across {forecast['historical_span_days']} day(s)."
        )
    if health["data_completeness_pct"] < 50:
        insufficient_reasons.append(
            f"Financial Health Score completeness is {health['data_completeness_pct']}%; missing dimensions are scored 0."
        )

    insufficient_data = (
        not completeness["has_activity"]
        or (
            forecast["overall_confidence"] == ConfidenceLevel.INSUFFICIENT_DATA.value
            and health["data_completeness_pct"] < 50
        )
    )

    h7 = forecast["horizons"]["7d"]
    h30 = forecast["horizons"]["30d"]
    h90 = forecast["horizons"]["90d"]

    context_payload: dict[str, Any] = {
        "business_profile": {
            "business_type": _sanitize_text(business.business_type, 60),
            "industry": _sanitize_text(business.industry, 80),
            "currency": business.currency,
            "country": _sanitize_text(business.country, 60),
            "business_size": _sanitize_text(business.business_size, 60),
            "gst_registered": bool(business.gst_registered),
            "as_of_date": dataset.as_of.isoformat(),
            "selected_window_preset": preset,
        },
        "data_completeness": {
            "has_activity": bool(completeness["has_activity"]),
            "completed_transactions_total": completeness["completed_transactions_total"],
            "completed_transactions_in_window": completeness["completed_transactions_in_window"],
            "invoices_count": completeness["invoices_count"],
            "inventory_products_count": completeness["inventory_products_count"],
            "health_data_completeness_pct": health["data_completeness_pct"],
            "insufficient_data": insufficient_data,
            "insufficient_data_reasons": insufficient_reasons,
            "missing_data_notes": health["missing_data_notes"],
        },
        "actual_metrics": {
            "data_label": DataLabel.ACTUAL.value,
            "available_cash": _money_str(k_30["available_cash"]),
            "opening_cash_balance": _money_str(k_30["opening_cash_balance"]),
            "monthly_fixed_overhead": _money_str(business.monthly_fixed_overhead),
            "selected_window": {
                "preset": summary_selected["window"]["preset"],
                "days": summary_selected["window"]["days"],
                "revenue": _money_str(k_sel["total_revenue"]),
                "expenses": _money_str(k_sel["total_expenses"]),
                "net_profit": _money_str(k_sel["net_profit"]),
                "net_margin_pct": str(k_sel["net_margin_pct"]),
            },
            "trailing_30d": {
                "revenue": _money_str(k_30["total_revenue"]),
                "expenses": _money_str(k_30["total_expenses"]),
                "cogs_and_inventory_spend": _money_str(k_30["cogs_and_inventory_spend"]),
                "gross_profit": _money_str(k_30["gross_profit"]),
                "gross_margin_pct": str(k_30["gross_margin_pct"]),
                "net_profit": _money_str(k_30["net_profit"]),
                "net_margin_pct": str(k_30["net_margin_pct"]),
                "top_income_categories": [
                    {"name": _sanitize_text(c["name"], 60), "amount": str(c["value"]), "share_pct": str(c["share_pct"])}
                    for c in summary_30["income_breakdown"][:5]
                ],
                "top_expense_categories": [
                    {"name": _sanitize_text(c["name"], 60), "amount": str(c["value"]), "share_pct": str(c["share_pct"])}
                    for c in summary_30["expense_breakdown"][:6]
                ],
            },
            "trailing_90d": {
                "revenue": _money_str(k_90["total_revenue"]),
                "expenses": _money_str(k_90["total_expenses"]),
                "net_profit": _money_str(k_90["net_profit"]),
            },
            "receivables": {
                "accounts_receivable_total": _money_str(k_30["accounts_receivable"]),
                "open_invoice_receivables": _money_str(k_30["invoice_receivables"]),
                "overdue_receivables": _money_str(k_30["overdue_receivables"]),
                "open_invoices_count": k_30["open_invoices_count"],
                "overdue_invoices_count": k_30["overdue_invoices_count"],
                "collection_efficiency_pct": str(twin["collection_efficiency_pct"]),
            },
            "payables_and_liabilities": {
                "accounts_payable_total": _money_str(k_30["accounts_payable"]),
                "scheduled_expense_payables": _money_str(k_30["scheduled_expense_payables"]),
                "supplier_opening_payables": _money_str(k_30["supplier_opening_payables"]),
                "tax_liability_accrued": _money_str(k_30["tax_liability_accrued"]),
                "short_term_loan_balance": _money_str(business.short_term_loan_balance),
                "total_liabilities": _money_str(twin["liabilities"]["total_liabilities"]),
                "coverage_note": "Tracks recorded supplier opening balances, pending/scheduled expenses, accrued tax, and short-term loans; unentered vendor bills are excluded.",
            },
            "inventory": {
                "inventory_valuation_at_cost": _money_str(k_30["inventory_valuation"]),
                "total_skus": len(dataset.products),
                "low_stock_count": len(low_stock_items),
                "low_stock_skus": low_stock_items,
            },
        },
        "digital_twin_and_health": {
            "data_label": health["data_label"],
            "net_working_position": _money_str(twin["net_working_position"]),
            "quick_ratio": str(twin["quick_ratio"]) if twin["quick_ratio"] is not None else None,
            "cash_runway_months": str(twin["cash_runway_months"]),
            "fixed_cost_pct": twin["fixed_vs_variable_ratio"]["fixed_pct"],
            "variable_cost_pct": twin["fixed_vs_variable_ratio"]["variable_pct"],
            "health_score": health["overall_score"],
            "health_grade": health["grade"],
            "health_components": [
                {
                    "label": c["label"],
                    "score": c["score"],
                    "weight": c["weight"],
                    "data_available": c["data_available"],
                    "metric": c["underlying_metric"],
                }
                for c in health["components"]
            ],
        },
        "cash_flow_forecast": {
            "data_label": DataLabel.FORECAST.value,
            "overall_confidence": forecast["overall_confidence"],
            "observed_payment_delay_days": forecast["observed_payment_delay_days"],
            "data_quality_notes": forecast["data_quality_notes"],
            "horizons": {
                "7d": {
                    "expected_cash_balance": _money_str(h7["expected_cash_balance"]),
                    "expected_inflows": _money_str(h7["expected_inflows"]),
                    "expected_outflows": _money_str(h7["expected_outflows"]),
                    "shortage_risk": h7["shortage_risk"],
                },
                "30d": {
                    "expected_cash_balance": _money_str(h30["expected_cash_balance"]),
                    "expected_inflows": _money_str(h30["expected_inflows"]),
                    "expected_outflows": _money_str(h30["expected_outflows"]),
                    "min_projected_cash": _money_str(h30["min_projected_cash"]),
                    "shortage_risk": h30["shortage_risk"],
                    "shortage_dates": h30["shortage_dates"][:5],
                },
                "90d": {
                    "expected_cash_balance": _money_str(h90["expected_cash_balance"]),
                    "expected_inflows": _money_str(h90["expected_inflows"]),
                    "expected_outflows": _money_str(h90["expected_outflows"]),
                    "min_projected_cash": _money_str(h90["min_projected_cash"]),
                    "shortage_risk": h90["shortage_risk"],
                    "shortage_dates": h90["shortage_dates"][:5],
                },
            },
        },
        "active_risk_alerts": active_alerts,
        "saved_what_if_scenarios": recent_scenarios,
    }

    cur = business.currency
    computed_facts = [
        {
            "key": "available_cash",
            "label": "Available Cash",
            "value": f"{cur} {_money_str(k_30['available_cash'])}",
            "numeric_value": to_money(k_30["available_cash"]),
            "data_label": DataLabel.ACTUAL.value,
            "source": "ledger_cash_balance",
        },
        {
            "key": "window_revenue",
            "label": f"Revenue ({summary_selected['window']['preset']})",
            "value": f"{cur} {_money_str(k_sel['total_revenue'])}",
            "numeric_value": to_money(k_sel["total_revenue"]),
            "data_label": DataLabel.ACTUAL.value,
            "source": "financial_summary",
        },
        {
            "key": "window_expenses",
            "label": f"Expenses ({summary_selected['window']['preset']})",
            "value": f"{cur} {_money_str(k_sel['total_expenses'])}",
            "numeric_value": to_money(k_sel["total_expenses"]),
            "data_label": DataLabel.ACTUAL.value,
            "source": "financial_summary",
        },
        {
            "key": "window_net_profit",
            "label": f"Net Profit ({summary_selected['window']['preset']})",
            "value": f"{cur} {_money_str(k_sel['net_profit'])} ({k_sel['net_margin_pct']}%)",
            "numeric_value": to_money(k_sel["net_profit"]),
            "data_label": DataLabel.ACTUAL.value,
            "source": "financial_summary",
        },
        {
            "key": "overdue_receivables",
            "label": "Overdue Receivables",
            "value": f"{cur} {_money_str(k_30['overdue_receivables'])} ({k_30['overdue_invoices_count']} inv)",
            "numeric_value": to_money(k_30["overdue_receivables"]),
            "data_label": DataLabel.ACTUAL.value,
            "source": "invoices_ledger",
        },
        {
            "key": "cash_runway_months",
            "label": "Estimated Cash Runway",
            "value": f"{twin['cash_runway_months']} months",
            "numeric_value": Decimal(str(twin["cash_runway_months"])),
            "data_label": DataLabel.ESTIMATED.value,
            "source": "digital_twin",
        },
        {
            "key": "health_score",
            "label": "Financial Health Score",
            "value": f"{health['overall_score']}/100 ({health['grade']})",
            "numeric_value": Decimal(str(health["overall_score"])),
            "data_label": health["data_label"],
            "source": "financial_health",
        },
        {
            "key": "forecast_30d_cash",
            "label": "30-Day Projected Cash",
            "value": f"{cur} {_money_str(h30['expected_cash_balance'])}",
            "numeric_value": to_money(h30["expected_cash_balance"]),
            "data_label": DataLabel.FORECAST.value,
            "source": "cash_flow_forecast",
        },
    ]

    return CopilotFinancialContext(
        business_id=business.id,
        currency=business.currency,
        as_of_date=dataset.as_of.isoformat(),
        window_preset=summary_selected["window"]["preset"],
        insufficient_data=insufficient_data,
        insufficient_data_reasons=insufficient_reasons,
        context_payload=context_payload,
        computed_facts=computed_facts,
    )
