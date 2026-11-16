import React, { useEffect, useMemo, useState } from 'react';
import { BookmarkPlus, GitCompare, RotateCcw, ShieldAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useFilteredMetrics } from '../hooks/useFilteredMetrics';
import { intelligenceApi, parseApiDecimal } from '../services/intelligenceApi';
import {
  DEFAULT_SCENARIO,
  runDeterministicSimulation,
  SCENARIO_PRESETS,
} from '../services/simulatorEngine';
import {
  ApiSimulationCompareResponse,
  ApiSimulationScenario,
} from '../types/api';
import { SimulationResult, SimulatorScenario } from '../types/financial';
import { formatCurrency } from '../utils/formatters';
import { SimulatorComparisonChart } from '../components/charts/SimulatorComparisonChart';
import { DataOriginTag } from '../components/common/DataOriginTag';
import { IntelligenceStateBanner } from '../components/common/IntelligenceStateBanner';
import { ScenarioControls } from '../components/simulator/ScenarioControls';

function mapApiScenarioToResult(res: ApiSimulationScenario['result']): SimulationResult {
  return {
    baselineSixMonthCash: parseApiDecimal(res.baseline_six_month_cash),
    simulatedSixMonthCash: parseApiDecimal(res.simulated_six_month_cash),
    baselineMonthlyProfit: parseApiDecimal(res.baseline_monthly_profit),
    simulatedMonthlyProfit: parseApiDecimal(res.simulated_monthly_profit),
    profitDeltaMonthly: parseApiDecimal(res.profit_delta_monthly),
    cashDeltaSixMonth: parseApiDecimal(res.cash_delta_six_month),
    runwayMonthsBaseline: parseApiDecimal(res.runway_months_baseline),
    runwayMonthsSimulated: parseApiDecimal(res.runway_months_simulated),
    riskLevel: res.risk_level,
    riskSummary: res.risk_summary,
    monthlySeries: res.monthly_series.map((pt) => ({
      month: pt.month,
      baselineCash: parseApiDecimal(pt.baseline_cash),
      simulatedCash: parseApiDecimal(pt.simulated_cash),
      baselineProfit: parseApiDecimal(pt.baseline_profit),
      simulatedProfit: parseApiDecimal(pt.simulated_profit),
    })),
  };
}

