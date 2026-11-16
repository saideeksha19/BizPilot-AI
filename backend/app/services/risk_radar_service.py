from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import get_tenant_record_or_404
from app.models import Business, FinancialAlert, Payment, User
from app.models.enums import (
    AlertSeverity,
    InvoiceStatus,
    TransactionSource,
    TransactionStatus,
    TransactionType,
)
from app.services.audit_service import record_audit_event
from app.services.digital_twin_service import build_cash_flow_forecast
from app.services.financial_engine import (
    ZERO,
    compute_financial_summary_from_dataset,
    is_inventory_cogs_tx,
    load_business_dataset,
    to_pct,
)
from app.services.financial_utils import compute_total_pages, to_money


def _candidate_alerts(
    db: Session,
    business: Business,
    *,
    as_of_date: date | None = None,
) -> list[dict[str, Any]]:
    ds = load_business_dataset(db, business, as_of_date=as_of_date)
    as_of = ds.as_of
    summary_30 = compute_financial_summary_from_dataset(ds, preset="30d")
    forecast = build_cash_flow_forecast(db, business, as_of_date=as_of, dataset=ds)
    k30 = summary_30["kpis"]

    completed_txs = [
        tx
        for tx in ds.transactions
        if tx.status == TransactionStatus.COMPLETED and tx.transaction_date <= as_of
    ]
    start_30 = as_of - timedelta(days=29)
    prev_30_start = start_30 - timedelta(days=30)
    prev_30_end = start_30 - timedelta(days=1)
    baseline_90_start = start_30 - timedelta(days=60)

    txs_30 = [tx for tx in completed_txs if start_30 <= tx.transaction_date <= as_of]
    txs_prev_30 = [tx for tx in completed_txs if prev_30_start <= tx.transaction_date <= prev_30_end]
    txs_prior_60 = [tx for tx in completed_txs if baseline_90_start <= tx.transaction_date < start_30]

    candidates: list[dict[str, Any]] = []

    # 1. Unusual expense spike
    cur_exp = to_money(k30["total_expenses"])
    prior_60_exp = sum(
        (to_money(tx.amount) for tx in txs_prior_60 if tx.type == TransactionType.EXPENSE),
        ZERO,
    )
    baseline_30_exp = to_money(prior_60_exp / Decimal("2"))
    if baseline_30_exp > ZERO and cur_exp > to_money(baseline_30_exp * Decimal("1.35")):
        spike_pct = to_pct(cur_exp - baseline_30_exp, baseline_30_exp)
        delta_amt = to_money(cur_exp - baseline_30_exp)
        candidates.append(
            {
                "dedup_key": "expense_spike_30d",
                "alert_type": "expense_spike",
                "category": "Expense Anomaly",
                "severity": AlertSeverity.CRITICAL if spike_pct >= Decimal("65") else AlertSeverity.WARNING,
                "title": f"Unusual Expense Spike (+{spike_pct}% vs Prior Baseline)",
                "description": (
                    f"Trailing 30-day completed expenses reached {cur_exp}, exceeding the prior 60-day monthly-equivalent baseline ({baseline_30_exp}) by {delta_amt}."
                ),
                "target_route": "transactions",
                "impact_amount": delta_amt,
                "recommended_action": "Audit recent category outflows and verify non-recurring vendor charges.",
                "supporting_evidence": {
                    "current_30d_expenses": str(cur_exp),
                    "baseline_30d_expenses": str(baseline_30_exp),
                    "spike_pct": str(spike_pct),
                },
            }
        )

    # 2. Revenue decline
    cur_rev = to_money(k30["total_revenue"])
    prev_rev = to_money(k30["prev_revenue"])
    if prev_rev > ZERO and cur_rev <= to_money(prev_rev * Decimal("0.80")):
        drop_amt = to_money(prev_rev - cur_rev)
        drop_pct = to_pct(drop_amt, prev_rev)
        candidates.append(
            {
                "dedup_key": "revenue_decline_30d",
                "alert_type": "revenue_decline",
                "category": "Cash Flow",
                "severity": AlertSeverity.CRITICAL if drop_pct >= Decimal("35") else AlertSeverity.WARNING,
                "title": f"Revenue Decline Detected (-{drop_pct}% vs Prior 30 Days)",
                "description": (
                    f"Completed inflows fell from {prev_rev} in the prior 30-day window to {cur_rev} in the current window."
                ),
                "target_route": "overview",
                "impact_amount": drop_amt,
                "recommended_action": "Review customer order frequency, open quotes, and collection pipeline.",
                "supporting_evidence": {
                    "current_30d_revenue": str(cur_rev),
                    "previous_30d_revenue": str(prev_rev),
                    "decline_pct": str(drop_pct),
                },
            }
        )

    # 3. Overdue customer invoices
    overdue_invoices = [
        inv
        for inv in ds.invoices
        if inv.status != InvoiceStatus.PAID
        and to_money(inv.total_amount - inv.amount_paid) > ZERO
        and (inv.status == InvoiceStatus.OVERDUE or inv.due_date < as_of)
    ]
    if overdue_invoices:
        overdue_total = to_money(
            sum((to_money(inv.total_amount - inv.amount_paid) for inv in overdue_invoices), ZERO)
        )
        max_days_late = max((as_of - inv.due_date).days for inv in overdue_invoices)
        candidates.append(
            {
                "dedup_key": "overdue_customer_invoices",
                "alert_type": "overdue_invoices",
                "category": "Overdue Receivables",
                "severity": AlertSeverity.CRITICAL if max_days_late >= 15 else AlertSeverity.WARNING,
                "title": f"{len(overdue_invoices)} Overdue Customer Invoice(s) Totaling {overdue_total}",
                "description": (
                    f"{len(overdue_invoices)} open invoice(s) remain past due by up to {max_days_late} day(s), locking {overdue_total} outside operating cash."
                ),
                "target_route": "invoices",
                "impact_amount": overdue_total,
                "recommended_action": "Send automated collection reminders and prioritize highest-balance past-due accounts.",
                "supporting_evidence": {
                    "overdue_count": len(overdue_invoices),
                    "overdue_total": str(overdue_total),
                    "max_days_overdue": max_days_late,
                    "invoice_numbers": [inv.invoice_number for inv in overdue_invoices[:10]],
                },
            }
        )

    # 4. Potential cash shortage from predictive forecast
    h30 = forecast["horizons"]["30d"]
    h90 = forecast["horizons"]["90d"]
    min_projected = min(to_money(h30["min_projected_cash"]), to_money(h90["min_projected_cash"]))
    overhead = to_money(business.monthly_fixed_overhead)
    if min_projected < ZERO or (overhead > ZERO and min_projected < overhead):
        sev = AlertSeverity.CRITICAL if min_projected < ZERO else AlertSeverity.WARNING
        shortfall = to_money(abs(min_projected)) if min_projected < ZERO else to_money(overhead - min_projected)
        shortage_dates = h90["shortage_dates"] or h30["shortage_dates"]
        candidates.append(
            {
                "dedup_key": "projected_cash_shortage",
                "alert_type": "cash_shortage",
                "category": "Cash Flow",
                "severity": sev,
                "title": (
                    "Projected Negative Cash Deficit Risk"
                    if min_projected < ZERO
                    else "Projected Cash Cushion Below Fixed Overhead Buffer"
                ),
                "description": (
                    f"90-day cash-flow projection reaches a minimum balance of {min_projected} against monthly fixed overhead of {overhead}."
                ),
                "target_route": "cash-flow",
                "impact_amount": shortfall,
                "recommended_action": "Accelerate invoice collections, defer discretionary restocks, or stress-test credit draw in What-If Simulator.",
                "supporting_evidence": {
                    "min_projected_cash": str(min_projected),
                    "monthly_fixed_overhead": str(overhead),
                    "first_shortage_dates": shortage_dates[:5],
                    "forecast_confidence": forecast["overall_confidence"],
                },
            }
        )

    # 5. Suspicious / potentially duplicate payment patterns (neutral language only)
    recent_expenses = [
        tx for tx in txs_30 if tx.type == TransactionType.EXPENSE
    ]
    grouped_exp: dict[tuple[str, Decimal], list[Any]] = defaultdict(list)
    for tx in recent_expenses:
        key = (tx.counterparty.strip().lower(), to_money(tx.amount))
        grouped_exp[key].append(tx)

    dup_matches: list[dict[str, Any]] = []
    dup_exposure = ZERO
    for (party_key, amt), rows in grouped_exp.items():
        if len(rows) < 2:
            continue
        rows_sorted = sorted(rows, key=lambda r: r.transaction_date)
        for idx in range(len(rows_sorted) - 1):
            gap = (rows_sorted[idx + 1].transaction_date - rows_sorted[idx].transaction_date).days
            if gap <= 3:
                dup_exposure += amt
                dup_matches.append(
                    {
                        "counterparty": rows_sorted[idx].counterparty,
                        "amount": str(amt),
                        "dates": [
                            rows_sorted[idx].transaction_date.isoformat(),
                            rows_sorted[idx + 1].transaction_date.isoformat(),
                        ],
                        "transaction_ids": [rows_sorted[idx].id, rows_sorted[idx + 1].id],
                    }
                )
                break

    if dup_matches:
        candidates.append(
            {
                "dedup_key": "duplicate_payment_pattern",
                "alert_type": "duplicate_payment_pattern",
                "category": "Expense Anomaly",
                "severity": AlertSeverity.WARNING,
                "title": f"Unusual / Potentially Duplicate Payment Pattern ({len(dup_matches)} Match(es))",
                "description": (
                    f"Detected {len(dup_matches)} repeating outflow pattern(s) with identical counterparty and amount within 3 days, totaling {to_money(dup_exposure)}."
                ),
                "target_route": "transactions",
                "impact_amount": to_money(dup_exposure),
                "recommended_action": "Verify whether these matching outflows represent intentional split bills or accidental duplicate payments.",
                "supporting_evidence": {
                    "matches": dup_matches[:10],
                },
            }
        )

    # 6. Margin deterioration
    prev_rev_m = sum(
        (to_money(tx.amount) for tx in txs_prev_30 if tx.type == TransactionType.INCOME),
        ZERO,
    )
    prev_exp_m = sum(
        (to_money(tx.amount) for tx in txs_prev_30 if tx.type == TransactionType.EXPENSE),
        ZERO,
    )
    cur_margin = to_money(k30["net_margin_pct"])
    prev_margin = to_pct(to_money(prev_rev_m - prev_exp_m), prev_rev_m) if prev_rev_m > ZERO else None
    if cur_rev > ZERO and (
        cur_margin < ZERO or (prev_margin is not None and (prev_margin - cur_margin) >= Decimal("10.0"))
    ):
        candidates.append(
            {
                "dedup_key": "margin_deterioration_30d",
                "alert_type": "margin_deterioration",
                "category": "Expense Anomaly",
                "severity": AlertSeverity.CRITICAL if cur_margin < ZERO else AlertSeverity.WARNING,
                "title": f"Operating Margin Deterioration ({cur_margin}% Net Margin)",
                "description": (
                    f"Net operating margin in the trailing 30 days is {cur_margin}%"
                    + (f" (down from {prev_margin}% in the prior 30 days)." if prev_margin is not None else ".")
                ),
                "target_route": "reports",
                "impact_amount": to_money(abs(to_money(k30["net_profit"]))) if k30["net_profit"] < ZERO else None,
                "recommended_action": "Review supplier price inflation, discounting, and variable cost ratios in Reports.",
                "supporting_evidence": {
                    "current_margin_pct": str(cur_margin),
                    "previous_margin_pct": str(prev_margin) if prev_margin is not None else None,
                },
            }
        )

    # 7. Excessive inventory expenditure
    restock_30 = to_money(
        sum(
            (to_money(tx.amount) for tx in txs_30 if tx.type == TransactionType.EXPENSE and is_inventory_cogs_tx(tx)),
            ZERO,
        )
    )
    inv_val = to_money(k30["inventory_valuation"])
    if restock_30 > ZERO and (
        (cur_rev > ZERO and restock_30 > to_money(cur_rev * Decimal("0.55")))
        or (cur_rev == ZERO and restock_30 > to_money(business.monthly_fixed_overhead))
    ):
        candidates.append(
            {
                "dedup_key": "excessive_inventory_expenditure",
                "alert_type": "excessive_inventory_spend",
                "category": "Inventory",
                "severity": AlertSeverity.WARNING,
                "title": "Elevated Inventory Procurement Relative to Sales",
                "description": (
                    f"Inventory and COGS procurement reached {restock_30} over 30 days against {cur_rev} revenue (stock on hand valued at {inv_val})."
                ),
                "target_route": "inventory",
                "impact_amount": restock_30,
                "recommended_action": "Check reorder thresholds and slow-moving SKUs before placing additional purchase orders.",
                "supporting_evidence": {
                    "restock_spend_30d": str(restock_30),
                    "revenue_30d": str(cur_rev),
                    "inventory_valuation": str(inv_val),
                },
            }
        )

    # 8. Unusual supplier payment patterns
    supplier_30: dict[str, list[Decimal]] = defaultdict(list)
    supplier_prior: dict[str, list[Decimal]] = defaultdict(list)
    for tx in txs_30:
        if tx.type == TransactionType.EXPENSE:
            supplier_30[tx.counterparty.strip()].append(to_money(tx.amount))
    for tx in txs_prior_60:
        if tx.type == TransactionType.EXPENSE:
            supplier_prior[tx.counterparty.strip()].append(to_money(tx.amount))

    for sup_name, amts in supplier_30.items():
        if len(amts) < 2:
            continue
        prior_amts = supplier_prior.get(sup_name, [])
        if prior_amts:
            prior_avg = to_money(sum(prior_amts, ZERO) / Decimal(len(prior_amts)))
            cur_max = max(amts)
            if prior_avg > ZERO and cur_max >= to_money(prior_avg * Decimal("2.2")):
                candidates.append(
                    {
                        "dedup_key": f"unusual_supplier_{sup_name.lower()[:40]}",
                        "alert_type": "unusual_supplier_pattern",
                        "category": "Expense Anomaly",
                        "severity": AlertSeverity.ADVISORY,
                        "title": f"Unusual Payment Pattern for {sup_name}",
                        "description": (
                            f"Recent disbursement of {cur_max} to {sup_name} is more than 2.2x the trailing average payout ({prior_avg})."
                        ),
                        "target_route": "transactions",
                        "impact_amount": cur_max,
                        "recommended_action": "Confirm invoice terms, bulk order authorization, and unit pricing for this supplier.",
                        "supporting_evidence": {
                            "supplier": sup_name,
                            "recent_peak_payment": str(cur_max),
                            "prior_average_payment": str(prior_avg),
                            "recent_payment_count": len(amts),
                        },
                    }
                )

    return candidates


