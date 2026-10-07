import api from '../api/apiClient';

// Sync pending data (for offline or queued data)
export async function syncPendingData() {
  const res = await api.post('/api/sync/pending');
  return res.data;
}
