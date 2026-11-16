import React from 'react';
import { AlertCircle, Info, Loader2, RefreshCw } from 'lucide-react';

interface IntelligenceStateBannerProps {
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyNotice?: string | null;
}

export function IntelligenceStateBanner({
  isLoading,
  error,
  onRetry,
  emptyNotice,
}: IntelligenceStateBannerProps) {
  if (error) {
    return (
      <div className="rounded-xl p-4 bg-rose-500/10 border border-rose-500/25 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-300 hover:bg-rose-500/10 shrink-0 font-medium"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl px-4 py-3 bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200 dark:border-white/8 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500 shrink-0" />
        <span>Computing authoritative financial intelligence from workspace ledger...</span>
      </div>
    );
  }

  if (emptyNotice) {
    return (
      <div className="rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/25 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
        <Info className="w-4 h-4 shrink-0" />
        <span>{emptyNotice}</span>
      </div>
    );
  }

  return null;
}
