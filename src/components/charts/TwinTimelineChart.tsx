import React from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CurrencyCode, TwinTimelinePoint } from '../../types/financial';
import { formatCurrency } from '../../utils/formatters';

interface TwinTimelineChartProps {
  data: TwinTimelinePoint[];
  currency: CurrencyCode;
  height?: number;
}

export function TwinTimelineChart({
  data,
  currency,
  height = 310,
}: TwinTimelineChartProps) {
  const estimatedPoint = data.find((d) => d.origin === 'estimated');

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="twinCashGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34495e" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#34495e" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="rgba(52, 73, 94, 0.12)"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#91a6b5' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#91a6b5' }}
            axisLine={false}
            tickLine={false}
            width={66}
            tickFormatter={(v: number) => formatCurrency(v, currency, { compact: true })}
          />
          {estimatedPoint && (
            <ReferenceLine
              x={estimatedPoint.label}
              stroke="#647c8e"
              strokeDasharray="4 4"
              label={{
                value: 'Current Horizon',
                position: 'top',
                fill: '#91a6b5',
                fontSize: 11,
              }}
            />
          )}
          <Tooltip
            contentStyle={{
              backgroundColor: '#263746',
              borderColor: 'rgba(255,255,255,0.12)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#f7f2e8',
            }}
            formatter={(value, name) => {
              const key = String(name ?? '');
              const labelMap: Record<string, string> = {
                cashBalance: 'Projected / Actual Cash',
                revenue: 'Revenue',
                expenses: 'Expenses',
              };
              return [formatCurrency(Number(value ?? 0), currency), labelMap[key] ?? key];
            }}
          />
          <Bar
            dataKey="revenue"
            fill="#647c8e"
            fillOpacity={0.7}
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            dataKey="expenses"
            fill="#5b6e7a"
            fillOpacity={0.55}
            radius={[3, 3, 0, 0]}
            maxBarSize={22}
          />
          <Area
            type="monotone"
            dataKey="cashBalance"
            stroke="#34495e"
            strokeWidth={2.5}
            fill="url(#twinCashGrad)"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
