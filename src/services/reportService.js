import api from '../api/apiClient';

/**
 * Fetches the combined JSON data for the report generator.
 * @param {object} params - { startDate, endDate, lowStockThreshold, expiryDays }
 */
export async function getFullReportData(params) {
  try {
    const res = await api.get('/api/reports/full', { params });
    return res.data;
  } catch (err) {
    console.error('Failed to fetch full report:', err);
    throw err.response?.data || err;
  }
}

/**
 * Downloads the full report as a PDF blob.
 * @param {object} params - { startDate, endDate, lowStockThreshold, expiryDays }
 */
export async function downloadFullReportPdf(params) {
  try {
    const res = await api.get('/api/reports/full/pdf', {
      params,
      responseType: 'blob', // <-- This is crucial!
    });
    return res.data; // This will be a Blob
  } catch (err) {
    console.error('Failed to download PDF report:', err);
    throw err.response?.data || err;
  }
}
