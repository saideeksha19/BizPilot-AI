from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models import (
    Business,
    Customer,
    InventoryProduct,
    Invoice,
    Supplier,
    Transaction,
    TransactionCategory,
)
from app.models.enums import (
    DataLabel,
    InvoiceStatus,
    TransactionSource,
    TransactionStatus,
    TransactionType,
)
from app.services.financial_utils import to_money

ZERO = Decimal("0.00")
HUNDRED = Decimal("100.00")
PCT_QUANT = Decimal("0.1")


def to_pct(numerator: Decimal, denominator: Decimal) -> Decimal:
    """Compute a percentage rounded to 1 decimal place safely with Decimal."""
    if denominator <= ZERO:
        return ZERO
    return ((numerator / denominator) * HUNDRED).quantize(PCT_QUANT, rounding=ROUND_HALF_UP)


def pct_delta(current: Decimal, previous: Decimal) -> Decimal | None:
    """Return percentage delta vs previous period, or None if previous is 0."""
    if previous == ZERO:
        if current == ZERO:
            return Decimal("0.0")
        return None
    base = abs(previous)
    return (((current - previous) / base) * HUNDRED).quantize(PCT_QUANT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class ReportingWindow:
    preset: str
    start: date
    end: date
    prev_start: date
    prev_end: date
    days: int


def resolve_reporting_window(
    *,
    preset: str = "30d",
    start_date: date | None = None,
    end_date: date | None = None,
    as_of_date: date | None = None,
) -> ReportingWindow:
    """Resolve current and prior comparison reporting windows deterministically."""
    ref_end = as_of_date or datetime.now(timezone.utc).date()

    if preset == "custom" and start_date is not None and end_date is not None:
        if start_date > end_date:
            raise ValueError("start_date cannot be after end_date.")
        days = (end_date - start_date).days + 1
        prev_end = start_date - timedelta(days=1)
        prev_start = prev_end - timedelta(days=days - 1)
        return ReportingWindow(
            preset="custom",
            start=start_date,
            end=end_date,
            prev_start=prev_start,
            prev_end=prev_end,
            days=days,
        )

    day_map = {"7d": 7, "30d": 30, "90d": 90}
    days = day_map.get(preset, 30)
    resolved_preset = preset if preset in day_map else "30d"
    start = ref_end - timedelta(days=days - 1)
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    return ReportingWindow(
        preset=resolved_preset,
        start=start,
        end=ref_end,
        prev_start=prev_start,
        prev_end=prev_end,
        days=days,
    )


def month_start(d: date) -> date:
    return date(d.year, d.month, 1)


def add_months(d: date, delta: int) -> date:
    total_months = (d.year * 12 + (d.month - 1)) + delta
    year, month_idx = divmod(total_months, 12)
    return date(year, month_idx + 1, 1)


def next_month_end(d: date) -> date:
    nxt = add_months(month_start(d), 1)
    return nxt - timedelta(days=1)


def is_inventory_cogs_tx(tx: Transaction) -> bool:
    if tx.source_type == TransactionSource.INVENTORY_RESTOCK:
        return True
    if tx.category is not None:
        name_lower = tx.category.name.lower()
        if any(tok in name_lower for tok in ("inventory", "cogs", "cost of goods", "procurement", "stock")):
            return True
    return False


def is_operating_tx(tx: Transaction) -> bool:
    if tx.category is not None:
        return bool(tx.category.is_operating)
    return True


@dataclass(frozen=True)
class BusinessDataset:
    business: Business
    transactions: list[Transaction]
    invoices: list[Invoice]
    customers: list[Customer]
    suppliers: list[Supplier]
    products: list[InventoryProduct]
    as_of: date


def load_business_dataset(
    db: Session,
    business: Business,
    *,
    as_of_date: date | None = None,
) -> BusinessDataset:
    """Batch-load all financial domain tables for a business in 5 non-N+1 queries."""
    as_of = as_of_date or datetime.now(timezone.utc).date()

    transactions = list(
        db.scalars(
            select(Transaction)
            .options(joinedload(Transaction.category))
            .where(
                Transaction.business_id == business.id,
                Transaction.status != TransactionStatus.VOID,
            )
            .order_by(Transaction.transaction_date.asc(), Transaction.created_at.asc())
        ).all()
    )
    invoices = list(
        db.scalars(
            select(Invoice)
            .where(
                Invoice.business_id == business.id,
                Invoice.status.notin_([InvoiceStatus.DRAFT, InvoiceStatus.VOID]),
            )
            .order_by(Invoice.issue_date.asc())
        ).all()
    )
    customers = list(
        db.scalars(select(Customer).where(Customer.business_id == business.id)).all()
    )
    suppliers = list(
        db.scalars(select(Supplier).where(Supplier.business_id == business.id)).all()
    )
    products = list(
        db.scalars(
            select(InventoryProduct).where(InventoryProduct.business_id == business.id)
        ).all()
    )
    return BusinessDataset(
        business=business,
        transactions=transactions,
        invoices=invoices,
        customers=customers,
        suppliers=suppliers,
        products=products,
        as_of=as_of,
    )


def _summarize_period_transactions(
    transactions: Iterable[Transaction],
) -> dict[str, Decimal]:
    total_revenue = ZERO
    invoice_collections = ZERO
    other_income = ZERO
    total_expenses = ZERO
    operating_expenses = ZERO
    non_operating_expenses = ZERO
    cogs_and_inventory_spend = ZERO

    for tx in transactions:
        if tx.status != TransactionStatus.COMPLETED:
            continue
        amt = to_money(tx.amount)
        if tx.type == TransactionType.INCOME:
            total_revenue += amt
            if tx.source_type == TransactionSource.INVOICE_PAYMENT:
                invoice_collections += amt
            else:
                other_income += amt
        else:
            total_expenses += amt
            if is_inventory_cogs_tx(tx):
                cogs_and_inventory_spend += amt
            if is_operating_tx(tx):
                operating_expenses += amt
            else:
                non_operating_expenses += amt

    total_revenue = to_money(total_revenue)
    total_expenses = to_money(total_expenses)
    operating_expenses = to_money(operating_expenses)
    non_operating_expenses = to_money(non_operating_expenses)
    cogs_and_inventory_spend = to_money(cogs_and_inventory_spend)
    gross_profit = to_money(total_revenue - cogs_and_inventory_spend)
    operating_profit = to_money(total_revenue - operating_expenses)
    net_profit = to_money(total_revenue - total_expenses)

    return {
        "total_revenue": total_revenue,
        "invoice_collections": to_money(invoice_collections),
        "other_income": to_money(other_income),
        "total_expenses": total_expenses,
        "operating_expenses": operating_expenses,
        "non_operating_expenses": non_operating_expenses,
        "cogs_and_inventory_spend": cogs_and_inventory_spend,
        "gross_profit": gross_profit,
        "operating_profit": operating_profit,
        "net_profit": net_profit,
    }


def compute_financial_summary_from_dataset(
    dataset: BusinessDataset,
    *,
    preset: str = "30d",
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    """Compute authoritative Decimal financial summary without double-counting."""
    window = resolve_reporting_window(
        preset=preset,
        start_date=start_date,
        end_date=end_date,
        as_of_date=dataset.as_of,
    )
    biz = dataset.business
    opening_cash = to_money(biz.opening_cash_balance)

    completed_txs = [
        tx for tx in dataset.transactions if tx.status == TransactionStatus.COMPLETED
    ]
    current_txs = [
        tx for tx in completed_txs if window.start <= tx.transaction_date <= window.end
    ]
    prev_txs = [
        tx for tx in completed_txs if window.prev_start <= tx.transaction_date <= window.prev_end
    ]

    cur = _summarize_period_transactions(current_txs)
    prev = _summarize_period_transactions(prev_txs)

    # Cumulative cash balance = opening_cash_balance + completed inflows - completed outflows
    inflows_to_end = ZERO
    outflows_to_end = ZERO
    inflows_to_prev_end = ZERO
    outflows_to_prev_end = ZERO
    for tx in completed_txs:
        amt = to_money(tx.amount)
        if tx.transaction_date <= window.end:
            if tx.type == TransactionType.INCOME:
                inflows_to_end += amt
            else:
                outflows_to_end += amt
        if tx.transaction_date <= window.prev_end:
            if tx.type == TransactionType.INCOME:
                inflows_to_prev_end += amt
            else:
                outflows_to_prev_end += amt

    available_cash = to_money(opening_cash + inflows_to_end - outflows_to_end)
    prev_available_cash = to_money(opening_cash + inflows_to_prev_end - outflows_to_prev_end)

    # Billed accrual invoicing (reported separately from cash inflows to prevent double-counting)
    billed_invoiced_revenue = to_money(
        sum(
            (
                to_money(inv.total_amount)
                for inv in dataset.invoices
                if window.start <= inv.issue_date <= window.end
            ),
            ZERO,
        )
    )

    # Accounts Receivable: unpaid open invoice balances + customer opening balances
    invoice_receivables = ZERO
    overdue_receivables = ZERO
    open_invoices_count = 0
    overdue_invoices_count = 0
    for inv in dataset.invoices:
        if inv.status == InvoiceStatus.PAID:
            continue
        remaining = to_money(inv.total_amount - inv.amount_paid)
        if remaining > ZERO:
            open_invoices_count += 1
            invoice_receivables += remaining
            if inv.status == InvoiceStatus.OVERDUE or inv.due_date < dataset.as_of:
                overdue_invoices_count += 1
                overdue_receivables += remaining

    customer_opening_receivables = to_money(
        sum((to_money(c.opening_balance) for c in dataset.customers), ZERO)
    )
    accounts_receivable = to_money(invoice_receivables + customer_opening_receivables)
    overdue_receivables = to_money(overdue_receivables)

    # Accounts Payable: pending/scheduled expense transactions + supplier opening payables + tax reserve
    scheduled_expense_payables = to_money(
        sum(
            (
                to_money(tx.amount)
                for tx in dataset.transactions
                if tx.type == TransactionType.EXPENSE
                and tx.status in (TransactionStatus.PENDING, TransactionStatus.SCHEDULED)
            ),
            ZERO,
        )
    )
    supplier_opening_payables = to_money(
        sum((to_money(s.opening_payable) for s in dataset.suppliers), ZERO)
    )
    tax_liability_accrued = to_money(biz.tax_liability_accrued)
    accounts_payable = to_money(
        scheduled_expense_payables + supplier_opening_payables + tax_liability_accrued
    )

    # Inventory Valuation (At Cost)
    inventory_valuation = to_money(
        sum(
            (
                to_money(Decimal(str(p.current_stock)) * Decimal(str(p.unit_cost)))
                for p in dataset.products
            ),
            ZERO,
        )
    )

    # Build time series across window
    use_weekly = window.days > 31
    buckets: dict[date, dict[str, Decimal]] = defaultdict(
        lambda: {"revenue": ZERO, "expenses": ZERO}
    )

    def _bucket_key(d: date) -> date:
        if not use_weekly:
            return d
        offset = (d - window.start).days // 7
        return window.start + timedelta(days=offset * 7)

    cursor = window.start
    while cursor <= window.end:
        _ = buckets[_bucket_key(cursor)]
        cursor += timedelta(days=7 if use_weekly else 1)

    for tx in current_txs:
        key = _bucket_key(tx.transaction_date)
        amt = to_money(tx.amount)
        if tx.type == TransactionType.INCOME:
            buckets[key]["revenue"] += amt
        else:
            buckets[key]["expenses"] += amt

    # Running cash starting immediately before window.start
    cash_before_window = opening_cash
    for tx in completed_txs:
        if tx.transaction_date < window.start:
            amt = to_money(tx.amount)
            cash_before_window += amt if tx.type == TransactionType.INCOME else -amt
    running_cash = to_money(cash_before_window)

    time_series = []
    for b_date in sorted(buckets.keys()):
        rev = to_money(buckets[b_date]["revenue"])
        exp = to_money(buckets[b_date]["expenses"])
        net = to_money(rev - exp)
        running_cash = to_money(running_cash + net)
        time_series.append(
            {
                "date": b_date.isoformat(),
                "label": b_date.strftime("%b %d") if not use_weekly else f"Wk {b_date.strftime('%b %d')}",
                "revenue": rev,
                "expenses": exp,
                "profit": net,
                "net_cash_flow": net,
                "cumulative_cash": running_cash,
                "data_label": DataLabel.ACTUAL.value,
            }
        )

    # Category breakdowns
    def _build_breakdown(tx_type: TransactionType) -> list[dict]:
        totals: dict[str, Decimal] = defaultdict(lambda: ZERO)
        grand = ZERO
        for tx in current_txs:
            if tx.type != tx_type:
                continue
            cat_name = tx.category.name if tx.category is not None else "Uncategorized"
            amt = to_money(tx.amount)
            totals[cat_name] += amt
            grand += amt
        rows = []
        for name, val in sorted(totals.items(), key=lambda kv: kv[1], reverse=True):
            q_val = to_money(val)
            rows.append(
                {
                    "name": name,
                    "value": q_val,
                    "share_pct": to_pct(q_val, grand),
                }
            )
        return rows

    gross_margin_pct = to_pct(cur["gross_profit"], cur["total_revenue"])
    net_margin_pct = to_pct(cur["net_profit"], cur["total_revenue"])

    return {
        "business_id": biz.id,
        "currency": biz.currency,
        "data_label": DataLabel.ACTUAL.value,
        "as_of_date": dataset.as_of.isoformat(),
        "window": {
            "preset": window.preset,
            "start": window.start.isoformat(),
            "end": window.end.isoformat(),
            "prev_start": window.prev_start.isoformat(),
            "prev_end": window.prev_end.isoformat(),
            "days": window.days,
        },
        "kpis": {
            "opening_cash_balance": opening_cash,
            "total_revenue": cur["total_revenue"],
            "prev_revenue": prev["total_revenue"],
            "revenue_change_pct": pct_delta(cur["total_revenue"], prev["total_revenue"]),
            "billed_invoiced_revenue": billed_invoiced_revenue,
            "invoice_collections": cur["invoice_collections"],
            "other_income": cur["other_income"],
            "total_expenses": cur["total_expenses"],
            "prev_expenses": prev["total_expenses"],
            "expenses_change_pct": pct_delta(cur["total_expenses"], prev["total_expenses"]),
            "operating_expenses": cur["operating_expenses"],
            "non_operating_expenses": cur["non_operating_expenses"],
            "cogs_and_inventory_spend": cur["cogs_and_inventory_spend"],
            "gross_profit": cur["gross_profit"],
            "gross_margin_pct": gross_margin_pct,
            "operating_profit": cur["operating_profit"],
            "net_profit": cur["net_profit"],
            "prev_net_profit": prev["net_profit"],
            "net_profit_change_pct": pct_delta(cur["net_profit"], prev["net_profit"]),
            "net_margin_pct": net_margin_pct,
            "cash_inflows": cur["total_revenue"],
            "cash_outflows": cur["total_expenses"],
            "net_cash_flow": cur["net_profit"],
            "available_cash": available_cash,
            "prev_available_cash": prev_available_cash,
            "cash_change_pct": pct_delta(available_cash, prev_available_cash),
            "accounts_receivable": accounts_receivable,
            "invoice_receivables": to_money(invoice_receivables),
            "customer_opening_receivables": customer_opening_receivables,
            "overdue_receivables": overdue_receivables,
            "open_invoices_count": open_invoices_count,
            "overdue_invoices_count": overdue_invoices_count,
            "accounts_payable": accounts_payable,
            "scheduled_expense_payables": scheduled_expense_payables,
            "supplier_opening_payables": supplier_opening_payables,
            "tax_liability_accrued": tax_liability_accrued,
            "inventory_valuation": inventory_valuation,
        },
        "time_series": time_series,
        "income_breakdown": _build_breakdown(TransactionType.INCOME),
        "expense_breakdown": _build_breakdown(TransactionType.EXPENSE),
        "data_completeness": {
            "completed_transactions_total": len(completed_txs),
            "completed_transactions_in_window": len(current_txs),
            "invoices_count": len(dataset.invoices),
            "inventory_products_count": len(dataset.products),
            "has_activity": len(completed_txs) > 0 or len(dataset.invoices) > 0,
        },
        "accounting_assumptions": [
            "Cash balance equals business.opening_cash_balance plus all completed INCOME transactions minus all completed EXPENSE transactions up to the reporting end date.",
            "Invoice payments create INVOICE_PAYMENT income transactions; open unpaid invoice balances are tracked exclusively in accounts_receivable to prevent double-counting revenue or cash.",
            "Voided transactions and draft/void invoices are excluded from all revenue, expense, cash, and receivable totals.",
            "Inventory valuation reflects sum(current_stock * unit_cost) at weighted unit cost.",
        ],
    }


def compute_financial_summary(
    db: Session,
    business: Business,
    *,
    preset: str = "30d",
    start_date: date | None = None,
    end_date: date | None = None,
    as_of_date: date | None = None,
) -> dict:
    """Authoritative backend financial aggregation entrypoint."""
    dataset = load_business_dataset(db, business, as_of_date=as_of_date)
    return compute_financial_summary_from_dataset(
        dataset,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
    )
