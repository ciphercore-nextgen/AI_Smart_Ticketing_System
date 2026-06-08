'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { PriorityBadge, StatusBadge, DepartmentBadge } from '@/components/ui/TicketBadge'
import AutoResponsePanel from '@/components/ui/AutoResponsePanel'
import SelfHelpPanel from '@/components/ui/SelfHelpPanel'
import { ticketsApi } from '@/lib/api'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Cpu, Send, Clock, User, MessageSquare,
  AlertTriangle, CheckCircle, Sparkles, Play,
  Loader, XCircle, Timer, Calendar, TrendingUp
} from 'lucide-react'
import { formatDistanceToNow, format, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns'
import { useAuthStore } from '@/stores/authStore'

// ── Time open display ────────────────────────────────────────────────────────
function TimeOpen({ createdAt, status, updatedAt }: { createdAt: string; status: string; updatedAt?: string }) {
  const [display, setDisplay] = useState('')
  const isActive = !['resolved', 'closed'].includes(status)

  useEffect(() => {
    const calc = () => {
      const from = new Date(createdAt)
      const now  = isActive ? new Date() : new Date(updatedAt || createdAt)
      const mins = differenceInMinutes(now, from)
      const hrs  = differenceInHours(now, from)
      const days = differenceInDays(now, from)
      if (mins < 60)  setDisplay(`${mins}m`)
      else if (hrs < 24) setDisplay(`${hrs}h ${mins % 60}m`)
      else setDisplay(`${days}d ${hrs % 24}h`)
    }
    calc()
    if (!isActive) return
    const t = setInterval(calc, 60000)
    return () => clearInterval(t)
  }, [createdAt, isActive, updatedAt])

  const mins = differenceInMinutes(new Date(), new Date(createdAt))
  const urgentColor = mins > 1440 ? 'text-red-400' : mins > 240 ? 'text-orange-400' : 'text-green-400'

  return (
    <div className="flex items-center gap-1.5">
      <Timer className={`w-3.5 h-3.5 ${isActive ? urgentColor : 'text-gray-500'}`} />
      <span className={`text-xs font-mono font-semibold ${isActive ? urgentColor : 'text-gray-500'}`}>
        {display}
      </span>
      <span className="text-xs text-gray-600">{isActive ? 'open' : 'total'}</span>
    </div>
  )
}

// ── Status workflow ───────────────────────────────────────────────────────────
// Visual status buttons — only show valid next steps for each current status
const STATUS_FLOW: Record<string, { value: string; label: string; icon: any; color: string; bg: string; border: string }[]> = {
  open:             [
    { value: 'in_progress',  label: 'Start Working',   icon: Play,        color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
    { value: 'assigned',     label: 'Mark Assigned',   icon: User,        color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
  ],
  pending:          [
    { value: 'in_progress',  label: 'Start Working',   icon: Play,        color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
  ],
  assigned:         [
    { value: 'in_progress',  label: 'Start Working',   icon: Play,        color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
  ],
  in_progress:      [
    { value: 'resolved',          label: 'Mark Resolved',   icon: CheckCircle, color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30' },
    { value: 'waiting_for_user',  label: 'Waiting for User',icon: Loader,      color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
    { value: 'escalated',         label: 'Escalate',        icon: AlertTriangle,color: 'text-red-400',   bg: 'bg-red-500/10',    border: 'border-red-500/30' },
  ],
  waiting_for_user: [
    { value: 'in_progress',  label: 'Resume Work',     icon: Play,        color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
    { value: 'resolved',     label: 'Mark Resolved',   icon: CheckCircle, color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30' },
  ],
  escalated:        [
    { value: 'in_progress',  label: 'Take Over',       icon: Play,        color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30' },
    { value: 'resolved',     label: 'Mark Resolved',   icon: CheckCircle, color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/30' },
  ],
  resolved:         [
    { value: 'closed',       label: 'Close Ticket',    icon: XCircle,     color: 'text-gray-400',   bg: 'bg-gray-700/40',   border: 'border-gray-600/30' },
    { value: 'in_progress',  label: 'Reopen',          icon: Play,        color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  ],
  closed:           [],
}

export default function TicketDetailPage() {
  const { id } = useParams() as { id: string }
  const router  = useRouter()
  const { user } = useAuthStore()

  const [ticket,          setTicket]          = useState<any>(null)
  const [loading,         setLoading]         = useState(true)
  const [comment,         setComment]         = useState('')
  const [isInternal,      setIsInternal]      = useState(false)
  const [posting,         setPosting]         = useState(false)
  const [changingStatus,  setChangingStatus]  = useState<string | null>(null)
  const [showResNote,     setShowResNote]      = useState(false)
  const [resNote,         setResNote]          = useState('')

  const role     = user?.role || 'employee'
  const isAgent  = ['ai_intern','it_support_technician','junior_operations'].includes(role)
  const isAdmin  = ['admin','super_admin'].includes(role)
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
    if (newStatus === 'resolved' && !showResNote) {
      setShowResNote(true)
      return
    }
    setChangingStatus(newStatus)
    try {
      await ticketsApi.updateStatus(id, newStatus, newStatus === 'resolved' ? resNote : undefined)
      toast.success(`Ticket ${newStatus.replace(/_/g, ' ')}`)
      if (newStatus === 'resolved') {
        try {
          const { data } = await ticketsApi.autoResponse(id, 'formal', 'resolved')
          await ticketsApi.addComment(id, data.response, false)
        } catch { /* silent */ }
        setShowResNote(false)
        setResNote('')
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
      setComment('')
      toast.success('Reply sent')
      load()
    } catch { toast.error('Failed to send reply') }
    finally { setPosting(false) }
  }

  if (loading) return (
    <DashboardLayout title="Loading...">
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    </DashboardLayout>
  )

  if (!ticket) return (
    <DashboardLayout title="Not Found">
      <div className="text-center py-20 text-gray-500">Ticket not found</div>
    </DashboardLayout>
  )

  const ai          = ticket.ai || {}
  const statusFlow  = STATUS_FLOW[ticket.status] || []
  const isActive    = !['resolved','closed'].includes(ticket.status)
  const inProgress  = ticket.status === 'in_progress'
  const statusLabel = ticket.status?.replace(/_/g, ' ')

  return (
    <DashboardLayout title={`Ticket ${ticket.ticket_number}`} subtitle={ticket.department?.name}>
      <div className="max-w-4xl space-y-4">

        <button onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* ── Main card ─────────────────────────────────────────────────────── */}
        <div className="glass-card rounded-xl p-6 border border-gray-800/60">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-mono text-xs text-gray-500">{ticket.ticket_number}</span>
                {ticket.is_escalated && (
                  <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                    <AlertTriangle className="w-3 h-3" /> Escalated
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-white">{ticket.title}</h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {ticket.department && <DepartmentBadge name={ticket.department.name} color={ticket.department.color} />}
              <PriorityBadge priority={ticket.priority} />
              <StatusBadge status={ticket.status} />
            </div>
          </div>

          <div className="bg-gray-900/60 rounded-lg p-4 mb-4">
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* Time + meta */}
          <div className="flex flex-wrap gap-4 items-center text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> {ticket.submitter?.full_name}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {ticket.created_at ? format(new Date(ticket.created_at), 'dd MMM yyyy HH:mm') : '—'}
            </span>

            {/* Live time tracker */}
            {ticket.created_at && (
              <TimeOpen
                createdAt={ticket.created_at}
                status={ticket.status}
                updatedAt={ticket.updated_at}
              />
            )}

            {/* In progress since */}
            {inProgress && ticket.updated_at && (
              <span className="flex items-center gap-1 text-blue-400">
                <TrendingUp className="w-3.5 h-3.5" />
                In progress for {formatDistanceToNow(new Date(ticket.updated_at))}
              </span>
            )}

            {/* Resolved at */}
            {ticket.resolved_at && (
              <span className="flex items-center gap-1 text-green-400">
                <CheckCircle className="w-3.5 h-3.5" />
                Resolved {formatDistanceToNow(new Date(ticket.resolved_at), { addSuffix: true })}
              </span>
            )}

            {/* SLA */}
            {ticket.sla_deadline && isActive && (
              <span className={`flex items-center gap-1 ${ticket.sla_breached ? 'text-red-400' : 'text-gray-500'}`}>
                <Clock className="w-3.5 h-3.5" />
                SLA: {format(new Date(ticket.sla_deadline), 'dd MMM HH:mm')}
                {ticket.sla_breached && ' ⚠ BREACHED'}
              </span>
            )}
          </div>
        </div>

        {/* ── Agent status workflow panel ───────────────────────────────────── */}
        {isAgent && statusFlow.length > 0 && (
          <div className="glass-card rounded-xl p-4 border border-gray-800/60">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Update Status</p>
              <span className="text-xs text-gray-600 ml-1">
                Current: <span className="text-gray-400 capitalize">{statusLabel}</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {statusFlow.map(opt => (
                <button key={opt.value} disabled={changingStatus !== null}
                  onClick={() => handleStatusChange(opt.value)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${opt.bg} ${opt.border} ${opt.color} hover:brightness-110`}>
                  {changingStatus === opt.value
                    ? <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    : <opt.icon className="w-3.5 h-3.5" />}
                  {opt.label}
                </button>
              ))}
            </div>
            {showResNote && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 space-y-2">
                <label className="block text-xs text-gray-400">Resolution note <span className="text-gray-600">(optional)</span></label>
                <textarea value={resNote} onChange={e => setResNote(e.target.value)} rows={2}
                  placeholder="Describe how the issue was resolved..."
                  className="w-full bg-gray-900 border border-green-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500 resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => handleStatusChange('resolved')} disabled={changingStatus !== null}
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-medium px-4 py-2 rounded-lg transition">
                    <CheckCircle className="w-3.5 h-3.5" /> Confirm Resolved
                  </button>
                  <button onClick={() => { setShowResNote(false); setResNote('') }}
                    className="text-xs text-gray-500 hover:text-gray-300 px-3 py-2 transition">Cancel</button>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* ── Admin oversight panel — view + close/reassign only ────────────── */}
        {isAdmin && (
          <div className="glass-card rounded-xl p-4 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Admin Controls</p>
              <span className="text-xs text-gray-600 ml-1">Monitor & manage — agents handle the work</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ticket.status !== 'closed' && (
                <button disabled={changingStatus !== null}
                  onClick={() => handleStatusChange('closed')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition bg-gray-700/40 border-gray-600/30 text-gray-400 hover:bg-gray-700/60 disabled:opacity-50">
                  {changingStatus === 'closed'
                    ? <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    : <XCircle className="w-3.5 h-3.5" />}
                  Close Ticket
                </button>
              )}
              {!['resolved','closed'].includes(ticket.status) && (
                <button disabled={changingStatus !== null}
                  onClick={() => handleStatusChange('escalated')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition bg-red-500/10 border-red-500/30 text-red-400 hover:brightness-110 disabled:opacity-50">
                  {changingStatus === 'escalated'
                    ? <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    : <AlertTriangle className="w-3.5 h-3.5" />}
                  Force Escalate
                </button>
              )}
              {['resolved','closed'].includes(ticket.status) && (
                <button disabled={changingStatus !== null}
                  onClick={() => handleStatusChange('open')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition bg-orange-500/10 border-orange-500/30 text-orange-400 hover:brightness-110 disabled:opacity-50">
                  <Play className="w-3.5 h-3.5" /> Reopen
                </button>
              )}
            </div>
            <p className="text-xs text-gray-600 mt-3">
              To reassign this ticket, go to <span className="text-purple-400">Admin → Users</span> or ask the assigned agent to transfer it.
            </p>
          </div>
        )}

        {/* ── Resolved banner ───────────────────────────────────────────────── */}
        {!isActive && (
          <div className="flex items-center gap-3 bg-green-500/5 border border-green-500/20 rounded-xl p-4">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-400 capitalize">{statusLabel}</p>
              {ticket.resolution_note && <p className="text-xs text-gray-400 mt-0.5">{ticket.resolution_note}</p>}
              {ticket.resolved_at && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {format(new Date(ticket.resolved_at), 'dd MMM yyyy HH:mm')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── 3-col info row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* AI Classification */}
          <div className="glass-card rounded-xl p-4 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-semibold text-blue-400">AI Classification</span>
            </div>
            <div className="space-y-2 text-xs">
              {[
                ['Department',    ticket.department?.name],
                ['Category',      ai.category],
                ['Routed to',     ai.routed_to_role?.replace(/_/g,' ')],
                ['Agent',         ai.routed_to_agent_name],
                ['Sentiment',     ai.sentiment],
                ['Token score',   ai.token_match_score ? `${ai.token_match_score}` : null],
                ['Confidence',    ai.confidence ? `${Math.round(ai.confidence * 100)}%` : null],
              ].map(([label, val]) => val ? (
                <div key={label as string} className="flex justify-between gap-2">
                  <span className="text-gray-600 flex-shrink-0">{label}</span>
                  <span className="text-gray-300 font-medium capitalize text-right truncate">{val as string}</span>
                </div>
              ) : null)}
            </div>
            {ai.routing_rationale && (
              <p className="mt-3 text-xs text-gray-500 italic border-t border-gray-800/60 pt-2 leading-relaxed">{ai.routing_rationale}</p>
            )}
            {ai.skill_tokens?.length > 0 && (
              <div className="mt-3 pt-2 border-t border-gray-800/60">
                <p className="text-xs text-gray-600 mb-1.5">Matched tokens</p>
                <div className="flex flex-wrap gap-1">
                  {ai.skill_tokens.slice(0, 6).map((t: string) => (
                    <span key={t} className="text-xs bg-blue-500/10 text-blue-400/80 px-1.5 py-0.5 rounded font-mono">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Assignment */}
          <div className="glass-card rounded-xl p-4 border border-gray-800/60">
            <p className="text-xs font-semibold text-gray-400 mb-3">Assignment</p>
            {ticket.assigned_agent ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-lg flex-shrink-0">
                  {ticket.assigned_agent.full_name?.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{ticket.assigned_agent.full_name}</p>
                  <p className="text-xs text-gray-500 capitalize">{(ticket.assigned_agent.agent_role_key || '').replace(/_/g,' ')}</p>
                  <span className="text-xs text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded mt-1 inline-block">AI Assigned</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600">Unassigned</p>
            )}
          </div>

          {/* Ticket timeline */}
          <div className="glass-card rounded-xl p-4 border border-gray-800/60">
            <p className="text-xs font-semibold text-gray-400 mb-3">Timeline</p>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Created</span>
                <span className="text-gray-300">
                  {ticket.created_at ? formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true }) : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Last update</span>
                <span className="text-gray-300">
                  {ticket.updated_at ? formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true }) : '—'}
                </span>
              </div>
              {ticket.resolved_at && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Resolved</span>
                  <span className="text-green-400">
                    {formatDistanceToNow(new Date(ticket.resolved_at), { addSuffix: true })}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">SLA deadline</span>
                <span className={ticket.sla_breached ? 'text-red-400' : 'text-gray-300'}>
                  {ticket.sla_deadline ? format(new Date(ticket.sla_deadline), 'dd MMM HH:mm') : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Comments</span>
                <span className="text-gray-300">{ticket.comments?.length || 0}</span>
              </div>
            </div>
          </div>

        </div>

        {/* Self-help — auto-loads for employees */}
        <SelfHelpPanel ticketId={id} autoLoad={!isAgentOrAdmin} />

        {/* ── Thread + Reply ────────────────────────────────────────────────── */}
        <div className="glass-card rounded-xl border border-gray-800/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800/60 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-300">
              Thread ({ticket.comments?.length || 0})
            </h2>
            {isAgentOrAdmin && (
              <span className="ml-auto flex items-center gap-1 text-xs text-blue-400/70">
                <Sparkles className="w-3 h-3" /> AI responses enabled
              </span>
            )}
          </div>

          {/* Comments */}
          <div className="divide-y divide-gray-800/40 max-h-96 overflow-y-auto">
            {(ticket.comments || []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-600 text-center">No messages yet</p>
            ) : (
              (ticket.comments || []).map((c: any) => (
                <div key={c.id} className={`px-5 py-4 ${
                  c.is_ai      ? 'bg-blue-500/5 border-l-2 border-l-blue-500/30' :
                  c.is_internal? 'bg-yellow-500/5' : ''
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                      c.is_ai ? 'bg-blue-600' : 'bg-gradient-to-br from-blue-500 to-purple-600'
                    }`}>
                      {c.is_ai ? <Cpu className="w-3 h-3" /> : (c.author?.full_name?.charAt(0) || '?')}
                    </div>
                    <span className="text-xs font-medium text-gray-300">
                      {c.is_ai ? 'AI Auto-Response' : c.author?.full_name}
                    </span>
                    {c.is_internal && (
                      <span className="text-xs text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">Internal</span>
                    )}
                    {c.is_ai && (
                      <span className="text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" /> Automated
                      </span>
                    )}
                    <span className="text-xs text-gray-600 ml-auto">
                      {c.created_at ? formatDistanceToNow(new Date(c.created_at), { addSuffix: true }) : ''}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{c.content}</p>
                </div>
              ))
            )}
          </div>

          {/* Reply box */}
          <form onSubmit={handleComment} className="p-5 border-t border-gray-800/60 space-y-3">
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
                <button type="button" onClick={() => setIsInternal(false)}
                  className={`text-xs px-3 py-1 rounded-full border transition ${!isInternal
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                    : 'text-gray-500 border-gray-700 hover:border-gray-600'}`}>
                  Public Reply
                </button>
                <button type="button" onClick={() => setIsInternal(true)}
                  className={`text-xs px-3 py-1 rounded-full border transition ${isInternal
                    ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                    : 'text-gray-500 border-gray-700 hover:border-gray-600'}`}>
                  Internal Note
                </button>
              </div>
            )}
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              placeholder={isInternal ? 'Internal note (not visible to employee)...' : 'Write a reply...'}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition resize-none"
            />
            <div className="flex justify-end">
              <button type="submit" disabled={posting || !comment.trim()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition">
                <Send className="w-3.5 h-3.5" />
                {posting ? 'Sending...' : 'Send Reply'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </DashboardLayout>
  )
}
