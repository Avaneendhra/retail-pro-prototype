import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next'; // <-- Import

// --- Formatting Helpers ---
const formatCurrency = (amount) => {
  if (amount === null || amount === undefined) return 'N/A';
  return (amount).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
};

const formatNumber = (num) => {
  if (num === null || num === undefined) return 'N/A';
  return (num).toLocaleString('en-IN');
};

// --- Sub-Components for the Report ---
const MetricBox = ({ title, value, className = 'text-blue-600' }) => (
  <div className="bg-gray-50 p-4 rounded-lg shadow-inner">
    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
    <p className={`text-3xl font-bold ${className}`}>{value}</p>
  </div>
);

const ReportTable = ({ headers, data, title }) => (
  <section className="space-y-3">
    <h3 className="text-xl font-bold text-gray-800 border-b border-gray-300 pb-2">{title}</h3>
    <div className="overflow-x-auto border border-gray-200 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-100">
          <tr>
            {headers.map(header => (
              <th key={header} className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-6 py-4 text-center text-gray-500">
                No data available for this section.
              </td>
            </tr>
          ) : (
            data.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50">
                {headers.map((header, colIndex) => (
                  <td key={colIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {row[header]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </section>
);

// --- Main Report Preview Component ---
export default function ReportPreview({ reportData, startDate, endDate }) {
  const { t } = useTranslation(); // <-- Get hook
  if (!reportData) return null;

  const { salesReport, textSummary, inventoryReport } = reportData;
  const { summary } = salesReport || {};

  // Format data for tables
  const topProductsData = (salesReport?.top_products || []).map(p => ({
    "Product Name": p.name,
    "Category": p.category || 'N/A',
    "Units Sold": formatNumber(p.qty),
    "Total Revenue": formatCurrency(p.revenue),
  }));

  // No change to lowStockData, it's not rendered

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      // This component STAYS light-themed
      className="bg-white text-gray-900 max-w-4xl mx-auto rounded-lg shadow-2xl p-10 md:p-16"
      id="report-preview-content"
    >
      <div className="space-y-12">
        {/* 1. Header */}
        <header className="text-center border-b border-gray-200 pb-6">
          <h1 className="text-4xl font-extrabold text-gray-900">{t('reports.title')}</h1>
          <p className="text-lg text-gray-600 mt-2">
            {startDate} to {endDate}
          </p>
        </header>

        {/* 2. AI Summary */}
        {textSummary?.report && (
          <section>
            <h2 className="text-2xl font-bold text-gray-800 mb-3">{t('reports.placeholder2')}</h2>
            <blockquote className="text-gray-700 text-lg leading-relaxed italic border-l-4 border-blue-500 pl-4">
              {textSummary.report}
            </blockquote>
          </section>
        )}

        {/* 3. Key Metrics */}
        <section>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Key Metrics</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricBox
              title={t('dashboard.totalRevenue')}
              value={formatCurrency(summary?.total_revenue)}
              className="text-emerald-600"
            />
            <MetricBox
              title={t('dashboard.totalOrders')}
              value={formatNumber(summary?.total_orders)}
              className="text-blue-600"
            />
            <MetricBox
              title={t('dashboard.productsSold')}
              value={formatNumber(summary?.total_products_sold)}
              className="text-purple-600"
            />
          </div>
        </section>

        {/* 4. Inventory Alerts */}
        <section>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Inventory Alerts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MetricBox
              title={t('customerList.showingLowStock')}
              value={formatNumber(inventoryReport?.lowStockCount)}
              className="text-yellow-600"
            />
            <MetricBox
              title="Expiring Soon Items"
              value={formatNumber(inventoryReport?.expiringCount)}
              className="text-orange-600"
            />
          </div>
        </section>

        {/* 5. Top Products Table */}
        <ReportTable
          title={t('dashboard.topProducts')}
          headers={["Product Name", "Category", "Units Sold", "Total Revenue"]}
          data={topProductsData}
        />

        {/* 6. Low Stock Details Table (Removed as per your file) */}
      </div>
    </motion.div>
  );
}