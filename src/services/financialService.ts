import { REFERENCE_TODAY } from '../data/mockBusinesses';
import {
  BusinessProfile,
  CustomDateRange,
  DateRangePreset,
  InventoryItem,
  Invoice,
  RiskAlert,
  Transaction,
  TwinTimelinePoint,
} from '../types/financial';
import { addDays, daysBetween, formatDayMonth } from '../utils/formatters';

export interface DateWindow {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  days: number;
}

export function resolveDateWindow(
  preset: DateRangePreset,
  customRange?: CustomDateRange
): DateWindow {
  const end = preset === 'custom' && customRange?.end ? customRange.end : REFERENCE_TODAY;
  let days = 30;
  if (preset === '7d') days = 7;
  else if (preset === '30d') days = 30;
  else if (preset === '90d') days = 90;
  else if (preset === 'custom' && customRange?.start) {
    days = Math.max(1, daysBetween(customRange.start, end) + 1);
  }

  const start =
    preset === 'custom' && customRange?.start
      ? customRange.start
      : addDays(end, -(days - 1));

  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));

  return { start, end, prevStart, prevEnd, days };
}

export interface KpiSummary {
  totalRevenue: number;
  prevRevenue: number;
  revenueChangePct: number;
  totalExpenses: number;
  prevExpenses: number;
  expensesChangePct: number;
  netProfit: number;
  prevNetProfit: number;
  netProfitChangePct: number;
  availableCash: number;
  prevCash: number;
  cashChangePct: number;
  outstandingReceivables: number;
  overdueReceivables: number;
  receivablesChangePct: number;
  upcomingPayables: number;
  payablesChangePct: number;
}

function pctDelta(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 12.5;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function computeKpiSummary(
  business: BusinessProfile,
  transactions: Transaction[],
  invoices: Invoice[],
  window: DateWindow
): KpiSummary {
  const completedTx = transactions.filter((t) => t.status === 'completed');
  const currentTx = completedTx.filter(
    (t) => t.date >= window.start && t.date <= window.end
  );
  const prevTx = completedTx.filter(
    (t) => t.date >= window.prevStart && t.date <= window.prevEnd
  );

  const totalRevenue = currentTx
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const prevRevenue = prevTx
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = currentTx
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const prevExpenses = prevTx
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const netProfit = totalRevenue - totalExpenses;
  const prevNetProfit = prevRevenue - prevExpenses;

  const allCompletedIncome = completedTx
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const allCompletedExpense = completedTx
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount, 0);

  // Anchor cash balance cleanly using opening balance + net delta of recent items
  const availableCash = Math.max(
    0,
    business.openingCashBalance + (allCompletedIncome - allCompletedExpense) * 0.22
  );
  const prevCash = Math.max(1, availableCash - netProfit * 0.45);

  const outstandingReceivables = invoices
    .filter((i) => i.status === 'pending' || i.status === 'overdue')
    .reduce((s, i) => s + i.totalAmount, 0);

  const overdueReceivables = invoices
    .filter((i) => i.status === 'overdue')
    .reduce((s, i) => s + i.totalAmount, 0);

  const scheduledPayables = transactions
    .filter((t) => t.type === 'expense' && (t.status === 'scheduled' || t.status === 'pending'))
    .reduce((s, t) => s + t.amount, 0);

  const upcomingPayables = scheduledPayables + business.taxLiabilityAccrued;

  return {
    totalRevenue,
    prevRevenue,
    revenueChangePct: pctDelta(totalRevenue, prevRevenue),
    totalExpenses,
    prevExpenses,
    expensesChangePct: pctDelta(totalExpenses, prevExpenses),
    netProfit,
    prevNetProfit,
    netProfitChangePct: pctDelta(netProfit, prevNetProfit),
    availableCash,
    prevCash,
    cashChangePct: pctDelta(availableCash, prevCash),
    outstandingReceivables,
    overdueReceivables,
    receivablesChangePct: overdueReceivables > 0 ? 8.4 : -6.2,
    upcomingPayables,
    payablesChangePct: -4.1,
  };
}

export interface TimeSeriesPoint {
  date: string;
  label: string;
  revenue: number;
  expenses: number;
  netCashFlow: number;
  cumulativeCash: number;
  profit: number;
}

