from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Business, Invoice, Payment
from app.models.enums import (
    ConfidenceLevel,
    DataLabel,
    InvoiceStatus,
    TransactionStatus,
    TransactionType,
)
from app.services.financial_engine import (
    BusinessDataset,
    HUNDRED,
    ZERO,
    add_months,
    compute_financial_summary_from_dataset,
    is_inventory_cogs_tx,
    load_business_dataset,
    month_start,
    next_month_end,
    to_pct,
)
from app.services.financial_utils import to_money

ONE = Decimal("1.00")
RATIO_QUANT = Decimal("0.01")
RUNWAY_QUANT = Decimal("0.1")


def _decimal_mean_and_std(values: list[Decimal]) -> tuple[Decimal, Decimal]:
    if not values:
        return ZERO, ZERO
    n = Decimal(len(values))
    mean = sum(values, ZERO) / n
    if len(values) < 2:
        return to_money(mean), ZERO
    variance = sum(((v - mean) * (v - mean) for v in values), ZERO) / n
    std = variance.sqrt() if variance > ZERO else ZERO
    return to_money(mean), to_money(std)


def _estimate_empirical_payment_delay_days(
    db: Session,
    business_id: str,
    invoices: list[Invoice],
) -> tuple[int | None, int]:
    """Measure observed payment delay (payment_date - due_date) across settled payments."""
    payments = list(
        db.scalars(select(Payment).where(Payment.business_id == business_id)).all()
    )
    if not payments:
        return None, 0

    inv_due = {inv.id: inv.due_date for inv in invoices}
    delays: list[int] = []
    for p in payments:
        due = inv_due.get(p.invoice_id)
        if due is not None:
            delay = (p.payment_date - due).days
            delays.append(max(0, delay))

    if not delays:
        return None, 0
    avg_delay = Decimal(sum(delays)) / Decimal(len(delays))
    return int(avg_delay.quantize(Decimal("1"), rounding=ROUND_HALF_UP)), len(delays)


def _compute_runway_months(
    available_cash: Decimal,
    monthly_inflow: Decimal,
    monthly_outflow: Decimal,
    monthly_fixed_overhead: Decimal,
) -> Decimal:
    """Estimate cash runway months conservatively using Decimal."""
    if available_cash <= ZERO:
        return Decimal("0.0")
    net_burn = monthly_outflow - monthly_inflow
    effective_burn = net_burn if net_burn > ZERO else max(monthly_fixed_overhead, monthly_outflow * Decimal("0.35"))
    if effective_burn <= ZERO:
        return Decimal("24.0")
    raw = (available_cash / effective_burn).quantize(RUNWAY_QUANT, rounding=ROUND_HALF_UP)
    return min(Decimal("36.0"), max(Decimal("0.0"), raw))


