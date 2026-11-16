import React from 'react';
import { ArrowRight, ArrowUpRight, Sparkles, TrendingUp } from 'lucide-react';
import { Reveal, StaggerLines } from '../motion/Reveal';
import { RouteId } from '../../types/financial';

interface ProductSectionProps {
  onEnter: (route?: RouteId) => void;
}

const MODULES: { route: RouteId; label: string }[] = [
  { route: 'overview', label: 'Overview' },
  { route: 'financial-twin', label: 'Financial Twin' },
  { route: 'transactions', label: 'Transactions' },
  { route: 'invoices', label: 'Invoices' },
  { route: 'cash-flow', label: 'Cash Flow' },
  { route: 'simulator', label: 'Simulator' },
  { route: 'risk-radar', label: 'Risk Radar' },
  { route: 'inventory', label: 'Inventory' },
  { route: 'copilot', label: 'Copilot' },
  { route: 'reports', label: 'Reports' },
  { route: 'settings', label: 'Settings' },
  { route: 'team', label: 'Team' },
  { route: 'help', label: 'Help' },
];

const KPI_PREVIEW = [
  { label: 'Revenue', value: '₹24.8L', delta: '+12.4%', positive: true },
  { label: 'Net Profit', value: '₹6.2L', delta: '+18.1%', positive: true },
  { label: 'Cash Balance', value: '₹18.4L', delta: '+4.6%', positive: true },
  { label: 'Health Score', value: '82', delta: 'Strong', positive: true },
];

