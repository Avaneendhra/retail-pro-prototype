// src/components/analytics/TopProductsChart.jsx
import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { CustomTooltip, chartTextColor } from './ChartUtils';

export default function TopProductsChart({ data }) {
  // Reverse the data so the #1 product is at the top of the chart
  const processedData = [...data].slice(0, 7).reverse(); 

  return (
    <div className="card lg:col-span-2 h-96"> {/* Spans 2 columns */}
      <h3 className="card-title mb-4">Top 7 Products (by Revenue)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart 
          data={processedData} 
          layout="vertical" 
          margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#4b5563" strokeOpacity={0.3} />
          <XAxis 
            type="number" 
            stroke={chartTextColor} 
            fontSize={12} 
            tickFormatter={(value) => `₹${value.toLocaleString()}`} 
          />
          <YAxis 
            dataKey="name" 
            type="category" 
            stroke={chartTextColor} 
            fontSize={12} 
            width={100}
            tick={{ fill: chartTextColor }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(156, 163, 175, 0.1)' }} />
          <Bar 
            dataKey="revenue" 
            fill="#8b5cf6" // purple-500
            name="Revenue" 
            isAnimationActive={true}
            animationDuration={1000}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}