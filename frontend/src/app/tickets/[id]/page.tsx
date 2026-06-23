'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { PriorityBadge, StatusBadge, DepartmentBadge } from '@/components/ui/TicketBadge'
import AutoResponsePanel from '@/components/ui/AutoResponsePanel'
import SelfHelpPanel from '@/components/ui/SelfHelpPanel'
import { ticketsApi } from '@/lib/api'
import { useLiveTime, formatElapsed, formatAgo, slaColor, formatSlaCountdown } from '@/lib/time'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Cpu, Send, Clock, User, MessageSquare,
  AlertTriangle, CheckCircle, Sparkles, Play,
  Loader, XCircle, Timer, Calendar, TrendingUp
} from 'lucide-react'
import { format } from 'date-fns'
import { useAuthStore } from '@/stores/authStore'

// ── Status workflow ───────────────────────────────────────────────────────────
type FlowItem = { value: string; label: string; icon: any; scheme: 'blue'|'purple'|'green'|'yellow'|'red'|'gray'|'orange' }

const STATUS_FLOW: Record<string, FlowItem[]> = {
  open:             [
    { value: 'in_progress',      label: 'Start Working',    icon: Play,          scheme: 'blue'   },
    { value: 'assigned',         label: 'Mark Assigned',    icon: User,          scheme: 'purple' },
  ],
  pending:          [{ value: 'in_progress',      label: 'Start Working',    icon: Play,          scheme: 'blue' }],
  assigned:         [{ value: 'in_progress',      label: 'Start Working',    icon: Play,          scheme: 'blue' }],
  in_progress:      [
    { value: 'resolved',         label: 'Mark Resolved',    icon: CheckCircle,   scheme: 'green'  },
    { value: 'waiting_for_user', label: 'Waiting for User', icon: Loader,        scheme: 'yellow' },
    { value: 'escalated',        label: 'Escalate',         icon: AlertTriangle, scheme: 'red'    },
  ],
  waiting_for_user: [
    { value: 'in_progress',      label: 'Resume Work',      icon: Play,          scheme: 'blue'   },
    { value: 'resolved',         label: 'Mark Resolved',    icon: CheckCircle,   scheme: 'green'  },
  ],
  escalated:        [
    { value: 'in_progress',      label: 'Take Over',        icon: Play,          scheme: 'blue'   },
    { value: 'resolved',         label: 'Mark Resolved',    icon: CheckCircle,   scheme: 'green'  },
  ],
  resolved:         [
    { value: 'closed',           label: 'Close Ticket',     icon: XCircle,       scheme: 'gray'   },
    { value: 'in_progress',      label: 'Reopen',           icon: Play,          scheme: 'orange' },
  ],
  closed: [],
}

// colour maps for scheme tokens → CSS vars
const SCHEME_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  blue:   { color: 'var(--accent-text)',  bg: 'var(--accent-subtle)',  border: 'var(--accent)' },
  purple: { color: '#a78bfa',             bg: '#2d1b69',               border: '#7c3aed' },
  green:  { color: 'var(--success)',      bg: 'var(--success-bg)',     border: 'var(--success)' },
  yellow: { color: 'var(--warning)',      bg: 'var(--warning-bg)',     border: 'var(--warning)' },
  red:    { color: 'var(--danger)',       bg: 'var(--danger-bg)',      border: 'var(--danger)' },
  gray:   { color: 'var(--text-3)',       bg: 'var(--bg-muted)',       border: 'var(--border)' },
  orange: { color: '#fb923c',             bg: '#2a1508',               border: '#ea580c' },
}

