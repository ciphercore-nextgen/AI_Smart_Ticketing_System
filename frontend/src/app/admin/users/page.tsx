'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { adminApi } from '@/lib/api'
import { Users, Search, RefreshCw, Cpu, Monitor, Workflow, Shield, User } from 'lucide-react'
import toast from 'react-hot-toast'

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  employee:              { label: 'Employee',                  color: '#22d3ee', bg: 'rgba(6,182,212,.1)',   icon: User     },
  ai_intern:             { label: 'AI Intern',                 color: '#a78bfa', bg: 'rgba(139,92,246,.1)',  icon: Cpu      },
  it_support_technician: { label: 'IT Support Assistant',      color: '#60a5fa', bg: 'rgba(59,130,246,.1)',  icon: Monitor  },
  junior_operations:     { label: 'Junior Automation Support', color: '#fbbf24', bg: 'rgba(245,158,11,.1)',  icon: Workflow },
  admin:                 { label: 'Admin',                     color: '#4ade80', bg: 'rgba(34,197,94,.1)',   icon: Shield   },
  super_admin:           { label: 'Super Admin',               color: '#f87171', bg: 'rgba(239,68,68,.1)',   icon: Shield   },
}

export default function UsersPage() {
  const [users,   setUsers]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  const load = () => {
    setLoading(true)
    adminApi.listUsers().then(({ data }) => setUsers(data))
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = users.filter(u =>
    !search ||
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.role?.toLowerCase().includes(search.toLowerCase())
  )

  const agents    = filtered.filter(u => ['ai_intern','it_support_technician','junior_operations'].includes(u.role))
  const employees = filtered.filter(u => u.role === 'employee')
  const admins    = filtered.filter(u => ['admin','super_admin'].includes(u.role))

  const UserCard = ({ u }: { u: any }) => {
    const cfg  = ROLE_CONFIG[u.role] || ROLE_CONFIG.employee
    const Icon = cfg.icon
    return (
      <div className="card rounded-xl p-4 flex items-center gap-3"
        style={{ borderColor: `color-mix(in srgb, ${cfg.color} 20%, transparent)` }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{ background: cfg.bg, color: cfg.color }}>
          {u.full_name?.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{u.full_name}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{u.email}</p>
        </div>
        <span className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full flex-shrink-0"
          style={{ background: cfg.bg, color: cfg.color }}>
          <Icon className="w-3 h-3" />
          {cfg.label}
        </span>
      </div>
    )
  }

  const Section = ({ title, items, emptyMsg }: { title: string; items: any[]; emptyMsg: string }) => (
    <div>
      <p className="section-label mb-3">{title} ({items.length})</p>
      {items.length === 0
        ? <p className="text-sm" style={{ color: 'var(--text-3)' }}>{emptyMsg}</p>
        : <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {items.map(u => <UserCard key={u.id} u={u} />)}
          </div>
      }
    </div>
  )

  return (
    <DashboardLayout title="Users" subtitle="All users and their roles" requiredRoles={['admin','super_admin']}>
      <div className="space-y-6" style={{ maxWidth: 900 }}>

        {/* Search + refresh */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-3)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search users…" className="input" style={{ paddingLeft: 36 }} />
          </div>
          <button onClick={load} disabled={loading}
            className="btn btn-secondary disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Role guide */}
        <div className="card rounded-xl p-4">
          <p className="section-label mb-3">Role Responsibilities</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {[
              { role: 'it_support_technician', desc: 'Passwords, devices, email, VPN, hardware, software, access' },
              { role: 'ai_intern',             desc: 'Reports, data analysis, dashboards, research, FAQs, summaries' },
              { role: 'junior_operations',     desc: 'Workflow failures, automations, scheduled jobs, integrations' },
            ].map(r => {
              const cfg  = ROLE_CONFIG[r.role]
              const Icon = cfg.icon
              return (
                <div key={r.role} className="rounded-lg p-3"
                  style={{ background: cfg.bg, border: `1px solid color-mix(in srgb, ${cfg.color} 25%, transparent)` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                    <p className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</p>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>{r.desc}</p>
                </div>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>Loading…</div>
        ) : (
          <div className="space-y-6">
            <Section title="Support Agents" items={agents}    emptyMsg="No agents found" />
            <Section title="Employees"      items={employees} emptyMsg="No employees found" />
            <Section title="Administrators" items={admins}    emptyMsg="No admins found" />
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}
