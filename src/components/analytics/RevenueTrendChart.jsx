import React from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { CustomTooltip, chartTextColor } from './ChartUtils';

export default function RevenueTrendChart({ data = [] }) {
  return (
    <div className="card bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-md rounded-2xl p-6 shadow-xl h-[420px]">
      <h3 className="card-title mb-5 text-xl font-bold text-white">Revenue Trend</h3>

      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.9} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="4 4" stroke="#4b5563" strokeOpacity={0.3} />
          <XAxis dataKey="day" stroke={chartTextColor} tick={{ fontSize: 12 }} />
          <YAxis
            stroke={chartTextColor}
            tick={{ fontSize: 12 }}
            tickFormatter={v => `₹${(v / 1_000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '12px' }} />

          <Area
            type="monotone"
            dataKey="totalRevenue"
            stroke="#10b981"
            fill="url(#gradRevenue)"
            strokeWidth={3}
            name="Revenue"
            dot={false}
            animationDuration={1200}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}