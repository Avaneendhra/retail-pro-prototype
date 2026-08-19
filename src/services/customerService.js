// src/services/customerService.js
import api from '../api/apiClient'

/**
 * Create a new customer
 */
export async function createCustomer(customer) {
  try {
    const res = await api.post('/api/customers', customer)
    return res.data
  } catch (err) {
    console.error('Failed to create customer:', err)
    throw err.response?.data || err
  }
}

/**
 * Get a single customer by ID
 */
export async function getCustomer(id) {
  try {
    const res = await api.get(`/api/customers/${id}`)
    return res.data
  } catch (err) {
    console.error(`Failed to fetch customer ${id}:`, err)
    throw err.response?.data || err
  }
}

/**
 * Get all customers
 */
export async function listCustomers() {
  try {
    const res = await api.get('/api/customers')
    return res.data
  } catch (err) {
    console.error('Failed to list customers:', err)
    throw err.response?.data || err
  }
}

/**
 * Update an existing customer
 */
export async function updateCustomer(id, customer) {
  try {
    const res = await api.put(`/api/customers/${id}`, customer)
    return res.data
  } catch (err) {
    console.error(`Failed to update customer ${id}:`, err)
    throw err.response?.data || err
  }
}

/**
 * Delete a customer by ID
 */
export async function deleteCustomer(id) {
  try {
    const res = await api.delete(`/api/customers/${id}`)
    return res.data
  } catch (err) {
    console.error(`Failed to delete customer ${id}:`, err)
    throw err.response?.data || err
  }
}

/**
 * Get customer purchase history (with optional date range)
 */
export async function getPurchaseHistory(customerId, startDate, endDate) {
  try {
    const params = {}
    if (startDate) params.startDate = startDate
    if (endDate) params.endDate = endDate

    const res = await api.get(`/api/customers/${customerId}/purchase-history`, { params })
    return res.data
  } catch (err) {
    console.error(`Failed to fetch purchase history for ${customerId}:`, err)
    throw err.response?.data || err
  }
}

/**
 * Trigger monthly purchase reminders manually
 */
export async function triggerReminders() {
  try {
    const res = await api.post('/api/customers/reminders')
    return res.data
  } catch (err) {
    console.error('Failed to trigger reminders:', err)
    throw err.response?.data || err
  }
}

/**
 * Send a custom email to a list of customers
 * @param {Object} emailRequest - { customerIds: string[], subject: string, body: string }
 */
export async function sendCustomEmail(emailRequest) {
  try {
    const res = await api.post('/api/customers/send-email', emailRequest)
    return res.data
  } catch (err) {
    console.error('Failed to send custom email:', err)
    throw err.response?.data || err
  }
}