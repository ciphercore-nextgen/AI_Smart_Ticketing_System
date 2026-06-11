'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import KPICard from '@/components/ui/KPICard'
import { ticketsApi } from '@/lib/api'
import { useLiveTime, formatAgo } from '@/lib/time'
import Link from 'next/link'
import { Ticket, Clock, CheckCircle, AlertTriangle, Plus, ChevronRight, Sparkles, Cpu } from 'lucide-react'
import { PriorityBadge, StatusBadge } from '@/components/ui/TicketBadge'
import { useAuthStore } from '@/stores/authStore'

const AGENT_ROUTING = [
  { problem: 'Password / account / device / email / VPN / software', agent: 'IT Support Assistant',      color: '#3b82f6' },
  { problem: 'Reports / data analysis / dashboards / research / FAQs', agent: 'AI Intern',               color: 'var(--accent)' },
  { problem: 'Workflow failures / automation / scheduled job errors', agent: 'Junior Automation Support', color: '#f59e0b' },
]

export default function EmployeeDashboard() {
  const { user } = useAuthStore()
  const now      = useLiveTime(1000)
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ticketsApi.list().then(({ data }) => setTickets(data.tickets || [])).catch(console.error).finally(() => setLoading(false))
  }, [])

  const open       = tickets.filter(t => ['open','pending'].includes(t.status)).length
  const inProgress = tickets.filter(t => ['in_progress','assigned'].includes(t.status)).length
  const resolved   = tickets.filter(t => ['resolved','closed'].includes(t.status)).length
  const escalated  = tickets.filter(t => t.is_escalated).length
  const recent     = tickets.slice(0, 5)

  return (
    <DashboardLayout title="My Dashboard" subtitle={`Welcome back, ${user?.full_name?.split(' ')[0]}`}>
      <div className="space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard title="Open"        value={open}       icon={Ticket}        color="blue"   index={0} />
          <KPICard title="In Progress" value={inProgress} icon={Clock}         color="purple" index={1} />
          <KPICard title="Resolved"    value={resolved}   icon={CheckCircle}   color="green"  index={2} />
          <KPICard title="Escalated"   value={escalated}  icon={AlertTriangle} color="red"    index={3} />
        </div>

        {/* How routing works */}
        <div className="card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>How your ticket gets routed</p>
          </div>
          <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-3)' }}>
            When you submit a ticket, AI reads the problem and routes it to the agent with the right expertise —
            not based on your department, but based on what kind of help is actually needed.
          </p>
          <div className="space-y-2">
            {AGENT_ROUTING.map(r => (
              <div key={r.agent} className="flex items-start gap-3 rounded-lg p-3"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: r.color }} />
                <div>
                  <p className="text-xs font-semibold" style={{ color: r.color }}>{r.agent}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{r.problem}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI support banner */}
        <div className="card rounded-xl p-4 flex items-start gap-3"
          style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-subtle)' }}>
            <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>AI-Powered Support Active</p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-3)' }}>
              When you submit a ticket, AI instantly routes it to the right agent and sends you an automated
              first response with self-help steps you can try while waiting.
            </p>
          </div>
          <Link href="/tickets/new" className="btn btn-primary flex-shrink-0" style={{ fontSize: 13 }}>
            <Plus className="w-3.5 h-3.5" /> New Ticket
          </Link>
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
          ) : recent.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>No tickets yet.</p>
              <Link href="/tickets/new" className="text-sm mt-1 inline-block" style={{ color: 'var(--accent)' }}>
                Submit your first ticket →
              </Link>
            </div>
          ) : (
            <div>
              {recent.map(t => (
                <Link key={t.id} href={`/tickets/${t.id}`}
                  className="flex items-center justify-between px-5 py-3.5 transition group"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-muted)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}>
                  <div className="flex items-center gap-3 min-w-0">
                    {t.is_escalated && <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: 'var(--danger)' }} />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{t.title}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                        {t.ticket_number}
                        {t.department && <> · <span style={{ color: t.department.color }}>{t.department.name}</span></>}
                        {t.ai?.category && <> · {t.ai.category}</>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                    {(t.comments || []).some((c: any) => c.is_ai) && (
                      <span className="hidden sm:flex items-center gap-1 badge" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
                        <Sparkles className="w-3 h-3" /> AI replied
                      </span>
                    )}
                    <span className="text-xs hidden sm:block" style={{ color: 'var(--text-3)' }}>
                      {t.created_at ? formatAgo(t.created_at, now) : ''}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  )
}
