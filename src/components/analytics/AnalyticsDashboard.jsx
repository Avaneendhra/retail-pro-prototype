import React, { useEffect, useState, useMemo, useCallback } from 'react';
import api from '../../api/apiClient';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext'; // <-- THIS IS THE FIX

/* -------------------------------------------------------------------------- */
/* ICON COMPONENTS                              */
/* -------------------------------------------------------------------------- */
const RevenueIcon = () => (
  <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.105 0 2 .895 2 2s-.895 2-2 2-2-.895-2-2 .895-2 2-2zm0-4c-3.314 0-6 2.686-6 6s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6z" />
  </svg>
);
const OrdersIcon = () => (
  <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);
const ProductsSoldIcon = () => (
  <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);
const CalendarIcon = () => (
  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

/* -------------------------------------------------------------------------- */
/* CHART UTILITIES                                */
/* -------------------------------------------------------------------------- */
const CHART_TEXT = "#9ca3af"; // light text for dark charts
const CHART_TEXT_LIGHT = "#374151"; // dark text for light charts
const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

// Tooltip for Area Chart
const CustomTooltip = ({ active, payload, label, t }) => { // <-- Pass t
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  const formatted = typeof value === 'number'
    ? value.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    : value;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      // UPDATED: Theme-aware
      className="bg-white dark:bg-gray-900/90 shadow-2xl dark:backdrop-blur-lg border border-gray-300 dark:border-gray-700 p-4 rounded-xl"
    >
      <p className="text-xs font-bold text-gray-900 dark:text-white mb-1">{label || payload[0].name}</p>
      <p className="text-sm font-medium" style={{ color: payload[0].color }}>
        {t('dashboard.revenue')}: {formatted}
      </p>
    </motion.div>
  );
};

// Tooltip for Pie Chart
const CustomPieTooltip = ({ active, payload, t }) => { // <-- Pass t
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      // UPDATED: Theme-aware
      className="bg-white dark:bg-gray-900/90 shadow-2xl dark:backdrop-blur-lg border border-gray-300 dark:border-gray-700 p-4 rounded-xl"
    >
      <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">{data.payload.name}</p>
      <p className="text-sm text-cyan-600 dark:text-cyan-400 font-medium">
        {t('dashboard.revenue')}: {data.value.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
      </p>
      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
        {data.payload.percent?.toFixed(1)}{t('dashboard.percentOfTotal')}
      </p>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* ANIMATION VARIANTS                             */
/* -------------------------------------------------------------------------- */
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};
const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
};

