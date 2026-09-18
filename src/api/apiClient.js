import axios from 'axios';
import authService from '../services/authService';
// We can't use the hook here, so we import the i18n instance
import i18n from '../i18n';

const API_BASE = 'https://smartretailsystem.onrender.com';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' }
});

import { products, customers, bills, users, analytics, notifications } from './mockData';

api.defaults.adapter = async (config) => {
  console.log(`[Mock API] ${config.method.toUpperCase()} ${config.url}`);
  
  const response = (data) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ data, status: 200, statusText: 'OK', headers: {}, config, request: {} });
      }, 300);
    });
  };

  const url = config.url || '';
  const method = (config.method || 'get').toLowerCase();

  // Analytics
  if (url.includes('/api/analytics/daily')) return response(analytics.daily);
  if (url.includes('/api/analytics/monthly')) return response(analytics.monthly);
  if (url.includes('/api/analytics/top-products')) return response(analytics.topProducts);
  if (url.includes('/api/analytics/revenue-trend')) return response(analytics.revenueTrend);
  if (url.includes('/api/analytics/report')) return response(analytics);

  // Product by barcode lookup
  const barcodeMatch = url.match(/\/api\/products\/barcode\/(.+)/);
  if (barcodeMatch) {
    const barcode = barcodeMatch[1];
    const found = products.find(p => p.barcode === barcode);
    if (found) return response(found);
    return new Promise((_, reject) => {
      setTimeout(() => reject({ response: { status: 404, data: { error: 'Product not found' } } }), 200);
    });
  }

  // Single product by ID
  const productIdMatch = url.match(/\/api\/products\/([^/]+)$/);
  if (productIdMatch && method === 'get') {
    const id = productIdMatch[1];
    const found = products.find(p => p.productId === id || p.id === id);
    if (found) return response(found);
    return response({});
  }

  // POST handlers (create/update operations)
  if (method === 'post') {
    if (url.includes('/api/products')) return response({ success: true, message: 'Product saved' });
    if (url.includes('/api/bills')) return response({ success: true, message: 'Bill created' });
    if (url.includes('/api/customers')) return response({ success: true, message: 'Customer saved' });
    if (url.includes('/api/users')) return response({ success: true, message: 'User created' });
  }

  // GET list endpoints
  if (url.includes('/api/products')) return response(products);
  if (url.includes('/api/customers')) return response(customers);
  if (url.includes('/api/users')) return response(users);
  if (url.includes('/api/bills')) return response(bills);
  if (url.includes('/api/notifications')) return response(notifications);
  
  return response({});
};


api.interceptors.request.use((config) => {
  const token = authService.getAccessToken();
  // Get language from i18n instance or localStorage
  const lang = i18n.language || localStorage.getItem('sr_lang') || 'en';

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['Accept-Language'] = lang;

  return config;
});

let isRefreshing = false;
let refreshQueue = [];

function processQueue(err, newToken = null) {
  refreshQueue.forEach(p => (err ? p.reject(err) : p.resolve(newToken)));
  refreshQueue = [];
}

api.interceptors.response.use(
  res => res,
  async err => {
    const originalReq = err.config;

    if (!originalReq || originalReq._retry) return Promise.reject(err);

    if (err.response && err.response.status === 401) {
      originalReq._retry = true;

      try {
        if (!isRefreshing) {
          isRefreshing = true;
          const newTokens = await authService.refresh();
          isRefreshing = false;
          processQueue(null, newTokens.accessToken);
        }

        return new Promise((resolve, reject) => {
          refreshQueue.push({
            resolve: token => {
              originalReq.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalReq));
            },
            reject: error => reject(error)
          });
        });
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Use translated error
        return Promise.reject(new Error(i18n.t('errors.refreshFailed')));
      }
    }

    return Promise.reject(err);
  }
);

export default api;