export function SimulatorPage() {
  const { activeBusiness, showToast } = useApp();
  const { kpi, isBackendMode } = useFilteredMetrics();
  const [scenario, setScenario] = useState<SimulatorScenario>(DEFAULT_SCENARIO);
  const [scenarioName, setScenarioName] = useState('Custom Growth Plan');
  const [chartMode, setChartMode] = useState<'cash' | 'profit'>('cash');

  const [backendResult, setBackendResult] = useState<SimulationResult | null>(null);
  const [backendAssumptions, setBackendAssumptions] = useState<string[]>([]);
  const [savedScenarios, setSavedScenarios] = useState<ApiSimulationScenario[]>([]);
  const [localSaved, setLocalSaved] = useState<
    { id: string; name: string; result: SimulationResult }[]
  >([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareResponse, setCompareResponse] =
    useState<ApiSimulationCompareResponse | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simSaving, setSimSaving] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  const c = activeBusiness.currency;

  const toPayload = (saveFlag: boolean) => ({
    name: scenarioName.trim() || scenario.name || 'Custom Scenario',
    sales_change_pct: String(scenario.salesChangePct),
    supplier_price_change_pct: String(scenario.supplierPriceChangePct),
    payment_delay_days: scenario.paymentDelayDays,
    additional_employees: scenario.additionalEmployees,
    avg_monthly_salary: String(scenario.avgMonthlySalary),
    new_inventory_purchase: String(scenario.newInventoryPurchase),
    equipment_purchase: String(scenario.equipmentPurchase),
    open_new_location: scenario.openNewLocation,
    new_location_monthly_rent: String(scenario.newLocationMonthlyRent),
    new_location_setup_cost: String(scenario.newLocationSetupCost),
    save: saveFlag,
  });

  // Load saved backend scenarios when authenticated
  useEffect(() => {
    if (!isBackendMode) {
      setSavedScenarios([]);
      setBackendResult(null);
      setCompareResponse(null);
      return;
    }
    let cancelled = false;
    intelligenceApi
      .listSimulations(activeBusiness.id, 1, 20)
      .then((res) => {
        if (!cancelled) setSavedScenarios(res.items);
      })
      .catch(() => {
        // Handled cleanly via main simulation banner if needed
      });
    return () => {
      cancelled = true;
    };
  }, [isBackendMode, activeBusiness.id]);

  // Execute hypothetical calculation on backend when in backend mode
  useEffect(() => {
    if (!isBackendMode) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setSimLoading(true);
      setSimError(null);
      intelligenceApi
        .runSimulation(activeBusiness.id, toPayload(false))
        .then((res) => {
          if (cancelled) return;
          setBackendResult(mapApiScenarioToResult(res.result));
          setBackendAssumptions(res.result.assumptions);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const msg = err instanceof Error ? err.message : 'Unable to evaluate simulation.';
          setSimError(msg);
        })
        .finally(() => {
          if (!cancelled) setSimLoading(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isBackendMode, activeBusiness.id, scenario]);

  const localResult = useMemo(
    () => runDeterministicSimulation(activeBusiness, kpi, scenario),
    [activeBusiness, kpi, scenario]
  );

  const result = isBackendMode && backendResult ? backendResult : localResult;

  const handleSaveScenario = async () => {
    const label = scenarioName.trim() || scenario.name || 'Saved Scenario';
    if (!isBackendMode) {
      const id = `local-sim-${Date.now()}`;
      setLocalSaved((prev) => [{ id, name: label, result: localResult }, ...prev]);
      showToast(`Saved hypothetical scenario "${label}" in session`);
      return;
    }

    setSimSaving(true);
    try {
      const saved = await intelligenceApi.runSimulation(activeBusiness.id, toPayload(true));
      setSavedScenarios((prev) => [saved, ...prev]);
      setBackendResult(mapApiScenarioToResult(saved.result));
      showToast(`Saved hypothetical scenario "${saved.name}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save simulation scenario.';
      showToast(msg, 'warning');
    } finally {
      setSimSaving(false);
    }
  };

  const toggleCompareId = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  const handleCompare = async () => {
    if (compareIds.length < 2) {
      showToast('Select at least 2 saved scenarios to compare.', 'warning');
      return;
    }
    if (!isBackendMode) {
      showToast('Comparing selected session scenarios below', 'info');
      return;
    }
    try {
      const res = await intelligenceApi.compareSimulations(activeBusiness.id, compareIds);
      setCompareResponse(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to compare scenarios.';
      showToast(msg, 'warning');
    }
  };

  const loadSavedScenario = (saved: ApiSimulationScenario) => {
    setScenario({
      id: saved.id ?? 'custom',
      name: saved.name,
      salesChangePct: parseApiDecimal(saved.sales_change_pct),
      supplierPriceChangePct: parseApiDecimal(saved.supplier_price_change_pct),
      paymentDelayDays: saved.payment_delay_days,
      additionalEmployees: saved.additional_employees,
      avgMonthlySalary: parseApiDecimal(saved.avg_monthly_salary),
      newInventoryPurchase: parseApiDecimal(saved.new_inventory_purchase),
      equipmentPurchase: parseApiDecimal(saved.equipment_purchase),
      openNewLocation: saved.open_new_location,
      newLocationMonthlyRent: parseApiDecimal(saved.new_location_monthly_rent),
      newLocationSetupCost: parseApiDecimal(saved.new_location_setup_cost),
    });
    setScenarioName(saved.name);
    setBackendResult(mapApiScenarioToResult(saved.result));
  };

  const riskTone =
    result.riskLevel === 'Low'
      ? 'text-emerald-600 dark:text-emerald-400'
      : result.riskLevel === 'Moderate'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-rose-600 dark:text-rose-400';

  const savedList = isBackendMode
    ? savedScenarios.map((s) => ({
        id: s.id ?? s.name,
        name: s.name,
        cash6m: parseApiDecimal(s.result.simulated_six_month_cash),
        profitMo: parseApiDecimal(s.result.simulated_monthly_profit),
        risk: s.result.risk_level,
        raw: s,
      }))
    : localSaved.map((s) => ({
        id: s.id,
        name: s.name,
        cash6m: s.result.simulatedSixMonthCash,
        profitMo: s.result.simulatedMonthlyProfit,
        risk: s.result.riskLevel,
        raw: null as ApiSimulationScenario | null,
      }));

  return (
    <div className="space-y-6">
      {/* Header & Presets */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/8">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {activeBusiness.name} Decision Sandbox
            </span>
            <span aria-hidden="true">·</span>
            <DataOriginTag kind="HYPOTHETICAL" />
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Deterministic 6-month sensitivity model. All figures represent hypothetical scenarios and never mutate actual ledger data.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {SCENARIO_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setScenario(preset);
                setScenarioName(preset.name);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                scenario.id === preset.id
                  ? 'border-violet-600 bg-violet-600/10 text-violet-700 dark:text-violet-300'
                  : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
              }`}
            >
              {preset.name.split('(')[0].trim()}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setScenario(DEFAULT_SCENARIO);
              setScenarioName(DEFAULT_SCENARIO.name);
            }}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      <IntelligenceStateBanner isLoading={simLoading} error={simError} />

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Controls & Save */}
        <div className="lg:col-span-4 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/[0.06]">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Scenario Levers
            </h2>
            <span className="text-[11px] text-slate-400">6-Month Horizon</span>
          </div>

          <div>
            <label
              htmlFor="sim-name-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Scenario Label
            </label>
            <div className="flex gap-2">
              <input
                id="sim-name-input"
                type="text"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
                placeholder="Name this hypothetical scenario"
              />
              <button
                type="button"
                disabled={simSaving}
                onClick={handleSaveScenario}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium disabled:opacity-50 shrink-0"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                Save
              </button>
            </div>
          </div>

          <ScenarioControls
            scenario={scenario}
            currency={c}
            onChange={(next) => setScenario({ ...next, id: 'custom' })}
          />
        </div>

        {/* Right: Outputs & Comparison Charts */}
        <div className="lg:col-span-8 space-y-4">
          {/* Output KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Current Cash Position
              </div>
              <div className="mt-1.5 text-xl font-semibold font-mono-num text-slate-900 dark:text-slate-100">
                {formatCurrency(kpi.availableCash, c, { compact: true })}
              </div>
              <div className="mt-1 text-[11px] font-mono-num text-slate-500">
                Runway: {result.runwayMonthsBaseline} mo
              </div>
            </div>

            <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Projected 6-Mo Cash (Hypothetical)
              </div>
              <div className="mt-1.5 text-xl font-semibold font-mono-num text-violet-600 dark:text-violet-400">
                {formatCurrency(result.simulatedSixMonthCash, c, { compact: true })}
              </div>
              <div
                className={`mt-1 text-[11px] font-mono-num ${
                  result.cashDeltaSixMonth >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {result.cashDeltaSixMonth >= 0 ? '+' : ''}
                {formatCurrency(result.cashDeltaSixMonth, c, { compact: true })} vs baseline
              </div>
            </div>

            <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Monthly Profit Impact
              </div>
              <div className="mt-1.5 text-xl font-semibold font-mono-num text-slate-900 dark:text-slate-100">
                {formatCurrency(result.simulatedMonthlyProfit, c, { compact: true })}
              </div>
              <div
                className={`mt-1 text-[11px] font-mono-num ${
                  result.profitDeltaMonthly >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {result.profitDeltaMonthly >= 0 ? '+' : ''}
                {formatCurrency(result.profitDeltaMonthly, c, { compact: true })} / mo
              </div>
            </div>

            <div className="rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Simulated Risk Level</span>
                <ShieldAlert className="w-4 h-4 text-slate-400" />
              </div>
              <div className={`mt-1.5 text-xl font-semibold ${riskTone}`}>
                {result.riskLevel} Risk
              </div>
              <div className="mt-1 text-[11px] font-mono-num text-slate-500">
                Post-shock runway: {result.runwayMonthsSimulated} mo
              </div>
            </div>
          </div>

          {/* Comparison Chart */}
          <div className="rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Baseline vs Hypothetical Scenario Trajectory
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Compares unchanged business run-rate against configured decision levers
                </p>
              </div>
              <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 text-xs">
                <button
                  type="button"
                  onClick={() => setChartMode('cash')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    chartMode === 'cash'
                      ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Cash Balance
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('profit')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    chartMode === 'profit'
                      ? 'bg-white dark:bg-[#2e4152] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Monthly Profit
                </button>
              </div>
            </div>

            <SimulatorComparisonChart
              series={result.monthlySeries}
              currency={c}
              mode={chartMode}
            />
          </div>

          {/* Risk Assessment & Baseline vs Simulated Summary Table */}
          <div className="rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Scenario Interpretation
                </h3>
                <DataOriginTag kind="HYPOTHETICAL" />
              </div>
              <span className={`text-xs font-semibold ${riskTone}`}>
                {result.riskLevel} Risk
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {result.riskSummary}
            </p>
            {backendAssumptions.length > 0 && (
              <ul className="text-[11px] text-slate-500 dark:text-slate-400 list-disc list-inside space-y-0.5">
                {backendAssumptions.map((a, idx) => (
                  <li key={idx}>{a}</li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-white/[0.06] text-xs font-mono-num">
              <div>
                <div className="text-slate-400">Baseline 6m Cash</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatCurrency(result.baselineSixMonthCash, c)}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Simulated 6m Cash</div>
                <div className="font-semibold text-violet-600 dark:text-violet-400">
                  {formatCurrency(result.simulatedSixMonthCash, c)}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Baseline Profit/mo</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatCurrency(result.baselineMonthlyProfit, c)}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Simulated Profit/mo</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">
                  {formatCurrency(result.simulatedMonthlyProfit, c)}
                </div>
              </div>
            </div>
          </div>

          {/* Saved Scenarios & Multi-Scenario Comparison */}
          {savedList.length > 0 && (
            <div className="rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Saved Scenarios ({savedList.length})
                  </h3>
                  <DataOriginTag kind="HYPOTHETICAL" />
                </div>
                {compareIds.length >= 2 && (
                  <button
                    type="button"
                    onClick={handleCompare}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium"
                  >
                    <GitCompare className="w-3.5 h-3.5" />
                    Compare Selected ({compareIds.length})
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-100 dark:divide-white/[0.06] text-xs">
                {savedList.map((item) => (
                  <div
                    key={item.id}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-3"
                  >
                    <label className="flex items-center gap-2 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={compareIds.includes(item.id)}
                        onChange={() => toggleCompareId(item.id)}
                        className="rounded border-slate-300 text-violet-600"
                      />
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                        {item.name}
                      </span>
                    </label>
                    <div className="flex items-center gap-4 font-mono-num">
                      <span>6m Cash: {formatCurrency(item.cash6m, c, { compact: true })}</span>
                      <span>Profit/mo: {formatCurrency(item.profitMo, c, { compact: true })}</span>
                      <span className="text-slate-500">{item.risk}</span>
                      {item.raw && (
                        <button
                          type="button"
                          onClick={() => item.raw && loadSavedScenario(item.raw)}
                          className="text-violet-600 dark:text-violet-400 hover:underline font-sans"
                        >
                          Load
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {compareResponse && (
                <div className="pt-3 border-t border-slate-100 dark:border-white/[0.06] text-xs space-y-2">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    Side-by-Side Comparison ({compareResponse.data_label})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {compareResponse.scenarios.map((sc) => (
                      <div
                        key={sc.id}
                        className="p-3 rounded-lg bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/8 font-mono-num space-y-1"
                      >
                        <div className="font-sans font-semibold text-slate-900 dark:text-slate-100 flex items-center justify-between">
                          <span className="truncate">{sc.name}</span>
                          {sc.id === compareResponse.best_ending_cash_scenario_id && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                              Top Cash
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          6m Cash: {formatCurrency(parseApiDecimal(sc.simulated_six_month_cash), c)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Profit/mo: {formatCurrency(parseApiDecimal(sc.simulated_monthly_profit), c)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Runway: {sc.runway_months_simulated} mo · {sc.risk_level}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
