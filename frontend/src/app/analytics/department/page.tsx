'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { ticketsApi } from '@/lib/api'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { BarChart3, CheckCircle, Clock, AlertTriangle, Cpu, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuthStore } from '@/stores/authStore'

const PRIO_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
}

export default function DeptAnalyticsPage() {
  const { user }    = useAuthStore()
  const [tickets,   setTickets]   = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    ticketsApi.list().then(({ data }) => setTickets(data.tickets || []))
      .catch(console.error).finally(() => setLoading(false))
  }, [])

  const total      = tickets.length
  const resolved   = tickets.filter(t => ['resolved','closed'].includes(t.status)).length
  const escalated  = tickets.filter(t => t.is_escalated).length
  const aiReplied  = tickets.filter(t => (t.comments||[]).some((c:any) => c.is_ai)).length
  const resRate    = total > 0 ? Math.round((resolved/total)*100) : 0

  const prioData = ['critical','high','medium','low'].map(p => ({
    priority: p,
    count: tickets.filter(t => t.priority === p).length,
  })).filter(p => p.count > 0)

  const catData: Record<string, number> = {}
  tickets.forEach(t => {
    const cat = t.ai?.category || 'General'
    catData[cat] = (catData[cat] || 0) + 1
  })
  const categoryData = Object.entries(catData).map(([name, count]) => ({ name, count }))
    .sort((a,b) => b.count - a.count).slice(0, 6)

  const KPI = ({ title, value, sub, icon: Icon, color }: any) => (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-xl p-4 border border-gray-800/60">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide">{title}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </motion.div>
  )

  return (
    <DashboardLayout title="My Analytics" subtitle="Your ticket queue performance">
      <div className="space-y-6">

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI title="In My Queue"    value={total}          sub="assigned to me"         icon={BarChart3}    color="bg-blue-500/10 text-blue-400" />
          <KPI title="Resolution Rate"value={`${resRate}%`}  sub={`${resolved} resolved`} icon={CheckCircle}  color="bg-green-500/10 text-green-400" />
          <KPI title="Escalated"      value={escalated}      sub="needs attention"        icon={AlertTriangle}color="bg-red-500/10 text-red-400" />
          <KPI title="AI Replied"     value={aiReplied}      sub="auto-responses sent"    icon={Sparkles}     color="bg-purple-500/10 text-purple-400" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-card rounded-xl p-5 border border-gray-800/60">
            <h2 className="text-sm font-semibold text-gray-300 mb-4">By Priority</h2>
            {prioData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={200}>
                  <PieChart>
                    <Pie data={prioData} dataKey="count" nameKey="priority" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
                      {prioData.map((e,i) => <Cell key={i} fill={PRIO_COLORS[e.priority] || '#6b7280'} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background:'#1f2937', border:'1px solid #374151', borderRadius:8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {prioData.map(p => (
                    <div key={p.priority} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: PRIO_COLORS[p.priority] }} />
                      <span className="text-xs text-gray-400 capitalize flex-1">{p.priority}</span>
                      <span className="text-xs font-bold text-white">{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No tickets yet</div>}
          </div>

          <div className="glass-card rounded-xl p-5 border border-gray-800/60">
            <h2 className="text-sm font-semibold text-gray-300 mb-4 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-400" /> Top Categories (AI)
            </h2>
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryData} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tick={{ fill:'#6b7280', fontSize:11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill:'#6b7280', fontSize:11 }} width={100} />
                  <Tooltip contentStyle={{ background:'#1f2937', border:'1px solid #374151', borderRadius:8 }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[0,6,6,0]} name="Tickets" />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="h-48 flex items-center justify-center text-gray-600 text-sm">No tickets yet</div>}
          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}
