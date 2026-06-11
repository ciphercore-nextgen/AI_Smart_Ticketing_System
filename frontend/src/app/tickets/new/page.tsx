'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/shared/DashboardLayout'
import SelfHelpPanel from '@/components/ui/SelfHelpPanel'
import { ticketsApi } from '@/lib/api'
import toast from 'react-hot-toast'
import {
  Cpu, Send, ChevronRight, CheckCircle,
  Info, Lightbulb, Monitor, Workflow, BarChart3,
} from 'lucide-react'

const ROUTING_GUIDE = [
  {
    icon: Monitor, color: '#3b82f6', agent: 'IT Support Assistant',
    triggers: ['Password or account locked', 'Can\'t connect to VPN or Wi-Fi', 'Laptop / hardware issue', 'Software crash or not responding', 'Email or Outlook problem', 'New device setup needed'],
  },
  {
    icon: Cpu, color: '#8b5cf6', agent: 'AI Intern',
    triggers: ['Need a report generated', 'Data analysis or dashboard', 'Summarize a document', 'Research task', 'Create FAQ or knowledge article', 'Trend analysis needed'],
  },
  {
    icon: Workflow, color: '#f59e0b', agent: 'Junior Automation Support',
    triggers: ['A workflow has stopped working', 'Approval emails not sending', 'Scheduled automation failed', 'Integration is broken', 'Onboarding/offboarding workflow issue', 'Power Automate / Zapier problem'],
  },
]