def evaluate_and_sync_alerts(
    db: Session,
    business: Business,
    *,
    as_of_date: date | None = None,
) -> list[FinancialAlert]:
    """Evaluate all Risk Radar rules and synchronize persistent FinancialAlert rows."""
    candidates = _candidate_alerts(db, business, as_of_date=as_of_date)
    existing_rows = list(
        db.scalars(
            select(FinancialAlert).where(FinancialAlert.business_id == business.id)
        ).all()
    )
    by_key = {row.dedup_key: row for row in existing_rows}
    seen_keys: set[str] = set()
    now_utc = datetime.now(timezone.utc)

    for item in candidates:
        key = item["dedup_key"]
        seen_keys.add(key)
        row = by_key.get(key)
        if row is None:
            row = FinancialAlert(
                business_id=business.id,
                dedup_key=key,
                alert_type=item["alert_type"],
                category=item["category"],
                severity=item["severity"],
                title=item["title"],
                description=item["description"],
                target_route=item["target_route"],
                impact_amount=item["impact_amount"],
                supporting_evidence=item["supporting_evidence"],
                recommended_action=item["recommended_action"],
                detected_at=now_utc,
                is_active=True,
                is_acknowledged=False,
            )
            db.add(row)
        else:
            row.alert_type = item["alert_type"]
            row.category = item["category"]
            row.severity = item["severity"]
            row.title = item["title"]
            row.description = item["description"]
            row.target_route = item["target_route"]
            row.impact_amount = item["impact_amount"]
            row.supporting_evidence = item["supporting_evidence"]
            row.recommended_action = item["recommended_action"]
            row.is_active = True

    for key, row in by_key.items():
        if key not in seen_keys and row.is_active:
            row.is_active = False

    db.commit()
    return list(
        db.scalars(
            select(FinancialAlert)
            .where(FinancialAlert.business_id == business.id, FinancialAlert.is_active.is_(True))
            .order_by(FinancialAlert.detected_at.desc())
        ).all()
    )


