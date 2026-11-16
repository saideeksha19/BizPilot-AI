import React from 'react';
import { CurrencyCode, SimulatorScenario } from '../../types/financial';
import { formatCurrency } from '../../utils/formatters';

interface ScenarioControlsProps {
  scenario: SimulatorScenario;
  currency: CurrencyCode;
  onChange: (next: SimulatorScenario) => void;
}

export function ScenarioControls({
  scenario,
  currency,
  onChange,
}: ScenarioControlsProps) {
  const update = <K extends keyof SimulatorScenario>(
    key: K,
    value: SimulatorScenario[K]
  ) => {
    onChange({ ...scenario, [key]: value });
  };

  return (
    <div className="space-y-5">
      {/* Sales Volume Change */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="sim-sales" className="font-medium text-slate-700 dark:text-slate-200">
            Sales Revenue Change
          </label>
          <span className="font-mono-num font-semibold text-violet-600 dark:text-violet-400">
            {scenario.salesChangePct > 0 ? `+${scenario.salesChangePct}%` : `${scenario.salesChangePct}%`}
          </span>
        </div>
        <input
          id="sim-sales"
          type="range"
          min={-50}
          max={100}
          step={1}
          value={scenario.salesChangePct}
          onChange={(e) => update('salesChangePct', Number(e.target.value))}
          className="w-full accent-violet-600"
        />
        <div className="flex justify-between text-[11px] font-mono-num text-slate-400">
          <span>-50%</span>
          <span>0%</span>
          <span>+100%</span>
        </div>
      </div>

      {/* Supplier Price Change */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="sim-supplier" className="font-medium text-slate-700 dark:text-slate-200">
            Supplier / COGS Price Change
          </label>
          <span className="font-mono-num font-semibold text-blue-600 dark:text-blue-400">
            {scenario.supplierPriceChangePct > 0
              ? `+${scenario.supplierPriceChangePct}%`
              : `${scenario.supplierPriceChangePct}%`}
          </span>
        </div>
        <input
          id="sim-supplier"
          type="range"
          min={-30}
          max={50}
          step={1}
          value={scenario.supplierPriceChangePct}
          onChange={(e) => update('supplierPriceChangePct', Number(e.target.value))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-[11px] font-mono-num text-slate-400">
          <span>-30%</span>
          <span>0%</span>
          <span>+50%</span>
        </div>
      </div>

      {/* Customer Payment Delays */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="sim-delay" className="font-medium text-slate-700 dark:text-slate-200">
            Customer Payment Delay
          </label>
          <span className="font-mono-num font-semibold text-amber-600 dark:text-amber-400">
            {scenario.paymentDelayDays} days
          </span>
        </div>
        <input
          id="sim-delay"
          type="range"
          min={0}
          max={60}
          step={5}
          value={scenario.paymentDelayDays}
          onChange={(e) => update('paymentDelayDays', Number(e.target.value))}
          className="w-full accent-amber-500"
        />
      </div>

      {/* Additional Staff Hired */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Additional Employees
          </label>
          <input
            type="number"
            min={0}
            max={25}
            value={scenario.additionalEmployees}
            onChange={(e) =>
              update('additionalEmployees', Math.max(0, Number(e.target.value)))
            }
            className="w-full px-3 py-1.5 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Avg Monthly Salary ({currency})
          </label>
          <input
            type="number"
            min={0}
            step={1000}
            value={scenario.avgMonthlySalary}
            onChange={(e) =>
              update('avgMonthlySalary', Math.max(0, Number(e.target.value)))
            }
            className="w-full px-3 py-1.5 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
          />
        </div>
      </div>

      {/* Inventory & Equipment Capex */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            New Inventory Stock ({currency})
          </label>
          <input
            type="number"
            min={0}
            step={10000}
            value={scenario.newInventoryPurchase}
            onChange={(e) =>
              update('newInventoryPurchase', Math.max(0, Number(e.target.value)))
            }
            className="w-full px-3 py-1.5 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Equipment Purchase ({currency})
          </label>
          <input
            type="number"
            min={0}
            step={10000}
            value={scenario.equipmentPurchase}
            onChange={(e) =>
              update('equipmentPurchase', Math.max(0, Number(e.target.value)))
            }
            className="w-full px-3 py-1.5 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
          />
        </div>
      </div>

      {/* New Business Location Toggle */}
      <div className="pt-2 border-t border-slate-100 dark:border-white/[0.06] space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
            Open New Business Location
          </span>
          <input
            type="checkbox"
            checked={scenario.openNewLocation}
            onChange={(e) => update('openNewLocation', e.target.checked)}
            className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
          />
        </label>

        {scenario.openNewLocation && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                Monthly Rent ({currency})
              </label>
              <input
                type="number"
                min={0}
                step={5000}
                value={scenario.newLocationMonthlyRent}
                onChange={(e) =>
                  update('newLocationMonthlyRent', Math.max(0, Number(e.target.value)))
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                One-time Setup ({currency})
              </label>
              <input
                type="number"
                min={0}
                step={25000}
                value={scenario.newLocationSetupCost}
                onChange={(e) =>
                  update('newLocationSetupCost', Math.max(0, Number(e.target.value)))
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
              />
            </div>
          </div>
        )}

        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-num">
          Est. Upfront Outflow:{' '}
          {formatCurrency(
            scenario.newInventoryPurchase +
              scenario.equipmentPurchase +
              (scenario.openNewLocation ? scenario.newLocationSetupCost : 0),
            currency
          )}
        </div>
      </div>
    </div>
  );
}