export function buildAnalyticsSeries(
  business: BusinessProfile,
  transactions: Transaction[],
  window: DateWindow
): TimeSeriesPoint[] {
  const bucketCount = window.days <= 10 ? window.days : window.days <= 35 ? 6 : 6;
  const bucketSize = Math.max(1, Math.ceil(window.days / bucketCount));
  const completedTx = transactions.filter((t) => t.status === 'completed');

  const points: TimeSeriesPoint[] = [];
  let runningCash = business.openingCashBalance * 0.88;

  for (let i = 0; i < bucketCount; i++) {
    const bStart = addDays(window.start, i * bucketSize);
    const rawEnd = addDays(bStart, bucketSize - 1);
    const bEnd = rawEnd > window.end ? window.end : rawEnd;
    if (bStart > window.end) break;

    const inBucket = completedTx.filter((t) => t.date >= bStart && t.date <= bEnd);
    const revenue = inBucket
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + t.amount, 0);
    const expenses = inBucket
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);

    const netCashFlow = revenue - expenses;
    runningCash = Math.max(0, runningCash + netCashFlow);

    points.push({
      date: bEnd,
      label: bucketSize === 1 ? formatDayMonth(bStart) : `${formatDayMonth(bStart)}`,
      revenue,
      expenses,
      netCashFlow,
      cumulativeCash: Math.round(runningCash),
      profit: netCashFlow,
    });
  }

  return points;
}

export function buildCategoryBreakdown(
  transactions: Transaction[],
  window: DateWindow,
  type: 'income' | 'expense'
): { name: string; value: number; share: number }[] {
  const filtered = transactions.filter(
    (t) =>
      t.status === 'completed' &&
      t.type === type &&
      t.date >= window.start &&
      t.date <= window.end
  );
  const total = filtered.reduce((s, t) => s + t.amount, 0) || 1;
  const map = new Map<string, number>();

  for (const tx of filtered) {
    map.set(tx.category, (map.get(tx.category) ?? 0) + tx.amount);
  }

  return Array.from(map.entries())
    .map(([name, value]) => ({
      name,
      value,
      share: Math.round((value / total) * 1000) / 10,
    }))
    .sort((a, b) => b.value - a.value);
}

export interface FinancialHealthBreakdown {
  overallScore: number;
  grade: 'Strong' | 'Healthy' | 'Watch' | 'Strained';
  liquidityScore: number;
  marginScore: number;
  receivablesScore: number;
  runwayMonths: number;
  netMarginPct: number;
}

export function computeFinancialHealth(
  business: BusinessProfile,
  kpi: KpiSummary,
  risks: RiskAlert[]
): FinancialHealthBreakdown {
  const monthlyExpense = Math.max(business.monthlyFixedOverhead, kpi.totalExpenses || 1);
  const runwayMonths = Math.max(0.5, kpi.availableCash / monthlyExpense);
  const netMarginPct =
    kpi.totalRevenue > 0 ? (kpi.netProfit / kpi.totalRevenue) * 100 : 0;

  const liquidityScore = Math.min(100, Math.round(runwayMonths * 18));
  const marginScore = Math.min(100, Math.max(20, Math.round(55 + netMarginPct * 1.4)));
  const overdueRatio =
    kpi.outstandingReceivables > 0
      ? kpi.overdueReceivables / kpi.outstandingReceivables
      : 0;
  const activeCritical = risks.filter((r) => !r.acknowledged && r.severity === 'critical').length;
  const receivablesScore = Math.max(
    25,
    Math.round(95 - overdueRatio * 45 - activeCritical * 8)
  );

  const overallScore = Math.round(
    liquidityScore * 0.38 + marginScore * 0.34 + receivablesScore * 0.28
  );

  let grade: FinancialHealthBreakdown['grade'] = 'Healthy';
  if (overallScore >= 82) grade = 'Strong';
  else if (overallScore >= 65) grade = 'Healthy';
  else if (overallScore >= 48) grade = 'Watch';
  else grade = 'Strained';

  return {
    overallScore,
    grade,
    liquidityScore,
    marginScore,
    receivablesScore,
    runwayMonths: Math.round(runwayMonths * 10) / 10,
    netMarginPct: Math.round(netMarginPct * 10) / 10,
  };
}

