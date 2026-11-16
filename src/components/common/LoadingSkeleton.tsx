import React from 'react';

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2" aria-busy="true" aria-label="Loading financial records">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 w-full rounded-lg bg-slate-200/70 dark:bg-white/[0.04] animate-pulse"
        />
      ))}
    </div>
  );
}
