import { CurrencyCode } from '../types/financial';

const CURRENCY_CONFIG: Record<CurrencyCode, { symbol: string; locale: string }> = {
  INR: { symbol: '₹', locale: 'en-IN' },
  USD: { symbol: '$', locale: 'en-US' },
  EUR: { symbol: '€', locale: 'de-DE' },
  GBP: { symbol: '£', locale: 'en-GB' },
};

export function formatCurrency(
  amount: number,
  currency: CurrencyCode = 'INR',
  options?: { compact?: boolean; decimals?: number }
): string {
  const { locale } = CURRENCY_CONFIG[currency] ?? CURRENCY_CONFIG.INR;
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (options?.compact) {
    if (currency === 'INR') {
      if (absAmount >= 1_00_00_000) {
        return `${sign}₹${(absAmount / 1_00_00_000).toFixed(2)} Cr`;
      }
      if (absAmount >= 1_00_000) {
        return `${sign}₹${(absAmount / 1_00_000).toFixed(2)} L`;
      }
      if (absAmount >= 1_000) {
        return `${sign}₹${(absAmount / 1_000).toFixed(1)}K`;
      }
    } else {
      const sym = CURRENCY_CONFIG[currency].symbol;
      if (absAmount >= 1_000_000) {
        return `${sign}${sym}${(absAmount / 1_000_000).toFixed(2)}M`;
      }
      if (absAmount >= 1_000) {
        return `${sign}${sym}${(absAmount / 1_000).toFixed(1)}K`;
      }
    }
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: options?.decimals ?? 0,
    minimumFractionDigits: options?.decimals ?? 0,
  }).format(amount);
}

export function formatPercent(value: number, includePlus = true): string {
  const prefix = includePlus && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}

export function formatShortDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDayMonth(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
}

export function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00`).getTime();
  const end = new Date(`${endIso}T00:00:00`).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
