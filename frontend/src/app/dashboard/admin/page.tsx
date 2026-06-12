'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import KPICard from '@/components/ui/KPICard'
import { analyticsApi, ticketsApi } from '@/lib/api'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Ticket, Clock, CheckCircle, AlertTriangle, Users, Building2,
  TrendingUp, ChevronRight, Cpu, Shield
} from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { PriorityBadge, StatusBadge, DepartmentBadge } from '@/components/ui/TicketBadge'
import { useLiveTime, formatAgo } from '@/lib/time'

const DEPT_COLORS: Record<string, string> = {
  'Human Resources':       '#8B5CF6',
  'Information Technology':'#3B82F6',
  'Finance':               '#10B981',
  'Operations':            '#F59E0B',
}

export default function AdminDashboard() {
  const now = useLiveTime(1000)
  const [overview, setOverview] = useState<any>({})
  const [deptData, setDeptData] = useState<any[]>([])
  const [priorityData, setPriorityData] = useState<any[]>([])
  const [tickets, setTickets] = useState<any[]>([])
  const router = useRouter()
  const [loading, setLoading] = useState(true)

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

  const PRIO_COLORS: Record<string, string> = {
    critical: '#ef4444',
    high:     '#f97316',
    medium:   '#eab308',
    low:      '#22c55e',
  }

  return (
    <DashboardLayout title="Admin Dashboard" subtitle="Full system overview" requiredRoles={['admin', 'super_admin']}>
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KPICard title="Total Tickets" value={overview.total ?? '—'}       icon={Ticket}        color="blue"   index={0} />
          <KPICard title="Open"          value={overview.open ?? '—'}        icon={Clock}         color="cyan"   index={1} />
          <KPICard title="In Progress"   value={overview.in_progress ?? '—'} icon={TrendingUp}    color="purple" index={2} />
          <KPICard title="Resolved"      value={overview.resolved ?? '—'}    icon={CheckCircle}   color="green"  index={3} />
          <KPICard title="Escalated"     value={overview.escalated ?? '—'}   icon={AlertTriangle} color="red"    index={4} />
          <KPICard title="Critical"      value={overview.critical ?? '—'}    icon={Shield}        color="red"    index={5} />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* By department */}
          <div className="glass-card rounded-xl p-5 border border-gray-800/60">
            <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              Tickets by Department
            </h2>
            {deptData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={deptData} margin={{ left: -20 }}>
                  <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickFormatter={n => n.split(' ')[0]} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                    labelStyle={{ color: '#f9fafb' }}
                    itemStyle={{ color: '#9ca3af' }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {deptData.map((entry, idx) => (
                      <Cell key={idx} fill={DEPT_COLORS[entry.name] || '#3B82F6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>
            )}
          </div>

          {/* By priority */}
          <div className="glass-card rounded-xl p-5 border border-gray-800/60">
            <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
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
                    <Tooltip
                      contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                      labelStyle={{ color: '#f9fafb' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {priorityData.map(p => (
                    <div key={p.priority} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ background: PRIO_COLORS[p.priority] || '#6b7280' }} />
                      <span className="text-xs text-gray-400 capitalize">{p.priority}</span>
                      <span className="text-xs font-bold text-white ml-auto">{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No data</div>
            )}
          </div>
        </div>

        {/* Routing summary */}
        <div className="glass-card rounded-xl p-5 border border-gray-800/60">
          <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-blue-400" />
            AI Agent Capabilities
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {[
              {
                agent: 'IT Support Assistant',
                email: 'l.selowa@ticketiq.com',
                color: '#3B82F6',
                skills: 'Password resets · VPN · Hardware · Software installs · Account access · Device setup',
              },
              {
                agent: 'AI Intern',
                email: 'l.ledwaba@ticketiq.com',
                color: '#8B5CF6',
                skills: 'Data analysis · Report generation · Dashboards · Trend analysis · Documentation support',
              },
              {
                agent: 'Junior Automation Support',
                email: 'l.kekane@ticketiq.com',
                color: '#F59E0B',
                skills: 'Workflow failures · Process automation · Scheduled jobs · Integration troubleshooting',
              },
            ].map((r, i) => (
              <motion.div key={r.agent}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="rounded-lg border border-gray-800/60 p-3 bg-gray-900/40">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                  <span className="text-xs font-semibold text-white">{r.agent}</span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{r.skills}</p>
                <p className="text-xs text-gray-700 mt-1.5 truncate">{r.email}</p>
              </motion.div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-3">Routing is content-based — any department can submit tickets that route to any agent based on the problem type, not the department.</p>
        </div>

        {/* Recent tickets */}
        <div className="glass-card rounded-xl border border-gray-800/60 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/60">
            <h2 className="text-sm font-semibold text-gray-300">Recent Tickets</h2>
            <Link href="/tickets" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800/60 bg-gray-900/40">
                    {['#', 'Title', 'Department', 'Priority', 'Status', 'Assigned To', 'Created'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/40">
                  {tickets.slice(0, 10).map((t, i) => (
                    <motion.tr key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-gray-900/40 transition cursor-pointer"
                      onClick={() => router.push(`/tickets/${t.id}`)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {t.is_escalated && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                          <span className="font-mono text-xs text-gray-500">{t.ticket_number}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white font-medium truncate max-w-[200px]">{t.title}</p>
                        {t.ai?.category && <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><Cpu className="w-3 h-3" />{t.ai.category}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {t.department ? <DepartmentBadge name={t.department.name} color={t.department.color} /> : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3">
                        {t.assigned_agent ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">
                              {t.assigned_agent.full_name?.charAt(0)}
                            </div>
                            <div>
                              <p className="text-xs text-gray-300">{t.assigned_agent.full_name?.split(' ')[0]}</p>
                              <p className="text-xs text-gray-600">{t.assigned_agent.agent_role_key?.replace(/_/g,' ')}</p>
                            </div>
                          </div>
                        ) : <span className="text-xs text-gray-600">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {t.created_at ? formatAgo(t.created_at, now) : '—'}
                      </td>
                    </motion.tr>
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
