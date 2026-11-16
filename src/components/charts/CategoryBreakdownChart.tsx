import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CurrencyCode } from '../../types/financial';
import { formatCurrency } from '../../utils/formatters';

interface BreakdownEntry {
  name: string;
  value: number;
  share: number;
}

interface CategoryBreakdownChartProps {
  data: BreakdownEntry[];
  currency: CurrencyCode;
}

const COLORS = ['#34495e', '#647c8e', '#91a6b5', '#5c8a70', '#b69a68', '#5b6e7a'];

export function CategoryBreakdownChart({
  data,
  currency,
}: CategoryBreakdownChartProps) {
  if (data.length === 0) {
    return (
      <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
        No category entries recorded in the selected date window.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
      <div className="sm:col-span-5 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={44}
              outerRadius={70}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((entry, idx) => (
                <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#263746',
                borderColor: 'rgba(255,255,255,0.12)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#f7f2e8',
              }}
              formatter={(value) => formatCurrency(Number(value ?? 0), currency)}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="sm:col-span-7 space-y-2.5">
        {data.slice(0, 5).map((item, idx) => (
          <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                aria-hidden="true"
              />
              <span className="truncate text-slate-700 dark:text-slate-200">
                {item.name}
              </span>
            </div>
            <div className="flex items-center gap-2.5 shrink-0 font-mono-num">
              <span className="text-slate-500 dark:text-slate-400">
                {item.share.toFixed(1)}%
              </span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {formatCurrency(item.value, currency, { compact: true })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
