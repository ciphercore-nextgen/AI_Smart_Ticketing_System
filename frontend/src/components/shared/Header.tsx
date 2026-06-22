'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, Search, LogOut, Sun, Moon } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useRouter, usePathname } from 'next/navigation'
import { authApi, notificationsApi, ticketsApi } from '@/lib/api'
import { fetchAlertSummary, onReadStateChanged } from '@/lib/alerts'
import { useTheme } from './ThemeProvider'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface HeaderProps { title: string; subtitle?: string }

export default function Header({ title, subtitle }: HeaderProps) {
  const { user, clearAuth, refresh_token } = useAuthStore()
  const { theme, toggle } = useTheme()
  const router   = useRouter()
  const pathname = usePathname()

  const [unread, setUnread] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Recomputes the badge from the SAME alert list + read-state the alerts
  // page uses, instead of a manually-incremented counter — so it always
  // reflects what's actually still unread, no matter where it changed
  // (opened an item, marked all read, a new alert arrived, etc.).
  const refreshUnread = useCallback(async () => {
    try {
      const { unreadCount } = await fetchAlertSummary(ticketsApi, notificationsApi)
      setUnread(unreadCount)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { refreshUnread() }, [])   // eslint-disable-line

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(refreshUnread, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [refreshUnread])

  // Recompute whenever the route changes — covers leaving /alerts after
  // reading some items, and opening a ticket directly from a notification.
  useEffect(() => { refreshUnread() }, [pathname]) // eslint-disable-line

  // Recompute instantly when an item is marked read — covers reading
  // several alerts (or hitting "mark all read") without leaving the page.
  useEffect(() => onReadStateChanged(refreshUnread), [refreshUnread])

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
      <div>
        <h1 className="font-semibold" style={{ fontSize: 15, color: 'var(--text)' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
            style={{ color: 'var(--text-3)' }} />
          <input placeholder="Search…" className="input"
            style={{ paddingLeft: 30, width: 180, height: 34, fontSize: 13 }} />
        </div>

        <button onClick={toggle}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex items-center justify-center rounded-lg transition"
          style={{ width: 34, height: 34, background: 'var(--bg-muted)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <Link href="/alerts">
          <button
            className="relative flex items-center justify-center rounded-lg transition"
            style={{
              width: 34, height: 34,
              background: unread > 0 ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-muted))' : 'var(--bg-muted)',
              border: `1px solid ${unread > 0 ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'var(--border)'}`,
              color: unread > 0 ? 'var(--accent)' : 'var(--text-3)',
            }}>
            <Bell className="w-4 h-4" />
            {unread > 0 && (
              <span className="absolute flex items-center justify-center rounded-full font-bold"
                style={{
                  top: -5, right: -5, minWidth: 16, height: 16, padding: '0 3px',
                  fontSize: 10, background: 'var(--danger)', color: '#fff', lineHeight: 1,
                }}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
        </Link>

        <div className="w-px h-5 mx-1" style={{ background: 'var(--border)' }} />

        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
              {user?.full_name?.split(' ')[0]}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'capitalize' }}>
              {user?.role?.replace(/_/g, ' ')}
            </p>
          </div>
          <button onClick={handleLogout} title="Sign out"
            className="flex items-center justify-center rounded-lg transition"
            style={{ width: 34, height: 34, background: 'var(--bg-muted)', border: '1px solid var(--border)', color: 'var(--text-3)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.background = 'var(--danger-bg)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-muted)' }}>
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
