from __future__ import annotations

from enum import Enum


class MembershipRole(str, Enum):
    OWNER = "owner"
    ADMIN = "admin"
    MANAGER = "manager"
    VIEWER = "viewer"


class TransactionType(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"


class TransactionStatus(str, Enum):
    COMPLETED = "completed"
    PENDING = "pending"
    SCHEDULED = "scheduled"
    VOID = "void"


class TransactionSource(str, Enum):
    MANUAL = "manual"
    INVOICE_PAYMENT = "invoice_payment"
    INVENTORY_RESTOCK = "inventory_restock"
    CSV_IMPORT = "csv_import"
    DEMO_SEED = "demo_seed"


class PaymentMethod(str, Enum):
    UPI = "upi"
    BANK_TRANSFER = "bank_transfer"
    CARD = "card"
    CASH = "cash"
    AUTO_DEBIT = "auto_debit"
    CHEQUE = "cheque"
    OTHER = "other"


class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    PARTIAL = "partial"
    PAID = "paid"
    OVERDUE = "overdue"
    VOID = "void"


class StockMovementType(str, Enum):
    RESTOCK = "restock"
    SALE = "sale"
    ADJUSTMENT = "adjustment"
    RETURN_IN = "return_in"
    RETURN_OUT = "return_out"


class DataLabel(str, Enum):
    ACTUAL = "ACTUAL"
    ESTIMATED = "ESTIMATED"
    FORECAST = "FORECAST"
    HYPOTHETICAL = "HYPOTHETICAL"


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INSUFFICIENT_DATA = "insufficient_data"


class AlertSeverity(str, Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    ADVISORY = "advisory"


class SimulationRiskLevel(str, Enum):
    LOW = "Low"
    MODERATE = "Moderate"
    HIGH = "High"
    CRITICAL = "Critical"


def enum_values(enum_cls: type[Enum]) -> list[str]:
    """Persist enum string values rather than member names."""
    return [member.value for member in enum_cls]

