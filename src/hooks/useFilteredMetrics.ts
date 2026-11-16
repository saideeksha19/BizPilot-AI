import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { getAuthToken } from '../services/apiClient';
import {
  buildAnalyticsSeries,
  buildCategoryBreakdown,
  buildDigitalTwinSnapshot,
  computeFinancialHealth,
  computeKpiSummary,
  DigitalTwinSnapshot,
  FinancialHealthBreakdown,
  KpiSummary,
  resolveDateWindow,
  TimeSeriesPoint,
} from '../services/financialService';
import { intelligenceApi, parseApiDecimal } from '../services/intelligenceApi';
import {
  ApiAlertSeverity,
  ApiCashFlowForecast,
  ApiDataLabel,
  ApiFinancialAlert,
  ApiFinancialHealth,
  ApiFinancialSummary,
  ApiFinancialTwin,
  ApiHealthComponent,
} from '../types/api';
import { DataOriginKind, RiskAlert, RouteId } from '../types/financial';

function mapDataLabelToOrigin(label: ApiDataLabel): DataOriginKind {
  if (label === 'ESTIMATED') return 'estimated';
  if (label === 'FORECAST') return 'forecasted';
  return 'actual';
}

function mapRouteId(route: string): RouteId {
  const allowed: RouteId[] = [
    'overview',
    'financial-twin',
    'transactions',
    'invoices',
    'cash-flow',
    'simulator',
    'risk-radar',
    'inventory',
    'copilot',
    'reports',
    'settings',
    'team',
    'help',
  ];
  return allowed.includes(route as RouteId) ? (route as RouteId) : 'risk-radar';
}

function buildDemoForecast(
  availableCash: number,
  monthlyOverhead: number,
  timeline: DigitalTwinSnapshot['timeline'],
  asOfDate: string
): ApiCashFlowForecast {
  const avgMonthlyIn =
    timeline.length > 0
      ? timeline.reduce((s, p) => s + p.revenue, 0) / timeline.length
      : 0;
  const avgMonthlyOut =
    timeline.length > 0
      ? timeline.reduce((s, p) => s + p.expenses, 0) / timeline.length
      : monthlyOverhead;

  const makeHorizon = (days: 7 | 30 | 90) => {
    const scale = days / 30;
    const expectedIn = Math.round(avgMonthlyIn * scale);
    const expectedOut = Math.round(avgMonthlyOut * scale);
    const ending = Math.round(availableCash + expectedIn - expectedOut);
    const minCash = Math.min(availableCash, ending);
    const stepCount = days === 7 ? 7 : days === 30 ? 10 : 12;
    const series = Array.from({ length: stepCount }, (_, idx) => {
      const ratio = (idx + 1) / stepCount;
      const proj = Math.round(availableCash + (ending - availableCash) * ratio);
      return {
        date: asOfDate,
        label: days === 7 ? `Day ${idx + 1}` : days === 30 ? `Day ${(idx + 1) * 3}` : `Wk ${idx + 1}`,
        expected_inflows: String(Math.round(expectedIn / stepCount)),
        expected_outflows: String(Math.round(expectedOut / stepCount)),
        net_flow: String(Math.round((expectedIn - expectedOut) / stepCount)),
        projected_cash_balance: String(proj),
        data_label: 'FORECAST' as const,
      };
    });
    return {
      horizon_days: days,
      starting_cash_balance: String(availableCash),
      expected_cash_balance: String(ending),
      expected_inflows: String(expectedIn),
      expected_outflows: String(expectedOut),
      net_cash_change: String(expectedIn - expectedOut),
      min_projected_cash: String(minCash),
      shortage_risk: minCash < monthlyOverhead * 1.1,
      shortage_dates: minCash < monthlyOverhead * 1.1 ? [asOfDate] : [],
      confidence: 'medium' as const,
      series,
    };
  };

  return {
    business_id: 'demo',
    currency: 'INR',
    data_label: 'FORECAST',
    as_of_date: asOfDate,
    generated_at: new Date().toISOString(),
    overall_confidence: 'medium',
    observed_payment_delay_days: 4,
    historical_sample_transactions: 18,
    historical_span_days: 90,
    data_quality_notes: ['Illustrative demo workspace projection derived from local demo records.'],
    assumptions: [
      'Demonstrates deterministic 7d/30d/90d horizon projection using local demo ledger records.',
    ],
    horizons: {
      '7d': makeHorizon(7),
      '30d': makeHorizon(30),
      '90d': makeHorizon(90),
    },
    expected_incoming_invoices: [],
    upcoming_scheduled_expenses: [],
  };
}