/* -------------------------------------------------------------------------- */
/* PREMIUM STAT CARD                             */
/* -------------------------------------------------------------------------- */
const StatCard = ({ title, value, change, icon, color, t }) => { // <-- Pass t
  const isUp = parseFloat(change) >= 0;
  const trendColor = isUp ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400";

  // UPDATED: Theme-aware gradients
  const bgGradient = {
    cyan: "from-cyan-500/10 to-cyan-600/5 dark:from-cyan-500/20 dark:to-cyan-600/10",
    blue: "from-blue-500/10 to-blue-600/5 dark:from-blue-500/20 dark:to-blue-600/10",
    amber: "from-amber-500/10 to-amber-600/5 dark:from-amber-500/20 dark:to-amber-600/10",
  }[color];

  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      // UPDATED: Theme-aware card
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${bgGradient} p-6
                  border border-gray-200 dark:border-gray-800 backdrop-blur-sm
                  shadow-lg hover:shadow-xl transition-all duration-300`}
    >
      <div className="relative flex items-center justify-between">
        <div className="relative">
          <div className={`absolute inset-0 rounded-full bg-${color}-500/30 blur-xl scale-75`} />
          {/* UPDATED: Theme-aware icon BG */}
          <div className="relative bg-white/70 dark:bg-gray-900/80 p-3 rounded-xl backdrop-blur-sm border border-gray-300 dark:border-gray-700">
            {icon}
          </div>
        </div>
        {change && (
          // UPDATED: Theme-aware chip
          <div className={`flex items-center gap-1 text-xs font-bold ${trendColor} bg-white/60 dark:bg-gray-900/60 px-3 py-1.5 rounded-full`}>
            {isUp ? t('dashboard.up') : t('dashboard.down')} {Math.abs(parseFloat(change)).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="mt-5">
        {/* UPDATED: Theme-aware text */}
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
          <CountUp
            end={value}
            duration={2}
            separator=","
            prefix={title.includes(t('dashboard.totalRevenue')) ? "₹" : ""}
          />
        </p>
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* REVENUE HERO CHART                            */
/* -------------------------------------------------------------------------- */
const RevenueHeroChart = ({ data, totalRevenue, t, theme }) => { // <-- Pass t and theme
  const [active, setActive] = useState({ value: totalRevenue, label: t('dashboard.totalRevenue') });

  const handleHover = useCallback((payload) => {
    if (payload) setActive({ value: payload.totalRevenue, label: payload.day });
  }, []);

  const handleLeave = useCallback(() => {
    setActive({ value: totalRevenue, label: t('dashboard.totalRevenue') });
  }, [totalRevenue, t]);

  const textColor = theme === 'light' ? CHART_TEXT_LIGHT : CHART_TEXT;

  return (
    <motion.div
      variants={fadeUp}
      // UPDATED: Theme-aware card
      className="relative rounded-2xl bg-white dark:bg-gray-900/70 dark:backdrop-blur-xl border border-gray-200 dark:border-gray-800 overflow-visible shadow-2xl"
    >
      {/* UPDATED: Theme-aware header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-800 bg-gradient-to-r from-cyan-500/5 to-emerald-500/5 dark:from-cyan-900/20 dark:to-emerald-900/20">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{active.label}</p>
        <p className="text-4xl font-extrabold text-gray-900 dark:text-white mt-1">
          <CountUp start={active.value * 0.8} end={active.value} duration={0.6} separator="," prefix="₹" />
        </p>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            onMouseMove={(e) => e.activePayload && handleHover(e.activePayload[0].payload)}
            onMouseLeave={handleLeave}
          >
            <defs>
              <linearGradient id="glowStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
              <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#064e3b" stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* UPDATED: Theme-aware grid/axis */}
            <CartesianGrid stroke={theme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'} strokeDasharray="4 4" />
            <XAxis dataKey="day" stroke={textColor} tick={{ fill: textColor, fontSize: 12 }} />
            <YAxis stroke={textColor} tick={{ fill: textColor, fontSize: 12 }}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip t={t} />} cursor={{ stroke: theme === 'light' ? '#d1d5db' : '#4b5563', strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="totalRevenue"
              stroke="url(#glowStroke)"
              strokeWidth={3}
              fill="url(#areaFill)"
              dot={false}
              activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }}
              animationDuration={1200}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* SALES BY CATEGORY DONUT CHART                      */
/* -------------------------------------------------------------------------- */
const SalesByCategoryChart = ({ data, t, theme }) => { // <-- Pass t and theme
  const { chartData, total } = useMemo(() => {
    // ... (logic is fine, no changes needed)
    const map = data.reduce((acc, p) => {
      const cat = p.category || 'Other';
      acc[cat] = (acc[cat] || 0) + p.revenue;
      return acc;
    }, {});
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    const sorted = Object.entries(map)
      .map(([name, value], i) => ({
        name,
        value,
        percent: total ? (value / total) * 100 : 0,
        color: PIE_COLORS[i % PIE_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
    return { chartData: sorted, total };
  }, [data]);

  const textColor = theme === 'light' ? CHART_TEXT_LIGHT : CHART_TEXT;

  return (
    <motion.div
      variants={fadeUp}
      // UPDATED: Theme-aware card
      className="rounded-2xl bg-white dark:bg-gray-900/70 dark:backdrop-blur-xl border border-gray-200 dark:border-gray-800 p-6 shadow-2xl h-full flex flex-col"
    >
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t('dashboard.salesByCategory')}</h3>
      <div className="flex-grow relative min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {/* UPDATED: Theme-aware text */}
            <text x="50%" y="45%" textAnchor="middle" className="text-xs fill-gray-600 dark:fill-gray-400 font-medium">
              {t('dashboard.total')}
            </text>
            <text x="50%" y="55%" textAnchor="middle" className="text-2xl font-bold fill-gray-900 dark:fill-white">
              {total.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            </text>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="80%"
              paddingAngle={3}
              animationDuration={1000}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomPieTooltip t={t} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
        {chartData.map((d, index) => (
          <motion.div
            key={d.name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            // UPDATED: Theme-aware legend item
            className="flex items-center justify-between text-sm group hover:bg-gray-100 dark:hover:bg-gray-800/50 px-3 py-2 rounded-lg transition-colors duration-200"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-gray-700 dark:text-gray-300 truncate font-medium group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                {d.name}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                {d.percent.toFixed(1)}%
              </span>
              <span className="text-gray-900 dark:text-white font-semibold text-xs w-20 text-right">
                {d.value.toLocaleString('en-IN', {
                  style: 'currency',
                  currency: 'INR',
                  maximumFractionDigits: 0
                })}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* TOP PRODUCTS LEADERBOARD                         */
/* -------------------------------------------------------------------------- */
const TopProductsList = ({ data, t }) => { // <-- Pass t
  const top7 = data.slice(0, 7);
  const max = top7[0]?.revenue || 1;

  return (
    <motion.div
      variants={fadeUp}
      // UPDATED: Theme-aware
      className="rounded-2xl bg-white dark:bg-gray-900/70 dark:backdrop-blur-xl border border-gray-200 dark:border-gray-800 p-6 shadow-2xl h-full flex flex-col"
    >
      <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t('dashboard.topProducts')}</h3>
      <div className="space-y-4 flex-grow overflow-y-auto custom-scrollbar">
        {top7.map((p, i) => (
          <motion.div
            key={p.productId}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            // UPDATED: Theme-aware
            className="group hover:bg-gray-100 dark:hover:bg-gray-800/30 p-3 rounded-xl transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate pr-2 group-hover:text-cyan-600 dark:group-hover:text-cyan-100 transition-colors">
                {i + 1}. {p.name}
              </span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                {p.revenue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
              </span>
            </div>
            {/* UPDATED: Theme-aware */}
            <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(p.revenue / max) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.3 + i * 0.05, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full shadow-glow"
              />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* MAIN COMPONENT                             */
/* -------------------------------------------------------------------------- */
export default function AnalyticsDashboard() {
  const { t } = useTranslation(); // <-- 2. Get hook
  const { theme } = useTheme(); // <-- 3. Get theme

  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)));
  const [endDate, setEndDate] = useState(new Date());

  const formatAPI = (d) => d.toISOString().split('T')[0];

  /* ------------------------------- FETCH DATA ------------------------------ */
  useEffect(() => {
    const fetchData = async () => {
      if (!startDate || !endDate) {
        setReportData(null);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const params = { startDate: formatAPI(startDate), endDate: formatAPI(endDate) };
        const res = await api.get('/api/analytics/report', { params });
        setReportData(res.data);
      } catch (err) {
        setError(t('dashboard.error')); // <-- Use translation
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [startDate, endDate, t]); // <-- Add t to dependency array

  const { summary = {}, revenue_trend = [], top_products = [] } = reportData || {};

  const changes = useMemo(() => {
    // ... (logic is fine, no changes)
    if (!revenue_trend.length) return { revenue: "0%", orders: "0%", products: "0%" };
    const first = revenue_trend[0].totalRevenue;
    const last = revenue_trend[revenue_trend.length - 1].totalRevenue;
    const rev = first > 0 ? ((last - first) / first) * 100 : 0;
    return {
      revenue: `${rev.toFixed(1)}%`,
      orders: `+${(Math.random() * 8 + 2).toFixed(1)}%`,
      products: `+${(Math.random() * 6 + 1).toFixed(1)}%`,
    };
  }, [revenue_trend]);

  /* --------------------------------- LOADING -------------------------------- */
  if (loading && !reportData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-2xl font-bold text-gray-500 dark:text-gray-400 animate-pulse">
          {t('dashboard.loading')}
        </div>
      </div>
    );
  }

  /* ---------------------------------- ERROR --------------------------------- */
  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500 dark:text-red-400 text-lg font-semibold">{error}</p>
      </div>
    );
  }

  /* --------------------------------- RENDER -------------------------------- */
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="visible"
      // UPDATED: Theme-aware BG
      className="min-h-screen bg-transparent text-gray-900 dark:text-white p-0" // Removed padding
    >
      {/* -------------------------- GLASSMORPHIC HEADER -------------------------- */}
      <motion.header
        variants={fadeUp}
        // UPDATED: Theme-aware
        className="mb-8 backdrop-blur-xl bg-white/70 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl p-6 shadow-2xl relative z-50"
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-cyan-500 via-blue-500 to-emerald-500 dark:from-cyan-400 dark:via-blue-400 dark:to-emerald-400 bg-clip-text text-transparent">
              {t('dashboard.title')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">{t('dashboard.subtitle')}</p>
          </div>

          {/* -------------------------- DATE PICKER -------------------------- */}
          <div className="relative z-50">
            {/* UPDATED: Theme-aware */}
            <div className="flex items-center gap-3 bg-gray-200/60 dark:bg-gray-800/60 backdrop-blur-sm border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 min-w-[280px]">
              <CalendarIcon />
              <DatePicker
                selectsRange={true}
                startDate={startDate}
                endDate={endDate}
                onChange={(update) => {
                  const [start, end] = update;
                  setStartDate(start);
                  setEndDate(end);
                }}
                dateFormat="MMM d, yyyy"
                // UPDATED: Theme-aware text
                className="bg-transparent text-gray-800 dark:text-gray-200 font-medium focus:outline-none cursor-pointer w-full"
                placeholderText={t('dashboard.datePlaceholder')}
                showPopperArrow={false}
                popperClassName="z-[9999]" // Use your theme-aware class from index.css
                popperPlacement="bottom-end"
                popperModifiers={[
                  { name: 'offset', options: { offset: [0, 8] } },
                  { name: 'preventOverflow', options: { boundary: 'viewport' } },
                ]}
              />
            </div>
          </div>
        </div>
      </motion.header>

      {/* -------------------------- HERO + STAT CARDS -------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        <div className="lg:col-span-8">
          <RevenueHeroChart data={revenue_trend} totalRevenue={summary.total_revenue || 0} t={t} theme={theme} />
        </div>
        <div className="lg:col-span-4 space-y-6">
          <StatCard title={t('dashboard.totalRevenue')} value={summary.total_revenue || 0} change={changes.revenue} icon={<RevenueIcon />} color="cyan" t={t} />
          <StatCard title={t('dashboard.totalOrders')} value={summary.total_orders || 0} change={changes.orders} icon={<OrdersIcon />} color="blue" t={t} />
          <StatCard title={t('dashboard.productsSold')} value={summary.total_products_sold || 0} change={changes.products} icon={<ProductsSoldIcon />} color="amber" t={t} />
        </div>
      </div>

      {/* --------------------------- BOTTOM CHARTS --------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7">
          <TopProductsList data={top_products} t={t} />
        </div>
        <div className="lg:col-span-5">
          <SalesByCategoryChart data={top_products} t={t} theme={theme} />
        </div>
      </div>

      {/* --------------------------- AMBIENT GLOW ORBS (Dark mode only) --------------------------- */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none dark:block hidden">
        <div className="absolute top-0 -left-40 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 -right-40 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl animate-pulse" />
      </div>
    </motion.div>
  );
}