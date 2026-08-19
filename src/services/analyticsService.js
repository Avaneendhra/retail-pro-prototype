import api from '../api/apiClient';

// Fetch daily sales analytics
export async function getDailyAnalytics() {
  const res = await api.get('/api/analytics/daily');
  return res.data;
}

// Fetch monthly sales analytics
export async function getMonthlyAnalytics() {
  const res = await api.get('/api/analytics/monthly');
  return res.data;
}

// Fetch top products analytics
export async function getTopProducts() {
  const res = await api.get('/api/analytics/top-products');
  return res.data;
}

// Fetch revenue trend data
export async function getRevenueTrend() {
  const res = await api.get('/api/analytics/revenue-trend');
  return res.data;
}



