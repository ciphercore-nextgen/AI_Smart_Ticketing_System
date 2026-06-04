'use client'
import { Bell, Search } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

interface HeaderProps { title: string; subtitle?: string }

export default function Header({ title, subtitle }: HeaderProps) {
  const { user } = useAuthStore()

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
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
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">3</span>
        </button>
        <div className="flex items-center gap-2 pl-3 border-l border-gray-800">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
            {user?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-medium text-white">{greeting()}</p>
            <p className="text-xs text-gray-500">{user?.full_name?.split(' ')[0]}</p>
          </div>
        </div>
      </div>
    </header>
  )
}