def build_cash_flow_forecast(
    db: Session,
    business: Business,
    *,
    as_of_date: date | None = None,
    dataset: BusinessDataset | None = None,
) -> dict:
    """Generate deterministic 7d, 30d, and 90d cash-flow forecasts with honest confidence grading."""
    ds = dataset or load_business_dataset(db, business, as_of_date=as_of_date)
    summary = compute_financial_summary_from_dataset(ds, preset="90d")
    kpis = summary["kpis"]
    as_of = ds.as_of

    completed_txs = [
        tx
        for tx in ds.transactions
        if tx.status == TransactionStatus.COMPLETED and tx.transaction_date <= as_of
    ]
    trailing_start = as_of - timedelta(days=89)
    trailing_txs = [tx for tx in completed_txs if tx.transaction_date >= trailing_start]

    inflow_days: dict[date, Decimal] = defaultdict(lambda: ZERO)
    outflow_days: dict[date, Decimal] = defaultdict(lambda: ZERO)
    active_dates: set[date] = set()
    for tx in trailing_txs:
        active_dates.add(tx.transaction_date)
        amt = to_money(tx.amount)
        if tx.type == TransactionType.INCOME:
            inflow_days[tx.transaction_date] += amt
        else:
            outflow_days[tx.transaction_date] += amt

    # Observed span in trailing 90d window
    if trailing_txs:
        earliest_tx_date = min(tx.transaction_date for tx in trailing_txs)
        observed_span_days = max(1, (as_of - earliest_tx_date).days + 1)
    else:
        observed_span_days = 0

    daily_inflows_series: list[Decimal] = []
    daily_outflows_series: list[Decimal] = []
    if observed_span_days > 0:
        span_cursor = as_of - timedelta(days=observed_span_days - 1)
        while span_cursor <= as_of:
            daily_inflows_series.append(inflow_days[span_cursor])
            daily_outflows_series.append(outflow_days[span_cursor])
            span_cursor += timedelta(days=1)

    mean_daily_inflow, std_daily_inflow = _decimal_mean_and_std(daily_inflows_series)
    mean_daily_outflow, std_daily_outflow = _decimal_mean_and_std(daily_outflows_series)

    # Scheduled obligations & open invoices
    observed_delay_days, payment_samples = _estimate_empirical_payment_delay_days(
        db, business.id, ds.invoices
    )
    effective_delay_days = observed_delay_days or 0

    open_invoices_by_expected_date: dict[date, Decimal] = defaultdict(lambda: ZERO)
    for inv in ds.invoices:
        if inv.status == InvoiceStatus.PAID:
            continue
        remaining = to_money(inv.total_amount - inv.amount_paid)
        if remaining <= ZERO:
            continue
        expected_date = inv.due_date + timedelta(days=effective_delay_days)
        if expected_date <= as_of:
            # Past-due collectible amount spread across next 7 days conservatively if due already passed
            expected_date = as_of + timedelta(days=3)
        open_invoices_by_expected_date[expected_date] += remaining

    scheduled_expenses_by_date: dict[date, Decimal] = defaultdict(lambda: ZERO)
    for tx in ds.transactions:
        if (
            tx.type == TransactionType.EXPENSE
            and tx.status in (TransactionStatus.PENDING, TransactionStatus.SCHEDULED)
        ):
            target_dt = tx.transaction_date if tx.transaction_date > as_of else as_of + timedelta(days=1)
            scheduled_expenses_by_date[target_dt] += to_money(tx.amount)

    # Confidence scoring based strictly on data depth and variance
    tx_count = len(trailing_txs)
    data_quality_notes: list[str] = []
    if tx_count < 5 or len(active_dates) < 3 or observed_span_days < 7:
        confidence = ConfidenceLevel.INSUFFICIENT_DATA
        data_quality_notes.append(
            f"Only {tx_count} completed transaction(s) across {observed_span_days} day(s) in trailing 90 days; historical baseline is insufficient for high-precision forecasting."
        )
    elif tx_count < 15 or observed_span_days < 21 or (
        mean_daily_outflow > ZERO and std_daily_outflow > mean_daily_outflow * Decimal("1.5")
    ):
        confidence = ConfidenceLevel.LOW
        data_quality_notes.append(
            f"Limited or volatile activity ({tx_count} transactions over {observed_span_days} days) lowers forecast certainty."
        )
    elif tx_count < 40 or observed_span_days < 60:
        confidence = ConfidenceLevel.MEDIUM
        data_quality_notes.append(
            f"Moderate transaction sample ({tx_count} transactions over {observed_span_days} days); accuracy improves with 60+ days of consistent history."
        )
    else:
        confidence = ConfidenceLevel.HIGH
        data_quality_notes.append(
            f"High historical coverage ({tx_count} transactions over {observed_span_days} days)."
        )

    if observed_delay_days is None:
        data_quality_notes.append(
            "No historical invoice payment settlements recorded yet; open invoice collections are projected on contractual due dates without empirical delay adjustment."
        )
    else:
        data_quality_notes.append(
            f"Empirical customer payment delay of +{observed_delay_days} day(s) applied from {payment_samples} settled payment record(s)."
        )

    daily_fixed_overhead = to_money(to_money(business.monthly_fixed_overhead) / Decimal("30"))
    # Avoid double-counting fixed overhead against historical daily outflows if history already includes rent/payroll:
    # if historical daily outflows exist, use max(mean_daily_outflow, daily_fixed_overhead) as baseline run-rate outflow.
    baseline_daily_outflow = (
        max(mean_daily_outflow, daily_fixed_overhead)
        if tx_count >= 5
        else daily_fixed_overhead
    )
    baseline_daily_inflow = mean_daily_inflow if tx_count >= 5 else ZERO

    starting_cash = to_money(kpis["available_cash"])
    overhead_buffer = to_money(business.monthly_fixed_overhead)

    horizons_output: dict[str, dict] = {}
    for days in (7, 30, 90):
        running_cash = starting_cash
        total_in = ZERO
        total_out = ZERO
        min_cash = starting_cash
        shortage_dates: list[str] = []
        points: list[dict] = []

        for step in range(1, days + 1):
            day = as_of + timedelta(days=step)
            inv_in = to_money(open_invoices_by_expected_date.get(day, ZERO))
            sched_out = to_money(scheduled_expenses_by_date.get(day, ZERO))
            day_in = to_money(baseline_daily_inflow + inv_in)
            day_out = to_money(baseline_daily_outflow + sched_out)
            net = to_money(day_in - day_out)
            running_cash = to_money(running_cash + net)
            total_in += day_in
            total_out += day_out
            if running_cash < min_cash:
                min_cash = running_cash
            if running_cash < ZERO or (overhead_buffer > ZERO and running_cash < overhead_buffer):
                shortage_dates.append(day.isoformat())

            # Emit every day for 7d/30d, and every 3rd day + final day for 90d for compact payload
            if days <= 30 or step % 3 == 0 or step == days:
                points.append(
                    {
                        "date": day.isoformat(),
                        "label": day.strftime("%b %d"),
                        "expected_inflows": day_in,
                        "expected_outflows": day_out,
                        "net_flow": net,
                        "projected_cash_balance": running_cash,
                        "data_label": DataLabel.FORECAST.value,
                    }
                )

        horizons_output[f"{days}d"] = {
            "horizon_days": days,
            "starting_cash_balance": starting_cash,
            "expected_cash_balance": to_money(running_cash),
            "expected_inflows": to_money(total_in),
            "expected_outflows": to_money(total_out),
            "net_cash_change": to_money(total_in - total_out),
            "min_projected_cash": to_money(min_cash),
            "shortage_risk": len(shortage_dates) > 0,
            "shortage_dates": shortage_dates[:15],
            "confidence": confidence.value,
            "series": points,
        }

    assumptions = [
        f"Starting cash balance ({starting_cash}) is sourced directly from verified ledger actuals as of {as_of.isoformat()}.",
        f"Baseline daily operating inflow ({baseline_daily_inflow}/day) and outflow ({baseline_daily_outflow}/day) are derived from trailing 90-day completed ledger history and monthly_fixed_overhead.",
        "Pending/scheduled expense transactions and unpaid open invoices are layered onto their scheduled or delay-adjusted due dates.",
        "Tax liability accrued and supplier opening payables remain tracked on the balance sheet until scheduled or paid.",
    ]

    return {
        "business_id": business.id,
        "currency": business.currency,
        "data_label": DataLabel.FORECAST.value,
        "as_of_date": as_of.isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "overall_confidence": confidence.value,
        "observed_payment_delay_days": observed_delay_days,
        "historical_sample_transactions": tx_count,
        "historical_span_days": observed_span_days,
        "data_quality_notes": data_quality_notes,
        "assumptions": assumptions,
        "horizons": horizons_output,
        "expected_incoming_invoices": [
            {
                "invoice_id": inv.id,
                "invoice_number": inv.invoice_number,
                "due_date": inv.due_date.isoformat(),
                "expected_collection_date": (inv.due_date + timedelta(days=effective_delay_days)).isoformat(),
                "remaining_amount": to_money(inv.total_amount - inv.amount_paid),
                "status": inv.status.value,
            }
            for inv in ds.invoices
            if inv.status != InvoiceStatus.PAID and to_money(inv.total_amount - inv.amount_paid) > ZERO
        ],
        "upcoming_scheduled_expenses": [
            {
                "transaction_id": tx.id,
                "description": tx.description,
                "counterparty": tx.counterparty,
                "scheduled_date": tx.transaction_date.isoformat(),
                "amount": to_money(tx.amount),
                "status": tx.status.value,
            }
            for tx in ds.transactions
            if tx.type == TransactionType.EXPENSE
            and tx.status in (TransactionStatus.PENDING, TransactionStatus.SCHEDULED)
        ],
    }


