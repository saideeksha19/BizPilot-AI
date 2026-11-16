export type RouteId =
  | 'overview'
  | 'financial-twin'
  | 'transactions'
  | 'invoices'
  | 'cash-flow'
  | 'simulator'
  | 'risk-radar'
  | 'inventory'
  | 'copilot'
  | 'reports'
  | 'settings'
  | 'team'
  | 'help';

export type BusinessType =
  | 'Retail'
  | 'Grocery'
  | 'Restaurant'
  | 'Startup'
  | 'Freelancer'
  | 'Service Business'
  | 'Home Business'
  | 'Other';

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';

export type BusinessSize =
  | 'Solo / Micro (1–5)'
  | 'Small (6–20)'
  | 'Growing (21–50)'
  | 'Mid-Size (51–200)';

export type DashboardPreference =
  | 'Executive Balanced'
  | 'Cash Flow First'
  | 'Profitability & Margins'
  | 'Inventory & Operations';

export type DateRangePreset = '7d' | '30d' | '90d' | 'custom';

export interface CustomDateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
}

export interface BusinessProfile {
  id: string;
  name: string;
  type: BusinessType;
  industry: string;
  currency: CurrencyCode;
  country: string;
  size: BusinessSize;
  financialYearStart: string;
  dashboardPreference: DashboardPreference;
  gstRegistered: boolean;
  openingCashBalance: number;
  monthlyFixedOverhead: number;
  creditFacilityLimit: number;
  shortTermLoanBalance: number;
  taxLiabilityAccrued: number;
  isDemoData: boolean;
  createdAt: string;
}

export type TransactionType = 'income' | 'expense';
export type TransactionStatus = 'completed' | 'pending' | 'scheduled' | 'void';

export interface Transaction {
  id: string;
  businessId: string;
  date: string; // YYYY-MM-DD
  description: string;
  counterparty: string;
  category: string;
  categoryId?: string | null;
  type: TransactionType;
  amount: number;
  paymentMethod: 'UPI' | 'Bank Transfer' | 'Card' | 'Cash' | 'Auto-Debit';
  status: TransactionStatus;
  sourceType?: string;
  reference: string;
  isDemoData: boolean;
}

export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'partial' | 'draft' | 'void';

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  businessId: string;
  customerId?: string;
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string;   // YYYY-MM-DD
  items: InvoiceLineItem[];
  taxRate: number; // percentage e.g. 18 or 5
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid?: number;
  outstandingBalance?: number;
  status: InvoiceStatus;
  notes?: string;
  isDemoData: boolean;
}

export interface InventoryItem {
  id: string;
  businessId: string;
  sku: string;
  name: string;
  category: string;
  currentStock: number;
  reorderPoint: number;
  unit: string;
  unitCost: number;
  sellingPrice: number;
  supplier: string;
  leadTimeDays: number;
  lastRestocked: string;
}

export type RiskSeverity = 'critical' | 'warning' | 'advisory';
export type RiskCategory = 'Cash Flow' | 'Overdue Receivables' | 'Expense Anomaly' | 'Inventory' | 'Tax & Compliance';

export interface RiskAlert {
  id: string;
  businessId: string;
  title: string;
  description: string;
  category: RiskCategory;
  severity: RiskSeverity;
  impactAmount?: number;
  detectedDate: string;
  recommendedAction: string;
  targetRoute: RouteId;
  acknowledged: boolean;
}

export interface TeamMember {
  id: string;
  businessId: string;
  name: string;
  email: string;
  role: 'Owner' | 'Finance Manager' | 'Accountant' | 'Operations' | 'Viewer';
  status: 'Active' | 'Invited';
  lastActive: string;
}

export interface NotificationItem {
  id: string;
  businessId: string;
  title: string;
  message: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  read: boolean;
  targetRoute: RouteId;
}

export type DataOriginKind = 'actual' | 'estimated' | 'forecasted';

export interface TwinTimelinePoint {
  period: string;
  label: string;
  origin: DataOriginKind;
  cashBalance: number;
  revenue: number;
  expenses: number;
  netProfit: number;
  receivables: number;
  payables: number;
}

export interface SimulatorScenario {
  id: string;
  name: string;
  salesChangePct: number;        // -50 to +100
  supplierPriceChangePct: number;// -30 to +50
  paymentDelayDays: number;      // 0 to 60
  additionalEmployees: number;   // 0 to 15
  avgMonthlySalary: number;      // INR
  newInventoryPurchase: number;  // INR
  equipmentPurchase: number;     // INR
  openNewLocation: boolean;
  newLocationMonthlyRent: number;
  newLocationSetupCost: number;
}

export interface SimulationResult {
  baselineSixMonthCash: number;
  simulatedSixMonthCash: number;
  baselineMonthlyProfit: number;
  simulatedMonthlyProfit: number;
  profitDeltaMonthly: number;
  cashDeltaSixMonth: number;
  runwayMonthsBaseline: number;
  runwayMonthsSimulated: number;
  riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  riskSummary: string;
  monthlySeries: {
    month: string;
    baselineCash: number;
    simulatedCash: number;
    baselineProfit: number;
    simulatedProfit: number;
  }[];
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  metrics?: {
    label: string;
    value: string;
    delta?: string;
    tone?: 'positive' | 'negative' | 'neutral';
  }[];
  recommendations?: string[];
  disclaimer?: string;
}
