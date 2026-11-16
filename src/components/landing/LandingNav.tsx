import React, { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { RouteId } from '../../types/financial';

interface LandingNavProps {
  onEnter: (route?: RouteId) => void;
  onSignIn: () => void;
}

const SECTIONS = [
  { id: 'about', label: 'About' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'features', label: 'Features' },
  { id: 'dashboard', label: 'Dashboard' },
];

export function LandingNav({ onEnter, onSignIn }: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const solid = scrolled || mobileOpen;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500 ${
        solid
          ? 'border-b border-[var(--line)] bg-[#faf8f2]/92 text-[#263746] backdrop-blur-md'
          : 'border-b border-transparent bg-transparent text-[#f5f0e6]'
      }`}
    >
      {!solid && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[112px] bg-gradient-to-b from-[#1b2833]/85 via-[#1b2833]/45 to-transparent"
        />
      )}
      <div className="mx-auto flex h-[68px] w-full max-w-[1320px] items-center justify-between gap-6 px-5 sm:px-8 lg:px-12">
        <a
          href="#top"
          className="group flex items-center gap-3"
          aria-label="BizPilot AI — back to top"
        >
          <span
            className={`relative flex h-8 w-8 items-center justify-center border transition-colors duration-500 ${
              solid ? 'border-[#34495e]/30 text-[#34495e]' : 'border-[#f5f0e6]/40 text-[#f5f0e6]'
            }`}
          >
            <span className="font-display text-[15px] leading-none">B</span>
            <span className="absolute -right-[3px] -top-[3px] h-[5px] w-[5px] bg-[#b69a68]" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="whitespace-nowrap font-display text-[15px] tracking-[0.16em]">BIZPILOT AI</span>
            <span
              className={`mt-1 text-[9px] uppercase tracking-[0.3em] transition-colors duration-500 ${
                solid ? 'text-[#5f6a70]' : 'text-[#f5f0e6]/55'
              }`}
            >
              Financial Intelligence
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-9 lg:flex" aria-label="Landing sections">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={`link-quiet text-[12px] font-medium uppercase tracking-[0.18em] ${
                solid ? 'text-[#34495e]/80 hover:text-[#263746]' : 'text-[#f5f0e6]/75 hover:text-[#f5f0e6]'
              }`}
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <button
            type="button"
            onClick={onSignIn}
            className={`btn !px-4 !py-2.5 !text-[12px] !tracking-[0.12em] uppercase ${
              solid ? 'btn-outline-ink' : 'btn-outline-ivory'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => onEnter()}
            className={`btn !px-5 !py-2.5 !text-[12px] !tracking-[0.12em] uppercase ${
              solid ? 'btn-stone' : 'btn-ivory'
            }`}
          >
            Get Started
          </button>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          className={`lg:hidden inline-flex h-10 w-10 items-center justify-center border transition-colors ${
            solid ? 'border-[#34495e]/25 text-[#34495e]' : 'border-[#f5f0e6]/30 text-[#f5f0e6]'
          }`}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-[var(--line)] bg-[#faf8f2] px-5 pb-7 pt-4 text-[#263746]">
          <nav className="flex flex-col" aria-label="Landing sections, mobile">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between border-b border-[var(--line)] py-3.5 text-sm tracking-[0.02em]"
              >
                <span>{section.label}</span>
                <span className="text-[10px] uppercase tracking-[0.22em] text-[#5b6e7a]">
                  0{SECTIONS.indexOf(section) + 1}
                </span>
              </a>
            ))}
          </nav>
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onSignIn();
              }}
              className="btn btn-outline-ink w-full !text-[12px] uppercase !tracking-[0.14em]"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onEnter();
              }}
              className="btn btn-stone w-full !text-[12px] uppercase !tracking-[0.14em]"
            >
              Enter Workspace
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
