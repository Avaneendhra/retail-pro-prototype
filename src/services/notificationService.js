import api from '../api/apiClient';

// Send a notification to a user (JSON body)
export async function sendNotification(notificationRequest) {
  const res = await api.post('/api/notifications', notificationRequest);
  return res.data;
}

// Get all notifications
export async function listNotifications() {
  const res = await api.get('/api/notifications');
  return res.data;
}

// Send a test notification email
export async function sendTestNotification(email, message) {
  const res = await api.post(`/api/notifications/test?email=${encodeURIComponent(email)}&message=${encodeURIComponent(message)}`);
  return res.data;
}

// Subscribe to push notifications
export async function subscribePush(subscription) {
  const res = await api.post('/api/notifications/subscribe', subscription);
  return res.data;
}

// Get VAPID public key for push notification setup
export async function getVapidPublicKey() {
  const res = await api.get('/api/notifications/vapid-public-key');
  return res.data;
}