export default function NewTicketPage() {
  const router = useRouter()
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [result,      setResult]      = useState<any>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !description.trim()) return
    setLoading(true)
    try {
      const { data } = await ticketsApi.create({ title, description })
      setResult(data)
      setSubmitted(true)
      toast.success('Ticket submitted — AI is routing your request!')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to submit ticket')
    } finally {
      setLoading(false)
    }
  }

  const ai = result?.ai

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted && result) {
    const agentCfg = ROUTING_GUIDE.find(r =>
      result.assigned_agent?.agent_role_key &&
      r.agent.toLowerCase().includes(result.assigned_agent.agent_role_key.split('_')[0])
    ) || ROUTING_GUIDE[0]

    return (
      <DashboardLayout title="Ticket Submitted" subtitle="Your request has been routed to the right agent">
        <div style={{ maxWidth: 680 }} className="mx-auto space-y-4">

          {/* Success */}
          <div className="card rounded-xl p-5"
            style={{ borderColor: 'color-mix(in srgb, var(--success) 25%, transparent)' }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--success-bg)' }}>
                <CheckCircle className="w-5 h-5" style={{ color: 'var(--success)' }} />
              </div>
              <div>
                <p className="font-semibold" style={{ color: 'var(--text)' }}>Ticket Created</p>
                <p className="mono text-xs" style={{ color: 'var(--text-3)' }}>{result.ticket_number}</p>
              </div>
              <span className="ml-auto text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                style={{
                  background: result.priority === 'critical' ? 'var(--danger-bg)'  :
                              result.priority === 'high'     ? 'rgba(249,115,22,.1)' :
                              result.priority === 'medium'   ? 'var(--warning-bg)' : 'var(--success-bg)',
                  color:      result.priority === 'critical' ? 'var(--danger)'  :
                              result.priority === 'high'     ? '#f97316' :
                              result.priority === 'medium'   ? 'var(--warning)' : 'var(--success)',
                }}>
                {result.priority} priority
              </span>
            </div>
            <p className="font-bold" style={{ color: 'var(--text)' }}>{result.title}</p>
          </div>

          {/* AI routing result */}
          <div className="card rounded-xl p-5"
            style={{ borderColor: 'color-mix(in srgb, var(--accent) 20%, transparent)' }}>
            <div className="flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--accent-text)' }}>AI Routing Result</span>
              {ai?.confidence && (
                <span className="ml-auto badge" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
                  {Math.round((ai.confidence || 0) * 100)}% confidence
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-subtle)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>Submitting Department</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{result.department?.name || '—'}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{ai?.category || 'General Support'}</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-subtle)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>Assigned Agent</p>
                {result.assigned_agent ? (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)' }}>
                      {result.assigned_agent.full_name?.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{result.assigned_agent.full_name}</p>
                      <p className="text-xs capitalize" style={{ color: 'var(--text-3)' }}>
                        {(result.assigned_agent.agent_role_key || '').replace(/_/g,' ')}
                      </p>
                    </div>
                  </div>
                ) : <p className="text-sm" style={{ color: 'var(--text-3)' }}>Being assigned…</p>}
              </div>
            </div>

            {ai?.routing_rationale && (
              <div className="rounded-lg p-3 flex items-start gap-2"
                style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>{ai.routing_rationale}</p>
              </div>
            )}

            {ai?.skill_tokens && ai.skill_tokens.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ai.skill_tokens.slice(0, 6).map((t: string) => (
                  <span key={t} className="mono badge"
                    style={{ background: 'var(--accent-subtle)', color: 'var(--accent-text)', fontSize: 11 }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Self-help steps */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4" style={{ color: '#f59e0b' }} />
              <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>
                Things to try while your ticket is being reviewed
              </p>
            </div>
            <SelfHelpPanel ticketId={result.id} autoLoad={true} />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={() => router.push(`/tickets/${result.id}`)}
              className="btn btn-primary flex-1 justify-center">
              View Ticket <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => { setSubmitted(false); setTitle(''); setDescription(''); setResult(null) }}
              className="btn btn-secondary px-5">
              New Ticket
            </button>
          </div>

        </div>
      </DashboardLayout>
    )
  }

  // ── Submission form ─────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Submit a Ticket" subtitle="Describe your problem — AI routes it to the right agent automatically">
      <div style={{ maxWidth: 740 }} className="mx-auto space-y-5">

        {/* Routing guide */}
        <div className="card rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
              AI routes by problem type — not your department
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {ROUTING_GUIDE.map(g => (
              <div key={g.agent} className="rounded-lg p-3"
                style={{
                  background: `color-mix(in srgb, ${g.color} 6%, var(--bg-subtle))`,
                  border: `1px solid color-mix(in srgb, ${g.color} 20%, transparent)`,
                }}>
                <div className="flex items-center gap-2 mb-2">
                  <g.icon className="w-3.5 h-3.5" style={{ color: g.color }} />
                  <p className="text-xs font-bold" style={{ color: g.color }}>{g.agent}</p>
                </div>
                {g.triggers.map(t => (
                  <p key={t} className="text-xs" style={{ color: 'var(--text-3)', marginBottom: 2 }}>· {t}</p>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* After-submit info */}
        <div className="card rounded-xl p-4 flex items-start gap-3"
          style={{ borderColor: 'rgba(245,158,11,.25)' }}>
          <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>After you submit</p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-3)' }}>
              AI instantly classifies the problem, routes it to the correct agent, and generates personalised
              self-help steps you can try right now — so you're not stuck waiting.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Subject <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input value={title} onChange={e => setTitle(e.target.value)} required
              placeholder="e.g. Cannot connect to VPN from home"
              className="input" />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>
              Description <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} required
              rows={6}
              placeholder="Describe your issue in detail. Include error messages, when it started, and what you've already tried. The more detail you give, the better the AI routing and self-help steps."
              className="input resize-none" />
            <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
              {description.length} chars · More detail = better routing accuracy
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={loading || !title.trim() || !description.trim()}
              className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {loading
                ? <><span className="w-4 h-4 rounded-full animate-spin border-2 border-white/30 border-t-white" /> Routing…</>
                : <><Send className="w-4 h-4" /> Submit Ticket</>
              }
            </button>
            <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
              <BarChart3 className="w-3 h-3" style={{ color: 'var(--accent)' }} /> Powered by GROQ LLaMA 3
            </p>
          </div>
        </form>

      </div>
    </DashboardLayout>
  )
}
