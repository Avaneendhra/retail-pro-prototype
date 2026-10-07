import React from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { RevenueIcon, OrdersIcon, ProductsSoldIcon } from './icons';

const iconMap = {
  revenue: <RevenueIcon />,
  orders: <OrdersIcon />,
  products: <ProductsSoldIcon />,
};

export function StatCard({
  title,
  value,
  change,
  icon,
  sparkData,
  sparkKey,
}) {
  const isUp = change ? parseFloat(change) >= 0 : true;
  const trendClr = isUp ? 'text-emerald-400' : 'text-red-400';
  const sparkClr = isUp ? '#22c55e' : '#ef4444';

  return (
    <div className="group card bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-md border border-gray-700 p-5 rounded-2xl shadow-xl transition-all hover:shadow-2xl hover:-translate-y-1">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-gray-800/70 rounded-xl group-hover:scale-110 transition-transform">
          {iconMap[icon]}
        </div>

        <div className="flex-1">
          <p className="text-sm font-medium text-gray-400">{title}</p>
          <p className="text-3xl font-bold text-white mt-1">{value}</p>
        </div>
      </div>

      <div className="flex items-end justify-between mt-5">
        {change && (
          <p className={`flex items-center text-lg font-semibold ${trendClr}`}>
            {isUp ? '▲' : '▼'} {change}
          </p>
        )}

        {sparkData && sparkData.length > 0 && (
          <div className="w-28 h-12">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                <Line
                  type="monotone"
                  dataKey={sparkKey}
                  stroke={sparkClr}
                  strokeWidth={2.5}
                  dot={false}
                  animationDuration={800}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}