'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lightbulb, ChevronDown, Clock, AlertTriangle,
  CheckCircle, Circle, Zap, RefreshCw, ExternalLink,
  Sparkles, ShieldAlert, ThumbsUp, ThumbsDown, Loader
} from 'lucide-react'
import { ticketsApi } from '@/lib/api'
import toast from 'react-hot-toast'

const RISK_CONFIG = {
  none:   { label: 'Safe',     color: 'text-green-400',  bg: 'bg-green-500/10'  },
  low:    { label: 'Low risk', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  medium: { label: 'Caution', color: 'text-orange-400', bg: 'bg-orange-500/10' },
}

interface Step {
  order: number
  title: string
  instruction: string
  time_estimate: string
  risk: 'none' | 'low' | 'medium'
  success_indicator: string
}

interface SelfHelpData {
  enabled?: boolean
  can_self_resolve?: boolean
  confidence?: number
  summary?: string
  likely_solution?: string | null
  steps?: Step[]
  do_not_do?: string[]
  escalate_if?: string
  useful_links?: { label: string; url: string | null }[]
  generated_by?: string
}

type OutcomeState = 'idle' | 'submitting' | 'resolved' | 'not_resolved'

interface Props {
  ticketId: string
  autoLoad?: boolean
}

export default function SelfHelpPanel({ ticketId, autoLoad = false }: Props) {
  const [open,    setOpen]    = useState(autoLoad)
  const [data,    setData]    = useState<SelfHelpData | null>(null)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [outcome, setOutcome] = useState<OutcomeState>('idle')

  const load = async (force = false) => {
    if (data && !force) return
    setLoading(true)
    try {
      const { data: res } = await ticketsApi.selfHelp(ticketId, force)
      setData(res)
      // Restore exactly where the employee left off — which steps were
      // already checked, and whether they already submitted an outcome —
      // so navigating away and back doesn't lose progress.
      setChecked(new Set<number>(res.steps_done ?? []))
      setOutcome(res.resolved === true ? 'resolved' : res.resolved === false ? 'not_resolved' : 'idle')
    } catch {
      // silent — self-help is optional
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (autoLoad) load() }, [ticketId]) // eslint-disable-line

  const toggle = () => {
    setOpen(o => !o)
    if (!data && !loading) load()
  }

  const toggleStep = (order: number) => {
    if (outcome !== 'idle') return
    setChecked(prev => {
      const next = new Set(prev)
      next.has(order) ? next.delete(order) : next.add(order)
      // Fire-and-forget persist — so checked steps survive navigating away
      // and back, even before a final yes/no outcome is submitted.
      ticketsApi.selfHelpProgress(ticketId, Array.from(next)).catch(() => {})
      return next
    })
  }

  const reportOutcome = async (resolved: boolean) => {
    setOutcome('submitting')
    try {
      await ticketsApi.selfHelpOutcome(ticketId, resolved, Array.from(checked))
      setOutcome(resolved ? 'resolved' : 'not_resolved')
      if (resolved) {
        toast.success('Great! Your ticket has been automatically resolved.')
      } else {
        toast('Got it — an agent will prioritise your ticket.', { icon: '👍' })
      }
    } catch {
      setOutcome('idle')
      toast.error('Could not submit outcome — please try again.')
    }
  }

  const completedCount = checked.size
  const totalSteps     = data?.steps?.length ?? 0
  const allDone        = totalSteps > 0 && completedCount === totalSteps

  return (
    <div className="border border-amber-500/20 rounded-xl overflow-hidden">

      {/* Header */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-amber-500/5 hover:bg-amber-500/10 transition"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center">
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <span className="text-sm font-medium text-amber-300">
            While you wait — try these first
          </span>
          {outcome === 'resolved' && (
            <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Issue resolved
            </span>
          )}
          {outcome === 'not_resolved' && (
            <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
              Agent notified
            </span>
          )}
          {outcome === 'idle' && data && (
            <span className="text-xs text-amber-500/70">
              {completedCount}/{totalSteps} steps done
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-amber-500/60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-gray-950/60 border-t border-amber-500/10 space-y-4">

              {/* Loading */}
              {loading && (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <div className="w-4 h-4 border-2 border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
                  <span className="text-sm text-amber-400/70">Generating self-help steps…</span>
                </div>
              )}

              {/* Disabled by admin */}
              {data && data.enabled === false && (
                <div className="py-4 text-center">
                  <p className="text-sm text-gray-400">Self-help suggestions are currently turned off.</p>
                  <p className="text-xs text-gray-600 mt-1">An agent will respond to your ticket shortly.</p>
                </div>
              )}

              {/* Resolved outcome */}
              {outcome === 'resolved' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-xl bg-green-500/5 border border-green-500/25 p-5 text-center"
                >
                  <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
                  <p className="text-base font-semibold text-green-300">Glad it worked!</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Your ticket has been automatically resolved. An agent will do a quick
                    check to confirm everything is working correctly.
                  </p>
                </motion.div>
              )}

              {/* Not resolved outcome */}
              {outcome === 'not_resolved' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-xl bg-blue-500/5 border border-blue-500/25 p-5 text-center"
                >
                  <Lightbulb className="w-10 h-10 text-blue-400 mx-auto mb-3" />
                  <p className="text-base font-semibold text-blue-300">We've got you</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Your agent has been notified that you tried the self-help steps and
                    the issue persists. They'll prioritise your ticket.
                  </p>
                </motion.div>
              )}

              {/* Main content */}
              {data && data.enabled !== false && outcome === 'idle' && (
                <>
                  {/* Summary + confidence */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1">
                      <p className="text-sm text-gray-300 leading-relaxed">{data.summary ?? ''}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          (data.can_self_resolve ?? false)
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-gray-700 text-gray-400'
                        }`}>
                          {(data.can_self_resolve ?? false) ? '✓ May self-resolve' : 'Agent required'}
                        </span>
                        <span className="text-xs text-gray-600">
                          {Math.round((data.confidence ?? 0) * 100)}% confidence
                        </span>
                        {(data.generated_by ?? '') === 'groq' && (
                          <span className="text-xs text-blue-400/60 flex items-center gap-1">
                            <Zap className="w-2.5 h-2.5" /> AI generated
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => { setData(null); setOutcome('idle'); load(true) }}
                      className="text-gray-600 hover:text-gray-400 transition flex-shrink-0"
                      title="Regenerate"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Likely solution */}
                  {data.likely_solution && (
                    <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                      <Sparkles className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-blue-400">Possible answer</p>
                        <p className="text-xs text-gray-300 mt-1 leading-relaxed">{data.likely_solution}</p>
                        <p className="text-xs text-gray-600 mt-1.5">An agent will confirm this applies to your specific case.</p>
                      </div>
                    </div>
                  )}

                  {/* Progress bar */}
                  {totalSteps > 0 && (
                    <div className="w-full bg-gray-800 rounded-full h-1">
                      <div
                        className="bg-amber-400 h-1 rounded-full transition-all duration-500"
                        style={{ width: `${(completedCount / totalSteps) * 100}%` }}
                      />
                    </div>
                  )}

                  {/* Steps */}
                  <div className="space-y-2">
                    {(data.steps ?? []).map((step) => {
                      const done    = checked.has(step.order)
                      const riskCfg = RISK_CONFIG[step.risk] || RISK_CONFIG.none
                      return (
                        <motion.div
                          key={step.order}
                          layout
                          className={`rounded-lg border p-3 transition cursor-pointer ${
                            done
                              ? 'bg-green-500/5 border-green-500/20 opacity-70'
                              : 'bg-gray-900/50 border-gray-800/60 hover:border-amber-500/20'
                          }`}
                          onClick={() => toggleStep(step.order)}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 transition ${
                              done
                                ? 'bg-green-500 border-green-500'
                                : 'border-gray-600 hover:border-amber-400'
                            }`}>
                              {done
                                ? <CheckCircle className="w-3.5 h-3.5 text-white" />
                                : <span className="text-xs text-gray-500 font-mono">{step.order}</span>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className={`text-sm font-medium ${done ? 'line-through text-gray-500' : 'text-white'}`}>
                                  {step.title}
                                </p>
                                <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                                  <span className="flex items-center gap-1 text-xs text-gray-500">
                                    <Clock className="w-3 h-3" /> {step.time_estimate}
                                  </span>
                                  {step.risk !== 'none' && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${riskCfg.bg} ${riskCfg.color}`}>
                                      {riskCfg.label}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-gray-400 mt-1 leading-relaxed">{step.instruction}</p>
                              {!done && (
                                <p className="text-xs text-green-400/70 mt-1.5 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  {step.success_indicator}
                                </p>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>

                  {/* Do not do */}
                  {data.do_not_do && data.do_not_do.length > 0 && (
                    <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />
                        <p className="text-xs font-medium text-orange-400">While you wait, avoid this</p>
                      </div>
                      <ul className="space-y-1">
                        {data.do_not_do.map((item, i) => (
                          <li key={i} className="text-xs text-gray-400 leading-relaxed pl-4 relative">
                            <span className="absolute left-0 text-orange-400/60">·</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Escalate warning */}
                  {data.escalate_if && (
                    <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-red-400">Skip these steps and escalate if:</p>
                        <p className="text-xs text-gray-400 mt-0.5">{data.escalate_if}</p>
                      </div>
                    </div>
                  )}

                  {/* Useful links */}
                  {(data.useful_links?.filter(l => l.url).length ?? 0) > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-600">Useful resources</p>
                      {(data.useful_links ?? []).filter(l => l.url).map((link, i) => (
                        <a key={i} href={link.url!} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition">
                          <ExternalLink className="w-3 h-3" /> {link.label}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* ── Outcome question ── */}
                  {completedCount > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl bg-gray-900 border border-gray-700/60 p-4"
                    >
                      <p className="text-sm font-medium text-white text-center mb-3">
                        Did {allDone ? 'these steps' : 'any of these steps'} fix your issue?
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => reportOutcome(true)}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition"
                          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(34,197,94,0.18)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(34,197,94,0.1)'}
                        >
                          <ThumbsUp className="w-4 h-4" /> Yes, it's fixed!
                        </button>
                        <button
                          onClick={() => reportOutcome(false)}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition"
                          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.15)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.08)'}
                        >
                          <ThumbsDown className="w-4 h-4" /> No, still broken
                        </button>
                      </div>
                      <p className="text-xs text-gray-600 text-center mt-2">
                        If it's fixed, we'll automatically close your ticket. If not, your agent will be notified.
                      </p>
                    </motion.div>
                  )}

                </>
              )}

              {!data && !loading && (
                <p className="text-xs text-gray-600 text-center py-2">
                  Click the panel header to load AI self-help steps
                </p>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
