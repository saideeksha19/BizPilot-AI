import React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CurrencyCode, SimulationResult } from '../../types/financial';
import { formatCurrency } from '../../utils/formatters';

interface SimulatorComparisonChartProps {
  series: SimulationResult['monthlySeries'];
  currency: CurrencyCode;
  mode: 'cash' | 'profit';
}

export function SimulatorComparisonChart({
  series,
  currency,
  mode,
}: SimulatorComparisonChartProps) {
  const baseKey = mode === 'cash' ? 'baselineCash' : 'baselineProfit';
  const simKey = mode === 'cash' ? 'simulatedCash' : 'simulatedProfit';

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="rgba(52, 73, 94, 0.12)"
          />
          <XAxis
            dataKey="month"
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
          <ReferenceLine y={0} stroke="rgba(142, 74, 67, 0.45)" strokeDasharray="4 4" />
          <Tooltip
            contentStyle={{
              backgroundColor: '#263746',
              borderColor: 'rgba(255,255,255,0.12)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#f7f2e8',
            }}
            formatter={(value, name) => [
              formatCurrency(Number(value ?? 0), currency),
              String(name ?? ''),
            ]}
          />
          <Legend wrapperStyle={{ fontSize: '12px' }} />
          <Line
            type="monotone"
            dataKey={baseKey}
            name={mode === 'cash' ? 'Baseline Cash' : 'Baseline Profit'}
            stroke="#5b6e7a"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey={simKey}
            name={mode === 'cash' ? 'Hypothetical Cash' : 'Hypothetical Profit'}
            stroke="#34495e"
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#34495e' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
