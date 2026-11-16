import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  FinancialHealthBreakdown,
  KpiSummary,
} from '../../services/financialService';
import { ApiHealthComponent } from '../../types/api';
import { RiskAlert } from '../../types/financial';
import { formatCurrency, formatShortDate } from '../../utils/formatters';
import { DataOriginTag, DataOriginTagKind } from '../common/DataOriginTag';

interface BusinessIntelligencePanelProps {
  health: FinancialHealthBreakdown & {
    gradeLabel?: string;
    dataCompletenessPct?: number;
    components?: ApiHealthComponent[];
    missingDataNotes?: string[];
  };
  kpi: KpiSummary;
  alerts?: RiskAlert[];
  dataOrigin?: DataOriginTagKind;
}

export function BusinessIntelligencePanel({
  health,
  kpi,
  alerts,
  dataOrigin = 'demo',
}: BusinessIntelligencePanelProps) {
  const {
    activeBusiness,
    businessTransactions,
    businessRisks,
    businessInventory,
    navigate,
  } = useApp();
  const c = activeBusiness.currency;

  const upcomingObligations = businessTransactions.filter(
    (t) => t.type === 'expense' && (t.status === 'scheduled' || t.status === 'pending')
  );
  const openRisks = (alerts ?? businessRisks).filter((r) => !r.acknowledged);
  const lowStockCount = businessInventory.filter(
    (i) => i.currentStock <= i.reorderPoint
  ).length;

  const insights: { title: string; body: string; actionLabel: string; route: 'invoices' | 'simulator' | 'inventory' | 'financial-twin' }[] = [
    {
      title:
        kpi.overdueReceivables > 0
          ? 'Accelerate Overdue B2B Collections'
          : 'Healthy Receivable Velocity',
      body:
        kpi.overdueReceivables > 0
          ? `Collecting ${formatCurrency(kpi.overdueReceivables, c)} in past-due invoices increases your available liquidity by ${((kpi.overdueReceivables / Math.max(1, kpi.availableCash)) * 100).toFixed(1)}%.`
          : `All open receivables are within credit terms, supporting a ${health.runwayMonths}-month cash runway.`,
      actionLabel: 'Review Invoices',
      route: 'invoices',
    },
    {
      title: 'Operating Margin & Cost Cushion',
      body: `Net operating margin stands at ${health.netMarginPct}%. Stress-test supplier inflation or staffing decisions before committing cash.`,
      actionLabel: 'Open Simulator',
      route: 'simulator',
    },
    {
      title:
        lowStockCount > 0
          ? `${lowStockCount} SKU(s) Approaching Stockout`
          : 'Digital Twin Horizon Aligned',
      body:
        lowStockCount > 0
          ? `Restock alerts active for ${lowStockCount} catalog item(s). Timely replenishment avoids revenue leakage.`
          : `Projected assets exceed short-term obligations across the next 90-day Twin timeline.`,
      actionLabel: lowStockCount > 0 ? 'Inspect Stock' : 'Open Digital Twin',
      route: lowStockCount > 0 ? 'inventory' : 'financial-twin',
    },
  ];

  const recentActivity = businessTransactions.slice(0, 4);
  const displayedGrade = health.gradeLabel ?? health.grade;
  const componentBars =
    health.components && health.components.length > 0
      ? health.components.map((comp) => ({
          label: comp.label,
          score: comp.score,
          meta: comp.data_available
            ? `${comp.weight}% wt · ${comp.underlying_metric}`
            : `${comp.weight}% wt · No data`,
          dataAvailable: comp.data_available,
        }))
      : [
          {
            label: 'Liquidity & Runway',
            score: health.liquidityScore,
            meta: `${health.runwayMonths} mo`,
            dataAvailable: true,
          },
          {
            label: 'Profitability Margin',
            score: health.marginScore,
            meta: `${health.netMarginPct}%`,
            dataAvailable: true,
          },
          {
            label: 'Receivables Discipline',
            score: health.receivablesScore,
            meta: `${openRisks.length} open risks`,
            dataAvailable: true,
          },
        ];

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Financial Health Score */}
      <div className="lg:col-span-4 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Financial Health Score
            </h2>
            <DataOriginTag kind={dataOrigin} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Transparent weighted index ({health.dataCompletenessPct ?? 100}% data coverage).
          </p>

          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-4xl font-semibold font-mono-num tracking-tight text-slate-900 dark:text-slate-50">
              {health.overallScore}
            </span>
            <span className="text-xs font-mono-num text-slate-400">/ 100</span>
            <span
              className={`ml-auto text-xs font-semibold ${
                displayedGrade === 'Strong' || displayedGrade === 'Healthy'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : displayedGrade === 'Watch' || displayedGrade === 'Insufficient Data'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {displayedGrade}
            </span>
          </div>

          <div className="mt-4 space-y-2.5">
            {componentBars.map((bar) => (
              <div key={bar.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-600 dark:text-slate-300 truncate">{bar.label}</span>
                  <span className="font-mono-num text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                    {bar.dataAvailable ? `${bar.score}/100` : 'No Data'}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      bar.dataAvailable
                        ? 'bg-gradient-to-r bg-[#34495e]'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                    style={{ width: `${bar.score}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 truncate">{bar.meta}</div>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('financial-twin')}
          className="mt-5 w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
        >
          <span>Inspect Financial Digital Twin</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Deterministic Business Insights */}
      <div className="lg:col-span-4 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Intelligence Insights
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('copilot')}
              className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              Ask Copilot
            </button>
          </div>

          <div className="mt-4 divide-y divide-slate-100 dark:divide-white/[0.06]">
            {insights.map((ins) => (
              <div key={ins.title} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {ins.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => navigate(ins.route)}
                    className="text-[11px] font-medium text-violet-600 dark:text-violet-400 hover:underline shrink-0"
                  >
                    {ins.actionLabel}
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {ins.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Upcoming Obligations, Warning Alerts & Recent Activity */}
      <div className="lg:col-span-4 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 flex flex-col gap-4">
        {/* Warning Alerts */}
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Warning Alerts
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('risk-radar')}
              className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
            >
              Risk Radar ({openRisks.length})
            </button>
          </div>

          <div className="mt-2.5 space-y-2">
            {openRisks.slice(0, 2).map((alert) => (
              <button
                key={alert.id}
                type="button"
                onClick={() => navigate(alert.targetRoute)}
                className="w-full text-left p-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.03] hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors flex items-start gap-2.5"
              >
                <AlertTriangle
                  className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                    alert.severity === 'critical'
                      ? 'text-rose-500'
                      : 'text-amber-500'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                    {alert.title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {alert.category} · {alert.severity.toUpperCase()}
                  </div>
                </div>
              </button>
            ))}
            {openRisks.length === 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-1">
                No unacknowledged alerts in this workspace.
              </p>
            )}
          </div>
        </div>

        {/* Upcoming Payment Obligations */}
        <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-blue-500" />
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Upcoming Obligations
              </h3>
            </div>
            <span className="text-[11px] font-mono-num text-slate-500">
              {upcomingObligations.length} scheduled
            </span>
          </div>

          <div className="mt-2 space-y-1.5">
            {upcomingObligations.slice(0, 2).map((ob) => (
              <div
                key={ob.id}
                className="flex items-center justify-between text-xs py-1"
              >
                <div className="min-w-0 pr-2">
                  <div className="text-slate-700 dark:text-slate-200 truncate">
                    {ob.description}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono-num">
                    Due {formatShortDate(ob.date)}
                  </div>
                </div>
                <span className="font-mono-num font-medium text-slate-900 dark:text-slate-100 shrink-0">
                  {formatCurrency(ob.amount, c)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between text-xs py-1 text-slate-500 dark:text-slate-400">
              <span>Accrued Tax Liability</span>
              <span className="font-mono-num font-medium">
                {formatCurrency(activeBusiness.taxLiabilityAccrued, c)}
              </span>
            </div>
          </div>
        </div>

        {/* Recent Business Activity */}
        <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06]">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Recent Activity
          </h3>
          <div className="space-y-1.5">
            {recentActivity.slice(0, 2).map((act) => (
              <div
                key={act.id}
                className="flex items-center justify-between text-xs gap-2"
              >
                <span className="text-slate-600 dark:text-slate-300 truncate">
                  {act.description}
                </span>
                <span
                  className={`font-mono-num shrink-0 ${
                    act.type === 'income'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {act.type === 'income' ? '+' : '-'}
                  {formatCurrency(act.amount, c, { compact: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
