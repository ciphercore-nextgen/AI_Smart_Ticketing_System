'use client'
import { Bell, Search, LogOut } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import toast from 'react-hot-toast'

interface HeaderProps { title: string; subtitle?: string }

export default function Header({ title, subtitle }: HeaderProps) {
  const { user, clearAuth, refresh_token } = useAuthStore()
  const router = useRouter()

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const handleLogout = async () => {
    try {
      if (refresh_token) await authApi.logout(refresh_token)
    } catch { /* silent */ }
    clearAuth()
    // Clear everything from localStorage to prevent stale token issues
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ticketiq-auth')
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
    }
    toast.success('Signed out')
    router.push('/login')
  }

  return (
    <header className="h-16 bg-gray-950 border-b border-gray-800/60 flex items-center justify-between px-6 fixed top-0 left-64 right-0 z-30">
      <div>
        <h1 className="text-lg font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            placeholder="Search tickets..."
            className="bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
          />
        </div>
        <button className="relative w-9 h-9 rounded-lg bg-gray-900 border border-gray-700 flex items-center justify-center hover:bg-gray-800 transition">
          <Bell className="w-4 h-4 text-gray-400" />
        </button>

        {/* User info + logout */}
        <div className="flex items-center gap-2 pl-3 border-l border-gray-800">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-medium text-white">{greeting()}, {user?.full_name?.split(' ')[0]}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role?.replace(/_/g, ' ')}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="ml-2 w-8 h-8 rounded-lg bg-gray-900 border border-gray-700 flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-gray-500 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
