import React, { useState } from 'react';
import { ArrowRight, Calendar, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useFilteredMetrics } from '../hooks/useFilteredMetrics';
import { DateRangePreset } from '../types/financial';
import { formatCurrency, formatShortDate } from '../utils/formatters';
import { CashFlowChart } from '../components/charts/CashFlowChart';
import { CategoryBreakdownChart } from '../components/charts/CategoryBreakdownChart';
import { ProfitTrendChart } from '../components/charts/ProfitTrendChart';
import { RevenueExpenseChart } from '../components/charts/RevenueExpenseChart';
import { DataOriginTag } from '../components/common/DataOriginTag';
import { IntelligenceStateBanner } from '../components/common/IntelligenceStateBanner';
import { BusinessIntelligencePanel } from '../components/dashboard/BusinessIntelligencePanel';
import { OverviewKPIs } from '../components/dashboard/OverviewKPIs';

const DATE_PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'custom', label: 'Custom range' },
];

export function OverviewPage() {
  const {
    activeBusiness,
    businessTransactions,
    datePreset,
    setDatePreset,
    customDateRange,
    setCustomDateRange,
    navigate,
    setAddTransactionOpen,
  } = useApp();

  const {
    dateWindow,
    kpi,
    timeSeries,
    incomeBreakdown,
    expenseBreakdown,
    health,
    alerts,
    isBackendMode,
    isLoading,
    error,
    refetch,
    hasActivity,
    dataOriginBadge,
  } = useFilteredMetrics();

  const [breakdownMode, setBreakdownMode] = useState<'expense' | 'income'>('expense');
  const c = activeBusiness.currency;

  const recentTx = businessTransactions
    .filter((t) => t.status === 'completed')
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Command Bar: Workspace Info + Date Range Filter */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/8">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {activeBusiness.name}
            </span>
            <span aria-hidden="true">·</span>
            <span>{activeBusiness.type}</span>
            <span aria-hidden="true">·</span>
            <span>{activeBusiness.dashboardPreference} Layout</span>
            <span aria-hidden="true">·</span>
            <DataOriginTag kind={dataOriginBadge} />
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-num">
            Reporting window: {formatShortDate(dateWindow.start)} – {formatShortDate(dateWindow.end)} ({dateWindow.days} days)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Date range filter"
            className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8"
          >
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setDatePreset(preset.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  datePreset === preset.id
                    ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={customDateRange.start}
                onChange={(e) =>
                  setCustomDateRange({ ...customDateRange, start: e.target.value })
                }
                aria-label="Custom start date"
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f] font-mono-num text-xs"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={customDateRange.end}
                onChange={(e) =>
                  setCustomDateRange({ ...customDateRange, end: e.target.value })
                }
                aria-label="Custom end date"
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f] font-mono-num text-xs"
              />
            </div>
          )}
        </div>
      </div>

      <IntelligenceStateBanner
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        emptyNotice={
          isBackendMode && !hasActivity
            ? 'No completed transactions or issued invoices recorded yet. Record ledger entries to unlock full financial intelligence.'
            : null
        }
      />

      {/* 6 Financial KPI Cards */}
      <OverviewKPIs kpi={kpi} series={timeSeries} />

      {/* Primary Analytics: Revenue vs Expenses + Cash Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Revenue vs Expenses
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Completed inflows compared against operating outflows
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-violet-600" />
                Revenue
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-blue-500" />
                Expenses
              </span>
            </div>
          </div>
          <RevenueExpenseChart data={timeSeries} currency={c} />
        </div>

        <div className="lg:col-span-5 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Cash Balance Trajectory
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cumulative liquidity movement across period
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('cash-flow')}
              className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline whitespace-nowrap"
            >
              90d Forecast
            </button>
          </div>
          <CashFlowChart data={timeSeries} currency={c} />
        </div>
      </div>

      {/* Business Intelligence Panel */}
      <BusinessIntelligencePanel
        health={health}
        kpi={kpi}
        alerts={alerts}
        dataOrigin={dataOriginBadge}
      />

      {/* Secondary Analytics: Profit Trend & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Net Profit Trend
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Period-by-period operating surplus above/below break-even
              </p>
            </div>
            <span className="text-xs font-mono-num font-medium text-emerald-600 dark:text-emerald-400">
              Margin {health.netMarginPct}%
            </span>
          </div>
          <ProfitTrendChart data={timeSeries} currency={c} />
        </div>

        <div className="lg:col-span-6 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Income & Expense Breakdown
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Distribution by ledger category
              </p>
            </div>
            <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8">
              <button
                type="button"
                onClick={() => setBreakdownMode('expense')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  breakdownMode === 'expense'
                    ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Expenses
              </button>
              <button
                type="button"
                onClick={() => setBreakdownMode('income')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  breakdownMode === 'income'
                    ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Income
              </button>
            </div>
          </div>
          <CategoryBreakdownChart
            data={breakdownMode === 'expense' ? expenseBreakdown : incomeBreakdown}
            currency={c}
          />
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="rounded-xl bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/8">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recent Transactions
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Latest completed inflows and outflows in {activeBusiness.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAddTransactionOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Entry
            </button>
            <button
              type="button"
              onClick={() => navigate('transactions')}
              className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline ml-2"
            >
              View All
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/8 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-white/[0.02]">
                <th className="py-2.5 px-5">Date</th>
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Method</th>
                <th className="py-2.5 px-5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05] text-xs">
              {recentTx.map((tx) => (
                <tr
                  key={tx.id}
                  onClick={() => navigate('transactions')}
                  className="hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors"
                >
                  <td className="py-3 px-5 font-mono-num text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {formatShortDate(tx.date)}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {tx.description}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {tx.counterparty} · {tx.reference}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {tx.category}
                  </td>
                  <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {tx.paymentMethod}
                  </td>
                  <td
                    className={`py-3 px-5 text-right font-mono-num font-medium whitespace-nowrap ${
                      tx.type === 'income'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : '-'}
                    {formatCurrency(tx.amount, c)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
