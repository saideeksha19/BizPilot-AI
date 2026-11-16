import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TimeSeriesPoint } from '../../services/financialService';
import { CurrencyCode } from '../../types/financial';
import { formatCurrency } from '../../utils/formatters';

interface RevenueExpenseChartProps {
  data: TimeSeriesPoint[];
  currency: CurrencyCode;
  height?: number;
}

export function RevenueExpenseChart({
  data,
  currency,
  height = 260,
}: RevenueExpenseChartProps) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            width={62}
            tickFormatter={(v: number) => formatCurrency(v, currency, { compact: true })}
          />
          <Tooltip
            cursor={{ fill: 'rgba(52, 73, 94, 0.06)' }}
            contentStyle={{
              backgroundColor: '#263746',
              borderColor: 'rgba(255,255,255,0.12)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#f7f2e8',
            }}
            formatter={(value, name) => [
              formatCurrency(Number(value ?? 0), currency),
              name === 'revenue' ? 'Revenue' : 'Expenses',
            ]}
          />
          <Bar
            dataKey="revenue"
            name="revenue"
            fill="#34495e"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="expenses"
            name="expenses"
            fill="#647c8e"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
