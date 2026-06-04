import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

const api = axios.create({ baseURL: API_URL, withCredentials: false })

// Attach access token to every request
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refresh })
          localStorage.setItem('access_token', data.access_token)
          err.config.headers.Authorization = `Bearer ${data.access_token}`
          return api(err.config)
        } catch {
          localStorage.clear()
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(err)
  }
)

export default api

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login:          (email: string, password: string) => api.post('/auth/login', { email, password }),
  logout:         (refresh_token: string)            => api.post('/auth/logout', { refresh_token }),
  me:             ()                                 => api.get('/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    api.post('/auth/change-password', { current_password, new_password }),
}

// ─── Tickets ─────────────────────────────────────────────────────────────────
export const ticketsApi = {
  list:         (params?: Record<string, string>) => api.get('/tickets/', { params }),
  get:          (id: string)                       => api.get(`/tickets/${id}`),
  create:       (data: { title: string; description: string }) => api.post('/tickets/', data),
  updateStatus: (id: string, status: string, resolution_note?: string) =>
    api.patch(`/tickets/${id}/status`, { status, resolution_note }),
  assign:       (id: string, agent_id: string)    => api.patch(`/tickets/${id}/assign`, { agent_id }),
  escalate:     (id: string, reason: string)       => api.post(`/tickets/${id}/escalate`, { reason }),
  addComment:   (id: string, content: string, is_internal: boolean) =>
    api.post(`/tickets/${id}/comments`, { content, is_internal }),
  getAiReply:   (id: string)                       => api.get(`/tickets/${id}/ai-reply`),
}

// ─── Analytics ────────────────────────────────────────────────────────────────
export const analyticsApi = {
  overview:      () => api.get('/analytics/overview'),
  byDepartment:  () => api.get('/analytics/by-department'),
  byPriority:    () => api.get('/analytics/by-priority'),
  byStatus:      () => api.get('/analytics/by-status'),
}

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminApi = {
  listUsers:       ()               => api.get('/admin/users'),
  createUser:      (data: any)      => api.post('/admin/users', data),
  updateUser:      (id: string, data: any) => api.patch(`/admin/users/${id}`, data),
  listDepartments: ()               => api.get('/admin/departments'),
  systemStats:     ()               => api.get('/admin/system-stats'),
}
