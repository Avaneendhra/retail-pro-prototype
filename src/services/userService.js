import api from '../api/apiClient';

// Create a new user (OWNER only)
export async function createUser(userRequest) {
  const res = await api.post('/api/users', userRequest);
  return res.data;
}

// Get all users
export async function listUsers() {
  const res = await api.get('/api/users');
  return res.data;
}

// Get user by ID
export async function getUser(id) {
  const res = await api.get(`/api/users/${id}`);
  return res.data;
}

// Update user details
export async function updateUser(id, userRequest) {
  const res = await api.put(`/api/users/${id}`, userRequest);
  return res.data;
}

// Delete user by ID
export async function deleteUser(id) {
  const res = await api.delete(`/api/users/${id}`);
  return res.data;
}
