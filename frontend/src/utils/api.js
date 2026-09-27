/**
 * Axios instance with JWT interceptors
 */

import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const PYTHON_BASE = process.env.REACT_APP_PYTHON_API_URL || 'http://127.0.0.1:8000'; // 127.0.0.1, not localhost: the service is IPv4-only and Windows tries IPv6 first (+200ms per request)

// ─── Main Backend API ─────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, err => Promise.reject(err));

// Handle 401 globally (token expired)
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Python Face Recognition API ─────────────────────────────────────────────

export const pythonApi = axios.create({
  baseURL: PYTHON_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

// ─── API Helper Functions ─────────────────────────────────────────────────────

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  updatePassword: (data) => api.put('/auth/update-password', data),
};

export const studentsAPI = {
  getAll: (params) => api.get('/students', { params }),
  getMe: () => api.get('/students/me'),
  getById: (id) => api.get(`/students/${id}`),
  update: (id, data) => api.put(`/students/${id}`, data),
  delete: (id) => api.delete(`/students/${id}`),
  encodeFace: (id, data) => api.post(`/students/${id}/encode-face`, data),
  getAllEncodings: () => api.get('/students/encodings/all'),
};

export const attendanceAPI = {
  getAll: (params) => api.get('/attendance', { params }),
  getMy: (params) => api.get('/attendance/my', { params }),
  getStats: () => api.get('/attendance/stats'),
  mark: (data) => api.post('/attendance/mark', data),
  exportCSV: (params) => api.get('/attendance/export', {
    params,
    responseType: 'blob' // For file download
  }),
  delete: (id) => api.delete(`/attendance/${id}`),
};

export const adminAPI = {
  getDashboard: () => api.get('/admin/dashboard'),
  getUsers: () => api.get('/admin/users'),
  toggleUser: (id) => api.put(`/admin/users/${id}/toggle`),
  bulkCreateStudents: (data) => api.post('/admin/students/bulk', data),
};

export const faceAPI = {
  status: () => pythonApi.get('/status'),
  recognizeFrame: (imageData) => pythonApi.post('/recognize-frame', { image: imageData }),
  encodeFaces: (images) => pythonApi.post('/encode', { images }),
  reloadEncodings: () => pythonApi.post('/encodings/reload'),
  start: () => pythonApi.post('/start'),
  stop: () => pythonApi.post('/stop'),
};

export default api;
