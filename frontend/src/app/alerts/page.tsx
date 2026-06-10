'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { ticketsApi, notificationsApi } from '@/lib/api'
import { useLiveTime, formatAgo } from '@/lib/time'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, AlertTriangle, Clock, CheckCircle, Zap,
  MessageSquare, Cpu, User, RefreshCw, ChevronRight,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import Link from 'next/link'

type FilterKey = 'all' | 'messages' | 'escalated' | 'sla' | 'critical'

interface AlertItem {
  id:       string
  type:     'message' | 'escalated' | 'sla' | 'critical'
  time:     string
  ticketId: string
  ticketNumber: string
  ticketTitle:  string
  department?:  string
  // message-specific
  authorName?:  string
  authorRole?:  string
  isAi?:        boolean
  preview?:     string
  // system-specific
  systemMsg?:   string
}

export default function AlertsPage() {
  const { user } = useAuthStore()
  const now      = useLiveTime(1000)

  const [alerts,   setAlerts]   = useState<AlertItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState<FilterKey>('all')
  const [lastSeen, setLastSeen] = useState<string | null>(null)   // ISO for polling
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const role    = user?.role || 'employee'
  const isAgent = ['ai_intern','it_support_technician','junior_operations','admin','super_admin'].includes(role)

  // ── Full load ───────────────────────────────────────────────────────────────
  const fullLoad = useCallback(async () => {
    setLoading(true)
    try {
      const [ticketRes, notifRes] = await Promise.all([
        ticketsApi.list(),
        notificationsApi.list(),
      ])

      const tickets: any[] = ticketRes.data.tickets || []
      const notifs:  any[] = notifRes.data.notifications || []

      // Build system alerts from ticket state
      const sysAlerts: AlertItem[] = tickets.flatMap(t => {
        const items: AlertItem[] = []
        if (t.is_escalated)
          items.push({ id: `esc-${t.id}`, type: 'escalated', time: t.updated_at,
            ticketId: t.id, ticketNumber: t.ticket_number, ticketTitle: t.title,
            department: t.department?.name, systemMsg: 'Ticket escalated — needs attention' })
        if (t.sla_breached)
          items.push({ id: `sla-${t.id}`, type: 'sla', time: t.sla_deadline,
            ticketId: t.id, ticketNumber: t.ticket_number, ticketTitle: t.title,
            department: t.department?.name, systemMsg: 'SLA breached — response overdue' })
        if (t.priority === 'critical' && ['open','assigned','pending'].includes(t.status))
          items.push({ id: `crit-${t.id}`, type: 'critical', time: t.created_at,
            ticketId: t.id, ticketNumber: t.ticket_number, ticketTitle: t.title,
            department: t.department?.name, systemMsg: 'Critical priority ticket open' })
        return items
      })

      // Build message notifications
      const msgAlerts: AlertItem[] = notifs.map((n: any) => ({
        id:           `msg-${n.id}`,
        type:         'message' as const,
        time:         n.created_at,
        ticketId:     n.ticket_id,
        ticketNumber: n.ticket_number,
        ticketTitle:  n.ticket_title,
        department:   n.department,
        authorName:   n.author_name,
        authorRole:   n.author_role,
        isAi:         n.is_ai,
        preview:      n.preview,
      }))

      const all = [...msgAlerts, ...sysAlerts]
        .sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime())

      setAlerts(all)

      // Track newest message for delta polling
      if (msgAlerts.length > 0) {
        const newest = msgAlerts.reduce((a, b) =>
          new Date(a.time) > new Date(b.time) ? a : b)
        setLastSeen(newest.time)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Delta poll — only new messages ─────────────────────────────────────────
  const deltaPoll = useCallback(async () => {
    try {
      const res  = await notificationsApi.list(lastSeen ?? undefined)
      const notifs: any[] = res.data.notifications || []
      if (notifs.length === 0) return

      const newItems: AlertItem[] = notifs.map((n: any) => ({
        id:           `msg-${n.id}`,
        type:         'message' as const,
        time:         n.created_at,
        ticketId:     n.ticket_id,
        ticketNumber: n.ticket_number,
        ticketTitle:  n.ticket_title,
        department:   n.department,
        authorName:   n.author_name,
        authorRole:   n.author_role,
        isAi:         n.is_ai,
        preview:      n.preview,
      }))

      setAlerts(prev => {
        const existingIds = new Set(prev.map(a => a.id))
        const fresh = newItems.filter(n => !existingIds.has(n.id))
        if (fresh.length === 0) return prev
        return [...fresh, ...prev]
          .sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime())
      })

      const newest = newItems.reduce((a, b) =>
        new Date(a.time) > new Date(b.time) ? a : b)
      setLastSeen(newest.time)
    } catch { /* silent */ }
  }, [lastSeen])

  useEffect(() => { fullLoad() }, [fullLoad])

  // Poll every 30 s
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(deltaPoll, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [deltaPoll])

  // ── Derived ─────────────────────────────────────────────────────────────────
  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.type === filter)
  const counts = {
    all:       alerts.length,
    messages:  alerts.filter(a => a.type === 'message').length,
    escalated: alerts.filter(a => a.type === 'escalated').length,
    sla:       alerts.filter(a => a.type === 'sla').length,
    critical:  alerts.filter(a => a.type === 'critical').length,
  }

  // ── Config per alert type ───────────────────────────────────────────────────
  const TYPE_CFG = {
    message:  { icon: MessageSquare, color: 'var(--accent)',   bg: 'var(--accent-subtle)',  border: 'color-mix(in srgb, var(--accent) 25%, transparent)'  },
    escalated:{ icon: AlertTriangle, color: 'var(--danger)',   bg: 'var(--danger-bg)',      border: 'color-mix(in srgb, var(--danger) 25%, transparent)'  },
    sla:      { icon: Clock,         color: 'var(--warning)',  bg: 'var(--warning-bg)',     border: 'color-mix(in srgb, var(--warning) 25%, transparent)' },
    critical: { icon: Zap,           color: '#f59e0b',         bg: 'rgba(245,158,11,.08)',  border: 'rgba(245,158,11,.25)'                                },
  }

  const TABS: [FilterKey, string][] = [
    ['all',       'All'],
    ['messages',  'Messages'],
    ['escalated', 'Escalated'],
    ['sla',       'SLA Breach'],
    ['critical',  'Critical'],
  ]

  return (
    <DashboardLayout title="Alerts" subtitle="Notifications & active issues">
      <div className="space-y-4" style={{ maxWidth: 720 }}>

        {/* ── Summary cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-5 gap-2">
          {TABS.map(([key, label]) => {
            const cfg = key === 'all' ? null : TYPE_CFG[key as keyof typeof TYPE_CFG]
            const active = filter === key
            const count  = counts[key]
            return (
              <button key={key} onClick={() => setFilter(key)}
                className="rounded-xl p-3 text-left transition"
                style={{
                  background: active ? (cfg ? cfg.bg : 'var(--bg-muted)') : 'var(--bg-card)',
                  border: `1px solid ${active ? (cfg ? cfg.border : 'var(--border)') : 'var(--border)'}`,
                }}>
                <p className="text-xl font-bold"
                  style={{ color: cfg ? cfg.color : 'var(--text)' }}>{count}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{label}</p>
              </button>
            )
          })}
        </div>

        {/* ── Toolbar ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>
            Auto-refreshes every 30 seconds
          </p>
          <button onClick={fullLoad} disabled={loading}
            className="flex items-center gap-1.5 text-xs transition disabled:opacity-50"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh now
          </button>
        </div>

        {/* ── Alert list ───────────────────────────────────────────── */}
        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--text-3)' }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="card rounded-xl p-14 text-center">
            <CheckCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--success)' }} />
            <p className="font-semibold" style={{ color: 'var(--text)' }}>All clear</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
              No {filter === 'all' ? '' : filter} alerts right now
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {filtered.map((alert, i) => {
                const cfg  = TYPE_CFG[alert.type]
                const Icon = cfg.icon
                const isMsg = alert.type === 'message'

                return (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, delay: i < 8 ? i * 0.03 : 0 }}
                  >
                    <Link href={`/tickets/${alert.ticketId}`}
                      className="flex items-start gap-3 p-4 rounded-xl transition group"
                      style={{
                        background: 'var(--bg-card)',
                        border: `1px solid ${cfg.border}`,
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-muted)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)'}
                    >
                      {/* Icon */}
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                        {isMsg && alert.isAi
                          ? <Cpu  className="w-4 h-4" style={{ color: cfg.color }} />
                          : isMsg
                          ? <User className="w-4 h-4" style={{ color: cfg.color }} />
                          : <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                        }
                      </div>

                      {/* Body */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            {/* Who + what */}
                            {isMsg ? (
                              <p className="text-sm font-semibold" style={{ color: cfg.color }}>
                                {alert.isAi
                                  ? 'AI Assistant replied'
                                  : `${alert.authorName} replied`}
                              </p>
                            ) : (
                              <p className="text-sm font-semibold" style={{ color: cfg.color }}>
                                {alert.systemMsg}
                              </p>
                            )}
                            {/* Ticket title */}
                            <p className="text-sm truncate mt-0.5" style={{ color: 'var(--text)', maxWidth: 420 }}>
                              {alert.ticketTitle}
                            </p>
                            {/* Message preview */}
                            {isMsg && alert.preview && (
                              <p className="text-xs mt-1 line-clamp-2 leading-relaxed"
                                style={{ color: 'var(--text-3)', maxWidth: 460 }}>
                                "{alert.preview}"
                              </p>
                            )}
                          </div>

                          {/* Time + chevron */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                              {alert.time ? formatAgo(alert.time, now) : ''}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition"
                              style={{ color: 'var(--text-3)' }} />
                          </div>
                        </div>

                        {/* Footer meta */}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                            {alert.ticketNumber}
                          </span>
                          {alert.department && (
                            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                              {alert.department}
                            </span>
                          )}
                          {isMsg && alert.authorRole && !alert.isAi && (
                            <span className="capitalize" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                              {alert.authorRole.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}
