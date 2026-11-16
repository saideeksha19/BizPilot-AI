import React, { useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  BusinessSize,
  BusinessType,
  CurrencyCode,
  DashboardPreference,
} from '../../types/financial';
import { Modal } from '../common/Modal';

const BUSINESS_TYPES: BusinessType[] = [
  'Retail',
  'Grocery',
  'Restaurant',
  'Startup',
  'Freelancer',
  'Service Business',
  'Home Business',
  'Other',
];

const CURRENCIES: { code: CurrencyCode; label: string }[] = [
  { code: 'INR', label: 'INR (₹) — Indian Rupee' },
  { code: 'USD', label: 'USD ($) — US Dollar' },
  { code: 'EUR', label: 'EUR (€) — Euro' },
  { code: 'GBP', label: 'GBP (£) — British Pound' },
];

const BUSINESS_SIZES: BusinessSize[] = [
  'Solo / Micro (1–5)',
  'Small (6–20)',
  'Growing (21–50)',
  'Mid-Size (51–200)',
];

const FY_STARTS = [
  'April (India FY)',
  'January (Calendar)',
  'July',
  'October',
];

const DASHBOARD_PREFS: {
  id: DashboardPreference;
  description: string;
}[] = [
  {
    id: 'Executive Balanced',
    description: 'Balanced view of revenue, profitability, liquidity, and risk alerts.',
  },
  {
    id: 'Cash Flow First',
    description: 'Prioritizes runway, cash inflows/outflows, and upcoming obligations.',
  },
  {
    id: 'Profitability & Margins',
    description: 'Highlights operating margins, category cost drivers, and profit trend.',
  },
  {
    id: 'Inventory & Operations',
    description: 'Emphasizes stock turnover, reorder risks, and supplier payables.',
  },
];

export function OnboardingModal() {
  const { onboardingOpen, setOnboardingOpen, onboardBusiness, isAuthenticated } = useApp();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [type, setType] = useState<BusinessType>('Retail');
  const [industry, setIndustry] = useState('Specialty Retail & Commerce');
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [country, setCountry] = useState('India');
  const [size, setSize] = useState<BusinessSize>('Small (6–20)');
  const [financialYearStart, setFinancialYearStart] = useState('April (India FY)');
  const [dashboardPreference, setDashboardPreference] =
    useState<DashboardPreference>('Executive Balanced');
  const [openingCashBalance, setOpeningCashBalance] = useState('650000');
  const [monthlyFixedOverhead, setMonthlyFixedOverhead] = useState('185000');
  const [gstRegistered, setGstRegistered] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleClose = () => {
    if (submitting) return;
    setOnboardingOpen(false);
    setStep(1);
    setError('');
  };

  const handleNext = () => {
    if (step === 1 && !name.trim()) {
      setError('Please enter your business name to continue.');
      return;
    }
    setError('');
    setStep((s) => Math.min(3, s + 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Business name is required.');
      setStep(1);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onboardBusiness({
        name: name.trim(),
        type,
        industry: industry.trim() || `${type} Operations`,
        currency,
        country: country.trim() || 'India',
        size,
        financialYearStart,
        dashboardPreference,
        gstRegistered,
        openingCashBalance: Number(openingCashBalance) || 0,
        monthlyFixedOverhead: Number(monthlyFixedOverhead) || 0,
      });
      setName('');
      setStep(1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to create business workspace.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={onboardingOpen}
      onClose={handleClose}
      title="Onboard a New Business"
      subtitle="Your Business. Your Financial Intelligence. Your Next Move."
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Step Progress */}
        <div className="flex items-center justify-between text-xs border-b border-slate-200 dark:border-white/8 pb-3">
          {[
            { num: 1, label: '01. Business Identity' },
            { num: 2, label: '02. Fiscal & Scale' },
            { num: 3, label: '03. Command Preferences' },
          ].map((item) => (
            <button
              key={item.num}
              type="button"
              onClick={() => {
                if (item.num < step || name.trim()) setStep(item.num);
              }}
              className={`font-medium transition-colors ${
                step === item.num
                  ? 'text-violet-600 dark:text-violet-400'
                  : step > item.num
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label htmlFor="ob-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Business Name *
              </label>
              <input
                id="ob-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Horizon Roasters & Bakery"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Business Type
              </label>
              <div role="group" aria-label="Business Type" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {BUSINESS_TYPES.map((bt) => (
                  <button
                    key={bt}
                    type="button"
                    onClick={() => setType(bt)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors ${
                      type === bt
                        ? 'border-violet-600 bg-violet-600/10 text-violet-700 dark:text-violet-300'
                        : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    {bt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="ob-industry" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Industry / Sub-sector
              </label>
              <input
                id="ob-industry"
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g., Artisanal Food & Beverage"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ob-currency" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Reporting Currency
              </label>
              <select
                id="ob-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f] text-slate-900 dark:text-slate-100"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ob-country" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Country
              </label>
              <input
                id="ob-country"
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="ob-size" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Business Size
              </label>
              <select
                id="ob-size"
                value={size}
                onChange={(e) => setSize(e.target.value as BusinessSize)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f] text-slate-900 dark:text-slate-100"
              >
                {BUSINESS_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ob-fy" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Financial Year Start
              </label>
              <select
                id="ob-fy"
                value={financialYearStart}
                onChange={(e) => setFinancialYearStart(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#22323f] text-slate-900 dark:text-slate-100"
              >
                {FY_STARTS.map((fy) => (
                  <option key={fy} value={fy}>
                    {fy}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ob-cash" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Starting Cash Reserve ({currency})
              </label>
              <input
                id="ob-cash"
                type="number"
                value={openingCashBalance}
                onChange={(e) => setOpeningCashBalance(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="ob-overhead" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Est. Monthly Fixed Overhead ({currency})
              </label>
              <input
                id="ob-overhead"
                type="number"
                value={monthlyFixedOverhead}
                onChange={(e) => setMonthlyFixedOverhead(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-num rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="sm:col-span-2 flex items-center gap-2.5 pt-1">
              <input
                id="gst-check"
                type="checkbox"
                checked={gstRegistered}
                onChange={(e) => setGstRegistered(e.target.checked)}
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <label
                htmlFor="gst-check"
                className="text-xs text-slate-600 dark:text-slate-300"
              >
                GST / VAT registered entity (enables tax liability tracking)
              </label>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Preferred Dashboard Configuration
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {DASHBOARD_PREFS.map((pref) => (
                  <button
                    key={pref.id}
                    type="button"
                    onClick={() => setDashboardPreference(pref.id)}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      dashboardPreference === pref.id
                        ? 'border-violet-600 bg-violet-600/10'
                        : 'border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {pref.id}
                      </span>
                      {dashboardPreference === pref.id && (
                        <Check className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {pref.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/8 text-xs space-y-1">
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                Workspace Summary ·{' '}
                {isAuthenticated ? 'Live Cloud PostgreSQL Workspace' : 'Illustrative Starter Ledger'}
              </div>
              <div className="text-slate-500 dark:text-slate-400">
                {name || 'New Business'} · {type} · {country} ({currency}) · {size} · FY {financialYearStart}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-white/8">
          {step > 1 ? (
            <button
              type="button"
              disabled={submitting}
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Back
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleClose}
              className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Cancel
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1 px-4 py-2 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white"
            >
              Continue
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white"
            >
              <Check className="w-3.5 h-3.5" />
              {submitting ? 'Initializing...' : 'Initialize Business Workspace'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
