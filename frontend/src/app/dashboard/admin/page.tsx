'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import KPICard from '@/components/ui/KPICard'
import { analyticsApi, ticketsApi } from '@/lib/api'
import { useLiveTime, formatAgo } from '@/lib/time'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Ticket, Clock, CheckCircle, AlertTriangle, Users, Building2,
  TrendingUp, ChevronRight, Cpu, Shield, Monitor, Workflow,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import { PriorityBadge, StatusBadge, DepartmentBadge } from '@/components/ui/TicketBadge'

const DEPT_COLORS: Record<string, string> = {
  'Human Resources':        '#8B5CF6',
  'Information Technology': '#3B82F6',
  'Finance':                '#10B981',
  'Operations':             '#F59E0B',
}
const PRIO_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
}

// Correct routing per Enterprise Simulation Rules
const ROUTING_TABLE = [
  {
    agent: 'IT Support Assistant',
    role:  'it_support_technician',
    color: '#3b82f6',
    icon:  Monitor,
    handles: 'Passwords · Devices · Email · VPN · Hardware · Software',
    example: '"My password is locked" → regardless of which dept submits',
  },
  {
    agent: 'AI Intern',
    role:  'ai_intern',
    color: '#8b5cf6',
    icon:  Cpu,
    handles: 'Reports · Data Analysis · Dashboards · Research · FAQs',
    example: '"Generate a monthly turnover report" → any dept',
  },
  {
    agent: 'Junior Automation Support',
    role:  'junior_operations',
    color: '#f59e0b',
    icon:  Workflow,
    handles: 'Workflow Failures · Automations · Scheduled Jobs · Integrations',
    example: '"Leave approval workflow stopped" → any dept',
  },
]

