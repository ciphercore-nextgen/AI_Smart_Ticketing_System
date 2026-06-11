'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { adminApi } from '@/lib/api'
import { Building2, Cpu, Users, RefreshCw, Monitor, Workflow, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'

const DEPT_INFO: Record<string, { description: string; examples: string[] }> = {
  'Human Resources': {
    description: 'Submits tickets about people, policies, and HR processes. Cannot resolve tickets.',
    examples: ['Password locked → IT Support Assistant', 'Turnover report needed → AI Intern', 'Leave workflow broken → Junior Automation Support'],
  },
  'Information Technology': {
    description: 'Submits tickets about technical systems and tools. Cannot resolve tickets.',
    examples: ['VPN not connecting → IT Support Assistant', 'Service desk analytics → AI Intern', 'Provisioning automation failed → Junior Automation Support'],
  },
  'Finance': {
    description: 'Submits tickets about financial systems and processes. Cannot resolve tickets.',
    examples: ['ERP system login issue → IT Support Assistant', 'Expense trend analysis → AI Intern', 'Finance approval workflow broken → Junior Automation Support'],
  },
  'Operations': {
    description: 'Submits tickets about facilities, logistics, and operations. Cannot resolve tickets.',
    examples: ['Access card not working → IT Support Assistant', 'Operations dashboard → AI Intern', 'Onboarding workflow failure → Junior Automation Support'],
  },
}

const AGENT_STYLE: Record<string, { color: string; bg: string; icon: any; label: string }> = {
  ai_intern:             { color: '#a78bfa', bg: 'rgba(139,92,246,.1)', icon: Cpu,      label: 'AI Intern' },
  it_support_technician: { color: '#60a5fa', bg: 'rgba(59,130,246,.1)', icon: Monitor,  label: 'IT Support Assistant' },
  junior_operations:     { color: '#fbbf24', bg: 'rgba(245,158,11,.1)', icon: Workflow, label: 'Junior Automation Support' },
}

export default function DepartmentsPage() {
  const [depts,   setDepts]   = useState<any[]>([])
  const [users,   setUsers]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([adminApi.listDepartments(), adminApi.listUsers()])
      .then(([d, u]) => { setDepts(d.data); setUsers(u.data) })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const agents    = users.filter(u => ['ai_intern','it_support_technician','junior_operations'].includes(u.role))
  const employees = users.filter(u => u.role === 'employee')

  return (
    <DashboardLayout title="Departments" subtitle="Structure and routing overview" requiredRoles={['admin','super_admin']}>
      <div className="space-y-5" style={{ maxWidth: 960 }}>

        {/* Key rule callout */}
        <div className="card rounded-xl p-4 flex items-start gap-3"
          style={{ borderColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' }}>
          <Cpu className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Departments submit — Agents resolve
            </p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-3)' }}>
              All four departments can submit tickets about any problem. The AI reads the ticket content and
              routes it to the agent whose expertise matches the problem — not the department. A Finance
              employee submitting a "password locked" ticket goes to IT Support Assistant, not the AI Intern.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="section-label">Departments ({depts.length})</p>
          <button onClick={load} disabled={loading} className="btn btn-secondary disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>Loading…</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {depts.map(dept => {
              const info     = DEPT_INFO[dept.name] || { description: '', examples: [] }
              const deptEmps = employees.filter(u => u.department_id === dept.id)

              return (
                <div key={dept.id} className="card rounded-xl p-5">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `color-mix(in srgb, ${dept.color} 15%, transparent)` }}>
                      <Building2 className="w-4.5 h-4.5" style={{ width: 18, height: 18, color: dept.color }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{dept.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-3)' }}>{info.description}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5 text-xs"
                      style={{ color: 'var(--text-3)' }}>
                      <Users className="w-3.5 h-3.5" />
                      {deptEmps.length} employee{deptEmps.length !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Routing examples */}
                  <div className="rounded-lg p-3 space-y-1.5"
                    style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-3)' }}>
                      Example routing from this department:
                    </p>
                    {info.examples.map((ex, i) => {
                      const [problem, agent] = ex.split(' → ')
                      const agentKey = Object.keys(AGENT_STYLE).find(k =>
                        AGENT_STYLE[k].label.toLowerCase().includes(agent?.toLowerCase().split(' ')[0])
                      )
                      const style = agentKey ? AGENT_STYLE[agentKey] : null
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span style={{ color: 'var(--text-2)' }}>"{problem}"</span>
                          <ArrowRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
                          <span className="font-medium" style={{ color: style?.color || 'var(--accent)' }}>{agent}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Agents panel */}
        <div>
          <p className="section-label mb-3">Support Agents ({agents.length})</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {agents.map(a => {
              const s    = AGENT_STYLE[a.role] || AGENT_STYLE.it_support_technician
              const Icon = s.icon
              return (
                <div key={a.id} className="card rounded-xl p-4"
                  style={{ borderColor: `color-mix(in srgb, ${s.color} 25%, transparent)` }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ background: s.bg, color: s.color }}>
                      {a.full_name?.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{a.full_name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Icon className="w-3 h-3" style={{ color: s.color }} />
                        <p className="text-xs" style={{ color: s.color }}>{s.label}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}
