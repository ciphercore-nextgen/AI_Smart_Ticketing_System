import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  full_name: string
  role: 'employee' | 'ai_intern' | 'it_support_technician' | 'junior_operations' | 'admin' | 'super_admin'
  employee_id?: string
  department_id?: string
  department_name?: string
  agent_departments?: string[]      // e.g. ["hr"] or ["it","finance"]
  agent_role_key?: string           // ai_intern / it_support_technician / junior_operations
  job_title?: string
  office_location?: string
  avatar_url?: string
  permissions?: string[]
}

interface AuthState {
  user: User | null
  access_token: string | null
  refresh_token: string | null
  isAuthenticated: boolean
  setAuth: (user: User, access_token: string, refresh_token: string) => void
  clearAuth: () => void
  updateUser: (updates: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      access_token: null,
      refresh_token: null,
      isAuthenticated: false,

      setAuth: (user, access_token, refresh_token) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('access_token', access_token)
          localStorage.setItem('refresh_token', refresh_token)
        }
        set({ user, access_token, refresh_token, isAuthenticated: true })
      },

      clearAuth: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
        }
        set({ user: null, access_token: null, refresh_token: null, isAuthenticated: false })
      },

      updateUser: (updates) =>
        set((state) => ({ user: state.user ? { ...state.user, ...updates } : null })),
    }),
    {
      name: 'ticketiq-auth',
      partialize: (state) => ({
        user: state.user,
        access_token: state.access_token,
        refresh_token: state.refresh_token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