export default function TicketDetailPage() {
  const { id }   = useParams() as { id: string }
  const router   = useRouter()
  const { user } = useAuthStore()
  const now      = useLiveTime(1000)            // ← ticks every second

  const [ticket,         setTicket]         = useState<any>(null)
  const [loading,        setLoading]        = useState(true)
  const [comment,        setComment]        = useState('')
  const [isInternal,     setIsInternal]     = useState(false)
  const [posting,        setPosting]        = useState(false)
  const [changingStatus, setChangingStatus] = useState<string | null>(null)
  const [showResNote,    setShowResNote]    = useState(false)
  const [resNote,        setResNote]        = useState('')

  const role           = user?.role || 'employee'
  const isAgent        = ['ai_intern','it_support_technician','junior_operations'].includes(role)
  const isAdmin        = ['admin','super_admin'].includes(role)
  const isAgentOrAdmin = isAgent || isAdmin

  const load = async () => {
    try {
      const { data } = await ticketsApi.get(id)
      setTicket(data)
    } catch {
      toast.error('Could not load ticket')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === 'resolved' && !showResNote) { setShowResNote(true); return }
    setChangingStatus(newStatus)
    try {
      await ticketsApi.updateStatus(id, newStatus, newStatus === 'resolved' ? resNote : undefined)
      toast.success(`Ticket ${newStatus.replace(/_/g, ' ')}`)
      if (newStatus === 'resolved') {
        try {
          const { data } = await ticketsApi.autoResponse(id, 'formal', 'resolved')
          await ticketsApi.addComment(id, data.response, false)
        } catch { /* silent */ }
        setShowResNote(false); setResNote('')
      }
      load()
    } catch { toast.error('Failed to update status') }
    finally { setChangingStatus(null) }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return
    setPosting(true)
    try {
      await ticketsApi.addComment(id, comment, isInternal)
      setComment(''); toast.success('Reply sent'); load()
    } catch { toast.error('Failed to send reply') }
    finally { setPosting(false) }
  }

  if (loading) return (
    <DashboardLayout title="Loading…">
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full animate-spin"
          style={{ border: '2px solid var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    </DashboardLayout>
  )

  if (!ticket) return (
    <DashboardLayout title="Not Found">
      <div className="text-center py-20" style={{ color: 'var(--text-3)' }}>Ticket not found</div>
    </DashboardLayout>
  )

  const ai         = ticket.ai || {}
  const statusFlow = STATUS_FLOW[ticket.status] || []
  const isActive   = !['resolved','closed'].includes(ticket.status)
  const inProgress = ticket.status === 'in_progress'

  // Live computed values
  const elapsed   = ticket.created_at ? formatElapsed(ticket.created_at, now) : null
  const minsOpen  = ticket.created_at
    ? Math.floor((now.getTime() - new Date(ticket.created_at).getTime()) / 60000) : 0
  const elColor   = slaColor(minsOpen)
  const slaCd     = ticket.sla_deadline && isActive
    ? formatSlaCountdown(ticket.sla_deadline, now) : null

  return (
    <DashboardLayout title={`Ticket ${ticket.ticket_number}`} subtitle={ticket.department?.name}>
      <div style={{ maxWidth: 860 }} className="space-y-4">

        <button onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm transition"
          style={{ color: 'var(--text-3)' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* ── Main card ──────────────────────────────────────────────── */}
        <div className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="mono text-xs" style={{ color: 'var(--text-3)' }}>{ticket.ticket_number}</span>
                {ticket.is_escalated && (
                  <span className="badge" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                    <AlertTriangle className="w-3 h-3" /> Escalated
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{ticket.title}</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {ticket.department && <DepartmentBadge name={ticket.department.name} color={ticket.department.color} />}
              <PriorityBadge priority={ticket.priority} />
              <StatusBadge status={ticket.status} />
            </div>
          </div>

          {/* Description */}
          <div className="rounded-lg p-4 mb-4" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-2)' }}>
              {ticket.description}
            </p>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap gap-4 items-center text-xs" style={{ color: 'var(--text-3)' }}>
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> {ticket.submitter?.full_name}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {ticket.created_at ? format(new Date(ticket.created_at), 'dd MMM yyyy HH:mm') : '—'}
            </span>

            {/* Live elapsed time — ticks every second */}
            {elapsed && (
              <span className="flex items-center gap-1 mono font-semibold"
                style={{ color: isActive ? elColor : 'var(--text-3)' }}>
                <Timer className="w-3.5 h-3.5" />
                {elapsed}
                <span className="font-normal" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-sans)' }}>
                  {isActive ? 'open' : 'total'}
                </span>
              </span>
            )}

            {/* In progress since */}
            {inProgress && ticket.updated_at && (
              <span className="flex items-center gap-1" style={{ color: 'var(--accent-text)' }}>
                <TrendingUp className="w-3.5 h-3.5" />
                In progress for {formatElapsed(ticket.updated_at, now)}
              </span>
            )}

            {/* Resolved */}
            {ticket.resolved_at && (
              <span className="flex items-center gap-1" style={{ color: 'var(--success)' }}>
                <CheckCircle className="w-3.5 h-3.5" />
                Resolved {formatAgo(ticket.resolved_at, now)}
              </span>
            )}

            {/* SLA countdown — ticks every second */}
            {slaCd && (
              <span className="flex items-center gap-1"
                style={{ color: slaCd.breached ? 'var(--danger)' : 'var(--text-3)' }}>
                <Clock className="w-3.5 h-3.5" />
                SLA: {slaCd.breached ? '⚠ BREACHED' : `${slaCd.label} left`}
              </span>
            )}
          </div>
        </div>

        {/* ── Agent status workflow ──────────────────────────────────── */}
        {isAgent && statusFlow.length > 0 && (
          <div className="card p-4" style={{ borderColor: 'color-mix(in srgb, var(--accent) 25%, transparent)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
              <p className="section-label">Update Status</p>
              <span className="text-xs ml-1" style={{ color: 'var(--text-3)' }}>
                Current: <span style={{ color: 'var(--text-2)', textTransform: 'capitalize' }}>
                  {ticket.status.replace(/_/g,' ')}
                </span>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {statusFlow.map(opt => {
                const s = SCHEME_STYLES[opt.scheme]
                return (
                  <button key={opt.value} disabled={changingStatus !== null}
                    onClick={() => handleStatusChange(opt.value)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition disabled:opacity-50"
                    style={{ color: s.color, background: s.bg, borderColor: `color-mix(in srgb, ${s.border} 30%, transparent)` }}>
                    {changingStatus === opt.value
                      ? <span className="w-3.5 h-3.5 rounded-full animate-spin"
                          style={{ border: '2px solid currentColor', borderTopColor: 'transparent' }} />
                      : <opt.icon className="w-3.5 h-3.5" />}
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {showResNote && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 space-y-2">
                <label className="block text-xs" style={{ color: 'var(--text-3)' }}>
                  Resolution note <span style={{ color: 'var(--text-3)', opacity: .6 }}>(optional)</span>
                </label>
                <textarea value={resNote} onChange={e => setResNote(e.target.value)} rows={2}
                  placeholder="Describe how the issue was resolved…"
                  className="input resize-none" style={{ borderColor: 'var(--success)' }} />
                <div className="flex gap-2">
                  <button onClick={() => handleStatusChange('resolved')} disabled={changingStatus !== null}
                    className="btn btn-primary" style={{ background: 'var(--success)' }}>
                    <CheckCircle className="w-3.5 h-3.5" /> Confirm Resolved
                  </button>
                  <button onClick={() => { setShowResNote(false); setResNote('') }}
                    className="text-xs px-3 py-2 transition" style={{ color: 'var(--text-3)' }}>Cancel</button>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* ── Admin controls ─────────────────────────────────────────── */}
        {isAdmin && (
          <div className="card p-4" style={{ borderColor: 'color-mix(in srgb, #a78bfa 25%, transparent)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full" style={{ background: '#a78bfa' }} />
              <p className="section-label" style={{ color: '#a78bfa' }}>Admin Controls</p>
              <span className="text-xs ml-1" style={{ color: 'var(--text-3)' }}>
                Monitor & manage — agents handle the work
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ticket.status !== 'closed' && (
                <button disabled={changingStatus !== null}
                  onClick={() => handleStatusChange('closed')}
                  className="btn btn-secondary" style={{ fontSize: 13 }}>
                  {changingStatus === 'closed'
                    ? <span className="w-3.5 h-3.5 rounded-full animate-spin"
                        style={{ border: '2px solid currentColor', borderTopColor: 'transparent' }} />
                    : <XCircle className="w-3.5 h-3.5" />}
                  Close Ticket
                </button>
              )}
              {!['resolved','closed'].includes(ticket.status) && (
                <button disabled={changingStatus !== null}
                  onClick={() => handleStatusChange('escalated')}
                  className="btn btn-danger" style={{ fontSize: 13 }}>
                  {changingStatus === 'escalated'
                    ? <span className="w-3.5 h-3.5 rounded-full animate-spin"
                        style={{ border: '2px solid currentColor', borderTopColor: 'transparent' }} />
                    : <AlertTriangle className="w-3.5 h-3.5" />}
                  Force Escalate
                </button>
              )}
              {['resolved','closed'].includes(ticket.status) && (
                <button disabled={changingStatus !== null}
                  onClick={() => handleStatusChange('open')}
                  className="btn btn-secondary" style={{ fontSize: 13 }}>
                  <Play className="w-3.5 h-3.5" /> Reopen
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Resolved banner ────────────────────────────────────────── */}
        {!isActive && (
          <div className="flex items-center gap-3 rounded-xl p-4"
            style={{ background: 'var(--success-bg)', border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)' }}>
            <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--success)' }} />
            <div>
              <p className="text-sm font-semibold capitalize" style={{ color: 'var(--success)' }}>
                {ticket.status.replace(/_/g,' ')}
              </p>
              {ticket.resolution_note && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-2)' }}>{ticket.resolution_note}</p>
              )}
              {ticket.resolved_at && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  {format(new Date(ticket.resolved_at), 'dd MMM yyyy HH:mm')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Info grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* AI Classification */}
          <div className="card p-4" style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--accent-text)' }}>AI Classification</span>
            </div>
            <div className="space-y-2 text-xs">
              {([
                ['Department',  ticket.department?.name],
                ['Category',    ai.category],
                ['Routed to',   ai.routed_to_role?.replace(/_/g,' ')],
                ['Agent',       ai.routed_to_agent_name],
                ['Sentiment',   ai.sentiment],
                ['Token score', ai.token_match_score ? `${ai.token_match_score}` : null],
                ['Confidence',  ai.confidence ? `${Math.round(ai.confidence * 100)}%` : null],
              ] as [string,string|null][]).map(([label, val]) => val ? (
                <div key={label} className="flex justify-between gap-2">
                  <span style={{ color: 'var(--text-3)' }}>{label}</span>
                  <span className="font-medium capitalize text-right truncate" style={{ color: 'var(--text-2)' }}>{val}</span>
                </div>
              ) : null)}
            </div>
            {ai.routing_rationale && (
              <p className="mt-3 text-xs italic pt-2 leading-relaxed"
                style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border-subtle)' }}>
                {ai.routing_rationale}
              </p>
            )}
            {ai.skill_tokens?.length > 0 && (
              <div className="mt-3 pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <p className="text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>Matched tokens</p>
                <div className="flex flex-wrap gap-1">
                  {ai.skill_tokens.slice(0, 6).map((tk: string) => (
                    <span key={tk} className="mono text-xs px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>{tk}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Assignment */}
          <div className="card p-4">
            <p className="text-xs font-semibold mb-3 section-label">Assignment</p>
            {ticket.assigned_agent ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0"
                  style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
                  {ticket.assigned_agent.full_name?.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{ticket.assigned_agent.full_name}</p>
                  <p className="text-xs capitalize" style={{ color: 'var(--text-3)' }}>
                    {(ticket.assigned_agent.agent_role_key || '').replace(/_/g,' ')}
                  </p>
                  <span className="badge mt-1" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                    AI Assigned
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Unassigned</p>
            )}
          </div>

          {/* Timeline — live "ago" text */}
          <div className="card p-4">
            <p className="section-label mb-3">Timeline</p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-3)' }}>Created</span>
                <span style={{ color: 'var(--text-2)' }}>
                  {ticket.created_at ? formatAgo(ticket.created_at, now) : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-3)' }}>Last update</span>
                <span style={{ color: 'var(--text-2)' }}>
                  {ticket.updated_at ? formatAgo(ticket.updated_at, now) : '—'}
                </span>
              </div>
              {ticket.resolved_at && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-3)' }}>Resolved</span>
                  <span style={{ color: 'var(--success)' }}>{formatAgo(ticket.resolved_at, now)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-3)' }}>SLA deadline</span>
                <span style={{ color: ticket.sla_breached ? 'var(--danger)' : 'var(--text-2)' }}>
                  {ticket.sla_deadline ? format(new Date(ticket.sla_deadline), 'dd MMM HH:mm') : '—'}
                </span>
              </div>
              {slaCd && !slaCd.breached && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-3)' }}>SLA remaining</span>
                  <span className="mono font-semibold" style={{ color: 'var(--warning)' }}>{slaCd.label}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-3)' }}>Comments</span>
                <span style={{ color: 'var(--text-2)' }}>{ticket.comments?.length || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Self-help panel */}
        <SelfHelpPanel ticketId={id} autoLoad={!isAgentOrAdmin} readOnly={isAgentOrAdmin} />

        {/* Self-help outcome banner — agents only */}
        {isAgentOrAdmin && ticket.self_help_shown && (
          <div className={`rounded-xl border p-4 ${
            ticket.self_help_resolved === true
              ? 'bg-green-500/5 border-green-500/25'
              : ticket.self_help_resolved === false
              ? 'bg-orange-500/5 border-orange-500/25'
              : 'bg-gray-800/40 border-gray-700/40'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                ticket.self_help_resolved === true ? 'bg-green-500/15' :
                ticket.self_help_resolved === false ? 'bg-orange-500/15' : 'bg-gray-700/40'
              }`}>
                {ticket.self_help_resolved === true
                  ? <CheckCircle className="w-4 h-4 text-green-400" />
                  : ticket.self_help_resolved === false
                  ? <AlertTriangle className="w-4 h-4 text-orange-400" />
                  : <Sparkles className="w-4 h-4 text-gray-400" />
                }
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${
                  ticket.self_help_resolved === true ? 'text-green-300' :
                  ticket.self_help_resolved === false ? 'text-orange-300' : 'text-gray-300'
                }`}>
                  {ticket.self_help_resolved === true
                    ? 'Employee resolved this with AI self-help'
                    : ticket.self_help_resolved === false
                    ? 'Self-help did not resolve this ticket'
                    : 'Employee was shown self-help suggestions'
                  }
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {ticket.self_help_resolved === true
                    ? `They completed ${ticket.self_help_steps_done?.length ?? 0} step(s) and confirmed the issue is fixed. Ticket was auto-resolved — please verify with the employee as a safety check.`
                    : ticket.self_help_resolved === false
                    ? `They tried ${ticket.self_help_steps_done?.length ?? 0} step(s) but the issue persists. Please prioritise this ticket.`
                    : 'The employee was shown AI self-help steps but has not yet reported an outcome.'
                  }
                </p>
                {ticket.self_help_resolved === true && (
                  <p className="text-xs text-green-400/70 mt-2 font-medium">
                    Safety check: confirm with the employee that everything is working before closing.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Thread + Reply ──────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <MessageSquare className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Thread ({ticket.comments?.length || 0})
            </h2>
            {isAgentOrAdmin && (
              <span className="ml-auto flex items-center gap-1 text-xs" style={{ color: 'var(--accent-text)' }}>
                <Sparkles className="w-3 h-3" /> AI responses enabled
              </span>
            )}
          </div>

          {/* Comments */}
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {(ticket.comments || []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-center" style={{ color: 'var(--text-3)' }}>
                No messages yet
              </p>
            ) : (ticket.comments || []).map((c: any) => (
              <div key={c.id}
                className="px-5 py-4"
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  background: c.is_ai ? 'color-mix(in srgb, var(--accent) 4%, transparent)'
                             : c.is_internal ? 'color-mix(in srgb, var(--warning) 4%, transparent)'
                             : undefined,
                  borderLeft: c.is_ai ? '2px solid color-mix(in srgb, var(--accent) 40%, transparent)' : undefined,
                }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: c.is_ai ? 'var(--accent)' : 'var(--accent-subtle)',
                      color: c.is_ai ? '#fff' : 'var(--accent-text)',
                    }}>
                    {c.is_ai ? <Cpu className="w-3 h-3" /> : (c.author?.full_name?.charAt(0) || '?')}
                  </div>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-2)' }}>
                    {c.is_ai ? 'AI Auto-Response' : c.author?.full_name}
                  </span>
                  {c.is_internal && (
                    <span className="badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                      Internal
                    </span>
                  )}
                  {c.is_ai && (
                    <span className="badge" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
                      <Sparkles className="w-2.5 h-2.5" /> Automated
                    </span>
                  )}
                  {/* Live "X ago" on each comment */}
                  <span className="ml-auto text-xs" style={{ color: 'var(--text-3)' }}>
                    {c.created_at ? formatAgo(c.created_at, now) : ''}
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{c.content}</p>
              </div>
            ))}
          </div>

          {/* Reply box */}
          <form onSubmit={handleComment} className="p-5 space-y-3"
            style={{ borderTop: '1px solid var(--border)' }}>
            {isAgentOrAdmin && (
              <AutoResponsePanel
                ticketId={id}
                category={ai.category}
                priority={ticket.priority}
                onInsert={(text) => setComment(text)}
              />
            )}
            {isAgentOrAdmin && (
              <div className="flex items-center gap-2">
                {(['Public Reply', 'Internal Note'] as const).map((label, i) => {
                  const active = i === 1 ? isInternal : !isInternal
                  const accent = i === 1 ? 'var(--warning)' : 'var(--accent)'
                  return (
                    <button key={label} type="button"
                      onClick={() => setIsInternal(i === 1)}
                      className="text-xs px-3 py-1 rounded-full border transition"
                      style={{
                        background: active ? `color-mix(in srgb, ${accent} 15%, transparent)` : 'transparent',
                        color: active ? accent : 'var(--text-3)',
                        borderColor: active ? `color-mix(in srgb, ${accent} 40%, transparent)` : 'var(--border)',
                      }}>
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
            <textarea
              value={comment} onChange={e => setComment(e.target.value)} rows={3}
              placeholder={isInternal ? 'Internal note (not visible to employee)…' : 'Write a reply…'}
              className="input resize-none"
            />
            <div className="flex justify-end">
              <button type="submit" disabled={posting || !comment.trim()} className="btn btn-primary">
                <Send className="w-3.5 h-3.5" />
                {posting ? 'Sending…' : 'Send Reply'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </DashboardLayout>
  )
}
