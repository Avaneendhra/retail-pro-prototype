import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { analytics as analyticsData, aiAnalytics as aiAnalyticsData } from '../../api/mockData';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';

/* -------------------------------------------------------------------------- */
/* ICON COMPONENTS                              */
/* -------------------------------------------------------------------------- */
const RevenueIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.105 0 2 .895 2 2s-.895 2-2 2-2-.895-2-2 .895-2 2-2zm0-4c-3.314 0-6 2.686-6 6s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6z" />
  </svg>
);
const OrdersIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);
const ProductsSoldIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);
const CalendarIcon = () => (
  <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);
const AlertsIcon = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
)

/* -------------------------------------------------------------------------- */
/* CHART UTILITIES                                */
/* -------------------------------------------------------------------------- */
const PIE_COLORS = ['#0EA5FF', '#8b5cf6', '#10B981', '#F59E0B', '#EF4444', '#06b6d4', '#ec4899'];

// Tooltip for Area Chart
const CustomTooltip = ({ active, payload, label, t }) => {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  const formatted = typeof value === 'number'
    ? value.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    : value;

  return (
    <div className="card p-3 border border-[var(--border)] shadow-xl z-50">
      <p className="text-xs font-bold text-[var(--text-primary)] mb-1">{label || payload[0].name}</p>
      <p className="text-sm font-semibold" style={{ color: payload[0].color }}>
        {t('dashboard.revenue')}: {formatted}
      </p>
    </div>
  );
};