def compute_financial_health(
    db: Session,
    business: Business,
    *,
    as_of_date: date | None = None,
    dataset: BusinessDataset | None = None,
) -> dict:
    """Transparent 0-100 Financial Health Score with explicit missing-data guardrails."""
    ds = dataset or load_business_dataset(db, business, as_of_date=as_of_date)
    summary = compute_financial_summary_from_dataset(ds, preset="30d")
    summary_90 = compute_financial_summary_from_dataset(ds, preset="90d")
    kpis = summary["kpis"]
    kpis90 = summary_90["kpis"]
    as_of = ds.as_of

    completed_txs = [
        tx for tx in ds.transactions if tx.status == TransactionStatus.COMPLETED and tx.transaction_date <= as_of
    ]
    has_tx_30 = summary["data_completeness"]["completed_transactions_in_window"] > 0
    has_tx_any = len(completed_txs) > 0
    has_invoices = len(ds.invoices) > 0

    available_cash = to_money(kpis["available_cash"])
    total_rev_30 = to_money(kpis["total_revenue"])
    total_exp_30 = to_money(kpis["total_expenses"])
    net_profit_30 = to_money(kpis["net_profit"])
    net_margin_pct = to_money(kpis["net_margin_pct"])

    # Avg monthly rev/exp over 90d
    avg_monthly_rev = to_money(to_money(kpis90["total_revenue"]) / Decimal("3"))
    avg_monthly_exp = to_money(to_money(kpis90["total_expenses"]) / Decimal("3"))

    runway_months = _compute_runway_months(
        available_cash,
        avg_monthly_rev,
        avg_monthly_exp,
        to_money(business.monthly_fixed_overhead),
    )

    # 1. Liquidity & Runway (weight 25)
    has_liquidity_data = has_tx_any or available_cash > ZERO or to_money(business.monthly_fixed_overhead) > ZERO
    if not has_liquidity_data:
        liquidity_score = 0
        liquidity_metric = "No cash balance or overhead configured"
    else:
        # 6 months runway -> 100
        raw_liq = min(Decimal("100"), (runway_months / Decimal("6")) * Decimal("100"))
        liquidity_score = int(raw_liq.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        liquidity_metric = f"{runway_months} months runway ({available_cash} cash)"

    # 2. Profitability (weight 20)
    if not has_tx_30 or total_rev_30 <= ZERO:
        profitability_score = 0
        profitability_metric = "No completed revenue in trailing 30d"
    else:
        # 0% margin -> 45, 25%+ margin -> 100, negative margin scales down to 0 at -25%
        if net_margin_pct >= ZERO:
            raw_prof = Decimal("45") + (min(net_margin_pct, Decimal("25")) / Decimal("25")) * Decimal("55")
        else:
            raw_prof = max(ZERO, Decimal("45") + (net_margin_pct / Decimal("25")) * Decimal("45"))
        profitability_score = int(raw_prof.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        profitability_metric = f"{net_margin_pct}% net margin ({net_profit_30} net)"

    # 3. Cash-Flow Stability (weight 15): trailing 3 months monthly net cash flow positivity & smoothness
    monthly_nets: list[Decimal] = []
    cur_m = month_start(as_of)
    for offset in (2, 1, 0):
        m_start = add_months(cur_m, -offset)
        m_end = next_month_end(m_start)
        m_rev = ZERO
        m_exp = ZERO
        m_count = 0
        for tx in completed_txs:
            if m_start <= tx.transaction_date <= m_end:
                m_count += 1
                amt = to_money(tx.amount)
                if tx.type == TransactionType.INCOME:
                    m_rev += amt
                else:
                    m_exp += amt
        if m_count > 0:
            monthly_nets.append(to_money(m_rev - m_exp))

    if len(monthly_nets) < 2:
        stability_score = 0
        stability_metric = "Requires >= 2 months of transaction history"
        has_stability_data = False
    else:
        has_stability_data = True
        positive_months = sum(1 for n in monthly_nets if n >= ZERO)
        pos_ratio = Decimal(positive_months) / Decimal(len(monthly_nets))
        mean_n, std_n = _decimal_mean_and_std([abs(x) for x in monthly_nets])
        cv_penalty = min(Decimal("35"), (std_n / max(mean_n, ONE)) * Decimal("35")) if mean_n > ZERO else ZERO
        raw_stab = max(ZERO, min(Decimal("100"), (pos_ratio * Decimal("85")) + Decimal("15") - cv_penalty))
        stability_score = int(raw_stab.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        stability_metric = f"{positive_months}/{len(monthly_nets)} positive net cash months"

    # 4. Receivables Discipline (weight 15)
    total_billed = sum((to_money(inv.total_amount) for inv in ds.invoices), ZERO)
    overdue_amt = to_money(kpis["overdue_receivables"])
    open_ar = to_money(kpis["invoice_receivables"])
    if not has_invoices or total_billed <= ZERO:
        receivables_score = 0
        receivables_metric = "No invoices issued yet"
    else:
        overdue_ratio = overdue_amt / total_billed
        open_ratio = open_ar / total_billed
        raw_rec = max(
            ZERO,
            min(
                Decimal("100"),
                Decimal("100") - (overdue_ratio * Decimal("180")) - (open_ratio * Decimal("25")),
            ),
        )
        receivables_score = int(raw_rec.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        receivables_metric = f"{overdue_amt} overdue of {total_billed} billed"

    # 5. Expense Control (weight 15): operating + total expenses vs revenue in 30d
    if not has_tx_30 or (total_rev_30 <= ZERO and total_exp_30 <= ZERO):
        expense_score = 0
        expense_metric = "No expense/revenue activity in trailing 30d"
        has_expense_data = False
    else:
        has_expense_data = True
        if total_rev_30 <= ZERO:
            expense_score = 10
            expense_metric = f"{total_exp_30} expenses with zero revenue"
        else:
            exp_ratio = total_exp_30 / total_rev_30
            # <=0.65 -> 100, 1.0 -> 50, >=1.3 -> 0
            if exp_ratio <= Decimal("0.65"):
                raw_ec = Decimal("100")
            elif exp_ratio <= ONE:
                raw_ec = Decimal("100") - ((exp_ratio - Decimal("0.65")) / Decimal("0.35")) * Decimal("50")
            else:
                raw_ec = max(ZERO, Decimal("50") - ((exp_ratio - ONE) / Decimal("0.30")) * Decimal("50"))
            expense_score = int(raw_ec.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
            expense_metric = f"Expense ratio {to_pct(total_exp_30, total_rev_30)}% of revenue"

    # 6. Revenue Consistency (weight 10)
    monthly_revs: list[Decimal] = []
    for offset in (2, 1, 0):
        m_start = add_months(cur_m, -offset)
        m_end = next_month_end(m_start)
        m_rev = sum(
            (
                to_money(tx.amount)
                for tx in completed_txs
                if tx.type == TransactionType.INCOME and m_start <= tx.transaction_date <= m_end
            ),
            ZERO,
        )
        if m_rev > ZERO:
            monthly_revs.append(to_money(m_rev))

    if len(monthly_revs) < 2:
        consistency_score = 0
        consistency_metric = "Requires >= 2 months of revenue data"
        has_consistency_data = False
    else:
        has_consistency_data = True
        mean_r, std_r = _decimal_mean_and_std(monthly_revs)
        cov = (std_r / mean_r) if mean_r > ZERO else ONE
        raw_con = max(ZERO, min(Decimal("100"), Decimal("100") - (cov * Decimal("80"))))
        consistency_score = int(raw_con.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        consistency_metric = f"Avg {mean_r}/mo across {len(monthly_revs)} months (std {std_r})"

    components = [
        {
            "key": "liquidity",
            "label": "Liquidity & Runway",
            "weight": 25,
            "score": liquidity_score,
            "weighted_contribution": to_money(Decimal(liquidity_score * 25) / HUNDRED),
            "data_available": has_liquidity_data,
            "underlying_metric": liquidity_metric,
            "explanation": "Measures available cash relative to monthly net burn and fixed overhead.",
        },
        {
            "key": "profitability",
            "label": "Profitability",
            "weight": 20,
            "score": profitability_score,
            "weighted_contribution": to_money(Decimal(profitability_score * 20) / HUNDRED),
            "data_available": has_tx_30 and total_rev_30 > ZERO,
            "underlying_metric": profitability_metric,
            "explanation": "Evaluates trailing 30-day net profit margin against healthy SME benchmarks.",
        },
        {
            "key": "cash_flow_stability",
            "label": "Cash-Flow Stability",
            "weight": 15,
            "score": stability_score,
            "weighted_contribution": to_money(Decimal(stability_score * 15) / HUNDRED),
            "data_available": has_stability_data,
            "underlying_metric": stability_metric,
            "explanation": "Tracks multi-month frequency of positive net cash flow and month-to-month variance.",
        },
        {
            "key": "receivables_discipline",
            "label": "Receivables Discipline",
            "weight": 15,
            "score": receivables_score,
            "weighted_contribution": to_money(Decimal(receivables_score * 15) / HUNDRED),
            "data_available": has_invoices and total_billed > ZERO,
            "underlying_metric": receivables_metric,
            "explanation": "Penalizes past-due invoices and uncollected receivable concentration.",
        },
        {
            "key": "expense_control",
            "label": "Expense Control",
            "weight": 15,
            "score": expense_score,
            "weighted_contribution": to_money(Decimal(expense_score * 15) / HUNDRED),
            "data_available": has_expense_data,
            "underlying_metric": expense_metric,
            "explanation": "Assesses total operating and procurement outflows relative to trailing 30d revenue.",
        },
        {
            "key": "revenue_consistency",
            "label": "Revenue Consistency",
            "weight": 10,
            "score": consistency_score,
            "weighted_contribution": to_money(Decimal(consistency_score * 10) / HUNDRED),
            "data_available": has_consistency_data,
            "underlying_metric": consistency_metric,
            "explanation": "Measures stability of monthly completed inflows over the trailing quarter.",
        },
    ]

    available_weight = sum(c["weight"] for c in components if c["data_available"])
    raw_weighted_sum = sum(
        (c["weighted_contribution"] for c in components),
        ZERO,
    )
    overall_score = int(raw_weighted_sum.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    overall_score = max(0, min(100, overall_score))

    # Strict missing-data guardrail: missing records cannot reach 100 or Healthy/Strong
    if available_weight == 0:
        overall_score = 0
        grade = "Insufficient Data"
    elif available_weight < 50:
        overall_score = min(overall_score, available_weight)
        grade = "Insufficient Data" if not has_tx_any else "Watch"
    elif overall_score >= 82 and available_weight >= 85:
        grade = "Strong"
    elif overall_score >= 65:
        grade = "Healthy"
    elif overall_score >= 45:
        grade = "Watch"
    else:
        grade = "At Risk"

    return {
        "business_id": business.id,
        "currency": business.currency,
        "data_label": DataLabel.ACTUAL.value if available_weight >= 50 else DataLabel.ESTIMATED.value,
        "as_of_date": as_of.isoformat(),
        "overall_score": overall_score,
        "grade": grade,
        "data_completeness_pct": available_weight,
        "runway_months": runway_months,
        "net_margin_pct": net_margin_pct,
        "components": components,
        "missing_data_notes": [
            f"Missing underlying data for '{c['label']}' ({c['weight']}% weight); scored 0 until records exist."
            for c in components
            if not c["data_available"]
        ],
    }


def build_financial_twin(
    db: Session,
    business: Business,
    *,
    as_of_date: date | None = None,
) -> dict:
    """Construct living Financial Digital Twin across Assets, Liabilities, and Timeline."""
    ds = load_business_dataset(db, business, as_of_date=as_of_date)
    summary = compute_financial_summary_from_dataset(ds, preset="30d")
    forecast = build_cash_flow_forecast(db, business, as_of_date=ds.as_of, dataset=ds)
    health = compute_financial_health(db, business, as_of_date=ds.as_of, dataset=ds)
    kpis = summary["kpis"]
    as_of = ds.as_of

    available_cash = to_money(kpis["available_cash"])
    outstanding_receivables = to_money(kpis["accounts_receivable"])
    inventory_valuation = to_money(kpis["inventory_valuation"])
    total_current_assets = to_money(available_cash + outstanding_receivables + inventory_valuation)

    scheduled_payables = to_money(kpis["scheduled_expense_payables"] + kpis["supplier_opening_payables"])
    tax_liability_accrued = to_money(kpis["tax_liability_accrued"])
    short_term_loan_balance = to_money(business.short_term_loan_balance)
    total_liabilities = to_money(scheduled_payables + tax_liability_accrued + short_term_loan_balance)

    net_working_position = to_money(total_current_assets - total_liabilities)
    quick_ratio: Decimal | None
    if total_liabilities > ZERO:
        quick_ratio = ((available_cash + outstanding_receivables) / total_liabilities).quantize(
            RATIO_QUANT, rounding=ROUND_HALF_UP
        )
    else:
        quick_ratio = None

    # Fixed vs variable ratio
    fixed_overhead = to_money(business.monthly_fixed_overhead)
    total_exp_30 = to_money(kpis["total_expenses"])
    variable_spend = max(ZERO, to_money(total_exp_30 - fixed_overhead))
    cost_denom = fixed_overhead + variable_spend
    if cost_denom > ZERO:
        fixed_pct = int(to_pct(fixed_overhead, cost_denom).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        variable_pct = 100 - fixed_pct
    else:
        fixed_pct = 0
        variable_pct = 0

    total_invoiced = sum((to_money(inv.total_amount) for inv in ds.invoices), ZERO)
    total_paid_on_invoices = sum((to_money(inv.amount_paid) for inv in ds.invoices), ZERO)
    collection_efficiency_pct = to_pct(total_paid_on_invoices, total_invoiced)

    # Build 8-month timeline: 4 historical actual months + current MTD (ESTIMATED) + 3 future months (FORECAST)
    cur_m = month_start(as_of)
    completed_txs = [tx for tx in ds.transactions if tx.status == TransactionStatus.COMPLETED]
    opening_cash = to_money(business.opening_cash_balance)

    # Calculate cash entering 4 months prior to cur_m
    hist_start = add_months(cur_m, -4)
    running_cash = opening_cash
    for tx in completed_txs:
        if tx.transaction_date < hist_start:
            amt = to_money(tx.amount)
            running_cash += amt if tx.type == TransactionType.INCOME else -amt

    timeline: list[dict] = []
    hist_revs: list[Decimal] = []
    hist_exps: list[Decimal] = []

    for offset in (-4, -3, -2, -1):
        m_s = add_months(cur_m, offset)
        m_e = next_month_end(m_s)
        m_rev = ZERO
        m_exp = ZERO
        for tx in completed_txs:
            if m_s <= tx.transaction_date <= m_e:
                amt = to_money(tx.amount)
                if tx.type == TransactionType.INCOME:
                    m_rev += amt
                else:
                    m_exp += amt
        m_rev = to_money(m_rev)
        m_exp = to_money(m_exp)
        m_net = to_money(m_rev - m_exp)
        running_cash = to_money(running_cash + m_net)
        if m_rev > ZERO or m_exp > ZERO:
            hist_revs.append(m_rev)
            hist_exps.append(m_exp)
        timeline.append(
            {
                "period": m_s.strftime("%Y-%m"),
                "label": m_s.strftime("%b %y"),
                "data_label": DataLabel.ACTUAL.value,
                "cash_balance": running_cash,
                "revenue": m_rev,
                "expenses": m_exp,
                "net_profit": m_net,
                "receivables": outstanding_receivables if offset == -1 else ZERO,
                "payables": scheduled_payables if offset == -1 else ZERO,
            }
        )

    # Current MTD (ESTIMATED full month if early in month, actual so far tagged ESTIMATED)
    mtd_rev = ZERO
    mtd_exp = ZERO
    for tx in completed_txs:
        if cur_m <= tx.transaction_date <= as_of:
            amt = to_money(tx.amount)
            if tx.type == TransactionType.INCOME:
                mtd_rev += amt
            else:
                mtd_exp += amt
    days_elapsed = max(1, (as_of - cur_m).days + 1)
    days_in_month = (next_month_end(cur_m) - cur_m).days + 1
    scale_factor = Decimal(days_in_month) / Decimal(days_elapsed)
    est_mtd_rev = to_money(mtd_rev * scale_factor)
    est_mtd_exp = max(to_money(mtd_exp * scale_factor), fixed_overhead)
    est_mtd_net = to_money(est_mtd_rev - est_mtd_exp)
    running_cash = available_cash  # anchor current period cash to verified available_cash
    timeline.append(
        {
            "period": cur_m.strftime("%Y-%m"),
            "label": f"{cur_m.strftime('%b %y')} (MTD)",
            "data_label": DataLabel.ESTIMATED.value,
            "cash_balance": running_cash,
            "revenue": est_mtd_rev,
            "expenses": est_mtd_exp,
            "net_profit": est_mtd_net,
            "receivables": outstanding_receivables,
            "payables": scheduled_payables,
        }
    )

    # 3 forward months from 90d forecast average + historical run rate
    avg_hist_rev, _ = _decimal_mean_and_std(hist_revs)
    avg_hist_exp, _ = _decimal_mean_and_std(hist_exps)
    h30 = forecast["horizons"]["30d"]
    h90 = forecast["horizons"]["90d"]
    proj_m_rev = to_money(h90["expected_inflows"] / Decimal("3")) if h90["expected_inflows"] > ZERO else avg_hist_rev
    proj_m_exp = max(to_money(h90["expected_outflows"] / Decimal("3")), fixed_overhead)
    if proj_m_exp == ZERO and avg_hist_exp > ZERO:
        proj_m_exp = avg_hist_exp

    forecast_cash = available_cash
    for f_step in (1, 2, 3):
        f_m = add_months(cur_m, f_step)
        if f_step == 1:
            step_rev = to_money(h30["expected_inflows"])
            step_exp = to_money(h30["expected_outflows"])
            forecast_cash = to_money(h30["expected_cash_balance"])
        else:
            step_rev = proj_m_rev
            step_exp = proj_m_exp
            forecast_cash = to_money(forecast_cash + step_rev - step_exp)
        timeline.append(
            {
                "period": f_m.strftime("%Y-%m"),
                "label": f_m.strftime("%b %y"),
                "data_label": DataLabel.FORECAST.value,
                "cash_balance": forecast_cash,
                "revenue": step_rev,
                "expenses": step_exp,
                "net_profit": to_money(step_rev - step_exp),
                "receivables": outstanding_receivables,
                "payables": scheduled_payables,
            }
        )

    change_drivers = [
        {
            "title": "Opening Balance & Net Cash Accumulation",
            "impact": f"{available_cash} cash",
            "data_label": DataLabel.ACTUAL.value,
            "detail": f"Verified cash equals opening balance ({kpis['opening_cash_balance']}) plus cumulative completed inflows minus outflows.",
        },
        {
            "title": "Receivables & Collection Velocity",
            "impact": f"{outstanding_receivables} open AR",
            "data_label": DataLabel.ACTUAL.value,
            "detail": f"Collection rate stands at {collection_efficiency_pct}% across billed invoices, with {kpis['overdue_receivables']} past due.",
        },
        {
            "title": "Forward 90-Day Liquidity Trajectory",
            "impact": f"{h90['expected_cash_balance']} in 90d",
            "data_label": DataLabel.FORECAST.value,
            "detail": f"90-day projection ({h90['confidence']} confidence) incorporates open receivables, scheduled payouts, and fixed overhead ({fixed_overhead}/mo).",
        },
    ]

    return {
        "business_id": business.id,
        "currency": business.currency,
        "data_label": DataLabel.ACTUAL.value,
        "as_of_date": as_of.isoformat(),
        "net_working_position": net_working_position,
        "quick_ratio": quick_ratio,
        "cash_runway_months": health["runway_months"],
        "collection_efficiency_pct": collection_efficiency_pct,
        "fixed_vs_variable_ratio": {
            "fixed_pct": fixed_pct,
            "variable_pct": variable_pct,
            "monthly_fixed_overhead": fixed_overhead,
            "trailing_variable_spend": variable_spend,
        },
        "assets": {
            "available_cash": available_cash,
            "accounts_receivable": outstanding_receivables,
            "overdue_receivables": to_money(kpis["overdue_receivables"]),
            "inventory_valuation": inventory_valuation,
            "total_current_assets": total_current_assets,
        },
        "liabilities": {
            "upcoming_payables": scheduled_payables,
            "tax_liability_accrued": tax_liability_accrued,
            "short_term_loan_balance": short_term_loan_balance,
            "credit_facility_limit": to_money(business.credit_facility_limit),
            "total_liabilities": total_liabilities,
        },
        "obligations_timeline": forecast["upcoming_scheduled_expenses"],
        "timeline": timeline,
        "change_drivers": change_drivers,
        "forecast_confidence": forecast["overall_confidence"],
    }
