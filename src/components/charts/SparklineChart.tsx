import React from 'react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';

interface SparklineChartProps {
  data: { value: number }[];
  color?: string;
}

export function SparklineChart({
  data,
  color = '#34495e',
}: SparklineChartProps) {
  if (!data || data.length === 0) return null;

  return (
    <div className="h-9 w-24 shrink-0" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