// Tooltip for Pie Chart
const CustomPieTooltip = ({ active, payload, t }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  return (
    <div className="card p-3 border border-[var(--border)] shadow-xl z-50">
      <p className="text-sm font-bold text-[var(--text-primary)] mb-1">{data.payload.name}</p>
      <p className="text-sm font-semibold text-[var(--primary)]">
        {t('dashboard.revenue')}: {data.value.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
      </p>
      <p className="text-xs text-[var(--text-muted)] mt-1">
        {data.payload.percent?.toFixed(1)}{t('dashboard.percentOfTotal')}
      </p>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* ANIMATION VARIANTS                             */
/* -------------------------------------------------------------------------- */
const fadeUp = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};
const container = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

/* -------------------------------------------------------------------------- */
/* PREMIUM STAT CARD                             */
/* -------------------------------------------------------------------------- */
const StatCard = ({ title, value, change, icon, color, t }) => {
  const isUp = change ? parseFloat(change) >= 0 : null;
  
  return (
    <motion.div variants={fadeUp} className="stat-card">
      <div className="flex items-start justify-between">
        <div className={`stat-icon ${color}`}>
          {icon}
        </div>
        {change && (
          <div className={`stat-trend ${isUp ? 'up' : 'down'}`}>
            {isUp ? '↑' : '↓'} {Math.abs(parseFloat(change)).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="stat-value">
          <CountUp
            end={value}
            duration={2}
            separator=","
            prefix={title.includes(t('dashboard.totalRevenue')) ? "₹" : ""}
          />
        </div>
        <div className="stat-label">{title}</div>
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* REVENUE HERO CHART                            */
/* -------------------------------------------------------------------------- */
const RevenueHeroChart = ({ data, totalRevenue, t, theme }) => {
  const [active, setActive] = useState({ value: totalRevenue, label: t('dashboard.totalRevenue') });

  const handleHover = useCallback((payload) => {
    if (payload) setActive({ value: payload.totalRevenue, label: payload.day });
  }, []);

  const handleLeave = useCallback(() => {
    setActive({ value: totalRevenue, label: t('dashboard.totalRevenue') });
  }, [totalRevenue, t]);

  const gridColor = theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  const textColor = theme === 'light' ? '#94A3B8' : '#64748B'; // --text-muted

  return (
    <motion.div variants={fadeUp} className="card overflow-hidden h-full flex flex-col">
      <div className="p-6 border-b border-[var(--border)] bg-[rgba(14,165,255,0.03)]">
        <p className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider">{active.label}</p>
        <p className="text-4xl font-extrabold text-[var(--text-primary)] mt-1">
          <CountUp start={active.value * 0.8} end={active.value} duration={0.6} separator="," prefix="₹" />
        </p>
      </div>

      <div className="flex-1 min-h-[280px] p-4 pt-6">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
            onMouseMove={(e) => e.activePayload && handleHover(e.activePayload[0].payload)}
            onMouseLeave={handleLeave}
          >
            <defs>
              <linearGradient id="areaColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={gridColor} strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="day" stroke={textColor} tick={{ fill: textColor, fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
            <YAxis stroke={textColor} tick={{ fill: textColor, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip t={t} />} cursor={{ stroke: 'var(--border)', strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="totalRevenue"
              stroke="var(--primary)"
              strokeWidth={3}
              fill="url(#areaColor)"
              dot={false}
              activeDot={{ r: 6, stroke: 'var(--surface)', strokeWidth: 2, fill: 'var(--primary)' }}
              animationDuration={1000}
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
const SalesByCategoryChart = ({ data, t, theme }) => {
  const { chartData, total } = useMemo(() => {
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

  return (
    <motion.div variants={fadeUp} className="card p-6 h-full flex flex-col">
      <h3 className="card-title">{t('dashboard.salesByCategory')}</h3>
      <div className="flex-grow relative min-h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <text x="50%" y="45%" textAnchor="middle" className="text-xs fill-[var(--text-muted)] font-semibold uppercase tracking-wider">
              {t('dashboard.total')}
            </text>
            <text x="50%" y="55%" textAnchor="middle" className="text-xl font-bold fill-[var(--text-primary)]">
              {total.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
            </text>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="65%"
              outerRadius="85%"
              paddingAngle={4}
              animationDuration={1000}
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomPieTooltip t={t} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
        {chartData.map((d, index) => (
          <motion.div
            key={d.name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center justify-between text-sm group hover:bg-[rgba(14,165,255,0.04)] px-3 py-2 rounded-lg transition-colors duration-200"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-[var(--text-secondary)] truncate font-medium group-hover:text-[var(--text-primary)] transition-colors">
                {d.name}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-[var(--text-primary)] font-semibold text-xs w-20 text-right">
                {d.value.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
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
const TopProductsList = ({ data, t }) => {
  const top7 = data.slice(0, 7);
  const max = top7[0]?.revenue || 1;

  return (
    <motion.div variants={fadeUp} className="card p-6 h-full flex flex-col">
      <h3 className="card-title">{t('dashboard.topProducts')}</h3>
      <div className="space-y-4 flex-grow overflow-y-auto custom-scrollbar pr-2 mt-2">
        {top7.map((p, i) => (
          <motion.div
            key={p.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--text-secondary)] truncate pr-2 group-hover:text-[var(--primary)] transition-colors">
                {i + 1}. {p.name}
              </span>
              <span className="text-sm font-bold text-[var(--text-primary)] flex-shrink-0">
                {p.revenue.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(p.revenue / max) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.3 + i * 0.05, ease: "easeOut" }}
                className="h-full bg-[var(--primary)] rounded-full"
              />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* AI FORECASTING CHART                             */
/* -------------------------------------------------------------------------- */
const AiForecastingChart = ({ data, theme }) => {
  const gridColor = theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
  const textColor = theme === 'light' ? '#94A3B8' : '#64748B';

  return (
    <motion.div variants={fadeUp} className="card p-6 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-[rgba(139,92,246,0.1)] text-[#8b5cf6] flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        </div>
        <h3 className="card-title !mb-0">AI Sales Forecasting</h3>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">Predicted revenue for the upcoming week based on historical velocity.</p>
      
      <div className="flex-grow min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data || []} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid stroke={gridColor} strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="day" stroke={textColor} tick={{ fill: textColor, fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
            <YAxis stroke={textColor} tick={{ fill: textColor, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'var(--surface)', borderRadius: '12px', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card-hover)', color: 'var(--text-primary)' }}
              itemStyle={{ color: '#8b5cf6', fontWeight: 'bold' }}
              formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Predicted']}
            />
            <Area type="monotone" dataKey="predicted" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorPredicted)" activeDot={{ r: 6, stroke: 'var(--surface)', strokeWidth: 2, fill: '#8b5cf6' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* SMART REPLENISHMENT LIST                         */
/* -------------------------------------------------------------------------- */
const SmartReplenishmentList = ({ data }) => {
  return (
    <motion.div variants={fadeUp} className="card p-6 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-[rgba(245,158,11,0.1)] text-[var(--warning)] flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
        </div>
        <h3 className="card-title !mb-0">Smart Replenishment</h3>
      </div>
      <p className="text-sm text-[var(--text-muted)] mb-6">AI suggestions based on stock levels and sales velocity.</p>
      
      <div className="space-y-3 flex-grow overflow-y-auto custom-scrollbar pr-2">
        {data?.map((item, i) => (
          <div key={i} className="p-4 rounded-xl border border-[var(--border)] bg-[rgba(0,0,0,0.01)] dark:bg-[rgba(255,255,255,0.02)]">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-semibold text-[var(--text-primary)]">{item.name}</h4>
              <span className="badge badge-warning">Buy {item.recommendedBuy}</span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-[var(--text-secondary)]">Current Stock: <strong className="text-[var(--danger)]">{item.currentStock}</strong></span>
            </div>
            <p className="text-xs text-[var(--text-muted)] italic">"{item.reason}"</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

/* -------------------------------------------------------------------------- */
/* MAIN COMPONENT                             */
/* -------------------------------------------------------------------------- */
export default function AnalyticsDashboard() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)));
  const [endDate, setEndDate] = useState(new Date());

  const reportData = analyticsData;
  const aiData = aiAnalyticsData;

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  const top_products = useMemo(() => reportData?.topProducts || [], [reportData]);
  const revenue_trend = useMemo(() => (reportData?.revenueTrend || []).map(item => ({
    day: new Date(item.date).toLocaleDateString('en-IN', { weekday: 'short' }),
    totalRevenue: item.revenue
  })), [reportData]);
  
  const summary = useMemo(() => ({
    total_revenue: reportData?.monthly?.revenue || 0,
    total_orders: reportData?.monthly?.orders || 0,
    total_products_sold: reportData?.monthly?.itemsSold || 0
  }), [reportData]);

  const changes = useMemo(() => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-xl font-bold text-[var(--text-muted)] animate-pulse">
          {t('dashboard.loading')}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="visible"
    >
      <div className="page-header flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="page-title">{t('dashboard.title')}</h1>
          <p className="page-subtitle">{t('dashboard.subtitle')}</p>
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-2 shadow-sm">
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
              className="bg-transparent text-[var(--text-primary)] text-sm font-medium focus:outline-none cursor-pointer w-48"
              placeholderText={t('dashboard.datePlaceholder')}
              showPopperArrow={false}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard title={t('dashboard.totalRevenue')} value={summary.total_revenue || 0} change={changes.revenue} icon={<RevenueIcon />} color="blue" t={t} />
        <StatCard title={t('dashboard.totalOrders')} value={summary.total_orders || 0} change={changes.orders} icon={<OrdersIcon />} color="cyan" t={t} />
        <StatCard title={t('dashboard.productsSold')} value={summary.total_products_sold || 0} change={changes.products} icon={<ProductsSoldIcon />} color="amber" t={t} />
        <StatCard title="Low Stock Alerts" value={2} change={null} icon={<AlertsIcon />} color="red" t={t} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2">
          <RevenueHeroChart data={revenue_trend} totalRevenue={summary.total_revenue || 0} t={t} theme={theme} />
        </div>
        <div className="lg:col-span-1">
          <SalesByCategoryChart data={top_products} t={t} theme={theme} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <TopProductsList data={top_products} t={t} />
        </div>
        <div className="lg:col-span-1">
          <AiForecastingChart data={aiData?.forecasting} theme={theme} />
        </div>
        <div className="lg:col-span-1">
          <SmartReplenishmentList data={aiData?.smartReplenishment} />
        </div>
      </div>
    </motion.div>
  );
}