'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { PriorityBadge, StatusBadge, DepartmentBadge } from '@/components/ui/TicketBadge'
import { ticketsApi } from '@/lib/api'
import { useLiveTime, formatElapsedShort, formatAgo, slaColor } from '@/lib/time'
import Link from 'next/link'
import { Search, Plus, Cpu, Timer } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useRouter } from 'next/navigation'

export default function TicketsPage() {
  const { user } = useAuthStore()
  const router   = useRouter()
  const now      = useLiveTime(1000)          // ← ticks every second

  const [tickets,        setTickets]        = useState<any[]>([])
  const [filtered,       setFiltered]       = useState<any[]>([])
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [loading,        setLoading]        = useState(true)

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
    if (statusFilter   !== 'all') result = result.filter(t => t.status   === statusFilter)
    if (priorityFilter !== 'all') result = result.filter(t => t.priority === priorityFilter)
    setFiltered(result)
  }, [search, statusFilter, priorityFilter, tickets])

  const role = user?.role || 'employee'
  const titleMap: Record<string, string> = {
    employee:              'My Tickets',
    ai_intern:             'HR Queue',
    it_support_technician: 'IT & Finance Queue',
    junior_operations:     'Operations Queue',
    admin:                 'All Tickets',
    super_admin:           'All Tickets',
  }

  const STATUSES = ['open','pending','assigned','in_progress','escalated','waiting_for_user','resolved','closed']
  const PRIORITIES = ['critical','high','medium','low']

  return (
    <DashboardLayout
      title={titleMap[role] || 'Tickets'}
      subtitle={`${filtered.length} ticket${filtered.length !== 1 ? 's' : ''}`}
    >
      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">

        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'var(--text-3)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tickets…"
            className="input" style={{ paddingLeft: 36 }}
          />
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input"
          style={{ width: 'auto' }}>
          <option value="all">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>

        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="input"
          style={{ width: 'auto' }}>
          <option value="all">All Priority</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>

        {role === 'employee' && (
          <Link href="/tickets/new" className="btn btn-primary">
            <Plus className="w-4 h-4" /> New Ticket
          </Link>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm" style={{ color: 'var(--text-3)' }}>
            Loading tickets…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>No tickets found</p>
            {role === 'employee' && (
              <Link href="/tickets/new" className="text-sm mt-1 inline-block"
                style={{ color: 'var(--accent)' }}>Submit your first ticket →</Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  {['#', 'Title', 'Department', 'Priority', 'Status', 'Agent', 'Time Open', 'Submitted'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const isActive = !['resolved','closed'].includes(t.status)
                  const elapsed  = t.created_at ? formatElapsedShort(t.created_at, now) : null
                  const agoText  = t.created_at ? formatAgo(t.created_at, now) : '—'

                  // colour elapsed based on minutes open
                  const minsOpen = t.created_at
                    ? Math.floor((now.getTime() - new Date(t.created_at).getTime()) / 60000)
                    : 0
                  const elapsedColor = slaColor(minsOpen)

                  return (
                    <tr key={t.id} className="cursor-pointer"
                      onClick={() => router.push(`/tickets/${t.id}`)}>

                      {/* # */}
                      <td>
                        <div className="flex items-center gap-2">
                          {t.is_escalated && (
                            <span className="w-1.5 h-1.5 rounded-full animate-pulse"
                              style={{ background: 'var(--danger)' }} />
                          )}
                          <span className="mono text-xs" style={{ color: 'var(--text-3)' }}>
                            {t.ticket_number}
                          </span>
                        </div>
                      </td>

                      {/* Title */}
                      <td>
                        <p className="font-medium truncate" style={{ maxWidth: 280, color: 'var(--text)' }}>
                          {t.title}
                        </p>
                        {t.ai?.category && (
                          <p className="flex items-center gap-1 mt-0.5"
                            style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            <Cpu className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                            {t.ai.category}
                          </p>
                        )}
                      </td>

                      {/* Department */}
                      <td>
                        {t.department
                          ? <DepartmentBadge name={t.department.name} color={t.department.color} />
                          : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>

                      {/* Priority */}
                      <td><PriorityBadge priority={t.priority} /></td>

                      {/* Status */}
                      <td><StatusBadge status={t.status} /></td>

                      {/* Agent */}
                      <td>
                        {t.assigned_agent ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
                              {t.assigned_agent.full_name?.charAt(0)}
                            </div>
                            <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                              {t.assigned_agent.full_name?.split(' ')[0]}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-3)' }}>Unassigned</span>
                        )}
                      </td>

                      {/* Time Open — live ⏱ */}
                      <td>
                        {isActive && elapsed ? (
                          <span className="mono flex items-center gap-1"
                            style={{ fontSize: 12, fontWeight: 600, color: elapsedColor }}>
                            <Timer className="w-3 h-3" />
                            {elapsed}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
                        )}
                      </td>

                      {/* Submitted — live "X ago" */}
                      <td style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                        {agoText}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
