import {
  BusinessProfile,
  SimulationResult,
  SimulatorScenario,
} from '../types/financial';
import { KpiSummary } from './financialService';

export const DEFAULT_SCENARIO: SimulatorScenario = {
  id: 'custom',
  name: 'Custom Decision Scenario',
  salesChangePct: 0,
  supplierPriceChangePct: 0,
  paymentDelayDays: 0,
  additionalEmployees: 0,
  avgMonthlySalary: 32000,
  newInventoryPurchase: 0,
  equipmentPurchase: 0,
  openNewLocation: false,
  newLocationMonthlyRent: 65000,
  newLocationSetupCost: 450000,
};

export const SCENARIO_PRESETS: SimulatorScenario[] = [
  {
    ...DEFAULT_SCENARIO,
    id: 'preset-growth',
    name: 'Festive Expansion (+20% Sales, +2 Staff, Stock Up)',
    salesChangePct: 20,
    supplierPriceChangePct: 4,
    paymentDelayDays: 5,
    additionalEmployees: 2,
    avgMonthlySalary: 28000,
    newInventoryPurchase: 220000,
    equipmentPurchase: 0,
    openNewLocation: false,
  },
  {
    ...DEFAULT_SCENARIO,
    id: 'preset-stress',
    name: 'Supply Shock & Slow Collections',
    salesChangePct: -12,
    supplierPriceChangePct: 18,
    paymentDelayDays: 30,
    additionalEmployees: 0,
    avgMonthlySalary: 30000,
    newInventoryPurchase: 0,
    equipmentPurchase: 0,
    openNewLocation: false,
  },
  {
    ...DEFAULT_SCENARIO,
    id: 'preset-branch',
    name: 'Second Outlet Launch',
    salesChangePct: 35,
    supplierPriceChangePct: 0,
    paymentDelayDays: 10,
    additionalEmployees: 4,
    avgMonthlySalary: 26000,
    newInventoryPurchase: 300000,
    equipmentPurchase: 250000,
    openNewLocation: true,
    newLocationMonthlyRent: 65000,
    newLocationSetupCost: 450000,
  },
];

export function runDeterministicSimulation(
  business: BusinessProfile,
  kpi: KpiSummary,
  scenario: SimulatorScenario
): SimulationResult {
  // Normalize baseline monthly revenue and operating expenses from current KPI window
  const baselineMonthlyRev = Math.max(250000, kpi.totalRevenue || 480000);
  const baselineMonthlyExp = Math.max(180000, kpi.totalExpenses || 375000);
  const baselineMonthlyProfit = baselineMonthlyRev - baselineMonthlyExp;

  // Split baseline expenses roughly into 55% COGS/supplier + 45% fixed/payroll
  const baselineSupplierCost = baselineMonthlyExp * 0.55;
  const baselineFixedCost = baselineMonthlyExp * 0.45;

  const simMonthlyRev = baselineMonthlyRev * (1 + scenario.salesChangePct / 100);
  // Variable supplier costs scale with both sales volume and supplier price inflation
  const volumeFactor = Math.max(0.4, 1 + (scenario.salesChangePct * 0.7) / 100);
  const simSupplierCost =
    baselineSupplierCost * volumeFactor * (1 + scenario.supplierPriceChangePct / 100);

  const extraPayroll = scenario.additionalEmployees * scenario.avgMonthlySalary;
  const extraRent = scenario.openNewLocation ? scenario.newLocationMonthlyRent : 0;

  const simMonthlyExp = simSupplierCost + baselineFixedCost + extraPayroll + extraRent;
  const simulatedMonthlyProfit = simMonthlyRev - simMonthlyExp;

  // One-time capex / working capital outflows in Month 1
  const upfrontOutflow =
    scenario.newInventoryPurchase +
    scenario.equipmentPurchase +
    (scenario.openNewLocation ? scenario.newLocationSetupCost : 0);

  // Payment delay locks cash in Month 1 proportionally
  const delayWorkingCapitalDrag =
    (simMonthlyRev * (scenario.paymentDelayDays / 30)) * 0.45;

  const monthNames = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
  const monthlySeries: SimulationResult['monthlySeries'] = [];

  let baseCash = kpi.availableCash;
  let simCash = kpi.availableCash;

  for (let idx = 0; idx < 6; idx++) {
    baseCash = baseCash + baselineMonthlyProfit;

    let monthSimCashFlow = simulatedMonthlyProfit;
    if (idx === 0) {
      monthSimCashFlow -= upfrontOutflow + delayWorkingCapitalDrag;
    } else if (idx === 5 && scenario.paymentDelayDays > 0) {
      // Partial recovery as delayed receivables stabilize
      monthSimCashFlow += delayWorkingCapitalDrag * 0.35;
    }
    simCash = simCash + monthSimCashFlow;

    monthlySeries.push({
      month: monthNames[idx],
      baselineCash: Math.round(baseCash),
      simulatedCash: Math.round(simCash),
      baselineProfit: Math.round(baselineMonthlyProfit),
      simulatedProfit: Math.round(simulatedMonthlyProfit),
    });
  }

  const runwayMonthsBaseline =
    baselineMonthlyExp > 0 ? kpi.availableCash / baselineMonthlyExp : 12;
  const minSimulatedCash = Math.min(...monthlySeries.map((m) => m.simulatedCash));
  const runwayMonthsSimulated =
    simMonthlyExp > 0
      ? Math.max(0, (kpi.availableCash - upfrontOutflow - delayWorkingCapitalDrag) / simMonthlyExp)
      : 12;

  let riskLevel: SimulationResult['riskLevel'] = 'Low';
  let riskSummary =
    'Projected cash reserves remain comfortably positive throughout the 6-month horizon.';

  if (minSimulatedCash < 0) {
    riskLevel = 'Critical';
    riskSummary =
      'Simulated upfront outflows or margin compression push projected cash below zero. Phased capex or credit line draw is advised.';
  } else if (minSimulatedCash < business.monthlyFixedOverhead * 1.2 || simulatedMonthlyProfit < 0) {
    riskLevel = 'High';
    riskSummary =
      'Cash buffer drops below 1.2x monthly fixed overhead or operating profit turns negative.';
  } else if (
    simulatedMonthlyProfit < baselineMonthlyProfit * 0.85 ||
    minSimulatedCash < kpi.availableCash * 0.65
  ) {
    riskLevel = 'Moderate';
    riskSummary =
      'Profitability or liquidity cushion narrows noticeably under this configuration; monitor collections closely.';
  }

  return {
    baselineSixMonthCash: Math.round(baseCash),
    simulatedSixMonthCash: Math.round(simCash),
    baselineMonthlyProfit: Math.round(baselineMonthlyProfit),
    simulatedMonthlyProfit: Math.round(simulatedMonthlyProfit),
    profitDeltaMonthly: Math.round(simulatedMonthlyProfit - baselineMonthlyProfit),
    cashDeltaSixMonth: Math.round(simCash - baseCash),
    runwayMonthsBaseline: Math.round(runwayMonthsBaseline * 10) / 10,
    runwayMonthsSimulated: Math.round(runwayMonthsSimulated * 10) / 10,
    riskLevel,
    riskSummary,
    monthlySeries,
  };
}
