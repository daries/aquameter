import axios from 'axios'
import { getToken, clearAuth } from './auth'

const BASE = '/api'

const api = axios.create({
  baseURL: BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach auth token to every request
api.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle responses & errors
api.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) {
      clearAuth()
      window.location.href = '/login'
    }
    const msg = err.response?.data?.error || err.message || 'Terjadi kesalahan jaringan'
    return Promise.reject(new Error(msg))
  }
)

// ─── Auth ───
export const authAPI = {
  login:  (data) => api.post('/auth/login', data),
  logout: ()     => api.post('/auth/logout'),
  me:     ()     => api.get('/auth/me'),
}

// ─── Customers ───
export const customerAPI = {
  getAll:  (params)    => api.get('/customers', { params }),
  getById: (id)        => api.get(`/customers/${id}`),
  create:  (data)      => api.post('/customers', data),
  update:  (id, data)  => api.put(`/customers/${id}`, data),
  remove:  (id)        => api.delete(`/customers/${id}`),
}

// ─── Readings ───
export const readingAPI = {
  getAll: (params)    => api.get('/readings', { params }),
  create: (data)      => api.post('/readings', data),
  update: (id, data)  => api.patch(`/readings/${id}`, data),
}

// ─── Bills ───
export const billAPI = {
  getAll:     (params) => api.get('/bills', { params }),
  getById:    (id)     => api.get(`/bills/${id}`),
  markPaid:   (id)     => api.patch(`/bills/${id}/pay`),
  markUnpaid: (id)     => api.patch(`/bills/${id}/unpay`),
}

// ─── Tariffs ───
export const tariffAPI = {
  getAll:  ()          => api.get('/tariffs'),
  update:  (grp, blocks) => api.put(`/tariffs/${grp}`, { blocks }),
}

// ─── Settings ───
export const settingsAPI = {
  get:    ()     => api.get('/settings'),
  update: (data) => api.put('/settings', data),
}

// ─── Reports ───
export const reportAPI = {
  monthly: (year) => api.get('/reports/monthly', { params: { year } }),
  summary: ()     => api.get('/reports/summary'),
}

// ─── Users ───
export const userAPI = {
  getAll:  ()          => api.get('/users'),
  create:  (data)      => api.post('/users', data),
  update:  (id, data)  => api.put(`/users/${id}`, data),
  remove:  (id)        => api.delete(`/users/${id}`),
}

// ─── WhatsApp Bot ───
export const waAPI = {
  status:     ()     => api.get('/whatsapp/status'),
  connect:    ()     => api.post('/whatsapp/connect'),
  disconnect: ()     => api.post('/whatsapp/disconnect'),
}

// ─── Transaction Categories ───
export const categoryAPI = {
  getAll:  ()          => api.get('/transaction-categories'),
  create:  (data)      => api.post('/transaction-categories', data),
  update:  (id, data)  => api.put(`/transaction-categories/${id}`, data),
  remove:  (id)        => api.delete(`/transaction-categories/${id}`),
}

// ─── Installations (Pasang Baru) ───
export const installationAPI = {
  getAll:   (params)    => api.get('/installations', { params }),
  getById:  (id)        => api.get(`/installations/${id}`),
  create:   (data)      => api.post('/installations', data),
  update:   (id, data)  => api.put(`/installations/${id}`, data),
  invoice:  (id, data)  => api.patch(`/installations/${id}/invoice`, data || {}),
  pay:      (id)        => api.patch(`/installations/${id}/pay`),
  install:  (id, data)  => api.patch(`/installations/${id}/install`, data),
  cancel:   (id)        => api.patch(`/installations/${id}/cancel`),
}

// ─── Transactions (Buku Kas) ───
export const transactionAPI = {
  getAll:   (params) => api.get('/transactions', { params }),
  getSummary: (params) => api.get('/transactions/summary', { params }),
  create:   (data)   => api.post('/transactions', data),
  remove:   (id)     => api.delete(`/transactions/${id}`),
}

// ─── Tickets (Pengaduan) ───
export const ticketAPI = {
  getAll:      (params)    => api.get('/tickets', { params }),
  getById:     (id)        => api.get(`/tickets/${id}`),
  create:      (data)      => api.post('/tickets', data),
  update:      (id, data)  => api.put(`/tickets/${id}`, data),
  updateStatus:(id, data)  => api.patch(`/tickets/${id}/status`, data),
  remove:      (id)        => api.delete(`/tickets/${id}`),
  categories:  ()          => api.get('/tickets/meta/categories'),
}

// ─── Ticket Categories (master data) ───
export const ticketCategoryAPI = {
  getAll:  ()          => api.get('/ticket-categories'),
  create:  (data)      => api.post('/ticket-categories', data),
  update:  (id, data)  => api.put(`/ticket-categories/${id}`, data),
  remove:  (id)        => api.delete(`/ticket-categories/${id}`),
}

export default api
