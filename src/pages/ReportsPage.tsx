import React, { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useFilteredMetrics } from '../hooks/useFilteredMetrics';
import { parseApiDecimal } from '../services/intelligenceApi';
import { formatCurrency, formatShortDate } from '../utils/formatters';
import { CategoryBreakdownChart } from '../components/charts/CategoryBreakdownChart';
import { ProfitTrendChart } from '../components/charts/ProfitTrendChart';
import { RevenueExpenseChart } from '../components/charts/RevenueExpenseChart';
import { DataOriginTag } from '../components/common/DataOriginTag';
import { IntelligenceStateBanner } from '../components/common/IntelligenceStateBanner';

type ReportTab = 'profitability' | 'revenue' | 'expenses' | 'cash-flow';

export function ReportsPage() {
  const { activeBusiness, businessTransactions, showToast } = useApp();
  const {
    dateWindow,
    kpi,
    timeSeries,
    incomeBreakdown,
    expenseBreakdown,
    health,
    backendSummary,
    accountingAssumptions,
    isBackendMode,
    isLoading,
    error,
    refetch,
    hasActivity,
    dataOriginBadge,
  } = useFilteredMetrics();

  const [activeTab, setActiveTab] = useState<ReportTab>('profitability');
  const c = activeBusiness.currency;

  const grossProfit = backendSummary
    ? parseApiDecimal(backendSummary.kpis.gross_profit)
    : kpi.totalRevenue;
  const cogsSpend = backendSummary
    ? parseApiDecimal(backendSummary.kpis.cogs_and_inventory_spend)
    : 0;
  const operatingExpenses = backendSummary
    ? parseApiDecimal(backendSummary.kpis.operating_expenses)
    : kpi.totalExpenses;
  const totalTxCount = backendSummary
    ? backendSummary.data_completeness.completed_transactions_total
    : businessTransactions.length;

  const exportReportCsv = () => {
    const basisLabel = isBackendMode ? 'ACTUAL (Authoritative Ledger)' : 'Illustrative Demo Data';
    const lines = [
      `BizPilot AI Financial Report - ${activeBusiness.name}`,
      `Period,${dateWindow.start} to ${dateWindow.end}`,
      `Data Basis,${basisLabel}`,
      '',
      'Metric,Value',
      `Total Revenue,${kpi.totalRevenue}`,
      `COGS & Inventory Spend,${cogsSpend}`,
      `Gross Profit,${grossProfit}`,
      `Operating Expenses,${operatingExpenses}`,
      `Total Expenses,${kpi.totalExpenses}`,
      `Net Profit,${kpi.netProfit}`,
      `Net Margin %,${health.netMarginPct}%`,
      `Available Cash,${kpi.availableCash}`,
      `Outstanding Receivables,${kpi.outstandingReceivables}`,
      `Upcoming Payables,${kpi.upcomingPayables}`,
      '',
      'Category Breakdown,Amount',
      ...incomeBreakdown.map((r) => `Income: ${r.name},${r.value}`),
      ...expenseBreakdown.map((r) => `Expense: ${r.name},${r.value}`),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeBusiness.name.toLowerCase().replace(/\s+/g, '-')}-${activeTab}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${activeTab} financial report CSV`);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/8">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {activeBusiness.name} Financial Statements
            </span>
            <span aria-hidden="true">·</span>
            <DataOriginTag kind={dataOriginBadge} />
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            Statement Period: {formatShortDate(dateWindow.start)} – {formatShortDate(dateWindow.end)} ({totalTxCount} completed ledger entries)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
          >
            <Printer className="w-3.5 h-3.5" />
            Print View
          </button>
          <button
            type="button"
            onClick={exportReportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium"
          >
            <Download className="w-3.5 h-3.5" />
            Export Report CSV
          </button>
        </div>
      </div>

      <IntelligenceStateBanner
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        emptyNotice={
          isBackendMode && !hasActivity
            ? 'No completed ledger transactions recorded in this workspace yet.'
            : null
        }
      />

      {/* Report Selector Tabs */}
      <div className="inline-flex flex-wrap p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 text-xs">
        {(
          [
            { id: 'profitability', label: 'Profitability & P&L' },
            { id: 'revenue', label: 'Revenue Report' },
            { id: 'expenses', label: 'Expense Report' },
            { id: 'cash-flow', label: 'Cash Flow Statement' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profitability' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Profit & Loss Summary
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">Total Operating Revenue</span>
                <span className="font-mono-num font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(kpi.totalRevenue, c)}
                </span>
              </div>
              {backendSummary && (
                <>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">COGS & Inventory Spend</span>
                    <span className="font-mono-num text-rose-600 dark:text-rose-400">
                      -{formatCurrency(cogsSpend, c)}
                    </span>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <span className="text-slate-600 dark:text-slate-300">Gross Profit</span>
                    <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                      {formatCurrency(grossProfit, c)}
                    </span>
                  </div>
                </>
              )}
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-600 dark:text-slate-300">Total Period Expenses</span>
                <span className="font-mono-num font-semibold text-rose-600 dark:text-rose-400">
                  -{formatCurrency(kpi.totalExpenses, c)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Net Profit
                </span>
                <span className="font-mono-num font-bold text-slate-900 dark:text-slate-50">
                  {formatCurrency(kpi.netProfit, c)}
                </span>
              </div>
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Net Margin</span>
                <span className="font-mono-num font-medium text-violet-600 dark:text-violet-400">
                  {health.netMarginPct}%
                </span>
              </div>
            </div>
            {accountingAssumptions.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] text-[11px] text-slate-500 dark:text-slate-400 space-y-1">
                <div className="font-semibold text-slate-700 dark:text-slate-200">
                  Accounting Basis Notes
                </div>
                <ul className="list-disc list-inside space-y-0.5">
                  {accountingAssumptions.map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="lg:col-span-7 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Net Profit Progression
            </h2>
            <ProfitTrendChart data={timeSeries} currency={c} />
          </div>
        </div>
      )}

      {activeTab === 'revenue' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Revenue by Stream
            </h2>
            <CategoryBreakdownChart data={incomeBreakdown} currency={c} />
          </div>
          <div className="lg:col-span-6 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Revenue vs Expense Comparison
            </h2>
            <RevenueExpenseChart data={timeSeries} currency={c} />
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Expense Allocation by Category
            </h2>
            <CategoryBreakdownChart data={expenseBreakdown} currency={c} />
          </div>
          <div className="lg:col-span-6 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Top Cost Categories
            </h2>
            <div className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs">
              {expenseBreakdown.map((row) => (
                <div key={row.name} className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-200">{row.name}</span>
                  <div className="font-mono-num flex items-center gap-3">
                    <span className="text-slate-400">{row.share}%</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {formatCurrency(row.value, c)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'cash-flow' && (
        <div className="rounded-xl bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/8">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Period Cash Flow Statement
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/8 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-white/[0.02]">
                  <th className="py-2.5 px-5">Window</th>
                  <th className="py-2.5 px-4 text-right">Cash Inflows</th>
                  <th className="py-2.5 px-4 text-right">Cash Outflows</th>
                  <th className="py-2.5 px-4 text-right">Net Cash Flow</th>
                  <th className="py-2.5 px-5 text-right">Ending Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05] text-xs font-mono-num">
                {timeSeries.map((pt) => (
                  <tr key={pt.date}>
                    <td className="py-3 px-5 font-sans font-medium text-slate-900 dark:text-slate-100">
                      {pt.label}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(pt.revenue, c)}
                    </td>
                    <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400">
                      {formatCurrency(pt.expenses, c)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {formatCurrency(pt.netCashFlow, c)}
                    </td>
                    <td className="py-3 px-5 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatCurrency(pt.cumulativeCash, c)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
