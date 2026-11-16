import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 border border-dashed border-slate-200 dark:border-white/10 rounded-xl bg-slate-50/50 dark:bg-white/[0.02]">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h3>
      <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-700 text-white transition-colors whitespace-nowrap shrink-0"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
