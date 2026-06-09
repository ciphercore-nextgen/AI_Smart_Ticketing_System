import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'

const api = axios.create({ baseURL: API_URL, withCredentials: false })

// Read token from Zustand persisted store
function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('ticketiq-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.access_token || null
  } catch { return null }
}

function getRefresh(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem('ticketiq-auth')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.state?.refresh_token || null
  } catch { return null }
}

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401 — use router.push NOT window.location.href
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      const refresh = getRefresh()
      if (refresh && !err.config._retry) {
        err.config._retry = true
        try {
          const { data } = await axios.post(`${API_URL}/auth/refresh`, { refresh_token: refresh })
          // Update stored token
          const raw = localStorage.getItem('ticketiq-auth')
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed?.state) {
              parsed.state.access_token = data.access_token
              localStorage.setItem('ticketiq-auth', JSON.stringify(parsed))
            }
          }
          err.config.headers.Authorization = `Bearer ${data.access_token}`
          return api(err.config)
        } catch {
          // Refresh failed — clear and redirect via Next.js router (not window.location)
          localStorage.removeItem('ticketiq-auth')
          if (typeof window !== 'undefined') window.location.replace('/login')
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

// ─── Tickets ──────────────────────────────────────────────────────────────────
export const ticketsApi = {
  list:         (params?: any)                           => api.get('/tickets/', { params }),
  get:          (id: string)                             => api.get(`/tickets/${id}`),
  create:       (data: any)                              => api.post('/tickets/', data),
  updateStatus: (id: string, status: string, resolution_note?: string) =>
    api.patch(`/tickets/${id}/status`, { status, resolution_note }),
  assign:       (id: string, agent_id: string)           => api.patch(`/tickets/${id}/assign`, { agent_id }),
  escalate:     (id: string, reason: string)             => api.post(`/tickets/${id}/escalate`, { reason }),
  addComment:   (id: string, content: string, is_internal: boolean) =>
    api.post(`/tickets/${id}/comments`, { content, is_internal }),
  getAiReply:   (id: string)                             => api.get(`/tickets/${id}/ai-reply`),
  autoResponse: (id: string, tone: string, trigger: string) =>
    api.post(`/tickets/${id}/auto-response`, { tone, trigger }),
  autoResponseAllTones: (id: string, trigger = 'agent_reply') =>
    api.get(`/tickets/${id}/auto-response/all-tones?trigger=${trigger}`),
  selfHelp:     (id: string)                             => api.get(`/tickets/${id}/self-help`),
}

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminApi = {
  listUsers:       ()                          => api.get('/admin/users'),
  updateUser:      (id: string, data: any)     => api.patch(`/admin/users/${id}`, data),
  listDepartments: ()                          => api.get('/admin/departments'),
  systemStats:     ()                          => api.get('/admin/system-stats'),
}

// ─── Analytics ────────────────────────────────────────────────────────────────
export const analyticsApi = {
  overview:      () => api.get('/analytics/overview'),
  byDepartment:  () => api.get('/analytics/by-department'),
  byPriority:    () => api.get('/analytics/by-priority'),
  byStatus:      () => api.get('/analytics/by-status'),
}
