import React from 'react';
import { ApiDataLabel } from '../../types/api';
import { DataOriginKind } from '../../types/financial';

export type DataOriginTagKind =
  | DataOriginKind
  | 'hypothetical'
  | 'demo'
  | ApiDataLabel;

interface DataOriginTagProps {
  kind: DataOriginTagKind;
  className?: string;
}

const ORIGIN_META: Record<DataOriginTagKind, { label: string; colorClass: string }> = {
  actual: {
    label: 'ACTUAL',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
  },
  ACTUAL: {
    label: 'ACTUAL',
    colorClass: 'text-emerald-600 dark:text-emerald-400',
  },
  estimated: {
    label: 'ESTIMATED',
    colorClass: 'text-blue-600 dark:text-blue-400',
  },
  ESTIMATED: {
    label: 'ESTIMATED',
    colorClass: 'text-blue-600 dark:text-blue-400',
  },
  forecasted: {
    label: 'FORECAST',
    colorClass: 'text-violet-600 dark:text-violet-400',
  },
  FORECAST: {
    label: 'FORECAST',
    colorClass: 'text-violet-600 dark:text-violet-400',
  },
  hypothetical: {
    label: 'HYPOTHETICAL',
    colorClass: 'text-amber-600 dark:text-amber-400',
  },
  HYPOTHETICAL: {
    label: 'HYPOTHETICAL',
    colorClass: 'text-amber-600 dark:text-amber-400',
  },
  demo: {
    label: 'Illustrative Demo Data',
    colorClass: 'text-slate-500 dark:text-slate-400',
  },
};

export function DataOriginTag({ kind, className = '' }: DataOriginTagProps) {
  const meta = ORIGIN_META[kind] ?? ORIGIN_META.actual;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide whitespace-nowrap ${meta.colorClass} ${className}`}
    >
      {meta.label}
    </span>
  );
}
