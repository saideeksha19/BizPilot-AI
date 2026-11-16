import React, { useState } from 'react';
import { ChevronDown, HelpCircle, Send } from 'lucide-react';
import { useApp } from '../context/AppContext';

const FAQS = [
  {
    q: 'How does BizPilot AI separate Demo Mode from Live Cloud Mode?',
    a: 'When signed out, BizPilot AI runs in Illustrative Demo Mode with synthetic business datasets stored locally in your browser. Signing in connects your workspace to the FastAPI + PostgreSQL ledger, Decimal intelligence engine, and Gemini Copilot, with every figure labeled as ACTUAL, ESTIMATED, FORECASTED, or HYPOTHETICAL.',
  },
  {
    q: 'How does the Financial Digital Twin separate Actual vs Forecasted values?',
    a: 'Historical closed periods use recorded transaction totals (Actual Ledger), the current incomplete month combines MTD actuals with run-rate extrapolation (Estimated MTD), and future months apply deterministic revenue/expense trend models (Forecasted).',
  },
  {
    q: 'How are What-If Simulator outputs calculated?',
    a: 'The simulator evaluates cash-flow sensitivity against your current baseline without mutating your financial ledger. Adjusting sales %, supplier pricing %, payment delays, staffing, inventory, or new location capex recalculates monthly operating profit, 6-month cash trajectory, and liquidity risk.',
  },
  {
    q: 'Can I test BizPilot AI with my own business type?',
    a: 'Yes. Open the Business Selector in the sidebar or top header and click "Add New Business" to walk through the 3-step onboarding wizard for Retail, Grocery, Restaurant, Startup, Freelancer, Service, or Home Business profiles.',
  },
];

export function HelpSupportPage() {
  const { showToast, resetDemoData, isBackendMode } = useApp();
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    showToast(isBackendMode ? 'Workspace feedback note recorded' : 'Support note logged in demo session');
    setSubject('');
    setMessage('');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="pb-4 border-b border-slate-200 dark:border-white/8">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          BizPilot AI — Help & Workspace Guide
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Your Business. Your Financial Intelligence. Your Next Move.
        </p>
      </div>

      {/* FAQ Accordion */}
      <div className="rounded-xl bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 divide-y divide-slate-100 dark:divide-white/[0.06]">
        {FAQS.map((item, idx) => (
          <div key={item.q} className="p-4 sm:p-5">
            <button
              type="button"
              onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              className="w-full flex items-center justify-between gap-4 text-left"
            >
              <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
                {item.q}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                  openIdx === idx ? 'rotate-180' : ''
                }`}
              />
            </button>
            {openIdx === idx && (
              <p className="mt-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {item.a}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Support Request & Demo Reset */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <form
          onSubmit={handleSubmit}
          className="md:col-span-8 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 space-y-3.5"
        >
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Send Workspace Feedback
            </h3>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Topic</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g., Question about GST invoice exports"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Details</label>
            <textarea
              rows={3}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe what you would like help with..."
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04]"
            />
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium"
          >
            <Send className="w-3.5 h-3.5" />
            Submit Note
          </button>
        </form>

        <div className="md:col-span-4 rounded-xl p-5 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {isBackendMode ? 'Cloud Workspace Status' : 'Demo Environment Controls'}
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {isBackendMode
                ? 'Your authenticated workspace saves transactions, invoices, inventory movements, and Copilot threads directly to the cloud financial ledger.'
                : 'Changes to transactions, invoices, inventory, and onboarded businesses persist locally. Reset anytime to restore the original illustrative datasets.'}
            </p>
          </div>
          {!isBackendMode && (
            <button
              type="button"
              onClick={resetDemoData}
              className="mt-4 w-full py-2 px-3 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            >
              Restore Default Demo Data
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
