import React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { SparklineChart } from '../charts/SparklineChart';

interface StatCardProps {
  title: string;
  value: string;
  previousValueLabel: string;
  changePct: number;
  positiveIsGood?: boolean;
  sparkline?: { value: number }[];
  sparklineColor?: string;
  onClick?: () => void;
}

export function StatCard({
  title,
  value,
  previousValueLabel,
  changePct,
  positiveIsGood = true,
  sparkline,
  sparklineColor = '#34495e',
  onClick,
}: StatCardProps) {
  const isUp = changePct > 0.2;
  const isDown = changePct < -0.2;
  const isFavorable = isUp ? positiveIsGood : isDown ? !positiveIsGood : true;

  const deltaTone =
    !isUp && !isDown
      ? 'text-slate-500 dark:text-slate-400'
      : isFavorable
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-rose-600 dark:text-rose-400';

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full text-left rounded-xl p-4 bg-white dark:bg-[#22323f] border border-slate-200 dark:border-white/8 transition-colors ${
        onClick
          ? 'hover:border-violet-500/40 dark:hover:border-violet-400/30 cursor-pointer'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
          {title}
        </span>
        <span className={`inline-flex items-center gap-0.5 text-xs font-mono-num font-medium shrink-0 ${deltaTone}`}>
          {isUp ? (
            <ArrowUpRight className="w-3.5 h-3.5" />
          ) : isDown ? (
            <ArrowDownRight className="w-3.5 h-3.5" />
          ) : (
            <Minus className="w-3.5 h-3.5" />
          )}
          {changePct > 0 ? `+${changePct.toFixed(1)}%` : `${changePct.toFixed(1)}%`}
        </span>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 font-mono-num truncate">
            {value}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
            {previousValueLabel}
          </div>
        </div>
        {sparkline && (
          <SparklineChart data={sparkline} color={sparklineColor} />
        )}
      </div>
    </Wrapper>
  );
}
