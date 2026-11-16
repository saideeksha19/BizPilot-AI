import React, { useState } from 'react';
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Info, SlidersHorizontal } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApp } from '../context/AppContext';
import { useFilteredMetrics } from '../hooks/useFilteredMetrics';
import { parseApiDecimal } from '../services/intelligenceApi';
import { formatCurrency, formatShortDate } from '../utils/formatters';
import { DataOriginTag } from '../components/common/DataOriginTag';
import { IntelligenceStateBanner } from '../components/common/IntelligenceStateBanner';

type HorizonKey = '7d' | '30d' | '90d';

const CONFIDENCE_LABELS: Record<string, { text: string; tone: string }> = {
  high: { text: 'High Confidence', tone: 'text-emerald-600 dark:text-emerald-400' },
  medium: { text: 'Medium Confidence', tone: 'text-blue-600 dark:text-blue-400' },
  low: { text: 'Low Confidence', tone: 'text-amber-600 dark:text-amber-400' },
  insufficient_data: {
    text: 'Insufficient Historical Data',
    tone: 'text-rose-600 dark:text-rose-400',
  },
};

export function CashFlowPage() {
  const {
    activeBusiness,
    businessInvoices,
    businessTransactions,
    navigate,
  } = useApp();
  const {
    forecast,
    kpi,
    isBackendMode,
    isLoading,
    error,
    refetch,
  } = useFilteredMetrics();
  const [horizonKey, setHorizonKey] = useState<HorizonKey>('30d');
  const c = activeBusiness.currency;

  const activeHorizon = forecast.horizons[horizonKey] ?? forecast.horizons['30d'];
  const confidenceInfo =
    CONFIDENCE_LABELS[forecast.overall_confidence] ?? CONFIDENCE_LABELS.low;

  const forecastSeries = activeHorizon.series.map((pt) => ({
    label: pt.label,
    cashBalance: parseApiDecimal(pt.projected_cash_balance),
    netFlow: parseApiDecimal(pt.net_flow),
  }));

  const lowestProjectedCash = parseApiDecimal(activeHorizon.min_projected_cash);
  const expectedEndingCash = parseApiDecimal(activeHorizon.expected_cash_balance);
  const expectedInflowsTotal = parseApiDecimal(activeHorizon.expected_inflows);
  const expectedOutflowsTotal = parseApiDecimal(activeHorizon.expected_outflows);
  const shortageRisk = activeHorizon.shortage_risk;

  const expectedInflows = isBackendMode
    ? forecast.expected_incoming_invoices.map((inv) => ({
        id: inv.invoice_id,
        title: inv.invoice_number,
        subtitle: `Due ${formatShortDate(inv.due_date)} · Exp. ${formatShortDate(inv.expected_collection_date)} · ${inv.status}`,
        amount: parseApiDecimal(inv.remaining_amount),
        isOverdue: inv.status === 'overdue',
      }))
    : businessInvoices
        .filter((i) => i.status === 'pending' || i.status === 'overdue')
        .map((inv) => ({
          id: inv.id,
          title: `${inv.customerName} · ${inv.invoiceNumber}`,
          subtitle: `Due ${formatShortDate(inv.dueDate)} · ${inv.status}`,
          amount: inv.totalAmount,
          isOverdue: inv.status === 'overdue',
        }));

  const upcomingExpenses = isBackendMode
    ? forecast.upcoming_scheduled_expenses.map((tx) => ({
        id: tx.transaction_id,
        description: tx.description,
        subtitle: `${tx.counterparty} · Scheduled ${formatShortDate(tx.scheduled_date)}`,
        amount: parseApiDecimal(tx.amount),
      }))
    : businessTransactions
        .filter((t) => t.type === 'expense' && (t.status === 'scheduled' || t.status === 'pending'))
        .map((tx) => ({
          id: tx.id,
          description: tx.description,
          subtitle: `${tx.counterparty} · Scheduled ${formatShortDate(tx.date)}`,
          amount: tx.amount,
        }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/8">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Cash Flow Forecast & Liquidity Schedule
            </span>
            <span aria-hidden="true">·</span>
            <DataOriginTag kind={isBackendMode ? 'FORECAST' : 'demo'} />
            <span aria-hidden="true">·</span>
            <span className={`font-semibold ${confidenceInfo.tone}`}>
              {confidenceInfo.text}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tracks expected receivables collections against scheduled payouts, overhead burn, and potential cash-buffer dips.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Forecast horizon selector"
            className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 text-xs"
          >
            {(['7d', '30d', '90d'] as const).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizonKey(h)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  horizonKey === h
                    ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {h === '7d' ? '7 Days' : h === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => navigate('simulator')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Stress-Test Cash Flow
          </button>
        </div>
      </div>

      <IntelligenceStateBanner
        isLoading={isLoading}
        error={error}
        onRetry={refetch}
        emptyNotice={
          forecast.overall_confidence === 'insufficient_data'
            ? forecast.data_quality_notes[0] ?? 'Insufficient historical transactions for high-confidence forecasting.'
            : null
        }
      />

      {/* Horizon Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Expected Cash ({horizonKey})
          </div>
          <div className="mt-1.5 text-xl font-semibold font-mono-num text-slate-900 dark:text-slate-50">
            {formatCurrency(expectedEndingCash, c)}
          </div>
          <div className="mt-1 text-[11px] font-mono-num text-slate-400">
            From {formatCurrency(kpi.availableCash, c, { compact: true })} today
          </div>
        </div>

        <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Projected Inflows ({horizonKey})
          </div>
          <div className="mt-1.5 text-xl font-semibold font-mono-num text-emerald-600 dark:text-emerald-400">
            +{formatCurrency(expectedInflowsTotal, c)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {forecast.observed_payment_delay_days !== null
              ? `Delay adj: +${forecast.observed_payment_delay_days}d empirical`
              : 'Contractual invoice due dates'}
          </div>
        </div>

        <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Projected Outflows ({horizonKey})
          </div>
          <div className="mt-1.5 text-xl font-semibold font-mono-num text-rose-600 dark:text-rose-400">
            -{formatCurrency(expectedOutflowsTotal, c)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Includes scheduled bills & overhead
          </div>
        </div>

        <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Minimum Projected Cash
          </div>
          <div
            className={`mt-1.5 text-xl font-semibold font-mono-num ${
              shortageRisk ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-50'
            }`}
          >
            {formatCurrency(lowestProjectedCash, c)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Overhead buffer: {formatCurrency(activeBusiness.monthlyFixedOverhead, c, { compact: true })}
          </div>
        </div>
      </div>

      {/* Shortage Advisory */}
      <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertCircle
            className={`w-5 h-5 mt-0.5 shrink-0 ${
              shortageRisk ? 'text-amber-500' : 'text-emerald-500'
            }`}
          />
          <div>
            <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {shortageRisk
                ? `Projected Cash Cushion Tightening Detected (${horizonKey})`
                : `No Projected Cash Shortages Over Next ${activeHorizon.horizon_days} Days`}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Minimum projected cash across the {horizonKey} horizon is{' '}
              <span className="font-mono-num font-medium text-slate-900 dark:text-slate-100">
                {formatCurrency(lowestProjectedCash, c)}
              </span>{' '}
              against monthly fixed overhead of{' '}
              <span className="font-mono-num font-medium text-slate-900 dark:text-slate-100">
                {formatCurrency(activeBusiness.monthlyFixedOverhead, c)}
              </span>
              .
            </p>
          </div>
        </div>
        <span className="text-xs font-mono-num text-slate-500 dark:text-slate-400 shrink-0">
          Sample: {forecast.historical_sample_transactions} txs / {forecast.historical_span_days}d
        </span>
      </div>

      {/* Forecast Chart */}
      <div className="rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {activeHorizon.horizon_days}-Day Cash Balance Forecast
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deterministic projection combining ledger run-rate, open invoices, and scheduled payouts
            </p>
          </div>
          <DataOriginTag kind={isBackendMode ? 'FORECAST' : 'demo'} />
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={forecastSeries} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cfForecastGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34495e" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#34495e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(52, 73, 94, 0.12)"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#91a6b5' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#91a6b5' }}
                axisLine={false}
                tickLine={false}
                width={66}
                tickFormatter={(v: number) => formatCurrency(v, c, { compact: true })}
              />
              <ReferenceLine
                y={activeBusiness.monthlyFixedOverhead}
                stroke="#b69a68"
                strokeDasharray="4 4"
                label={{
                  value: '1x Monthly Overhead',
                  position: 'insideBottomRight',
                  fill: '#b69a68',
                  fontSize: 11,
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#263746',
                  borderColor: 'rgba(255,255,255,0.12)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#f7f2e8',
                }}
                formatter={(value) => [formatCurrency(Number(value ?? 0), c), 'Projected Cash']}
              />
              <Area
                type="monotone"
                dataKey="cashBalance"
                stroke="#34495e"
                strokeWidth={2.5}
                fill="url(#cfForecastGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Forecast Assumptions & Data Quality Notes */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.06] grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div>
            <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200 mb-1">
              <Info className="w-3.5 h-3.5 text-violet-500" />
              Data Quality & Confidence Notes
            </div>
            <ul className="space-y-1 list-disc list-inside">
              {forecast.data_quality_notes.map((n, idx) => (
                <li key={idx}>{n}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Forecasting Basis
            </div>
            <ul className="space-y-1 list-disc list-inside">
              {forecast.assumptions.map((a, idx) => (
                <li key={idx}>{a}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Incoming Payments & Upcoming Expenses */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Expected Incoming Payments
              </h3>
            </div>
            <button
              type="button"
              onClick={() => navigate('invoices')}
              className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
            >
              Manage Invoices
            </button>
          </div>
          <div className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.05]">
            {expectedInflows.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                No pending incoming invoice payments.
              </p>
            ) : (
              expectedInflows.map((inv) => (
                <div key={inv.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {inv.title}
                    </div>
                    <div
                      className={`text-[11px] font-mono-num ${
                        inv.isOverdue
                          ? 'text-rose-500 font-medium'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {inv.subtitle}
                    </div>
                  </div>
                  <span className="font-mono-num font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                    +{formatCurrency(inv.amount, c)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.06]">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-rose-500" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Upcoming Scheduled Expenses
              </h3>
            </div>
            <button
              type="button"
              onClick={() => navigate('transactions')}
              className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
            >
              View Ledger
            </button>
          </div>
          <div className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.05]">
            {upcomingExpenses.map((tx) => (
              <div key={tx.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {tx.description}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-num">
                    {tx.subtitle}
                  </div>
                </div>
                <span className="font-mono-num font-semibold text-rose-600 dark:text-rose-400 shrink-0">
                  -{formatCurrency(tx.amount, c)}
                </span>
              </div>
            ))}
            <div className="py-3 flex items-center justify-between gap-3 text-xs">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  Accrued GST & Statutory Tax Reserve
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Estimated monthly statutory filing
                </div>
              </div>
              <span className="font-mono-num font-semibold text-rose-600 dark:text-rose-400 shrink-0">
                -{formatCurrency(activeBusiness.taxLiabilityAccrued, c)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
