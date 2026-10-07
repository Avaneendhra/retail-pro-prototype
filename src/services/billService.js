// src/services/billService.js
import api from '../api/apiClient';

/**
 * Create a new bill
 */
export async function createBill(bill) {
  try {
    const res = await api.post('/api/bills', bill, {
      headers: { 'Content-Type': 'application/json' },
    });
    return res.data;
  } catch (err) {
    console.error('Failed to create bill:', err);
    throw err.response?.data || err;
  }
}

/**
 * Get a single bill by ID
 */
export async function getBill(billId) {
  try {
    const res = await api.get(`/api/bills/${billId}`);
    return res.data;
  } catch (err) {
    console.error(`Failed to fetch bill ${billId}:`, err);
    throw err.response?.data || err;
  }
}

/**
 * Get all bills
 */
export async function listBills() {
  try {
    const res = await api.get('/api/bills');
    return res.data;
  } catch (err) {
    console.error('Failed to list bills:', err);
    throw err.response?.data || err;
  }
}

/**
 * Download bill PDF
 */
export async function downloadBillPdf(billId, token = null) {
  try {
    if (!token) {
      throw new Error('PDF access token is required');
    }

    const url = `/api/bills/${billId}/pdf?token=${encodeURIComponent(token)}`;
    const res = await api.get(url, {
      responseType: 'blob'
    });
    return res.data;
  } catch (err) {
    console.error(`Failed to download PDF for bill ${billId}:`, err);
    throw err.response?.data || err;
  }
}

/**
 * Generate PDF access token for existing bill
 */
export async function generatePdfToken(billId) {
  try {
    const res = await api.post(`/api/bills/${billId}/generate-token`);
    return res.data;
  } catch (err) {
    console.error(`Failed to generate PDF token for bill ${billId}:`, err);
    throw err.response?.data || err;
  }
}

/**
 * Bulk upload bills via CSV
 */
export async function bulkUploadBills(csvFile) {
  try {
    const formData = new FormData();
    formData.append('file', csvFile);

    const res = await api.post('/api/bills/bulk', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return res.data;
  } catch (err) {
    console.error('Failed to bulk upload bills:', err);
    throw err.response?.data || err;
  }
}

/**
 * Resend bill email to customer
 */
export async function resendBillEmail(billId) {
  try {
    const res = await api.post(`/api/bills/resend-email/${billId}`);
    return res.data;
  } catch (err) {
    console.error(`Failed to resend email for bill ${billId}:`, err);
    throw err.response?.data || err;
  }
}

/**
 * Utility function to handle PDF download in browser
 */
export function handlePdfDownload(blob, billId) {
  // Create blob URL
  const blobUrl = window.URL.createObjectURL(blob);

  // Create temporary link and trigger download
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = `Bill_${billId}.pdf`;
  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);
}

/**
 * Complete PDF download flow with token generation
 */
export async function downloadBillPdfWithFlow(billId) {
  try {
    // First generate a token
    const tokenResponse = await generatePdfToken(billId);
    const { pdfAccessToken } = tokenResponse;

    // Then download the PDF
    const pdfBlob = await downloadBillPdf(billId, pdfAccessToken);

    return pdfBlob;
  } catch (error) {
    console.error('PDF download flow failed:', error);
    throw error;
  }
}