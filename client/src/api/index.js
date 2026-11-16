import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:5000/api',
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
};

// Room API
export const roomAPI = {
  create: (data) => API.post('/rooms/create', data),
  join: (token) => API.post('/rooms/join', { token }),
  getMyRooms: () => API.get('/rooms/my/rooms'),
  getRoom: (id) => API.get(`/rooms/${id}`),
  updateMedia: (id, data) => API.put(`/rooms/${id}/media`, data),
  addToPlaylist: (id, data) => API.post(`/rooms/${id}/playlist`, data),
  getMessages: (id) => API.get(`/rooms/${id}/messages`),
  deleteRoom: (id) => API.delete(`/rooms/${id}`),
};

export default API;
