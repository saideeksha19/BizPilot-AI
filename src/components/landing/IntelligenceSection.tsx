import React from 'react';
import { MessageSquareText, Network, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { Reveal, StaggerLines } from '../motion/Reveal';

const CAPABILITIES = [
  {
    index: '01',
    icon: Network,
    title: 'Financial Digital Twin',
    description:
      'Understand the current financial state of your business — assets, obligations and liquidity, held in one living model.',
  },
  {
    index: '02',
    icon: TrendingUp,
    title: 'Predictive Financial Intelligence',
    description:
      'Anticipate cash flow and future financial conditions with transparent 7, 30 and 90 day projections.',
  },
  {
    index: '03',
    icon: SlidersHorizontal,
    title: 'What-If Business Simulator',
    description:
      'Explore possible decisions before implementing them — pricing, hiring, stock, capex and expansion.',
  },
  {
    index: '04',
    icon: MessageSquareText,
    title: 'Explainable AI Copilot',
    description:
      'Ask questions and receive meaningful financial guidance, grounded in your own ledger and clearly explained.',
  },
];

export function IntelligenceSection() {
  return (
    <section id="intelligence" className="relative bg-[var(--paper-soft)]">
      <div className="mx-auto w-full max-w-[1320px] px-5 py-24 sm:px-8 sm:py-28 lg:px-12 lg:py-36">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Reveal>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-[#b69a68]" aria-hidden="true" />
                <span className="eyebrow">03 — Intelligence</span>
              </div>
            </Reveal>
            <StaggerLines className="mt-7" delay={0.05} step={0.1}>
              <h2 className="max-w-[18ch] font-display text-[clamp(2.1rem,4.6vw,3.6rem)] font-normal leading-[1.06] tracking-[-0.025em] text-[#263746]">
                Beyond Numbers. Into Intelligence.
              </h2>
            </StaggerLines>
          </div>
          <Reveal delay={0.18} className="lg:col-span-5">
            <p className="max-w-[40ch] border-l border-[#b69a68]/45 pl-5 text-[13.5px] leading-[1.9] text-[#5c6a72] lg:ml-auto">
              Four connected capabilities turn recorded activity into perspective — so each decision
              is taken with the whole business in view.
            </p>
          </Reveal>
        </div>

        <div id="features" className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:mt-20 lg:gap-5">
          {CAPABILITIES.map((capability, index) => {
            const Icon = capability.icon;
            return (
              <Reveal key={capability.title} delay={index * 0.08} y={26}>
                <article className="landing-card group flex h-full flex-col justify-between p-7 sm:p-8 lg:p-9">
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="card-icon flex h-11 w-11 items-center justify-center border border-[var(--line-strong)] bg-[var(--paper)] text-[#34495e]">
                        <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                      </div>
                      <span className="font-display text-[11px] tracking-[0.2em] text-[#5b6e7a]">
                        {capability.index}
                      </span>
                    </div>

                    <h3 className="mt-8 font-display text-[clamp(1.2rem,2vw,1.5rem)] font-normal leading-snug text-[#263746]">
                      {capability.title}
                    </h3>
                    <p className="mt-3 max-w-[42ch] text-[13.5px] leading-[1.85] text-[#5c6a72]">
                      {capability.description}
                    </p>
                  </div>

                  <div className="mt-8 flex items-center gap-3">
                    <span className="h-px flex-1 bg-[var(--line)] transition-colors duration-500 group-hover:bg-[#b69a68]/60" aria-hidden="true" />
                    <span className="text-[9px] uppercase tracking-[0.26em] text-[#5b6e7a] transition-colors duration-500 group-hover:text-[#b69a68]">
                      Capability
                    </span>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
