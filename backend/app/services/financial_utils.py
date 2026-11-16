from __future__ import annotations

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from math import ceil

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import TransactionCategory
from app.models.enums import TransactionType

MONEY_QUANT = Decimal("0.01")
QTY_QUANT = Decimal("0.001")


def to_money(value: Decimal | int | str) -> Decimal:
    """Quantize a numeric value to 2 decimal places using HALF_UP rounding."""
    if isinstance(value, float):
        raise TypeError("Float values are prohibited in authoritative monetary calculations.")
    dec = value if isinstance(value, Decimal) else Decimal(str(value))
    return dec.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def to_qty(value: Decimal | int | str) -> Decimal:
    """Quantize a stock or line-item quantity to 3 decimal places."""
    if isinstance(value, float):
        raise TypeError("Float values are prohibited in authoritative quantity calculations.")
    dec = value if isinstance(value, Decimal) else Decimal(str(value))
    return dec.quantize(QTY_QUANT, rounding=ROUND_HALF_UP)


def parse_decimal_strict(raw: str | int | Decimal, *, scale: str = "money") -> Decimal:
    """Parse string/Decimal/int into Decimal strictly without float intermediate."""
    if isinstance(raw, float):
        raise ValueError("Float inputs are not accepted for monetary or quantity fields.")
    try:
        dec = raw if isinstance(raw, Decimal) else Decimal(str(raw).strip())
    except InvalidOperation as exc:
        raise ValueError(f"Invalid decimal value: {raw!r}") from exc
    if not dec.is_finite():
        raise ValueError("Decimal value must be finite.")
    return to_money(dec) if scale == "money" else to_qty(dec)


def compute_total_pages(total: int, page_size: int) -> int:
    if total <= 0:
        return 1
    return ceil(total / page_size)


def csv_safe_cell(value: str | None) -> str:
    """Neutralize spreadsheet formula injection characters in CSV exports."""
    if not value:
        return ""
    text = str(value)
    if text[0] in ("=", "+", "-", "@"):
        return f"'{text}"
    return text


def get_or_create_system_category(
    db: Session,
    business_id: str,
    name: str,
    tx_type: TransactionType,
    *,
    is_operating: bool = True,
) -> TransactionCategory:
    """Fetch or create a business-scoped system category for automated accounting entries."""
    category = db.scalar(
        select(TransactionCategory).where(
            TransactionCategory.business_id == business_id,
            TransactionCategory.name == name,
            TransactionCategory.type == tx_type,
        )
    )
    if category is None:
        category = TransactionCategory(
            business_id=business_id,
            name=name,
            type=tx_type,
            is_operating=is_operating,
            is_system=True,
        )
        db.add(category)
        db.flush()
    return category
