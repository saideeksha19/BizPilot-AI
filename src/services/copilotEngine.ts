import {
  BusinessProfile,
  CopilotMessage,
  InventoryItem,
  Invoice,
  RiskAlert,
  Transaction,
} from '../types/financial';
import { formatCurrency, formatPercent } from '../utils/formatters';
import { FinancialHealthBreakdown, KpiSummary } from './financialService';

export const SUGGESTED_COPILOT_QUESTIONS = [
  'What is my current cash runway and liquidity position?',
  'Which unpaid or overdue invoices need immediate follow-up?',
  'Where are my biggest expenses and margin pressures?',
  'Which inventory items should I reorder this week?',
  'Can I afford to hire 2 new staff members right now?',
];

export function generateCopilotResponse(
  question: string,
  business: BusinessProfile,
  kpi: KpiSummary,
  health: FinancialHealthBreakdown,
  invoices: Invoice[],
  transactions: Transaction[],
  inventory: InventoryItem[],
  risks: RiskAlert[]
): CopilotMessage {
  const q = question.toLowerCase();
  const c = business.currency;
  const now = new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const overdueInvoices = invoices.filter((i) => i.status === 'overdue');
  const pendingInvoices = invoices.filter((i) => i.status === 'pending');
  const lowStock = inventory.filter((i) => i.currentStock <= i.reorderPoint);
  const activeRisks = risks.filter((r) => !r.acknowledged);

  // Top expense categories
  const expenseMap = new Map<string, number>();
  transactions
    .filter((t) => t.type === 'expense' && t.status === 'completed')
    .forEach((t) => expenseMap.set(t.category, (expenseMap.get(t.category) ?? 0) + t.amount));
  const topExpenses = Array.from(expenseMap.entries()).sort((a, b) => b[1] - a[1]);

  if (q.includes('invoice') || q.includes('receivable') || q.includes('overdue')) {
    const overdueSum = overdueInvoices.reduce((s, i) => s + i.totalAmount, 0);
    const pendingSum = pendingInvoices.reduce((s, i) => s + i.totalAmount, 0);

    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      timestamp: now,
      content:
        overdueInvoices.length > 0
          ? `${business.name} currently has ${overdueInvoices.length} overdue invoice(s) totaling ${formatCurrency(overdueSum, c)} and ${pendingInvoices.length} pending invoice(s) totaling ${formatCurrency(pendingSum, c)}. Prioritizing overdue collections would immediately increase available cash by ${formatPercent((overdueSum / Math.max(1, kpi.availableCash)) * 100, false)}.`
          : `All receivables are currently within terms. There are ${pendingInvoices.length} pending invoice(s) totaling ${formatCurrency(pendingSum, c)}.`,
      metrics: [
        {
          label: 'Overdue Receivables',
          value: formatCurrency(overdueSum, c),
          delta: `${overdueInvoices.length} invoice(s)`,
          tone: overdueSum > 0 ? 'negative' : 'positive',
        },
        {
          label: 'Pending Receivables',
          value: formatCurrency(pendingSum, c),
          delta: `${pendingInvoices.length} open`,
          tone: 'neutral',
        },
        {
          label: 'Available Cash',
          value: formatCurrency(kpi.availableCash, c),
          tone: 'positive',
        },
      ],
      recommendations: overdueInvoices.map(
        (inv) =>
          `Follow up with ${inv.customerName} on ${inv.invoiceNumber} (${formatCurrency(inv.totalAmount, c)}, due ${inv.dueDate}).`
      ),
      disclaimer:
        'Computed deterministically from your current illustrative workspace invoices.',
    };
  }

  if (q.includes('expense') || q.includes('cost') || q.includes('margin') || q.includes('spend')) {
    const top1 = topExpenses[0];
    const top2 = topExpenses[1];
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      timestamp: now,
      content: `Over the selected period, ${business.name} recorded ${formatCurrency(kpi.totalExpenses, c)} in expenses against ${formatCurrency(kpi.totalRevenue, c)} in revenue, yielding a net margin of ${health.netMarginPct}%. Your largest cost drivers are ${top1 ? `${top1[0]} (${formatCurrency(top1[1], c)})` : 'operating costs'}${top2 ? ` followed by ${top2[0]} (${formatCurrency(top2[1], c)})` : ''}.`,
      metrics: [
        {
          label: 'Total Expenses',
          value: formatCurrency(kpi.totalExpenses, c),
          delta: formatPercent(kpi.expensesChangePct),
          tone: kpi.expensesChangePct > 5 ? 'negative' : 'neutral',
        },
        {
          label: 'Net Profit',
          value: formatCurrency(kpi.netProfit, c),
          delta: `${health.netMarginPct}% margin`,
          tone: kpi.netProfit >= 0 ? 'positive' : 'negative',
        },
        {
          label: 'Largest Category',
          value: top1 ? top1[0] : 'N/A',
          delta: top1 ? formatCurrency(top1[1], c) : undefined,
          tone: 'neutral',
        },
      ],
      recommendations: [
        'Review supplier unit pricing changes in the What-If Simulator before your next bulk order.',
        activeRisks[0]?.recommendedAction ?? 'Audit recurring utility and subscription charges monthly.',
      ],
      disclaimer:
        'Computed deterministically from your current illustrative workspace transactions.',
    };
  }

  if (q.includes('inventory') || q.includes('stock') || q.includes('reorder')) {
    const invValue = inventory.reduce((s, i) => s + i.currentStock * i.unitCost, 0);
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      timestamp: now,
      content:
        lowStock.length > 0
          ? `${lowStock.length} SKU(s) are currently at or below their reorder threshold, while total inventory holding value stands at ${formatCurrency(invValue, c)}. Replenishing low-stock items promptly prevents lost retail sales.`
          : `All ${inventory.length} tracked SKUs are above reorder thresholds with a total valuation of ${formatCurrency(invValue, c)}.`,
      metrics: [
        {
          label: 'Inventory Valuation',
          value: formatCurrency(invValue, c),
          delta: `${inventory.length} active SKUs`,
          tone: 'neutral',
        },
        {
          label: 'Low Stock SKUs',
          value: `${lowStock.length}`,
          delta: lowStock.length > 0 ? 'Action needed' : 'Nominal',
          tone: lowStock.length > 0 ? 'negative' : 'positive',
        },
      ],
      recommendations:
        lowStock.length > 0
          ? lowStock.map(
              (item) =>
                `Reorder ${item.name} (${item.currentStock} ${item.unit} left vs ${item.reorderPoint} reorder point; ${item.leadTimeDays}d lead time from ${item.supplier}).`
            )
          : ['Inventory levels are healthy across all tracked categories.'],
      disclaimer:
        'Computed deterministically from your current illustrative workspace inventory.',
    };
  }

  if (q.includes('hire') || q.includes('staff') || q.includes('employee') || q.includes('afford')) {
    const estCost = 2 * 30000;
    const postHireProfit = kpi.netProfit - estCost;
    return {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      timestamp: now,
      content: `Hiring 2 additional team members at an illustrative ₹30,000/month each adds ₹60,000 in fixed monthly payroll. Based on your current net profit of ${formatCurrency(kpi.netProfit, c)} and ${health.runwayMonths} months of runway, ${postHireProfit > 0 ? 'your current operating surplus can absorb this addition, though margin buffer narrows' : 'this would push current period profit negative unless paired with +12% to +15% revenue growth'}.`,
      metrics: [
        {
          label: 'Estimated Payroll Add',
          value: formatCurrency(estCost, c),
          delta: 'per month',
          tone: 'neutral',
        },
        {
          label: 'Current Net Profit',
          value: formatCurrency(kpi.netProfit, c),
          tone: kpi.netProfit > 0 ? 'positive' : 'negative',
        },
        {
          label: 'Pro-Forma Surplus',
          value: formatCurrency(postHireProfit, c),
          tone: postHireProfit > 0 ? 'positive' : 'negative',
        },
      ],
      recommendations: [
        'Open the What-If Simulator and set Additional Employees = 2 to test a 6-month cash curve.',
        overdueInvoices.length > 0
          ? `Collect ${formatCurrency(kpi.overdueReceivables, c)} in overdue receivables before committing new fixed payroll.`
          : 'Confirm sales pipeline coverage for at least 90 days of added payroll.',
      ],
      disclaimer:
        'Hypothetical calculation grounded in your illustrative workspace data.',
    };
  }

  // Default: Cash runway & financial health overview
  return {
    id: `msg-${Date.now()}`,
    role: 'assistant',
    timestamp: now,
    content: `${business.name} holds ${formatCurrency(kpi.availableCash, c)} in available cash against ${formatCurrency(kpi.upcomingPayables, c)} in upcoming payables and accrued taxes. Your calculated Financial Health Score is ${health.overallScore}/100 (${health.grade}), with an estimated ${health.runwayMonths} months of liquidity runway at current operating burn.`,
    metrics: [
      {
        label: 'Available Cash',
        value: formatCurrency(kpi.availableCash, c),
        delta: formatPercent(kpi.cashChangePct),
        tone: 'positive',
      },
      {
        label: 'Liquidity Runway',
        value: `${health.runwayMonths} mo`,
        delta: `${health.grade} buffer`,
        tone: health.runwayMonths >= 3 ? 'positive' : 'negative',
      },
      {
        label: 'Health Score',
        value: `${health.overallScore}/100`,
        delta: `${activeRisks.length} open alerts`,
        tone: health.overallScore >= 65 ? 'positive' : 'neutral',
      },
    ],
    recommendations: [
      kpi.overdueReceivables > 0
        ? `Accelerate collection on ${formatCurrency(kpi.overdueReceivables, c)} in overdue invoices.`
        : 'Receivables aging is clean — keep Net-15 terms consistent.',
      lowStock.length > 0
        ? `Restock ${lowStock.length} low-inventory SKU(s) before weekend demand.`
        : 'Use the What-If Simulator to stress-test next quarter supplier price changes.',
    ],
    disclaimer:
      'Computed deterministically from your current illustrative workspace ledger.',
  };
}
