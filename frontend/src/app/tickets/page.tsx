'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { PriorityBadge, StatusBadge, DepartmentBadge } from '@/components/ui/TicketBadge'
import { ticketsApi } from '@/lib/api'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Search, Plus, Cpu } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { formatDistanceToNow } from 'date-fns'

export default function TicketsPage() {
  const { user } = useAuthStore()
  const [tickets, setTickets]             = useState<any[]>([])
  const [filtered, setFiltered]           = useState<any[]>([])
  const [search, setSearch]               = useState('')
  const [statusFilter, setStatusFilter]   = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [loading, setLoading]             = useState(true)

  useEffect(() => {
    ticketsApi.list()
      .then(({ data }) => { setTickets(data.tickets || []); setFiltered(data.tickets || []) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let result = tickets
    if (search)
      result = result.filter(t =>
        t.title?.toLowerCase().includes(search.toLowerCase()) ||
        t.ticket_number?.toLowerCase().includes(search.toLowerCase())
      )
    if (statusFilter !== 'all')   result = result.filter(t => t.status === statusFilter)
    if (priorityFilter !== 'all') result = result.filter(t => t.priority === priorityFilter)
    setFiltered(result)
  }, [search, statusFilter, priorityFilter, tickets])

  const role = (user as any)?.agent_role_key || user?.role || 'employee'
  const titleMap: Record<string, string> = {
    employee:              'My Tickets',
    ai_intern:             'HR Queue',
    it_support_technician: 'IT & Finance Queue',
    junior_operations:     'Operations Queue',
    admin:                 'All Tickets',
    super_admin:           'All Tickets',
  }
  const title = titleMap[role] || 'Tickets'

  return (
    <DashboardLayout title={title} subtitle={`${filtered.length} ticket${filtered.length !== 1 ? 's' : ''}`}>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tickets..."
            className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="all">All Status</option>
          {['open','pending','assigned','in_progress','escalated','waiting_for_user','resolved','closed'].map(s =>
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          )}
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <option value="all">All Priority</option>
          {['critical','high','medium','low'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {role === 'employee' && (
          <Link href="/tickets/new"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition">
            <Plus className="w-4 h-4" /> New Ticket
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl border border-gray-800/60 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 text-sm">Loading tickets...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-sm">No tickets found</p>
            {role === 'employee' && (
              <Link href="/tickets/new" className="text-blue-400 text-sm mt-1 inline-block">Submit your first ticket →</Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800/60 bg-gray-900/40">
                  {['#', 'Title', 'Department', 'Priority', 'Status', 'Agent', 'Submitted'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/40">
                {filtered.map((t, i) => (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
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
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <Cpu className="w-3 h-3 text-blue-400/60" /> {t.ai.category}
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
                    <td className="px-4 py-3">
                      {t.assigned_agent ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs">
                            {t.assigned_agent.full_name?.charAt(0)}
                          </div>
                          <span className="text-xs text-gray-400">{t.assigned_agent.full_name?.split(' ')[0]}</span>
                        </div>
                      ) : <span className="text-xs text-gray-600">Unassigned</span>}
                    </td>
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
    </DashboardLayout>
  )
}
