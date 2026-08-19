// src/components/analytics/ChartUtils.jsx
import React from 'react';

/**
 * A "premium" tooltip component for our charts.
 * It matches the glassmorphic theme and formats numbers as currency.
 */
export const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    
    const value = payload[0].value;
    const formattedValue = typeof value === 'number' 
      ? value.toLocaleString('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0,
        })
      : value;

    const name = payload[0].name;

    return (
      <div className="bg-gray-950/80 backdrop-blur-sm border border-gray-700 p-3 rounded-lg shadow-xl opacity-95">
        <p className="label text-sm text-white font-bold mb-1">{`${label || name}`}</p>
        <p style={{ color: payload[0].color || payload[0].payload.fill }} className="text-sm">
          {`${payload[0].name}: ${formattedValue}`}
        </p>
      </div>
    );
  }
  return null;
};

// Define a light color for chart text (Tailwind's gray-400)
export const chartTextColor = "#9ca3af";

// Colors for the Pie/Donut Chart
export const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6b7280'];