import React from 'react';
import { RouteId } from '../../types/financial';

interface LandingFooterProps {
  onEnter: (route?: RouteId) => void;
  onSignIn: () => void;
}

const COLUMNS: {
  title: string;
  links: { label: string; href?: string; route?: RouteId }[];
}[] = [
  {
    title: 'Platform',
    links: [
      { label: 'Overview', route: 'overview' },
      { label: 'Financial Twin', route: 'financial-twin' },
      { label: 'Cash Flow', route: 'cash-flow' },
      { label: 'Simulator', route: 'simulator' },
      { label: 'Copilot', route: 'copilot' },
    ],
  },
  {
    title: 'Intelligence',
    links: [
      { label: 'About the business', href: '#about' },
      { label: 'Capabilities', href: '#intelligence' },
      { label: 'Risk Radar', route: 'risk-radar' },
      { label: 'Reports', route: 'reports' },
    ],
  },
  {
    title: 'Workspace',
    links: [
      { label: 'Dashboard', href: '#dashboard' },
      { label: 'Settings', route: 'settings' },
      { label: 'Team & Access', route: 'team' },
      { label: 'Help & Support', route: 'help' },
    ],
  },
];

export function LandingFooter({ onEnter, onSignIn }: LandingFooterProps) {
  return (
    <footer className="relative overflow-hidden bg-[#263746] text-[#f5f0e6]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#b69a68]/50 to-transparent"
      />
      <div className="mx-auto w-full max-w-[1320px] px-5 py-20 sm:px-8 sm:py-24 lg:px-12">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3">
              <span className="relative flex h-9 w-9 items-center justify-center border border-[#f5f0e6]/35">
                <span className="font-display text-[16px] leading-none">B</span>
                <span
                  className="absolute -right-[3px] -top-[3px] h-[5px] w-[5px] bg-[#b69a68]"
                  aria-hidden="true"
                />
              </span>
              <div>
                <div className="font-display text-[16px] tracking-[0.16em]">BIZPILOT AI</div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.3em] text-[#f5f0e6]/45">
                  Financial Intelligence
                </div>
              </div>
            </div>

            <p className="mt-8 max-w-[34ch] font-display text-[clamp(1.2rem,2vw,1.55rem)] italic leading-[1.35] text-[#f5f0e6]/85">
              Your Business. Your Financial Intelligence. Your Next Move.
            </p>

            <p className="mt-6 max-w-[40ch] text-[12.5px] leading-[1.85] text-[#f5f0e6]/45">
              An intelligent financial workspace for modern businesses — combining a living digital
              twin, forward cash flow, decision simulation and an explainable copilot.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onEnter('overview')}
                className="btn btn-ivory !px-5 !py-3 !text-[11px]"
              >
                Enter Workspace
              </button>
              <button
                type="button"
                onClick={onSignIn}
                className="btn btn-outline-ivory !px-5 !py-3 !text-[11px]"
              >
                Sign In
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:col-span-7">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="text-[9px] font-medium uppercase tracking-[0.3em] text-[#f5f0e6]/35">
                  {column.title}
                </h3>
                <ul className="mt-5 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.href ? (
                        <a
                          href={link.href}
                          className="link-quiet text-[12.5px] text-[#f5f0e6]/70 hover:text-[#f5f0e6]"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onEnter(link.route)}
                          className="link-quiet text-left text-[12.5px] text-[#f5f0e6]/70 hover:text-[#f5f0e6]"
                        >
                          {link.label}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-[#f5f0e6]/12 pt-6 text-[10px] uppercase tracking-[0.22em] text-[#f5f0e6]/35 sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 BizPilot AI — Quiet elegance. Confident intelligence.</span>
          <span className="normal-case tracking-[0.08em] text-[#f5f0e6]/30">
            Illustrative demo data · No live financial information is shown without sign-in.
          </span>
        </div>
      </div>
    </footer>
  );
}
