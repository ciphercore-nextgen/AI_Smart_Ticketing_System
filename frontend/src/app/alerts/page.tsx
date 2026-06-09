'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { ticketsApi } from '@/lib/api'
import { motion } from 'framer-motion'
import { Bell, AlertTriangle, Clock, CheckCircle, Zap, RefreshCw, Cpu } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useAuthStore } from '@/stores/authStore'
import Link from 'next/link'

export default function AlertsPage() {
  const { user }   = useAuthStore()
  const [tickets,  setTickets]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState<'all'|'escalated'|'sla'|'critical'>('all')

  const role = user?.role || 'employee'
  const isAgent = ['ai_intern','it_support_technician','junior_operations','admin','super_admin'].includes(role)

  useEffect(() => {
    ticketsApi.list().then(({ data }) => setTickets(data.tickets || []))
      .catch(console.error).finally(() => setLoading(false))
  }, [])

  // Build alerts from ticket data
  const alerts = tickets.flatMap(t => {
    const items: any[] = []
    if (t.is_escalated)
      items.push({ type: 'escalated', ticket: t, message: 'Ticket has been escalated', icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', time: t.updated_at })
    if (t.sla_breached)
      items.push({ type: 'sla', ticket: t, message: 'SLA breached — response overdue', icon: Clock, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', time: t.sla_deadline })
    if (t.priority === 'critical' && ['open','assigned','pending'].includes(t.status))
      items.push({ type: 'critical', ticket: t, message: 'Critical priority ticket open', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', time: t.created_at })
    return items
  }).sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime())

  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.type === filter)

  const counts = {
    all:      alerts.length,
    escalated: alerts.filter(a => a.type === 'escalated').length,
    sla:       alerts.filter(a => a.type === 'sla').length,
    critical:  alerts.filter(a => a.type === 'critical').length,
  }

  return (
    <DashboardLayout title="Alerts" subtitle="Active issues requiring attention">
      <div className="space-y-4 max-w-3xl">

        {/* Summary */}
        <div className="grid grid-cols-4 gap-3">
          {([
            ['all',      'All Alerts', Bell,          'bg-blue-500/10 text-blue-400'],
            ['escalated','Escalated',  AlertTriangle,  'bg-red-500/10 text-red-400'],
            ['sla',      'SLA Breach', Clock,          'bg-orange-500/10 text-orange-400'],
            ['critical', 'Critical',   Zap,            'bg-yellow-500/10 text-yellow-400'],
          ] as [string, string, any, string][]).map(([key, label, Icon, color]) => (
            <button key={key} onClick={() => setFilter(key as any)}
              className={`glass-card rounded-xl p-3 border transition text-left ${
                filter === key ? 'border-blue-500/40 bg-blue-500/5' : 'border-gray-800/60 hover:border-gray-700'
              }`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold text-white">{counts[key as keyof typeof counts]}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </button>
          ))}
        </div>

        {/* Refresh */}
        <div className="flex justify-end">
          <button onClick={() => { setLoading(true); ticketsApi.list().then(({data}) => setTickets(data.tickets||[])).finally(() => setLoading(false)) }}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {/* Alert list */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading alerts...</div>
        ) : filtered.length === 0 ? (
          <div className="glass-card rounded-xl p-12 border border-gray-800/60 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-white font-semibold">All clear!</p>
            <p className="text-sm text-gray-500 mt-1">No active alerts in this category</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((alert, i) => {
              const Icon = alert.icon
              return (
                <motion.div key={`${alert.ticket.id}-${alert.type}`}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`glass-card rounded-xl p-4 border ${alert.border} ${alert.bg} flex items-start gap-3`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${alert.bg} border ${alert.border}`}>
                    <Icon className={`w-4 h-4 ${alert.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`text-sm font-semibold ${alert.color}`}>{alert.message}</p>
                        <p className="text-sm text-white mt-0.5 truncate">{alert.ticket.title}</p>
                      </div>
                      <span className="text-xs text-gray-600 flex-shrink-0">
                        {alert.time ? formatDistanceToNow(new Date(alert.time), { addSuffix: true }) : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="text-xs text-gray-500 font-mono">{alert.ticket.ticket_number}</span>
                      {alert.ticket.department && (
                        <span className="text-xs text-gray-500">{alert.ticket.department.name}</span>
                      )}
                      {alert.ticket.assigned_agent && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Cpu className="w-3 h-3" /> {alert.ticket.assigned_agent.full_name}
                        </span>
                      )}
                      <Link href={`/tickets/${alert.ticket.id}`}
                        className={`text-xs font-medium ${alert.color} hover:underline ml-auto`}>
                        View ticket →
                      </Link>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}
