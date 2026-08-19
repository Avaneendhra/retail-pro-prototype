import api from '../api/apiClient';

// Create a new payment
export async function createPayment(payment) {
  const res = await api.post('/api/payments', payment);
  return res.data;
}

// Get payment by ID
export async function getPayment(paymentId) {
  const res = await api.get(`/api/payments/${paymentId}`);
  return res.data;
}

// List all payments
export async function listPayments() {
  const res = await api.get('/api/payments');
  return res.data;
}
