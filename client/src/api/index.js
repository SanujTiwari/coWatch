import axios from 'axios';

export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN || 'http://localhost:5000';
export const getAvatarUrl = (avatar) => avatar?.startsWith('/uploads/') ? `${API_ORIGIN}${avatar}` : avatar;

const API = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('cowatch_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors globally
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('cowatch_token');
      localStorage.removeItem('cowatch_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => API.post('/auth/register', data),
  login: (data) => API.post('/auth/login', data),
  getMe: () => API.get('/auth/me'),
  updateProfile: (data) => API.put('/auth/profile', data),
  uploadAvatar: (formData) => API.post('/auth/upload-avatar', formData, { headers: { 'Content-Type': undefined } }),
  forgotPassword: (email) => API.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => API.post(`/auth/reset-password/${token}`, { password }),
};

// Friends API
export const friendAPI = {
  search: (q) => API.get('/friends/search', { params: { q } }),
  sendRequest: (friendId) => API.post('/friends/request', { friendId }),
  acceptRequest: (id) => API.post(`/friends/request/${id}/accept`),
  rejectRequest: (id) => API.post(`/friends/request/${id}/reject`),
  cancelRequest: (id) => API.post(`/friends/request/${id}/cancel`),
  getFriends: () => API.get('/friends'),
  getPendingRequests: () => API.get('/friends/requests'),
  getBlockedUsers: () => API.get('/friends/blocked'),
  blockUser: (id) => API.post(`/friends/${id}/block`),
  unblockUser: (id) => API.post(`/friends/${id}/unblock`),
  reportUser: (data) => API.post('/friends/report', data),
};

// Room API
export const roomAPI = {
  create: (data) => API.post('/rooms/create', data),
  join: (token) => API.post('/rooms/join', { token }),
  getMyRooms: () => API.get('/rooms/my/rooms'),
  getRoom: (id) => API.get(`/rooms/${id}`),
  updateMedia: (id, data) => API.put(`/rooms/${id}/media`, data),
  addToPlaylist: (id, data) => API.post(`/rooms/${id}/playlist`, data),
  reorderPlaylist: (id, itemIds) => API.put(`/rooms/${id}/playlist/order`, { itemIds }),
  removeFromPlaylist: (id, itemId) => API.delete(`/rooms/${id}/playlist/${itemId}`),
  getPlaylist: (id) => API.get(`/rooms/${id}/playlist`),
  getMessages: (id) => API.get(`/rooms/${id}/messages`),
  getModeration: (id) => API.get(`/rooms/${id}/moderation`),
  moderateParticipant: (id, userId, action) => API.patch(`/rooms/${id}/participants/${userId}`, { action }),
  deleteRoom: (id) => API.delete(`/rooms/${id}`),
};

export default API;