def list_alerts(
    db: Session,
    business: Business,
    *,
    severity: AlertSeverity | None = None,
    is_acknowledged: bool | None = None,
    include_inactive: bool = False,
    page: int = 1,
    page_size: int = 25,
    refresh: bool = True,
    as_of_date: date | None = None,
) -> dict[str, Any]:
    if refresh:
        evaluate_and_sync_alerts(db, business, as_of_date=as_of_date)

    stmt = select(FinancialAlert).where(FinancialAlert.business_id == business.id)
    if not include_inactive:
        stmt = stmt.where(FinancialAlert.is_active.is_(True))
    if severity is not None:
        stmt = stmt.where(FinancialAlert.severity == severity)
    if is_acknowledged is not None:
        stmt = stmt.where(FinancialAlert.is_acknowledged.is_(is_acknowledged))

    total = int(
        db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    )
    items = list(
        db.scalars(
            stmt.order_by(
                FinancialAlert.is_acknowledged.asc(),
                FinancialAlert.detected_at.desc(),
            )
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


def acknowledge_alert(
    db: Session,
    business: Business,
    alert_id: str,
    user: User,
    *,
    is_acknowledged: bool,
    ip_address: str | None = None,
) -> FinancialAlert:
    alert = get_tenant_record_or_404(
        db, FinancialAlert, alert_id, business.id, entity_label="Financial alert"
    )
    alert.is_acknowledged = is_acknowledged
    if is_acknowledged:
        alert.acknowledged_at = datetime.now(timezone.utc)
        alert.acknowledged_by_user_id = user.id
    else:
        alert.acknowledged_at = None
        alert.acknowledged_by_user_id = None

    record_audit_event(
        db,
        action="alert.acknowledge" if is_acknowledged else "alert.reopen",
        entity_type="financial_alert",
        entity_id=alert.id,
        user_id=user.id,
        business_id=business.id,
        details={
            "alert_type": alert.alert_type,
            "severity": alert.severity.value,
            "is_acknowledged": is_acknowledged,
        },
        ip_address=ip_address,
    )
    db.commit()
    db.refresh(alert)
    return alert
