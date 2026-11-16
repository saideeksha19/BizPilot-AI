import React from 'react';
import { ArrowDown, ArrowRight, Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { RouteId } from '../../types/financial';
import heroDashboard from '../../assets/images/hero-finance-dashboard.webp';

interface HeroSectionProps {
  onEnter: (route?: RouteId) => void;
}

export function HeroSection({ onEnter }: HeroSectionProps) {
  const reduceMotion = useReducedMotion();

  const rise = (delay: number) =>
    reduceMotion
      ? {}
      : {
          initial: { opacity: 0, y: 26 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 1.1, delay, ease: [0.16, 0.84, 0.24, 1] as const },
        };

  const settle = reduceMotion
    ? {}
    : {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 1.4, delay: 0.3, ease: [0.16, 0.84, 0.24, 1] as const },
      };

  return (
    <section id="top" className="relative isolate min-h-[100svh] overflow-hidden xl:min-h-0">
      <div className="grid min-h-[100svh] grid-cols-1 xl:min-h-0 xl:grid-cols-[minmax(0,48fr)_minmax(0,52fr)]">
        {/* Deep stone blue — project introduction */}
        <div className="hero-deep grain relative flex flex-col justify-center px-5 pb-14 pt-28 sm:px-10 sm:pb-16 sm:pt-32 lg:px-12 lg:py-24 xl:px-14 xl:pb-14 xl:pt-24 2xl:px-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f5f0e6]/25 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-8 top-24 hidden h-20 w-px bg-gradient-to-b from-transparent via-[#b69a68]/70 to-transparent lg:block"
          />

          <motion.div {...rise(0.05)} className="flex items-center gap-3">
            <span className="text-[#b69a68]" aria-hidden="true">
              ✦
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.34em] text-[#f5f0e6]/65 sm:text-[11px]">
              AI-Powered Financial Intelligence
            </span>
          </motion.div>

          {/* Hanging editorial title treatment */}
          <div className="relative mt-8 sm:mt-10">
            <span
              aria-hidden="true"
              className="absolute -top-7 left-[3px] hidden h-7 w-px bg-[#f5f0e6]/25 sm:block"
            />
            <span
              aria-hidden="true"
              className="absolute -top-7 left-[7px] hidden h-2 w-2 -translate-x-1/2 rotate-45 border border-[#b69a68]/70 sm:block"
            />

            <div className="flex gap-4 sm:gap-6">
              <div aria-hidden="true" className="vertical-rule mt-2 shrink-0 sm:mt-3" />
              <div className="min-w-0">
                <h1 className="font-display text-[clamp(3rem,11.2vw,8.6rem)] font-normal leading-[0.86] tracking-[-0.035em] text-[#f5f0e6] xl:text-[clamp(2.75rem,6.6vw,7.6rem)]">
                  <span className="block">BIZPILOT</span>
                  <span className="mt-2 flex items-baseline gap-4 sm:mt-3 sm:gap-6">
                    <span>AI</span>
                    <span
                      className="relative top-[-0.22em] text-[0.26em] text-[#b69a68]"
                      aria-hidden="true"
                    >
                      ✦
                    </span>
                    <span
                      className="hidden h-px flex-1 bg-[#f5f0e6]/20 xl:block"
                      aria-hidden="true"
                    />
                  </span>
                </h1>
              </div>
            </div>
          </div>

          <motion.p
            {...rise(0.22)}
            className="mt-8 max-w-[26ch] font-display text-[clamp(1.3rem,2.4vw,1.85rem)] font-normal italic leading-[1.26] text-[#f5f0e6]/92 sm:mt-9 xl:text-[clamp(1.4rem,1.9vw,1.9rem)]"
          >
            Your Business. Your Financial Intelligence. Your Next Move.
          </motion.p>

          <motion.p
            {...rise(0.32)}
            className="mt-6 max-w-[44ch] text-[13.5px] leading-[1.85] text-[#f5f0e6]/62 sm:text-[14.5px]"
          >
            BizPilot AI is an AI-powered financial intelligence platform for growing businesses —
            bringing your ledger, cash flow, forecasts and decisions into one clear, living view.
          </motion.p>

          <motion.div
            {...rise(0.42)}
            className="mt-9 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4"
          >
            <a href="#dashboard" className="btn btn-ivory group !px-6 !py-[1.05rem]">
              <span>Explore the Platform</span>
              <ArrowDown className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-y-0.5" />
            </a>
            <button
              type="button"
              onClick={() => onEnter()}
              className="btn btn-outline-ivory group !px-6 !py-[1.05rem]"
            >
              <span>Get Started</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-500 group-hover:translate-x-0.5" />
            </button>
          </motion.div>

          <motion.div
            {...rise(0.54)}
            className="mt-10 flex flex-wrap items-center gap-4 text-[10px] uppercase tracking-[0.28em] text-[#f5f0e6]/40 sm:mt-12"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-[#b69a68]" aria-hidden="true" />
              Illustrative demo workspace
            </span>
            <span className="hidden h-px w-10 bg-[#f5f0e6]/20 sm:block" aria-hidden="true" />
            <span className="hidden sm:inline">No card required</span>
          </motion.div>
        </div>

        {/* Ivory plate — supplied finance dashboard illustration */}
        <aside className="hero-aside relative flex items-center justify-center overflow-hidden border-t border-[#34495e]/12 px-5 py-12 sm:px-10 sm:py-16 lg:py-20 xl:border-l xl:border-t-0 xl:px-4 xl:py-10 2xl:px-8">
          <motion.div {...settle} className="relative w-full max-w-[980px]">
            <img
              src={heroDashboard}
              alt="Illustrative finance dashboard showing business growth of 24.8%, cash flow of $48,750, a financial health score of 92 out of 100, and rising revenue on a laptop screen."
              width={1600}
              height={900}
              loading="eager"
              decoding="async"
              className="block h-auto w-full select-none"
            />
            {/* Feather the artwork's edges into the ivory plate */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#fdf6eb] via-[#fdf6eb]/60 to-transparent"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#fdf6eb] via-[#fdf6eb]/70 to-transparent"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#fdf6eb] to-transparent"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#fdf6eb] to-transparent"
            />
          </motion.div>
        </aside>
      </div>

      {/* Subtle scroll indicator (full-height heroes only) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-5 xl:hidden">
        <div className="flex items-center gap-3 text-[9px] uppercase tracking-[0.32em] text-[#f5f0e6]/45 mix-blend-difference">
          <span className="hidden sm:inline">Scroll</span>
          <span
            className="relative block h-10 w-px overflow-hidden bg-[#f5f0e6]/20"
            aria-hidden="true"
          >
            <span className="scroll-cue-line absolute inset-x-0 top-0 h-6 bg-[#b69a68]" />
          </span>
        </div>
      </div>
    </section>
  );
}
