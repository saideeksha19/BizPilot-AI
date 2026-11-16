import React, { useState } from 'react';
import { ArrowRight, Layers, ShieldCheck, TrendingUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useFilteredMetrics } from '../hooks/useFilteredMetrics';
import { formatCurrency } from '../utils/formatters';
import { TwinTimelineChart } from '../components/charts/TwinTimelineChart';
import { DataOriginTag } from '../components/common/DataOriginTag';
import { IntelligenceStateBanner } from '../components/common/IntelligenceStateBanner';

export function FinancialTwinPage() {
  const { activeBusiness, navigate } = useApp();
  const {
    digitalTwin,
    health,
    kpi,
    backendTwin,
    isBackendMode,
    isLoading,
    error,
    refetch,
    hasActivity,
    dataOriginBadge,
  } = useFilteredMetrics();
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<
    'all' | 'actual' | 'estimated' | 'forecasted'
  >('all');

  const c = activeBusiness.currency;

  const filteredTimeline =
    selectedPeriodFilter === 'all'
      ? digitalTwin.timeline
      : digitalTwin.timeline.filter((t) => t.origin === selectedPeriodFilter);

  const quickRatioDisplay =
    isBackendMode && backendTwin && backendTwin.quick_ratio === null
      ? 'No Liabilities'
      : `${digitalTwin.quickRatio.toFixed(2)}x`;

  return (
    <div className="space-y-6">
      {/* Header Summary Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/8">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {activeBusiness.name} Digital Twin
            </span>
            <span aria-hidden="true">·</span>
            <span>Living Balance Sheet & Trajectory Model</span>
            <span aria-hidden="true">·</span>
            <DataOriginTag kind={dataOriginBadge} />
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Separates verified ledger actuals from mid-month estimates and deterministic forward projections.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('simulator')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors whitespace-nowrap"
          >
            <span>Simulate Changes</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <IntelligenceStateBanner
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        emptyNotice={
          isBackendMode && !hasActivity
            ? 'No completed ledger history yet; Digital Twin shows configured opening cash, inventory, and balance-sheet reserves.'
            : null
        }
      />

      {/* Top Financial Position & Stability Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Net Working Position</span>
            <DataOriginTag kind="actual" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono-num text-slate-900 dark:text-slate-50">
            {formatCurrency(digitalTwin.netEquityPosition, c)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Assets minus short-term liabilities
          </div>
        </div>

        <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Quick Liquidity Ratio</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono-num text-slate-900 dark:text-slate-50">
            {quickRatioDisplay}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {quickRatioDisplay === 'No Liabilities' || digitalTwin.quickRatio >= 1.2
              ? 'Healthy short-term coverage'
              : 'Monitor near-term payables'}
          </div>
        </div>

        <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Cash Runway</span>
            <DataOriginTag kind="estimated" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono-num text-slate-900 dark:text-slate-50">
            {health.runwayMonths} months
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            At current operating burn pace
          </div>
        </div>

        <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Cost Structure</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono-num text-slate-900 dark:text-slate-50">
            {digitalTwin.fixedVsVariableRatio.fixedPct}% / {digitalTwin.fixedVsVariableRatio.variablePct}%
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Fixed overhead vs variable spend
          </div>
        </div>
      </div>

      {/* Balance Sheet Twin: Assets vs Liabilities */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.06]">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Current Assets
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Liquid cash, customer receivables, and stock on hand
              </p>
            </div>
            <span className="text-sm font-semibold font-mono-num text-emerald-600 dark:text-emerald-400">
              {formatCurrency(digitalTwin.assets.totalCurrentAssets, c)}
            </span>
          </div>

          <div className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  Available Cash & Bank Balances
                </div>
                <DataOriginTag kind="actual" />
              </div>
              <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(digitalTwin.assets.availableCash, c)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  Outstanding Receivables
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Includes {formatCurrency(kpi.overdueReceivables, c)} overdue ·{' '}
                  {digitalTwin.collectionEfficiencyPct}% paid rate
                </span>
              </div>
              <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(digitalTwin.assets.outstandingReceivables, c)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  Inventory Asset Valuation (At Cost)
                </div>
                <DataOriginTag kind="estimated" />
              </div>
              <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(digitalTwin.assets.inventoryValuation, c)}
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.06]">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Liabilities & Obligations
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Scheduled payables, tax accruals, and short-term debt
              </p>
            </div>
            <span className="text-sm font-semibold font-mono-num text-rose-600 dark:text-rose-400">
              {formatCurrency(digitalTwin.liabilities.totalLiabilities, c)}
            </span>
          </div>

          <div className="mt-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  Scheduled Vendor Payables
                </div>
                <DataOriginTag kind="actual" />
              </div>
              <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(digitalTwin.liabilities.upcomingPayables, c)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  Accrued GST / Tax Obligations
                </div>
                <DataOriginTag kind="estimated" />
              </div>
              <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(digitalTwin.liabilities.taxLiabilityAccrued, c)}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  Working Capital Credit / Term Loan
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Facility Limit: {formatCurrency(activeBusiness.creditFacilityLimit, c)}
                </span>
              </div>
              <span className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(digitalTwin.liabilities.shortTermLoanBalance, c)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Twin Timeline Visualization */}
      <div className="rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Projected Financial State Timeline
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Historical actuals bridged with mid-month estimates and 3-month deterministic forecasts
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <DataOriginTag kind="actual" />
            <DataOriginTag kind="estimated" />
            <DataOriginTag kind="forecasted" />
          </div>
        </div>

        <TwinTimelineChart data={digitalTwin.timeline} currency={c} />
      </div>

      {/* Period-by-Period State Table & Intelligence Drivers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 rounded-xl bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-slate-200 dark:border-white/8">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              State Ledger Breakdown
            </h2>
            <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 text-xs">
              {(['all', 'actual', 'estimated', 'forecasted'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSelectedPeriodFilter(f)}
                  className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                    selectedPeriodFilter === f
                      ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white font-medium shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/8 text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-white/[0.02]">
                  <th className="py-2.5 px-5">Period</th>
                  <th className="py-2.5 px-4">Data Basis</th>
                  <th className="py-2.5 px-4 text-right">Revenue</th>
                  <th className="py-2.5 px-4 text-right">Expenses</th>
                  <th className="py-2.5 px-4 text-right">Net Profit</th>
                  <th className="py-2.5 px-5 text-right">Cash Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05] text-xs">
                {filteredTimeline.map((row) => (
                  <tr key={row.period}>
                    <td className="py-3 px-5 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {row.label}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <DataOriginTag kind={row.origin} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-slate-700 dark:text-slate-300">
                      {formatCurrency(row.revenue, c)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-num text-slate-700 dark:text-slate-300">
                      {formatCurrency(row.expenses, c)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono-num font-medium ${
                        row.netProfit >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatCurrency(row.netProfit, c)}
                    </td>
                    <td className="py-3 px-5 text-right font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                      {formatCurrency(row.cashBalance, c)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Intelligence Panel Explaining Changes */}
        <div className="lg:col-span-4 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Key Change Drivers
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {digitalTwin.changeDrivers.map((drv) => (
              <div key={drv.title} className="py-3 first:pt-0 last:pb-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <DataOriginTag kind={drv.origin} />
                  <span className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                    {drv.impact}
                  </span>
                </div>
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {drv.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {drv.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
