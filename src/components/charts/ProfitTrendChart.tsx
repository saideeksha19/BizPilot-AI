import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TimeSeriesPoint } from '../../services/financialService';
import { CurrencyCode } from '../../types/financial';
import { formatCurrency } from '../../utils/formatters';

interface ProfitTrendChartProps {
  data: TimeSeriesPoint[];
  currency: CurrencyCode;
  height?: number;
}

export function ProfitTrendChart({
  data,
  currency,
  height = 220,
}: ProfitTrendChartProps) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
          <ReferenceLine y={0} stroke="rgba(52, 73, 94, 0.3)" strokeDasharray="4 4" />
          <Tooltip
            contentStyle={{
              backgroundColor: '#263746',
              borderColor: 'rgba(255,255,255,0.12)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#f7f2e8',
            }}
            formatter={(value) => [formatCurrency(Number(value ?? 0), currency), 'Net Profit']}
          />
          <Line
            type="monotone"
            dataKey="profit"
            stroke="#5c8a70"
            strokeWidth={2.2}
            dot={{ r: 3, fill: '#5c8a70', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
