'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import KPICard from '@/components/ui/KPICard'
import { ticketsApi, analyticsApi } from '@/lib/api'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Ticket, Clock, CheckCircle, AlertTriangle, Plus, ChevronRight } from 'lucide-react'
import { PriorityBadge, StatusBadge } from '@/components/ui/TicketBadge'
import { formatDistanceToNow } from 'date-fns'
import { useAuthStore } from '@/stores/authStore'

export default function EmployeeDashboard() {
  const { user } = useAuthStore()
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ticketsApi.list().then(({ data }) => {
      setTickets(data.tickets || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const open       = tickets.filter(t => t.status === 'open' || t.status === 'pending').length
  const inProgress = tickets.filter(t => t.status === 'in_progress' || t.status === 'assigned').length
  const resolved   = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length
  const escalated  = tickets.filter(t => t.is_escalated).length

  const recent = tickets.slice(0, 5)

  return (
    <DashboardLayout title="My Dashboard" subtitle={`Welcome back, ${user?.full_name?.split(' ')[0]}`}>
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Open Tickets"    value={open}       icon={Ticket}       color="blue"   index={0} />
          <KPICard title="In Progress"     value={inProgress} icon={Clock}        color="purple" index={1} />
          <KPICard title="Resolved"        value={resolved}   icon={CheckCircle}  color="green"  index={2} />
          <KPICard title="Escalated"       value={escalated}  icon={AlertTriangle} color="red"   index={3} />
        </div>

        {/* Quick actions */}
        <div className="glass-card rounded-xl p-5 border border-gray-800/60">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Quick Actions</h2>
          <Link href="/tickets/new"
            className="flex items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-3 font-medium text-sm transition w-fit">
            <Plus className="w-4 h-4" />
            Submit a New Ticket
          </Link>
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
          ) : recent.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500 text-sm">No tickets yet.</p>
              <Link href="/tickets/new" className="text-blue-400 text-sm mt-1 inline-block">Submit your first ticket →</Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/40">
              {recent.map((t, i) => (
                <motion.div key={t.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}>
                  <Link href={`/tickets/${t.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-900/40 transition">
                    <div className="flex items-center gap-3 min-w-0">
                      {t.is_escalated && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm text-white font-medium truncate">{t.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {t.ticket_number}
                          {t.department && <> · <span style={{ color: t.department.color }}>{t.department.name}</span></>}
                          {t.ai?.category && <> · {t.ai.category}</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <PriorityBadge priority={t.priority} />
                      <StatusBadge status={t.status} />
                      <span className="text-xs text-gray-600 hidden sm:block">
                        {t.created_at ? formatDistanceToNow(new Date(t.created_at), { addSuffix: true }) : ''}
                      </span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