export function useFilteredMetrics() {
  const {
    activeBusiness,
    businessTransactions,
    businessInvoices,
    businessInventory,
    businessRisks,
    datePreset,
    customDateRange,
    acknowledgeRisk,
    ledgerVersion,
  } = useApp();

  const authToken = getAuthToken();
  const isBackendMode = Boolean(authToken) && !activeBusiness.isDemoData;

  const [backendSummary, setBackendSummary] = useState<ApiFinancialSummary | null>(null);
  const [backendTwin, setBackendTwin] = useState<ApiFinancialTwin | null>(null);
  const [backendForecast, setBackendForecast] = useState<ApiCashFlowForecast | null>(null);
  const [backendHealth, setBackendHealth] = useState<ApiFinancialHealth | null>(null);
  const [backendAlerts, setBackendAlerts] = useState<ApiFinancialAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const refetch = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!isBackendMode) {
      setBackendSummary(null);
      setBackendTwin(null);
      setBackendForecast(null);
      setBackendHealth(null);
      setBackendAlerts([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all([
      intelligenceApi.getFinancialSummary(activeBusiness.id, {
        preset: datePreset,
        startDate: customDateRange.start,
        endDate: customDateRange.end,
      }),
      intelligenceApi.getFinancialTwin(activeBusiness.id),
      intelligenceApi.getCashFlowForecast(activeBusiness.id),
      intelligenceApi.getFinancialHealth(activeBusiness.id),
      intelligenceApi.listAlerts(activeBusiness.id, { pageSize: 50 }),
    ])
      .then(([summaryRes, twinRes, forecastRes, healthRes, alertsRes]) => {
        if (cancelled) return;
        setBackendSummary(summaryRes);
        setBackendTwin(twinRes);
        setBackendForecast(forecastRes);
        setBackendHealth(healthRes);
        setBackendAlerts(alertsRes.items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Unable to load backend financial intelligence.';
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isBackendMode,
    activeBusiness.id,
    datePreset,
    customDateRange.start,
    customDateRange.end,
    refreshTick,
    ledgerVersion,
  ]);

  const localDateWindow = useMemo(
    () => resolveDateWindow(datePreset, customDateRange),
    [datePreset, customDateRange]
  );

  const localKpi = useMemo(
    () =>
      computeKpiSummary(
        activeBusiness,
        businessTransactions,
        businessInvoices,
        localDateWindow
      ),
    [activeBusiness, businessTransactions, businessInvoices, localDateWindow]
  );

  const localTimeSeries = useMemo(
    () => buildAnalyticsSeries(activeBusiness, businessTransactions, localDateWindow),
    [activeBusiness, businessTransactions, localDateWindow]
  );

  const localIncomeBreakdown = useMemo(
    () => buildCategoryBreakdown(businessTransactions, localDateWindow, 'income'),
    [businessTransactions, localDateWindow]
  );

  const localExpenseBreakdown = useMemo(
    () => buildCategoryBreakdown(businessTransactions, localDateWindow, 'expense'),
    [businessTransactions, localDateWindow]
  );

  const localHealth = useMemo(
    () => computeFinancialHealth(activeBusiness, localKpi, businessRisks),
    [activeBusiness, localKpi, businessRisks]
  );

  const localDigitalTwin = useMemo(
    () =>
      buildDigitalTwinSnapshot(
        activeBusiness,
        businessTransactions,
        businessInvoices,
        businessInventory,
        localKpi
      ),
    [activeBusiness, businessTransactions, businessInvoices, businessInventory, localKpi]
  );

  const dateWindow = useMemo(() => {
    if (!isBackendMode || !backendSummary) return localDateWindow;
    return {
      start: backendSummary.window.start,
      end: backendSummary.window.end,
      prevStart: backendSummary.window.prev_start,
      prevEnd: backendSummary.window.prev_end,
      days: backendSummary.window.days,
    };
  }, [isBackendMode, backendSummary, localDateWindow]);

  const kpi: KpiSummary = useMemo(() => {
    if (!isBackendMode || !backendSummary) return localKpi;
    const k = backendSummary.kpis;
    return {
      totalRevenue: parseApiDecimal(k.total_revenue),
      prevRevenue: parseApiDecimal(k.prev_revenue),
      revenueChangePct: parseApiDecimal(k.revenue_change_pct),
      totalExpenses: parseApiDecimal(k.total_expenses),
      prevExpenses: parseApiDecimal(k.prev_expenses),
      expensesChangePct: parseApiDecimal(k.expenses_change_pct),
      netProfit: parseApiDecimal(k.net_profit),
      prevNetProfit: parseApiDecimal(k.prev_net_profit),
      netProfitChangePct: parseApiDecimal(k.net_profit_change_pct),
      availableCash: parseApiDecimal(k.available_cash),
      prevCash: parseApiDecimal(k.prev_available_cash),
      cashChangePct: parseApiDecimal(k.cash_change_pct),
      outstandingReceivables: parseApiDecimal(k.accounts_receivable),
      overdueReceivables: parseApiDecimal(k.overdue_receivables),
      receivablesChangePct: 0,
      upcomingPayables: parseApiDecimal(k.accounts_payable),
      payablesChangePct: 0,
    };
  }, [isBackendMode, backendSummary, localKpi]);

  const timeSeries: TimeSeriesPoint[] = useMemo(() => {
    if (!isBackendMode || !backendSummary) return localTimeSeries;
    return backendSummary.time_series.map((pt) => ({
      date: pt.date,
      label: pt.label,
      revenue: parseApiDecimal(pt.revenue),
      expenses: parseApiDecimal(pt.expenses),
      netCashFlow: parseApiDecimal(pt.net_cash_flow),
      cumulativeCash: parseApiDecimal(pt.cumulative_cash),
      profit: parseApiDecimal(pt.profit),
    }));
  }, [isBackendMode, backendSummary, localTimeSeries]);

  const incomeBreakdown = useMemo(() => {
    if (!isBackendMode || !backendSummary) return localIncomeBreakdown;
    return backendSummary.income_breakdown.map((item) => ({
      name: item.name,
      value: parseApiDecimal(item.value),
      share: parseApiDecimal(item.share_pct),
    }));
  }, [isBackendMode, backendSummary, localIncomeBreakdown]);

  const expenseBreakdown = useMemo(() => {
    if (!isBackendMode || !backendSummary) return localExpenseBreakdown;
    return backendSummary.expense_breakdown.map((item) => ({
      name: item.name,
      value: parseApiDecimal(item.value),
      share: parseApiDecimal(item.share_pct),
    }));
  }, [isBackendMode, backendSummary, localExpenseBreakdown]);

  const health: FinancialHealthBreakdown & {
    gradeLabel: string;
    dataCompletenessPct: number;
    components: ApiHealthComponent[];
    missingDataNotes: string[];
  } = useMemo(() => {
    if (!isBackendMode || !backendHealth) {
      const demoComponents: ApiHealthComponent[] = [
        {
          key: 'liquidity',
          label: 'Liquidity & Runway',
          weight: 25,
          score: localHealth.liquidityScore,
          weighted_contribution: String(((localHealth.liquidityScore * 25) / 100).toFixed(2)),
          data_available: true,
          underlying_metric: `${localHealth.runwayMonths} months runway`,
          explanation: 'Evaluates cash cushion relative to monthly burn.',
        },
        {
          key: 'profitability',
          label: 'Profitability',
          weight: 20,
          score: localHealth.marginScore,
          weighted_contribution: String(((localHealth.marginScore * 20) / 100).toFixed(2)),
          data_available: true,
          underlying_metric: `${localHealth.netMarginPct}% net margin`,
          explanation: 'Measures operating profit margin across completed ledger activity.',
        },
        {
          key: 'receivables_discipline',
          label: 'Receivables Discipline',
          weight: 15,
          score: localHealth.receivablesScore,
          weighted_contribution: String(((localHealth.receivablesScore * 15) / 100).toFixed(2)),
          data_available: true,
          underlying_metric: `${businessRisks.filter((r) => !r.acknowledged).length} open risk alerts`,
          explanation: 'Tracks overdue invoice ratio and collection discipline.',
        },
      ];
      return {
        ...localHealth,
        gradeLabel: localHealth.grade,
        dataCompletenessPct: 100,
        components: demoComponents,
        missingDataNotes: [],
      };
    }

    const byKey = new Map(backendHealth.components.map((c) => [c.key, c]));
    const normalizedGrade: FinancialHealthBreakdown['grade'] =
      backendHealth.grade === 'Strong'
        ? 'Strong'
        : backendHealth.grade === 'Healthy'
        ? 'Healthy'
        : backendHealth.grade === 'Watch'
        ? 'Watch'
        : 'Strained';

    return {
      overallScore: backendHealth.overall_score,
      grade: normalizedGrade,
      gradeLabel: backendHealth.grade,
      liquidityScore: byKey.get('liquidity')?.score ?? 0,
      marginScore: byKey.get('profitability')?.score ?? 0,
      receivablesScore: byKey.get('receivables_discipline')?.score ?? 0,
      runwayMonths: parseApiDecimal(backendHealth.runway_months),
      netMarginPct: parseApiDecimal(backendHealth.net_margin_pct),
      dataCompletenessPct: backendHealth.data_completeness_pct,
      components: backendHealth.components,
      missingDataNotes: backendHealth.missing_data_notes,
    };
  }, [isBackendMode, backendHealth, localHealth, businessRisks]);

  const digitalTwin: DigitalTwinSnapshot = useMemo(() => {
    if (!isBackendMode || !backendTwin) return localDigitalTwin;
    return {
      assets: {
        availableCash: parseApiDecimal(backendTwin.assets.available_cash),
        outstandingReceivables: parseApiDecimal(backendTwin.assets.accounts_receivable),
        inventoryValuation: parseApiDecimal(backendTwin.assets.inventory_valuation),
        totalCurrentAssets: parseApiDecimal(backendTwin.assets.total_current_assets),
      },
      liabilities: {
        upcomingPayables: parseApiDecimal(backendTwin.liabilities.upcoming_payables),
        taxLiabilityAccrued: parseApiDecimal(backendTwin.liabilities.tax_liability_accrued),
        shortTermLoanBalance: parseApiDecimal(backendTwin.liabilities.short_term_loan_balance),
        totalLiabilities: parseApiDecimal(backendTwin.liabilities.total_liabilities),
      },
      netEquityPosition: parseApiDecimal(backendTwin.net_working_position),
      quickRatio: parseApiDecimal(backendTwin.quick_ratio),
      fixedVsVariableRatio: {
        fixedPct: backendTwin.fixed_vs_variable_ratio.fixed_pct,
        variablePct: backendTwin.fixed_vs_variable_ratio.variable_pct,
      },
      collectionEfficiencyPct: parseApiDecimal(backendTwin.collection_efficiency_pct),
      timeline: backendTwin.timeline.map((pt) => ({
        period: pt.period,
        label: pt.label,
        origin: mapDataLabelToOrigin(pt.data_label),
        cashBalance: parseApiDecimal(pt.cash_balance),
        revenue: parseApiDecimal(pt.revenue),
        expenses: parseApiDecimal(pt.expenses),
        netProfit: parseApiDecimal(pt.net_profit),
        receivables: parseApiDecimal(pt.receivables),
        payables: parseApiDecimal(pt.payables),
      })),
      changeDrivers: backendTwin.change_drivers.map((drv) => ({
        title: drv.title,
        detail: drv.detail,
        origin: mapDataLabelToOrigin(drv.data_label),
        impact: drv.impact,
      })),
    };
  }, [isBackendMode, backendTwin, localDigitalTwin]);

  const forecast: ApiCashFlowForecast = useMemo(() => {
    if (isBackendMode && backendForecast) return backendForecast;
    return buildDemoForecast(
      localKpi.availableCash,
      activeBusiness.monthlyFixedOverhead,
      localDigitalTwin.timeline,
      localDateWindow.end
    );
  }, [
    isBackendMode,
    backendForecast,
    localKpi.availableCash,
    activeBusiness.monthlyFixedOverhead,
    localDigitalTwin.timeline,
    localDateWindow.end,
  ]);

  const alerts: (RiskAlert & { supportingEvidence?: Record<string, unknown> | null; alertType?: string })[] =
    useMemo(() => {
      if (!isBackendMode) return businessRisks;
      return backendAlerts.map((a) => ({
        id: a.id,
        businessId: a.business_id,
        title: a.title,
        description: a.description,
        category: (a.category as RiskAlert['category']) || 'Cash Flow',
        severity: a.severity as ApiAlertSeverity,
        impactAmount: a.impact_amount !== null ? parseApiDecimal(a.impact_amount) : undefined,
        detectedDate: a.detected_at.slice(0, 10),
        recommendedAction: a.recommended_action,
        targetRoute: mapRouteId(a.target_route),
        acknowledged: a.is_acknowledged,
        supportingEvidence: a.supporting_evidence,
        alertType: a.alert_type,
      }));
    }, [isBackendMode, backendAlerts, businessRisks]);

  const toggleAlertAcknowledge = useCallback(
    async (alertId: string, nextAck?: boolean) => {
      if (!isBackendMode) {
        acknowledgeRisk(alertId);
        return;
      }
      const existing = backendAlerts.find((a) => a.id === alertId);
      const targetVal = nextAck !== undefined ? nextAck : !(existing?.is_acknowledged ?? false);
      const updated = await intelligenceApi.acknowledgeAlert(activeBusiness.id, alertId, targetVal);
      setBackendAlerts((prev) => prev.map((a) => (a.id === alertId ? updated : a)));
    },
    [isBackendMode, acknowledgeRisk, backendAlerts, activeBusiness.id]
  );

  return {
    dateWindow,
    kpi,
    timeSeries,
    incomeBreakdown,
    expenseBreakdown,
    health,
    digitalTwin,
    forecast,
    alerts,
    toggleAlertAcknowledge,
    isBackendMode,
    isLoading,
    error,
    refetch,
    backendSummary,
    backendTwin,
    backendHealth,
    accountingAssumptions: backendSummary?.accounting_assumptions ?? [],
    hasActivity: backendSummary ? backendSummary.data_completeness.has_activity : true,
    dataOriginBadge: isBackendMode ? ('ACTUAL' as const) : ('demo' as const),
  };
}
