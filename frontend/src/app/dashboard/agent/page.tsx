'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import KPICard from '@/components/ui/KPICard'
import { ticketsApi } from '@/lib/api'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Ticket, Clock, CheckCircle, AlertTriangle, Cpu, ChevronRight, Zap, Users } from 'lucide-react'
import { PriorityBadge, StatusBadge, DepartmentBadge } from '@/components/ui/TicketBadge'
import { formatDistanceToNow } from 'date-fns'
import { useAuthStore } from '@/stores/authStore'

const ROLE_LABELS: Record<string, string> = {
  ai_intern:             'AI Intern',
  it_support_technician: 'IT Support Technician',
  junior_operations:     'Junior Operations',
}

const ROLE_DEPT_LABELS: Record<string, string[]> = {
  ai_intern:             ['Human Resources'],
  it_support_technician: ['Information Technology', 'Finance'],
  junior_operations:     ['Operations'],
}

export default function AgentDashboard() {
  const { user } = useAuthStore()
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const agentRole = user?.agent_role_key || (user as any)?.role || ''
  const roleLabel = ROLE_LABELS[agentRole] || agentRole
  const deptLabels = ROLE_DEPT_LABELS[agentRole] || []

  useEffect(() => {
    ticketsApi.list().then(({ data }) => {
      setTickets(data.tickets || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const myQueue    = tickets.filter(t => t.assigned_agent?.id === user?.id)
  const open       = tickets.filter(t => ['open', 'pending', 'assigned'].includes(t.status)).length
  const inProgress = tickets.filter(t => t.status === 'in_progress').length
  const resolved   = tickets.filter(t => ['resolved', 'closed'].includes(t.status)).length
  const escalated  = tickets.filter(t => t.is_escalated).length

  return (
    <DashboardLayout
      title="Agent Dashboard"
      subtitle={`${roleLabel} · ${deptLabels.join(' & ')}`}
    >
      <div className="space-y-6">
        {/* Agent role badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-xl p-4 border border-blue-500/20 flex items-center gap-4"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
            <Cpu className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">{roleLabel}</p>
            <p className="text-xs text-gray-500">
              Handling tickets from: <span className="text-blue-400">{deptLabels.join(', ')}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-400">{tickets.length}</p>
            <p className="text-xs text-gray-500">total in queue</p>
          </div>
        </motion.div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Open"       value={open}       icon={Ticket}        color="blue"   index={0} />
          <KPICard title="In Progress" value={inProgress} icon={Clock}        color="purple" index={1} />
          <KPICard title="Resolved"   value={resolved}   icon={CheckCircle}   color="green"  index={2} />
          <KPICard title="Escalated"  value={escalated}  icon={AlertTriangle} color="red"    index={3} />
        </div>

        {/* Ticket queue */}
        <div className="glass-card rounded-xl border border-gray-800/60 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/60">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-gray-300">Department Queue</h2>
            </div>
            <Link href="/tickets" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading queue...</div>
          ) : tickets.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No tickets in your queue 🎉</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800/60 bg-gray-900/40">
                    {['#', 'Title / AI Category', 'Department', 'Priority', 'Status', 'Submitted'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/40">
                  {tickets.slice(0, 20).map((t, i) => (
                    <motion.tr
                      key={t.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="hover:bg-gray-900/40 transition cursor-pointer"
                      onClick={() => window.location.href = `/tickets/${t.id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {t.is_escalated && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                          <span className="font-mono text-xs text-gray-500">{t.ticket_number}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-white font-medium truncate max-w-xs">{t.title}</p>
                        {t.ai?.category && (
                          <p className="text-xs text-blue-400/70 mt-0.5 flex items-center gap-1">
                            <Cpu className="w-3 h-3" /> {t.ai.category}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {t.department
                          ? <DepartmentBadge name={t.department.name} color={t.department.color} />
                          : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {t.created_at ? formatDistanceToNow(new Date(t.created_at), { addSuffix: true }) : '—'}
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
