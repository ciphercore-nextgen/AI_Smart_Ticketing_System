'use client'
import { Bell, Search, LogOut, Sun, Moon } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { useTheme } from './ThemeProvider'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface HeaderProps { title: string; subtitle?: string }

export default function Header({ title, subtitle }: HeaderProps) {
  const { user, clearAuth, refresh_token } = useAuthStore()
  const { theme, toggle } = useTheme()
  const router = useRouter()

  const handleLogout = async () => {
    try { if (refresh_token) await authApi.logout(refresh_token) } catch {}
    clearAuth()
    if (typeof window !== 'undefined') localStorage.removeItem('ticketiq-auth')
    toast.success('Signed out')
    router.push('/login')
  }

  return (
    <header
      className="flex items-center justify-between px-6 fixed right-0 z-30"
      style={{
        left: 'var(--sidebar-w)',
        height: 'var(--header-h)',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Page title */}
      <div>
        <h1 className="font-semibold" style={{ fontSize: 15, color: 'var(--text)' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{subtitle}</p>}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} />
          <input
            placeholder="Search..."
            className="input"
            style={{ paddingLeft: 30, width: 180, height: 34, fontSize: 13 }}
          />
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex items-center justify-center rounded-lg transition"
          style={{
            width: 34, height: 34,
            background: 'var(--bg-muted)',
            border: '1px solid var(--border)',
            color: 'var(--text-3)',
          }}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Alerts bell */}
        <Link href="/alerts">
          <button
            className="flex items-center justify-center rounded-lg transition"
            style={{
              width: 34, height: 34,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              color: 'var(--text-3)',
            }}
          >
            <Bell className="w-4 h-4" />
          </button>
        </Link>

        {/* Divider */}
        <div className="w-px h-5 mx-1" style={{ background: 'var(--border)' }} />

        {/* User + logout */}
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{user?.full_name?.split(' ')[0]}</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'capitalize' }}>
              {user?.role?.replace(/_/g,' ')}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Sign out"
            className="flex items-center justify-center rounded-lg transition"
            style={{
              width: 34, height: 34,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
              color: 'var(--text-3)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.background = 'var(--danger-bg)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-muted)' }}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
