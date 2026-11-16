import React from 'react';
import { Reveal, StaggerLines } from '../motion/Reveal';
import aboutEcosystem from '../../assets/images/about-financial-ecosystem.webp';

export function AboutSection() {
  return (
    <section id="about" className="relative border-b border-[var(--line)] bg-[var(--paper)]">
      <div className="mx-auto w-full max-w-[1320px] px-5 py-24 sm:px-8 sm:py-28 lg:px-12 lg:py-32">
        <div className="grid grid-cols-1 gap-x-10 gap-y-12 lg:grid-cols-[minmax(0,52fr)_minmax(0,48fr)] lg:items-center lg:gap-x-12">
          <div className="lg:row-start-1 lg:col-start-1">
            <Reveal>
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-[#b69a68]" aria-hidden="true" />
                <span className="eyebrow">02 — The Business</span>
              </div>
            </Reveal>

            <StaggerLines className="mt-7" itemClassName="" delay={0.06} step={0.1}>
              <h2 className="max-w-[19ch] font-display text-[clamp(2.1rem,4.6vw,3.6rem)] font-normal leading-[1.06] tracking-[-0.025em] text-[#263746]">
                A Better Way to Understand Your Business.
              </h2>
            </StaggerLines>

            <Reveal
              delay={0.16}
              className="mt-8 max-w-[54ch] space-y-5 text-[14.5px] leading-[1.9] text-[#5c6a72] sm:text-[15px]"
            >
              <p>
                Running a business involves more than tracking numbers. It means understanding
                financial health, anticipating risks, managing cash flow, and knowing which
                decisions will move your business forward.
              </p>
              <p className="text-[#34495e]">
                BizPilot AI brings these insights together in one intelligent financial workspace.
              </p>
            </Reveal>
          </div>

          {/* Supplied financial ecosystem illustration */}
          <Reveal
            delay={0.2}
            className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center"
          >
            <div className="relative mx-auto w-full max-w-[620px]">
              <img
                src={aboutEcosystem}
                alt="Illustration of a connected financial ecosystem: a central business headquarters linked to cash, analytics, growth, inventory, balance and forecasting."
                width={1200}
                height={896}
                loading="lazy"
                decoding="async"
                className="block h-auto w-full object-contain"
              />
              {/* Feather the artwork's edges into the ivory ground */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-[#f5f0e6] via-[#f5f0e6]/55 to-transparent"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#f5f0e6] via-[#f5f0e6]/55 to-transparent"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#f5f0e6] to-transparent"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#f5f0e6] to-transparent"
              />
            </div>
          </Reveal>

          <Reveal
            delay={0.26}
            className="mt-1 grid grid-cols-1 gap-px border-t border-[var(--line)] sm:grid-cols-3 lg:col-start-1 lg:row-start-2 lg:mt-2"
          >
            {[
              { label: 'Health', value: 'A live score' },
              { label: 'Foresight', value: '7 / 30 / 90 days' },
              { label: 'Decisions', value: 'Simulated first' },
            ].map((item) => (
              <div
                key={item.label}
                className="group border-b border-[var(--line)] py-5 pr-4 transition-colors duration-500 hover:border-[#b69a68]/50 sm:border-b-0 sm:border-r sm:pl-5 sm:first:pl-0 sm:last:border-r-0"
              >
                <div className="text-[9px] uppercase tracking-[0.28em] text-[#5b6e7a]">
                  {item.label}
                </div>
                <div className="mt-2 font-display text-[15px] text-[#34495e]">{item.value}</div>
              </div>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