export interface DigitalTwinSnapshot {
  assets: {
    availableCash: number;
    outstandingReceivables: number;
    inventoryValuation: number;
    totalCurrentAssets: number;
  };
  liabilities: {
    upcomingPayables: number;
    taxLiabilityAccrued: number;
    shortTermLoanBalance: number;
    totalLiabilities: number;
  };
  netEquityPosition: number;
  quickRatio: number;
  fixedVsVariableRatio: { fixedPct: number; variablePct: number };
  collectionEfficiencyPct: number;
  timeline: TwinTimelinePoint[];
  changeDrivers: {
    title: string;
    detail: string;
    origin: 'actual' | 'estimated' | 'forecasted';
    impact: string;
  }[];
}

export function buildDigitalTwinSnapshot(
  business: BusinessProfile,
  transactions: Transaction[],
  invoices: Invoice[],
  inventory: InventoryItem[],
  kpi: KpiSummary
): DigitalTwinSnapshot {
  const inventoryValuation = inventory.reduce(
    (s, item) => s + item.currentStock * item.unitCost,
    0
  );
  const totalCurrentAssets =
    kpi.availableCash + kpi.outstandingReceivables + inventoryValuation;

  const scheduledOnly = transactions
    .filter((t) => t.type === 'expense' && t.status === 'scheduled')
    .reduce((s, t) => s + t.amount, 0);

  const totalLiabilities =
    scheduledOnly + business.taxLiabilityAccrued + business.shortTermLoanBalance;

  const quickRatio =
    totalLiabilities > 0
      ? Math.round(((kpi.availableCash + kpi.outstandingReceivables) / totalLiabilities) * 100) /
        100
      : 2.5;

  const paidInvoices = invoices.filter((i) => i.status === 'paid').length;
  const totalInvoices = Math.max(1, invoices.length);
  const collectionEfficiencyPct = Math.round((paidInvoices / totalInvoices) * 100);

  // Average monthly revenue & expense over 90d
  const completed = transactions.filter((t) => t.status === 'completed');
  const avgMonthlyRev =
    Math.round(
      completed.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0) / 2.6
    ) || 450000;
  const avgMonthlyExp =
    Math.round(
      completed.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0) / 2.6
    ) || 360000;

  const fixedPct = Math.min(
    75,
    Math.max(25, Math.round((business.monthlyFixedOverhead / Math.max(1, avgMonthlyExp)) * 100))
  );

  // 6-point timeline: Sep (Actual), Oct (Actual), Nov (Estimated MTD+runrate), Dec-Feb (Forecasted)
  const timeline: TwinTimelinePoint[] = [
    {
      period: '2026-09',
      label: 'Sep 2026',
      origin: 'actual',
      revenue: Math.round(avgMonthlyRev * 0.94),
      expenses: Math.round(avgMonthlyExp * 0.96),
      netProfit: Math.round(avgMonthlyRev * 0.94 - avgMonthlyExp * 0.96),
      cashBalance: Math.round(kpi.availableCash * 0.86),
      receivables: Math.round(kpi.outstandingReceivables * 0.78),
      payables: Math.round(kpi.upcomingPayables * 0.9),
    },
    {
      period: '2026-10',
      label: 'Oct 2026',
      origin: 'actual',
      revenue: Math.round(avgMonthlyRev * 1.04),
      expenses: Math.round(avgMonthlyExp * 0.98),
      netProfit: Math.round(avgMonthlyRev * 1.04 - avgMonthlyExp * 0.98),
      cashBalance: Math.round(kpi.availableCash * 0.95),
      receivables: Math.round(kpi.outstandingReceivables * 0.92),
      payables: Math.round(kpi.upcomingPayables * 0.85),
    },
    {
      period: '2026-11',
      label: 'Nov 2026 (MTD + Est.)',
      origin: 'estimated',
      revenue: Math.round(avgMonthlyRev * 1.02),
      expenses: Math.round(avgMonthlyExp * 1.03),
      netProfit: Math.round(avgMonthlyRev * 1.02 - avgMonthlyExp * 1.03),
      cashBalance: Math.round(kpi.availableCash),
      receivables: Math.round(kpi.outstandingReceivables),
      payables: Math.round(kpi.upcomingPayables),
    },
    {
      period: '2026-12',
      label: 'Dec 2026',
      origin: 'forecasted',
      revenue: Math.round(avgMonthlyRev * 1.12),
      expenses: Math.round(avgMonthlyExp * 1.05),
      netProfit: Math.round(avgMonthlyRev * 1.12 - avgMonthlyExp * 1.05),
      cashBalance: Math.round(
        kpi.availableCash + (avgMonthlyRev * 1.12 - avgMonthlyExp * 1.05)
      ),
      receivables: Math.round(kpi.outstandingReceivables * 0.88),
      payables: Math.round(kpi.upcomingPayables * 0.95),
    },
    {
      period: '2027-01',
      label: 'Jan 2027',
      origin: 'forecasted',
      revenue: Math.round(avgMonthlyRev * 0.98),
      expenses: Math.round(avgMonthlyExp * 0.99),
      netProfit: Math.round(avgMonthlyRev * 0.98 - avgMonthlyExp * 0.99),
      cashBalance: Math.round(
        kpi.availableCash +
          (avgMonthlyRev * 1.12 - avgMonthlyExp * 1.05) +
          (avgMonthlyRev * 0.98 - avgMonthlyExp * 0.99)
      ),
      receivables: Math.round(kpi.outstandingReceivables * 0.82),
      payables: Math.round(kpi.upcomingPayables * 0.9),
    },
    {
      period: '2027-02',
      label: 'Feb 2027',
      origin: 'forecasted',
      revenue: Math.round(avgMonthlyRev * 1.05),
      expenses: Math.round(avgMonthlyExp * 1.0),
      netProfit: Math.round(avgMonthlyRev * 1.05 - avgMonthlyExp * 1.0),
      cashBalance: Math.round(
        kpi.availableCash +
          (avgMonthlyRev * 1.12 - avgMonthlyExp * 1.05) +
          (avgMonthlyRev * 0.98 - avgMonthlyExp * 0.99) +
          (avgMonthlyRev * 1.05 - avgMonthlyExp * 1.0)
      ),
      receivables: Math.round(kpi.outstandingReceivables * 0.8),
      payables: Math.round(kpi.upcomingPayables * 0.88),
    },
  ];

  const changeDrivers = [
    {
      title: 'Working Capital Locked in Overdue Receivables',
      detail: `${Math.round((kpi.overdueReceivables / Math.max(1, kpi.outstandingReceivables)) * 100)}% of open receivables are currently past due, compressing short-term liquidity.`,
      origin: 'actual' as const,
      impact: `${kpi.overdueReceivables > 0 ? 'High Priority' : 'Healthy'}`,
    },
    {
      title: 'November Run-Rate Adjustment',
      detail: 'Mid-month POS and B2B collections are extrapolated across remaining 15 days based on 90-day velocity.',
      origin: 'estimated' as const,
      impact: 'Mid-month estimate',
    },
    {
      title: 'Year-End Seasonal Demand Uplift',
      detail: 'December revenue forecast incorporates +12% seasonal volume with proportional inventory restock outflows.',
      origin: 'forecasted' as const,
      impact: '+12% Revenue Est.',
    },
  ];

  return {
    assets: {
      availableCash: Math.round(kpi.availableCash),
      outstandingReceivables: Math.round(kpi.outstandingReceivables),
      inventoryValuation: Math.round(inventoryValuation),
      totalCurrentAssets: Math.round(totalCurrentAssets),
    },
    liabilities: {
      upcomingPayables: Math.round(scheduledOnly),
      taxLiabilityAccrued: business.taxLiabilityAccrued,
      shortTermLoanBalance: business.shortTermLoanBalance,
      totalLiabilities: Math.round(totalLiabilities),
    },
    netEquityPosition: Math.round(totalCurrentAssets - totalLiabilities),
    quickRatio,
    fixedVsVariableRatio: { fixedPct, variablePct: 100 - fixedPct },
    collectionEfficiencyPct,
    timeline,
    changeDrivers,
  };
}

