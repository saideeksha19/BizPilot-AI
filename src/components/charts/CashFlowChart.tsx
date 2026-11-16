import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TimeSeriesPoint } from '../../services/financialService';
import { CurrencyCode } from '../../types/financial';
import { formatCurrency } from '../../utils/formatters';

interface CashFlowChartProps {
  data: TimeSeriesPoint[];
  currency: CurrencyCode;
  height?: number;
}

export function CashFlowChart({
  data,
  currency,
  height = 260,
}: CashFlowChartProps) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#647c8e" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#647c8e" stopOpacity={0.02} />
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
            width={62}
            tickFormatter={(v: number) => formatCurrency(v, currency, { compact: true })}
          />
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
              name === 'cumulativeCash' ? 'Cash Balance' : 'Net Cash Flow',
            ]}
          />
          <Area
            type="monotone"
            dataKey="cumulativeCash"
            stroke="#647c8e"
            strokeWidth={2}
            fill="url(#cashGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