export function ProductSection({ onEnter }: ProductSectionProps) {
  return (
    <section id="dashboard" className="relative">
      {/* Deep stone band — the bridge from brand to product */}
      <div className="hero-deep grain relative overflow-hidden pb-44 pt-24 sm:pt-28 lg:pb-52 lg:pt-32">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-[#f5f0e6]/10 to-transparent"
        />
        <div className="relative mx-auto w-full max-w-[1320px] px-5 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-[46rem] text-center">
            <Reveal>
              <div className="flex items-center justify-center gap-3">
                <span className="h-px w-8 bg-[#b69a68]" aria-hidden="true" />
                <span className="text-[10px] font-medium uppercase tracking-[0.3em] text-[#f5f0e6]/55">
                  04 — The Platform
                </span>
                <span className="h-px w-8 bg-[#b69a68]" aria-hidden="true" />
              </div>
            </Reveal>

            <StaggerLines className="mt-8" delay={0.05} step={0.11}>
              <h2 className="font-display text-[clamp(2.15rem,4.8vw,3.8rem)] font-normal leading-[1.06] tracking-[-0.03em] text-[#f5f0e6]">
                Meet Your Financial Intelligence Platform.
              </h2>
            </StaggerLines>

            <Reveal delay={0.2}>
              <p className="mx-auto mt-7 max-w-[44ch] text-[14px] leading-[1.9] text-[#f5f0e6]/60 sm:text-[15px]">
                One connected workspace. A clearer picture of your business. Smarter decisions at
                every step.
              </p>
            </Reveal>

            <Reveal delay={0.3} className="mt-10 flex flex-col items-center gap-6">
              <div className="flex items-center gap-4 text-[#f5f0e6]/40">
                <span className="h-px w-10 bg-[#f5f0e6]/20" aria-hidden="true" />
                <span aria-hidden="true" className="text-[#b69a68]">✦</span>
                <span className="h-px w-10 bg-[#f5f0e6]/20" aria-hidden="true" />
              </div>

              <p className="font-display text-[clamp(1rem,1.6vw,1.2rem)] italic text-[#f5f0e6]/80">
                BizPilot AI — Financial Intelligence Dashboard
              </p>

              <button
                type="button"
                onClick={() => onEnter('overview')}
                className="btn btn-ivory group !px-7 !py-[1.1rem]"
              >
                <span>Enter Your Workspace</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-1" />
              </button>

              <p className="max-w-[36ch] text-balance text-[9px] uppercase leading-relaxed tracking-[0.26em] text-[#f5f0e6]/40">
                Demo Mode ready · Live Cloud available
              </p>
            </Reveal>
          </div>
        </div>
      </div>

      {/* Illustrative dashboard preview — overlaps the band */}
      <div className="relative mx-auto -mt-32 w-full max-w-[1320px] px-4 pb-24 sm:px-8 lg:-mt-36 lg:px-12">
        <Reveal y={34}>
          <div className="overflow-hidden border border-[#34495e]/15 bg-[var(--surface)] shadow-[0_50px_120px_-70px_rgba(38,55,70,0.65)]">
            {/* Window bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3.5 sm:px-7">
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center border border-[#34495e]/20 font-display text-[10px] text-[#34495e]">
                  B
                </span>
                <span className="text-[10px] uppercase tracking-[0.24em] text-[#5c6a72]">
                  Executive Overview
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 border border-[#b69a68]/40 px-2.5 py-1 text-[9px] uppercase tracking-[0.18em] text-[#7d6338]">
                  <span className="h-1 w-1 rounded-full bg-[#b69a68]" aria-hidden="true" />
                  Illustrative demo data
                </span>
                <button
                  type="button"
                  onClick={() => onEnter('overview')}
                  className="hidden items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[#34495e] transition-colors hover:text-[#b69a68] sm:inline-flex"
                >
                  Open
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-px bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
              {KPI_PREVIEW.map((kpi) => (
                <div key={kpi.label} className="bg-[var(--surface)] px-5 py-5 sm:px-6">
                  <div className="text-[9px] uppercase tracking-[0.24em] text-[#5b6e7a]">
                    {kpi.label}
                  </div>
                  <div className="mt-2.5 font-display font-mono-num text-[26px] leading-none tracking-tight text-[#263746]">
                    {kpi.value}
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#4c7660]">
                    <TrendingUp className="h-3 w-3" aria-hidden="true" />
                    {kpi.delta}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-px bg-[var(--line)] lg:grid-cols-3">
              {/* Chart */}
              <div className="bg-[var(--surface)] p-5 sm:p-6 lg:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-display text-[15px] text-[#263746]">
                      Revenue & Expense Performance
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[#5b6e7a]">
                      Last 12 periods
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.16em] text-[#5f6a70]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-[3px] w-4 bg-[#34495e]" aria-hidden="true" />
                      Revenue
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-[3px] w-4 bg-[#91a6b5]" aria-hidden="true" />
                      Expense
                    </span>
                  </div>
                </div>

                <div className="mt-5">
                  <svg viewBox="0 0 640 190" className="w-full" role="img" aria-label="Illustrative revenue and expense chart">
                    {[0, 1, 2, 3].map((line) => (
                      <line
                        key={line}
                        x1="0"
                        x2="640"
                        y1={24 + line * 44}
                        y2={24 + line * 44}
                        stroke="rgba(52,73,94,0.1)"
                        strokeDasharray="3 5"
                      />
                    ))}
                    <path
                      d="M0 150 L53 138 L106 142 L159 118 L212 126 L265 96 L318 104 L371 78 L424 86 L477 60 L530 66 L583 40 L636 30 L636 190 L0 190 Z"
                      fill="rgba(52,73,94,0.08)"
                    />
                    <path
                      d="M0 150 L53 138 L106 142 L159 118 L212 126 L265 96 L318 104 L371 78 L424 86 L477 60 L530 66 L583 40 L636 30"
                      fill="none"
                      stroke="#34495e"
                      strokeWidth="1.8"
                    />
                    <path
                      d="M0 166 L53 160 L106 168 L159 152 L212 158 L265 146 L318 150 L371 138 L424 144 L477 132 L530 138 L583 124 L636 118"
                      fill="none"
                      stroke="#91a6b5"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                    <circle cx="583" cy="40" r="3.5" fill="#b69a68" />
                  </svg>
                </div>
              </div>

              {/* Alerts + Copilot */}
              <div className="flex flex-col gap-px bg-[var(--line)]">
                <div className="flex-1 bg-[var(--surface)] p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.22em] text-[#5b6e7a]">
                      Risk Radar
                    </span>
                    <span className="text-[10px] font-mono-num text-[#7d6338]">2 open</span>
                  </div>
                  <ul className="mt-4 space-y-3">
                    {[
                      { title: 'Overdue receivables', meta: '₹1.4L · 3 invoices', tone: '#9c8254' },
                      { title: 'Cash cushion tightening', meta: 'Day 24 · ₹0.9L low', tone: '#8e4a43' },
                    ].map((alert) => (
                      <li key={alert.title} className="flex items-start gap-2.5">
                        <span
                          className="mt-1.5 h-1 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: alert.tone }}
                          aria-hidden="true"
                        />
                        <div>
                          <div className="text-[12px] text-[#34495e]">{alert.title}</div>
                          <div className="text-[10px] font-mono-num text-[#5b6e7a]">{alert.meta}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-[var(--paper)] p-5 sm:p-6">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-[#5b6e7a]">
                    <Sparkles className="h-3 w-3 text-[#b69a68]" aria-hidden="true" />
                    AI Copilot
                  </div>
                  <p className="mt-3 font-display text-[13px] italic leading-relaxed text-[#34495e]">
                    “Collecting overdue invoices would extend runway by roughly six weeks.”
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-5 py-3 text-[9px] uppercase tracking-[0.22em] text-[#5b6e7a] sm:px-7">
              <span>Financial Digital Twin · Connected</span>
              <span>Illustrative figures for demonstration only</span>
            </div>
          </div>
        </Reveal>

        {/* Module index — the real bridge into all 13 routes */}
        <div className="mt-14">
          <Reveal>
            <div className="flex flex-col gap-3 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="eyebrow">The Workspace</span>
                <p className="mt-3 font-display text-[clamp(1.3rem,2.2vw,1.7rem)] leading-snug text-[#263746]">
                  Thirteen modules. One connected view.
                </p>
              </div>
              <p className="max-w-[38ch] text-[12.5px] leading-relaxed text-[#5f6a70]">
                Every module below is the working application — no mock screens. Enter any of them
                directly, in illustrative demo mode or your live cloud workspace.
              </p>
            </div>
          </Reveal>

          <div className="mt-6 grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((module, index) => (
              <Reveal key={module.route} delay={Math.min(index * 0.03, 0.24)} y={12}>
                <button
                  type="button"
                  onClick={() => onEnter(module.route)}
                  className="group flex w-full items-center justify-between border-b border-[var(--line)] py-3.5 text-left transition-colors duration-400 hover:border-[#b69a68]/60"
                >
                  <span className="flex items-baseline gap-4">
                    <span className="font-mono-num text-[10px] text-[#7d6544]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[13px] tracking-[0.01em] text-[#34495e] transition-colors group-hover:text-[#263746]">
                      {module.label}
                    </span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 -translate-x-1 text-[#5b6e7a] opacity-0 transition-all duration-400 group-hover:translate-x-0 group-hover:opacity-100" />
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