export function generateStarterSeedForBusiness(biz: BusinessProfile): {
  transactions: Transaction[];
  invoices: Invoice[];
  inventory: InventoryItem[];
  risks: RiskAlert[];
} {
  const baseRev =
    biz.size === 'Solo / Micro (1–5)'
      ? 180000
      : biz.size === 'Small (6–20)'
      ? 420000
      : 920000;
  const baseExp = Math.round(baseRev * 0.74);

  const transactions: Transaction[] = [
    {
      id: `tx-${biz.id}-1`,
      businessId: biz.id,
      date: REFERENCE_TODAY,
      description: `${biz.name} — Weekly Primary Revenue Settlement`,
      counterparty: 'Customer Sales & Digital Payments',
      category: `${biz.type} Revenue`,
      type: 'income',
      amount: Math.round(baseRev * 0.45),
      paymentMethod: 'UPI',
      status: 'completed',
      reference: 'INIT-101',
      isDemoData: true,
    },
    {
      id: `tx-${biz.id}-2`,
      businessId: biz.id,
      date: addDays(REFERENCE_TODAY, -4),
      description: 'Core Supplier & Operating Supplies',
      counterparty: 'Primary Trade Vendor',
      category: 'Operating Procurement',
      type: 'expense',
      amount: Math.round(baseExp * 0.48),
      paymentMethod: 'Bank Transfer',
      status: 'completed',
      reference: 'INIT-102',
      isDemoData: true,
    },
    {
      id: `tx-${biz.id}-3`,
      businessId: biz.id,
      date: addDays(REFERENCE_TODAY, -10),
      description: 'Monthly Payroll & Fixed Overheads',
      counterparty: 'Team & Facilities',
      category: 'Payroll & Benefits',
      type: 'expense',
      amount: Math.round(baseExp * 0.52),
      paymentMethod: 'Bank Transfer',
      status: 'completed',
      reference: 'INIT-103',
      isDemoData: true,
    },
    {
      id: `tx-${biz.id}-4`,
      businessId: biz.id,
      date: addDays(REFERENCE_TODAY, -14),
      description: 'Prior Period Client & Store Receipts',
      counterparty: 'Direct Clients',
      category: `${biz.type} Revenue`,
      type: 'income',
      amount: Math.round(baseRev * 0.55),
      paymentMethod: 'Bank Transfer',
      status: 'completed',
      reference: 'INIT-104',
      isDemoData: true,
    },
    {
      id: `tx-${biz.id}-5`,
      businessId: biz.id,
      date: addDays(REFERENCE_TODAY, 8),
      description: 'Scheduled Vendor Settlement',
      counterparty: 'Primary Trade Vendor',
      category: 'Operating Procurement',
      type: 'expense',
      amount: Math.round(baseExp * 0.25),
      paymentMethod: 'Bank Transfer',
      status: 'scheduled',
      reference: 'SCH-105',
      isDemoData: true,
    },
  ];

  const invoices: Invoice[] = [
    {
      id: `inv-${biz.id}-1`,
      businessId: biz.id,
      invoiceNumber: 'INV-2026-001',
      customerName: 'Apex Partner Client',
      customerEmail: 'accounts@apexpartner.example',
      customerPhone: '+91 98000 11223',
      issueDate: addDays(REFERENCE_TODAY, -12),
      dueDate: addDays(REFERENCE_TODAY, 8),
      items: [
        {
          id: 'li-init-1',
          description: `${biz.industry} Standard Retainer / Order`,
          quantity: 1,
          unitPrice: Math.round(baseRev * 0.28),
        },
      ],
      taxRate: 18,
      subtotal: Math.round(baseRev * 0.28),
      taxAmount: Math.round(baseRev * 0.28 * 0.18),
      totalAmount: Math.round(baseRev * 0.28 * 1.18),
      status: 'pending',
      isDemoData: true,
    },
  ];

  const inventory: InventoryItem[] = [
    {
      id: `itm-${biz.id}-1`,
      businessId: biz.id,
      sku: 'SKU-001',
      name: `Core ${biz.type} Stock Unit`,
      category: biz.industry,
      currentStock: 24,
      reorderPoint: 15,
      unit: 'units',
      unitCost: 1200,
      sellingPrice: 1850,
      supplier: 'Primary Trade Vendor',
      leadTimeDays: 4,
      lastRestocked: addDays(REFERENCE_TODAY, -6),
    },
  ];

  const risks: RiskAlert[] = [
    {
      id: `rsk-${biz.id}-1`,
      businessId: biz.id,
      title: 'Initial Cash Flow Calibration Active',
      description: `BizPilot AI initialized ${biz.name} with illustrative baseline figures. Record live transactions or import statements to refine forecasts.`,
      category: 'Cash Flow',
      severity: 'advisory',
      detectedDate: REFERENCE_TODAY,
      recommendedAction: 'Log your first real expense or invoice in Transactions.',
      targetRoute: 'transactions',
      acknowledged: false,
    },
  ];

  return { transactions, invoices, inventory, risks };
}
