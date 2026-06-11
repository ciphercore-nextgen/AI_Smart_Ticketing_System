'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import KPICard from '@/components/ui/KPICard'
import { ticketsApi } from '@/lib/api'
import { useLiveTime, formatAgo } from '@/lib/time'
import Link from 'next/link'
import {
  Ticket, Clock, CheckCircle, AlertTriangle,
  Cpu, ChevronRight, Sparkles, Zap, Monitor, Workflow,
} from 'lucide-react'
import { PriorityBadge, StatusBadge, DepartmentBadge } from '@/components/ui/TicketBadge'
import { useAuthStore } from '@/stores/authStore'
import { useRouter } from 'next/navigation'

const ROLE_CONFIG: Record<string, { label: string; scope: string; description: string; icon: any; color: string }> = {
  ai_intern: {
    label:       'AI Intern',
    scope:       'Data, Reporting & Analysis',
    description: 'Handles report generation, data analysis, dashboards, research tasks, document summarization, FAQ creation, and business intelligence support.',
    icon:        Cpu,
    color:       'var(--accent)',
  },
  it_support_technician: {
    label:       'IT Support Assistant',
    scope:       'Devices, Access & Connectivity',
    description: 'Handles password resets, account lockouts, email issues, VPN, printers, hardware, software installation, and new employee device setup.',
    icon:        Monitor,
    color:       '#3b82f6',
  },
  junior_operations: {
    label:       'Junior Automation Support',
    scope:       'Workflows & Process Automation',
    description: 'Handles workflow failures, automation issues, scheduled job failures, integration errors, approval workflow problems, and notification failures.',
    icon:        Workflow,
    color:       '#f59e0b',
  },
}

export default function AgentDashboard() {
  const { user } = useAuthStore()
  const router   = useRouter()
  const now      = useLiveTime(1000)
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const role   = user?.role || ''
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.it_support_technician
  const Icon   = config.icon

  useEffect(() => {
    ticketsApi.list().then(({ data }) => setTickets(data.tickets || [])).catch(console.error).finally(() => setLoading(false))
  }, [])

  const open        = tickets.filter(t => ['open','pending','assigned'].includes(t.status)).length
  const inProgress  = tickets.filter(t => t.status === 'in_progress').length
  const resolved    = tickets.filter(t => ['resolved','closed'].includes(t.status)).length
  const escalated   = tickets.filter(t => t.is_escalated).length
  const aiResponded = tickets.filter(t => (t.comments || []).some((c: any) => c.is_ai)).length

  return (
    <DashboardLayout title="My Queue" subtitle={config.label}>
      <div className="space-y-5">

        {/* Role identity card */}
        <div className="card rounded-xl p-5 flex items-start gap-4"
          style={{ borderColor: `color-mix(in srgb, ${config.color} 25%, transparent)` }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `color-mix(in srgb, ${config.color} 12%, transparent)` }}>
            <Icon className="w-5 h-5" style={{ color: config.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold" style={{ color: 'var(--text)' }}>{config.label}</p>
            <p className="text-xs font-medium mt-0.5" style={{ color: config.color }}>{config.scope}</p>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-3)' }}>{config.description}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-bold" style={{ color: config.color }}>{tickets.length}</p>
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>in queue</p>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <KPICard title="Open"        value={open}        icon={Ticket}        color="blue"   index={0} />
          <KPICard title="In Progress" value={inProgress}  icon={Clock}         color="purple" index={1} />
          <KPICard title="Resolved"    value={resolved}    icon={CheckCircle}   color="green"  index={2} />
          <KPICard title="Escalated"   value={escalated}   icon={AlertTriangle} color="red"    index={3} />
          <KPICard title="AI Replied"  value={aiResponded} icon={Sparkles}      color="blue"   index={4} />
        </div>

        {/* AI response banner */}
        <div className="card rounded-xl p-4 flex items-start gap-3"
          style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-subtle)' }}>
            <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Automated Response Generation active</p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-3)' }}>
              Every new ticket gets an instant AI first-response. Open any ticket to use the{' '}
              <span style={{ color: 'var(--accent)' }}>AI Response Generator</span> — generate replies in
              Formal, Friendly, or Urgent tone and insert with one click.
            </p>
          </div>
        </div>

        {/* Queue table */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" style={{ color: config.color }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Your Queue</h2>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>— routed by problem type, not department</span>
            </div>
            <Link href="/tickets" className="text-xs flex items-center gap-1" style={{ color: 'var(--accent)' }}>
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm" style={{ color: 'var(--text-3)' }}>Loading…</div>
          ) : tickets.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--success)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Queue clear</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>No tickets assigned to you right now</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr>
                  {['#', 'Title / Category', 'Department', 'Priority', 'Status', 'AI Reply', 'Submitted'].map(h => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {tickets.slice(0, 20).map(t => {
                    const hasAiReply = (t.comments || []).some((c: any) => c.is_ai)
                    return (
                      <tr key={t.id} className="cursor-pointer" onClick={() => router.push(`/tickets/${t.id}`)}>
                        <td>
                          <div className="flex items-center gap-2">
                            {t.is_escalated && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--danger)' }} />}
                            <span className="mono text-xs" style={{ color: 'var(--text-3)' }}>{t.ticket_number}</span>
                          </div>
                        </td>
                        <td>
                          <p className="font-medium truncate" style={{ maxWidth: 260, color: 'var(--text)' }}>{t.title}</p>
                          {t.ai?.category && (
                            <p className="flex items-center gap-1 mt-0.5" style={{ fontSize: 11, color: 'var(--accent-text)' }}>
                              <Cpu className="w-3 h-3" style={{ color: 'var(--accent)' }} />{t.ai.category}
                            </p>
                          )}
                          {t.ai?.routing_rationale && (
                            <p className="truncate mt-0.5" style={{ fontSize: 11, color: 'var(--text-3)', maxWidth: 260 }}>
                              {t.ai.routing_rationale}
                            </p>
                          )}
                        </td>
                        <td>{t.department ? <DepartmentBadge name={t.department.name} color={t.department.color} /> : <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                        <td><PriorityBadge priority={t.priority} /></td>
                        <td><StatusBadge status={t.status} /></td>
                        <td>
                          {hasAiReply
                            ? <span className="badge flex items-center gap-1" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}><Sparkles className="w-3 h-3" /> Sent</span>
                            : <span className="text-xs" style={{ color: 'var(--text-3)' }}>Pending</span>}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                          {t.created_at ? formatAgo(t.created_at, now) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
