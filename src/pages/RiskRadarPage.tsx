import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useFilteredMetrics } from '../hooks/useFilteredMetrics';
import { RiskSeverity } from '../types/financial';
import { formatCurrency, formatShortDate } from '../utils/formatters';
import { DataOriginTag } from '../components/common/DataOriginTag';
import { IntelligenceStateBanner } from '../components/common/IntelligenceStateBanner';

export function RiskRadarPage() {
  const { activeBusiness, navigate, showToast } = useApp();
  const {
    alerts,
    toggleAlertAcknowledge,
    isBackendMode,
    isLoading,
    error,
    refetch,
    dataOriginBadge,
  } = useFilteredMetrics();
  const [severityFilter, setSeverityFilter] = useState<'all' | RiskSeverity>('all');
  const [showResolved, setShowResolved] = useState(true);
  const [pendingAlertId, setPendingAlertId] = useState<string | null>(null);
  const c = activeBusiness.currency;

  const filtered = alerts.filter((r) => {
    if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
    if (!showResolved && r.acknowledged) return false;
    return true;
  });

  const criticalCount = alerts.filter(
    (r) => !r.acknowledged && r.severity === 'critical'
  ).length;
  const warningCount = alerts.filter(
    (r) => !r.acknowledged && r.severity === 'warning'
  ).length;

  const handleToggleAck = async (alertId: string, currentAck: boolean) => {
    setPendingAlertId(alertId);
    try {
      await toggleAlertAcknowledge(alertId, !currentAck);
      if (isBackendMode) {
        showToast(!currentAck ? 'Alert acknowledged' : 'Alert reopened', 'info');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update alert status.';
      showToast(msg, 'warning');
    } finally {
      setPendingAlertId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/8">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {activeBusiness.name} Risk Radar
            </span>
            <span aria-hidden="true">·</span>
            <DataOriginTag kind={dataOriginBadge} />
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Monitors expense anomalies, overdue receivables, margin drops, duplicate outflow patterns, and cash shortage threats.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono-num">
          <span className="text-rose-600 dark:text-rose-400 font-semibold">
            {criticalCount} Critical
          </span>
          <span className="text-amber-600 dark:text-amber-400 font-semibold">
            {warningCount} Warning
          </span>
        </div>
      </div>

      <IntelligenceStateBanner isLoading={isLoading} error={error} onRetry={refetch} />

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 text-xs">
          {(['all', 'critical', 'warning', 'advisory'] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1 rounded-md capitalize font-medium transition-colors ${
                severityFilter === sev
                  ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
          />
          Show acknowledged alerts
        </label>
      </div>

      {/* Risk List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl p-10 text-center bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              No active risk alerts in this filter
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              All matching operational and financial alerts have been reviewed.
            </p>
          </div>
        ) : (
          filtered.map((risk) => (
            <div
              key={risk.id}
              className={`rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 transition-opacity ${
                risk.acknowledged ? 'opacity-65' : ''
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {risk.severity === 'critical' ? (
                      <ShieldAlert className="w-4 h-4 text-rose-500" />
                    ) : (
                      <AlertTriangle
                        className={`w-4 h-4 ${
                          risk.severity === 'warning'
                            ? 'text-amber-500'
                            : 'text-blue-500'
                        }`}
                      />
                    )}
                    <span
                      className={`font-semibold uppercase tracking-wide text-[11px] ${
                        risk.severity === 'critical'
                          ? 'text-rose-600 dark:text-rose-400'
                          : risk.severity === 'warning'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {risk.severity}
                    </span>
                    <span className="text-slate-400" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {risk.category}
                    </span>
                    <span className="text-slate-400" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono-num text-slate-500 dark:text-slate-400">
                      Detected {formatShortDate(risk.detectedDate)}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {risk.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                    {risk.description}
                  </p>
                  {risk.supportingEvidence && Object.keys(risk.supportingEvidence).length > 0 && (
                    <div className="pt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                      {Object.entries(risk.supportingEvidence)
                        .slice(0, 4)
                        .map(([k, v]) => (
                          <span key={k}>
                            {k.replace(/_/g, ' ')}:{' '}
                            <strong className="text-slate-700 dark:text-slate-200">
                              {Array.isArray(v) ? v.length : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </strong>
                          </span>
                        ))}
                    </div>
                  )}
                  <div className="pt-1 text-xs text-slate-500 dark:text-slate-400">
                    Recommended Action:{' '}
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {risk.recommendedAction}
                    </span>
                  </div>
                </div>

                <div className="flex md:flex-col items-end justify-between gap-3 shrink-0">
                  {risk.impactAmount !== undefined && (
                    <div className="text-right">
                      <div className="text-[11px] text-slate-400">Estimated Exposure</div>
                      <div className="text-base font-semibold font-mono-num text-slate-900 dark:text-slate-100">
                        {formatCurrency(risk.impactAmount, c)}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pendingAlertId === risk.id}
                      onClick={() => handleToggleAck(risk.id, risk.acknowledged)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] disabled:opacity-50"
                    >
                      {risk.acknowledged ? 'Reopen' : 'Acknowledge'}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(risk.targetRoute)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium"
                    >
                      <span>Investigate</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