export default function AdminDashboard() {
  const router  = useRouter()
  const now     = useLiveTime(1000)

  const [overview,      setOverview]      = useState<any>({})
  const [deptData,      setDeptData]      = useState<any[]>([])
  const [priorityData,  setPriorityData]  = useState<any[]>([])
  const [tickets,       setTickets]       = useState<any[]>([])
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    Promise.all([
      analyticsApi.overview(),
      analyticsApi.byDepartment(),
      analyticsApi.byPriority(),
      ticketsApi.list(),
    ]).then(([ov, dept, prio, tix]) => {
      setOverview(ov.data)
      setDeptData(dept.data)
      setPriorityData(prio.data)
      setTickets(tix.data.tickets || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const tooltipStyle = {
    contentStyle: {
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      fontSize: 12,
    },
    labelStyle: { color: 'var(--text)' },
    itemStyle:  { color: 'var(--text-3)' },
  }

  return (
    <DashboardLayout title="Admin Dashboard" subtitle="Full system overview" requiredRoles={['admin','super_admin']}>
      <div className="space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <KPICard title="Total"       value={overview.total       ?? '—'} icon={Ticket}        color="blue"   index={0} />
          <KPICard title="Open"        value={overview.open        ?? '—'} icon={Clock}         color="cyan"   index={1} />
          <KPICard title="In Progress" value={overview.in_progress ?? '—'} icon={TrendingUp}    color="purple" index={2} />
          <KPICard title="Resolved"    value={overview.resolved    ?? '—'} icon={CheckCircle}   color="green"  index={3} />
          <KPICard title="Escalated"   value={overview.escalated   ?? '—'} icon={AlertTriangle} color="red"    index={4} />
          <KPICard title="Critical"    value={overview.critical    ?? '—'} icon={Shield}        color="red"    index={5} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* By department */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <Building2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              Tickets by Department
            </h2>
            {deptData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={deptData} margin={{ left: -20 }}>
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-3)', fontSize: 11 }}
                    tickFormatter={n => n.split(' ')[0]} />
                  <YAxis tick={{ fill: 'var(--text-3)', fontSize: 11 }} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" radius={[4,4,0,0]}>
                    {deptData.map((entry, idx) => (
                      <Cell key={idx} fill={DEPT_COLORS[entry.name] || '#3B82F6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-sm" style={{ color: 'var(--text-3)' }}>No data yet</div>
            )}
          </div>

          {/* By priority */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <AlertTriangle className="w-4 h-4" style={{ color: '#f97316' }} />
              Tickets by Priority
            </h2>
            {priorityData.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="55%" height={200}>
                  <PieChart>
                    <Pie data={priorityData} dataKey="count" nameKey="priority"
                      cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
                      {priorityData.map((entry, idx) => (
                        <Cell key={idx} fill={PRIO_COLORS[entry.priority] || '#6b7280'} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {priorityData.map(p => (
                    <div key={p.priority} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ background: PRIO_COLORS[p.priority] || '#6b7280' }} />
                      <span className="text-xs capitalize" style={{ color: 'var(--text-3)' }}>{p.priority}</span>
                      <span className="text-xs font-bold ml-auto" style={{ color: 'var(--text)' }}>{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-sm" style={{ color: 'var(--text-3)' }}>No data yet</div>
            )}
          </div>
        </div>

        {/* AI Routing table — correct per simulation rules */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>AI Routing — By Problem Type</h2>
            <span className="text-xs ml-2" style={{ color: 'var(--text-3)' }}>
              Routing is based on WHAT the problem is, not which department submitted it
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {ROUTING_TABLE.map(r => (
              <div key={r.agent} className="rounded-xl p-4"
                style={{
                  background: 'var(--bg-subtle)',
                  border: `1px solid color-mix(in srgb, ${r.color} 25%, transparent)`,
                }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: `color-mix(in srgb, ${r.color} 12%, transparent)` }}>
                    <r.icon className="w-3.5 h-3.5" style={{ color: r.color }} />
                  </div>
                  <p className="text-xs font-bold" style={{ color: r.color }}>{r.agent}</p>
                </div>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-2)' }}>{r.handles}</p>
                <p className="text-xs italic" style={{ color: 'var(--text-3)' }}>{r.example}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent tickets */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Recent Tickets</h2>
            <Link href="/tickets" className="text-xs flex items-center gap-1" style={{ color: 'var(--accent)' }}>
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: 'var(--text-3)' }}>Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr>
                  {['#','Title','Department','Priority','Status','Assigned To','Created'].map(h => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {tickets.slice(0, 10).map(t => (
                    <tr key={t.id} className="cursor-pointer" onClick={() => router.push(`/tickets/${t.id}`)}>
                      <td>
                        <div className="flex items-center gap-2">
                          {t.is_escalated && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--danger)' }} />}
                          <span className="mono text-xs" style={{ color: 'var(--text-3)' }}>{t.ticket_number}</span>
                        </div>
                      </td>
                      <td>
                        <p className="font-medium truncate" style={{ maxWidth: 200, color: 'var(--text)' }}>{t.title}</p>
                        {t.ai?.category && (
                          <p className="flex items-center gap-1 mt-0.5" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            <Cpu className="w-3 h-3" style={{ color: 'var(--accent)' }} />{t.ai.category}
                          </p>
                        )}
                      </td>
                      <td>{t.department ? <DepartmentBadge name={t.department.name} color={t.department.color} /> : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                      <td><PriorityBadge priority={t.priority} /></td>
                      <td><StatusBadge status={t.status} /></td>
                      <td>
                        {t.assigned_agent ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
                              {t.assigned_agent.full_name?.charAt(0)}
                            </div>
                            <div>
                              <p className="text-xs" style={{ color: 'var(--text-2)' }}>{t.assigned_agent.full_name?.split(' ')[0]}</p>
                              <p className="text-xs capitalize" style={{ color: 'var(--text-3)', fontSize: 10 }}>
                                {t.assigned_agent.agent_role_key?.replace(/_/g,' ')}
                              </p>
                            </div>
                          </div>
                        ) : <span className="text-xs" style={{ color: 'var(--text-3)' }}>Unassigned</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                        {t.created_at ? formatAgo(t.created_at, now) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  )
}
