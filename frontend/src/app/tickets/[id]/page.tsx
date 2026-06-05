'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { PriorityBadge, StatusBadge, DepartmentBadge } from '@/components/ui/TicketBadge'
import AutoResponsePanel from '@/components/ui/AutoResponsePanel'
import { ticketsApi } from '@/lib/api'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Cpu, Send, Zap, Clock, User, MessageSquare,
  AlertTriangle, CheckCircle, ChevronDown, Sparkles
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { useAuthStore } from '@/stores/authStore'

const STATUS_OPTIONS = ['open','pending','assigned','in_progress','escalated','waiting_for_user','resolved','closed']

export default function TicketDetailPage() {
  const { id } = useParams() as { id: string }
  const router  = useRouter()
  const { user } = useAuthStore()
  const [ticket, setTicket]               = useState<any>(null)
  const [loading, setLoading]             = useState(true)
  const [comment, setComment]             = useState('')
  const [isInternal, setIsInternal]       = useState(false)
  const [posting, setPosting]             = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)

  const role = (user as any)?.agent_role_key || user?.role || 'employee'
  const isAgentOrAdmin = ['ai_intern','it_support_technician','junior_operations','admin','super_admin'].includes(role)

  const load = async () => {
    try {
      const { data } = await ticketsApi.get(id)
      setTicket(data)
    } catch { toast.error('Could not load ticket') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!comment.trim()) return
    setPosting(true)
    try {
      await ticketsApi.addComment(id, comment, isInternal)
      setComment('')
      toast.success('Comment added')
      load()
    } catch { toast.error('Failed to add comment') }
    finally { setPosting(false) }
  }

  const handleStatusChange = async (newStatus: string) => {
    setStatusChanging(true)
    try {
      await ticketsApi.updateStatus(id, newStatus)
      toast.success(`Status updated to ${newStatus.replace(/_/g,' ')}`)
      // If resolving, auto-generate a resolution message
      if (newStatus === 'resolved' && isAgentOrAdmin) {
        try {
          const { data } = await ticketsApi.autoResponse(id, 'formal', 'resolved')
          await ticketsApi.addComment(id, data.response, false)
        } catch { /* silent */ }
      }
      load()
    } catch { toast.error('Failed to update status') }
    finally { setStatusChanging(false) }
  }

  const handleEscalate = async () => {
    try {
      await ticketsApi.escalate(id, 'Manually escalated by agent')
      // Auto-post escalation notice
      try {
        const { data } = await ticketsApi.autoResponse(id, 'urgent', 'escalated')
        await ticketsApi.addComment(id, data.response, false)
      } catch { /* silent */ }
      toast.success('Ticket escalated')
      load()
    } catch { toast.error('Failed to escalate') }
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

  const ai = ticket.ai || {}

  return (
    <DashboardLayout title={`Ticket ${ticket.ticket_number}`} subtitle={ticket.department?.name}>
      <div className="max-w-4xl space-y-4">

        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Main card */}
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

          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {ticket.submitter?.full_name}</span>
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />
              {ticket.created_at ? format(new Date(ticket.created_at), 'dd MMM yyyy HH:mm') : '—'}
            </span>
            {ticket.sla_deadline && (
              <span className={`flex items-center gap-1 ${ticket.sla_breached ? 'text-red-400' : 'text-gray-500'}`}>
                <Clock className="w-3.5 h-3.5" /> SLA: {format(new Date(ticket.sla_deadline), 'dd MMM HH:mm')}
                {ticket.sla_breached && ' (BREACHED)'}
              </span>
            )}
          </div>
        </div>

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
            {/* Token chips */}
            {ai.skill_tokens?.length > 0 && (
              <div className="mt-3 pt-2 border-t border-gray-800/60">
                <p className="text-xs text-gray-600 mb-1.5">Matched tokens</p>
                <div className="flex flex-wrap gap-1">
                  {ai.skill_tokens.slice(0, 6).map((t: string) => (
                    <span key={t} className="text-xs bg-blue-500/10 text-blue-400/80 px-1.5 py-0.5 rounded font-mono">
                      {t}
                    </span>
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
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-lg">
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

          {/* Agent actions */}
          {isAgentOrAdmin && (
            <div className="glass-card rounded-xl p-4 border border-gray-800/60 space-y-2">
              <p className="text-xs font-semibold text-gray-400 mb-3">Actions</p>
              <div className="relative">
                <select
                  value={ticket.status}
                  onChange={e => handleStatusChange(e.target.value)}
                  disabled={statusChanging}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none pr-8"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>
              {!ticket.is_escalated && (
                <button onClick={handleEscalate}
                  className="w-full flex items-center justify-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg px-3 py-2 text-xs font-medium transition">
                  <AlertTriangle className="w-3.5 h-3.5" /> Escalate
                </button>
              )}
            </div>
          )}
        </div>

        {/* Comments + Auto-Response Module */}
        <div className="glass-card rounded-xl border border-gray-800/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800/60 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-300">
              Thread ({ticket.comments?.length || 0})
            </h2>
            {/* Auto-response label */}
            {isAgentOrAdmin && (
              <span className="ml-auto flex items-center gap-1 text-xs text-blue-400/70">
                <Sparkles className="w-3 h-3" /> AI responses enabled
              </span>
            )}
          </div>

          {/* Comment list */}
          <div className="divide-y divide-gray-800/40 max-h-96 overflow-y-auto">
            {(ticket.comments || []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-600 text-center">No messages yet</p>
            ) : (
              ticket.comments.map((c: any) => (
                <div key={c.id} className={`px-5 py-4 ${
                  c.is_ai ? 'bg-blue-500/5 border-l-2 border-l-blue-500/30' :
                  c.is_internal ? 'bg-yellow-500/5' : ''
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

          {/* Reply area */}
          <form onSubmit={handleComment} className="p-5 border-t border-gray-800/60 space-y-3">

            {/* AI Response Generator — agents only */}
            {isAgentOrAdmin && (
              <AutoResponsePanel
                ticketId={id}
                category={ai.category}
                priority={ticket.priority}
                onInsert={(text) => setComment(text)}
              />
            )}

            {/* Reply type toggle */}
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
