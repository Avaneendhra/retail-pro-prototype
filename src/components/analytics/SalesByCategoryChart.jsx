// src/components/analytics/SalesByCategoryChart.jsx
import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { CustomTooltip, PIE_COLORS } from './ChartUtils';
import { motion } from 'framer-motion';

// This component calculates the total value to display in the center of the donut
const DonutCenterLabel = ({ total }) => {
  return (
    <>
      <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle"
        className="text-sm font-medium fill-gray-400">
        Total
      </text>
      <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle"
        className="font-display text-3xl font-bold fill-white">
        {total.toLocaleString('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0,
        })}
      </text>
    </>
  );
};

export default function SalesByCategoryChart({ data }) {
  // Process the top_products data to get sales by category
  const { categoryData, totalRevenue } = useMemo(() => {
    if (!data) return { categoryData: [], totalRevenue: 0 };
    
    const categoryMap = data.reduce((acc, product) => {
      const category = product.category || 'Unknown';
      acc[category] = (acc[category] || 0) + product.revenue;
      return acc;
    }, {});
    
    const total = Object.values(categoryMap).reduce((sum, val) => sum + val, 0);

    const chartData = Object.keys(categoryMap).map((name, index) => ({
      name,
      value: categoryMap[name],
      percent: total > 0 ? (categoryMap[name] / total) * 100 : 0,
      color: PIE_COLORS[index % PIE_COLORS.length],
    })).sort((a, b) => b.value - a.value);

    return { categoryData: chartData, totalRevenue: total };
  }, [data]);

  return (
    <div className="card h-[450px] lg:col-span-4 flex flex-col">
      <h3 className="card-title mb-4 flex-shrink-0">Sales by Category</h3>
      <div className="w-full flex-grow h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {/* SVG Filter for the glow effect */}
            <defs>
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#3b82f6" floodOpacity="0.5" />
              </filter>
            </defs>
            <Pie
              data={categoryData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="75%" // Donut chart
              outerRadius="95%"
              fill="#8884d8"
              paddingAngle={2}
              isAnimationActive={true}
              animationDuration={1000}
            >
              {categoryData.map((entry) => (
                <Cell 
                  key={entry.name} 
                  fill={entry.color} 
                  stroke={entry.color}
                  style={{ filter: 'url(#glow)' }} // Apply glow
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            {/* Custom label in the center */}
            <DonutCenterLabel total={totalRevenue} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Custom Legend */}
      <div className="w-full space-y-2 overflow-y-auto custom-scrollbar pt-4 mt-4 border-t border-gray-800">
        {categoryData.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-300">{entry.name}</span>
            </div>
            <span className="font-semibold text-white">{entry.percent.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}