'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { analyticsApi, ticketsApi } from '@/lib/api'
import { motion } from 'framer-motion'
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { BarChart3, TrendingUp, Clock, CheckCircle, AlertTriangle, Cpu, Users, Zap } from 'lucide-react'

const DEPT_COLORS: Record<string, string> = {
  'Human Resources':       '#8B5CF6',
  'Information Technology':'#3B82F6',
  'Finance':               '#10B981',
  'Operations':            '#F59E0B',
}
const PRIO_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
}
const STATUS_COLORS: Record<string, string> = {
  open: '#3b82f6', assigned: '#8b5cf6', in_progress: '#f59e0b',
  resolved: '#22c55e', closed: '#6b7280', escalated: '#ef4444',
}

const TIP = ({ content, style }: any) => {
  if (!content || !Array.isArray(content)) return null
  return (
    <div style={{ ...style, background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#9ca3af' }}>
      {content.map((c: any, i: number) => (
        <div key={i} style={{ color: c.color }}>{c.name}: <strong style={{ color: '#fff' }}>{c.value}</strong></div>
      ))}
    </div>
  )
}

export default function AdminAnalyticsPage() {
  const [overview,    setOverview]    = useState<any>({})
  const [deptData,    setDeptData]    = useState<any[]>([])
  const [prioData,    setPrioData]    = useState<any[]>([])
  const [statusData,  setStatusData]  = useState<any[]>([])
  const [tickets,     setTickets]     = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([
      analyticsApi.overview(),
      analyticsApi.byDepartment(),
      analyticsApi.byPriority(),
      analyticsApi.byStatus(),
      ticketsApi.list(),
    ]).then(([ov, dept, prio, status, tix]) => {
      setOverview(ov.data)
      setDeptData(dept.data || [])
      setPrioData(prio.data || [])
      setStatusData(status.data || [])
      setTickets(tix.data.tickets || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  // Resolution rate
  const total    = overview.total || 0
  const resolved = overview.resolved || 0
  const resRate  = total > 0 ? Math.round((resolved / total) * 100) : 0

  // AI routing stats from ticket data
  const aiRouted = tickets.filter(t => t.ai?.classified_by && t.ai.classified_by !== 'seed_data').length
  const autoResponded = tickets.filter(t => (t.comments || []).some((c: any) => c.is_ai)).length

  // Agent workload from ticket assignments
  const agentLoad: Record<string, number> = {}
  tickets.forEach(t => {
    if (t.assigned_agent?.full_name) {
      agentLoad[t.assigned_agent.full_name] = (agentLoad[t.assigned_agent.full_name] || 0) + 1
    }
  })
  const agentData = Object.entries(agentLoad).map(([name, count]) => ({
    name: name.split(' ')[0], count,
  }))

  const KPI = ({ title, value, sub, icon: Icon, color }: any) => (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl p-4 border border-gray-800/60">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{title}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </motion.div>
  )

  return (
    <DashboardLayout title="Analytics" subtitle="System-wide ticket intelligence" requiredRoles={['admin', 'super_admin']}>
      <div className="space-y-6">

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI title="Total Tickets"     value={total}              sub="all time"                  icon={BarChart3}    color="bg-blue-500/10 text-blue-400" />
          <KPI title="Resolution Rate"   value={`${resRate}%`}      sub={`${resolved} resolved`}    icon={CheckCircle}  color="bg-green-500/10 text-green-400" />
          <KPI title="Active Escalations"value={overview.escalated} sub="needs attention"           icon={AlertTriangle}color="bg-red-500/10 text-red-400" />
          <KPI title="Critical Open"     value={overview.critical}  sub="SLA risk"                  icon={Zap}          color="bg-orange-500/10 text-orange-400" />
        </div>

        {/* AI stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI title="AI Routed"         value={aiRouted}       sub="via tokenization"          icon={Cpu}          color="bg-purple-500/10 text-purple-400" />
          <KPI title="Auto Responses"    value={autoResponded}  sub="AI first-replies sent"     icon={TrendingUp}   color="bg-blue-500/10 text-blue-400" />
          <KPI title="Avg Token Score"   value={
            tickets.filter(t => t.ai?.token_match_score).length > 0
              ? (tickets.reduce((s, t) => s + (t.ai?.token_match_score || 0), 0) / tickets.filter(t => t.ai?.token_match_score).length).toFixed(1)
              : '—'
          } sub="routing confidence"              icon={Cpu}          color="bg-indigo-500/10 text-indigo-400" />
          <KPI title="Open Tickets"      value={overview.open}  sub="awaiting response"         icon={Clock}        color="bg-yellow-500/10 text-yellow-400" />
        </div>

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* By department */}
          <div className="glass-card rounded-xl p-5 border border-gray-800/60">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Tickets by Department</h2>
            {deptData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={deptData} margin={{ left: -20 }}>
                  <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={n => n.split(' ')[0]} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip content={<TIP />} />
                  <Bar dataKey="count" radius={[6,6,0,0]} name="Tickets">
                    {deptData.map((e, i) => <Cell key={i} fill={DEPT_COLORS[e.name] || '#3B82F6'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-52 flex items-center justify-center text-gray-600">No data yet</div>}
          </div>

          {/* By priority */}
          <div className="glass-card rounded-xl p-5 border border-gray-800/60">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Tickets by Priority</h2>
            {prioData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie data={prioData} dataKey="count" nameKey="priority" cx="50%" cy="50%" outerRadius={85} innerRadius={55}>
                      {prioData.map((e, i) => <Cell key={i} fill={PRIO_COLORS[e.priority] || '#6b7280'} />)}
                    </Pie>
                    <Tooltip content={<TIP />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3 flex-1">
                  {prioData.map(p => (
                    <div key={p.priority}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400 capitalize">{p.priority}</span>
                        <span className="text-white font-bold">{p.count}</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full" style={{ width: `${total > 0 ? (p.count/total)*100 : 0}%`, background: PRIO_COLORS[p.priority] }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="h-52 flex items-center justify-center text-gray-600">No data yet</div>}
          </div>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* By status */}
          <div className="glass-card rounded-xl p-5 border border-gray-800/60">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Tickets by Status</h2>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={statusData} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis type="category" dataKey="status" tick={{ fill: '#6b7280', fontSize: 11 }} width={90}
                    tickFormatter={s => s.replace(/_/g, ' ')} />
                  <Tooltip content={<TIP />} />
                  <Bar dataKey="count" radius={[0,6,6,0]} name="Tickets">
                    {statusData.map((e, i) => <Cell key={i} fill={STATUS_COLORS[e.status] || '#6b7280'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-52 flex items-center justify-center text-gray-600">No data yet</div>}
          </div>

          {/* Agent workload */}
          <div className="glass-card rounded-xl p-5 border border-gray-800/60">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">Agent Workload</h2>
            {agentData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={agentData} margin={{ left: -20 }}>
                  <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <Tooltip content={<TIP />} />
                  <Bar dataKey="count" name="Tickets" fill="#8b5cf6" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-52 flex items-center justify-center text-gray-600">No data yet</div>}
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}
