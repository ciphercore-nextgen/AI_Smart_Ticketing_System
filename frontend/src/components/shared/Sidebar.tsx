'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Ticket, BarChart3, Users, Settings,
  LogOut, Building2, Plus, Bell, Shield, FileText,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/lib/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

const navByRole: Record<string, { href: string; icon: any; label: string }[]> = {
  employee: [
    { href: '/dashboard/employee', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/tickets',            icon: Ticket,          label: 'My Tickets' },
    { href: '/tickets/new',        icon: Plus,            label: 'New Ticket' },
    { href: '/alerts',             icon: Bell,            label: 'Alerts' },
  ],
  ai_intern: [
    { href: '/dashboard/agent',      icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/tickets',              icon: Ticket,          label: 'My Queue' },
    { href: '/analytics/department', icon: BarChart3,       label: 'Analytics' },
    { href: '/alerts',               icon: Bell,            label: 'Alerts' },
  ],
  it_support_technician: [
    { href: '/dashboard/agent',      icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/tickets',              icon: Ticket,          label: 'My Queue' },
    { href: '/analytics/department', icon: BarChart3,       label: 'Analytics' },
    { href: '/alerts',               icon: Bell,            label: 'Alerts' },
  ],
  junior_operations: [
    { href: '/dashboard/agent',      icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/tickets',              icon: Ticket,          label: 'My Queue' },
    { href: '/analytics/department', icon: BarChart3,       label: 'Analytics' },
    { href: '/alerts',               icon: Bell,            label: 'Alerts' },
  ],
  admin: [
    { href: '/dashboard/admin',   icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/tickets',           icon: Ticket,          label: 'All Tickets' },
    { href: '/admin/users',       icon: Users,           label: 'Users' },
    { href: '/admin/departments', icon: Building2,       label: 'Departments' },
    { href: '/analytics/admin',   icon: BarChart3,       label: 'Analytics' },
    { href: '/admin/reports',     icon: FileText,        label: 'Reports' },
    { href: '/alerts',            icon: Bell,            label: 'Alerts' },
    { href: '/admin/settings',    icon: Settings,        label: 'Settings' },
  ],
  super_admin: [
    { href: '/dashboard/admin',   icon: Shield,          label: 'Dashboard' },
    { href: '/tickets',           icon: Ticket,          label: 'All Tickets' },
    { href: '/admin/users',       icon: Users,           label: 'Users' },
    { href: '/admin/departments', icon: Building2,       label: 'Departments' },
    { href: '/analytics/admin',   icon: BarChart3,       label: 'Analytics' },
    { href: '/admin/reports',     icon: FileText,        label: 'Reports' },
    { href: '/alerts',            icon: Bell,            label: 'Alerts' },
    { href: '/admin/settings',    icon: Settings,        label: 'Settings' },
  ],
}

const ROLE_LABELS: Record<string, string> = {
  employee:              'Employee',
  ai_intern:             'AI Intern',
  it_support_technician: 'IT Support',
  junior_operations:     'Jr Automation Support',
  admin:                 'Administrator',
  super_admin:           'Super Admin',
}

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const { user, clearAuth, refresh_token } = useAuthStore()

  const role     = user?.role || 'employee'
  const navItems = navByRole[role] || navByRole.employee
  const initials = user?.full_name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() || 'U'

  const handleLogout = async () => {
    try { if (refresh_token) await authApi.logout(refresh_token) } catch {}
    clearAuth()
    if (typeof window !== 'undefined') localStorage.removeItem('ticketiq-auth')
    toast.success('Signed out')
    router.push('/login')
  }

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col z-40"
      style={{
        width: 'var(--sidebar-w)',
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: '1px solid var(--border)', height: 'var(--header-h)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--accent)' }}>
          <Ticket className="w-3.5 h-3.5" style={{ color: '#fff' }} />
        </div>
        <div>
          <p className="text-sm font-bold tracking-tight" style={{ color: 'var(--text)' }}>TicketIQ</p>
          <p className="text-xs" style={{ color: 'var(--text-3)', marginTop: -1 }}>Enterprise</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        <p className="section-label px-2 mb-2">Menu</p>
        {navItems.map(item => {
          const active = pathname === item.href || (item.href !== '/dashboard/employee' && item.href !== '/dashboard/agent' && item.href !== '/dashboard/admin' && pathname.startsWith(item.href + '/'))
          return (
            <Link key={item.href} href={item.href}
              className={clsx('nav-item', active && 'active')}>
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-3" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg mb-1">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{user?.full_name}</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{ROLE_LABELS[role]}</p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="nav-item w-full"
          style={{ color: 'var(--text-3)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.background = 'var(--danger-bg)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = '' }}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
