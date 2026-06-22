'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { ticketsApi, notificationsApi } from '@/lib/api'
import { useLiveTime, formatAgo } from '@/lib/time'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, AlertTriangle, Clock, CheckCircle, Zap,
  MessageSquare, Cpu, User, RefreshCw, ChevronRight,
  Lightbulb,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import Link from 'next/link'
import { buildAlertItems, getReadIds, markRead as markReadShared, markAllRead as markAllReadShared, AlertItem as SharedAlertItem, AlertType } from '@/lib/alerts'
import { isToday, isYesterday, format } from 'date-fns'

type FilterKey = 'all' | 'messages' | 'escalated' | 'sla' | 'critical'

interface AlertItem extends SharedAlertItem {
  read: boolean
}

const markRead = (id: string) => markReadShared(id)
const markAllRead = (ids: string[]) => markAllReadShared(ids)

// Group alerts by date
function groupByDate(alerts: AlertItem[]): { label: string; items: AlertItem[] }[] {
  const groups: Record<string, AlertItem[]> = {}
  alerts.forEach(a => {
    const d = new Date(a.time || Date.now())
    const key = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'EEEE, d MMM yyyy')
    if (!groups[key]) groups[key] = []
    groups[key].push(a)
  })
  return Object.entries(groups).map(([label, items]) => ({ label, items }))
}

export default function AlertsPage() {
  const { user } = useAuthStore()
  const now      = useLiveTime(1000)

  const [alerts,   setAlerts]   = useState<AlertItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState<FilterKey>('all')
  const [lastSeen, setLastSeen] = useState<string | null>(null)
  const [readIds,  setReadIds]  = useState<Set<string>>(new Set())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { setReadIds(getReadIds()) }, [])

  const fullLoad = useCallback(async () => {
    setLoading(true)
    try {
      const [ticketRes, notifRes] = await Promise.all([
        ticketsApi.list(),
        notificationsApi.list(),
      ])
      const tickets: any[] = ticketRes.data.tickets  || []
      const notifs:  any[] = notifRes.data.notifications || []
      const stored = getReadIds()

      const all: AlertItem[] = buildAlertItems(tickets, notifs)
        .map(item => ({ ...item, read: stored.has(item.id) }))

      setAlerts(all)
      const msgItems = all.filter(a => a.type === 'message')
      if (msgItems.length > 0) {
        const newest = msgItems.reduce((a, b) => new Date(a.time) > new Date(b.time) ? a : b)
        setLastSeen(newest.time)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  const deltaPoll = useCallback(async () => {
    try {
      const res   = await notificationsApi.list(lastSeen ?? undefined)
      const notifs: any[] = res.data.notifications || []
      if (notifs.length === 0) return
      const stored = getReadIds()
      const newItems: AlertItem[] = buildAlertItems([], notifs)
        .map(item => ({ ...item, read: stored.has(item.id) }))
      setAlerts(prev => {
        const existingIds = new Set(prev.map(a => a.id))
        const fresh = newItems.filter(n => !existingIds.has(n.id))
        if (fresh.length === 0) return prev
        return [...fresh, ...prev]
          .sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime())
      })
      const newest = newItems.reduce((a, b) => new Date(a.time) > new Date(b.time) ? a : b)
      setLastSeen(newest.time)
    } catch { /* silent */ }
  }, [lastSeen])

  useEffect(() => { fullLoad() }, [fullLoad])
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(deltaPoll, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [deltaPoll])

  const handleOpen = (id: string) => {
    markRead(id)
    setReadIds(prev => { const n = new Set(prev); n.add(id); return n })
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a))
  }

  const handleMarkAllRead = () => {
    const ids = filtered.map(a => a.id)
    markAllRead(ids)
    setReadIds(prev => { const n = new Set(prev); ids.forEach(id => n.add(id)); return n })
    setAlerts(prev => prev.map(a => ids.includes(a.id) ? { ...a, read: true } : a))
  }

  const filter_type_map: Record<FilterKey, AlertType | null> = {
    all: null, messages: 'message', escalated: 'escalated', sla: 'sla', critical: 'critical',
  }
  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.type === filter_type_map[filter])
  const unreadCount = filtered.filter(a => !a.read).length
  const counts = {
    all:       alerts.length,
    messages:  alerts.filter(a => a.type === 'message').length,
    escalated: alerts.filter(a => a.type === 'escalated').length,
    sla:       alerts.filter(a => a.type === 'sla').length,
    critical:  alerts.filter(a => a.type === 'critical').length,
  }

  const TYPE_CFG = {
    message:   { icon: MessageSquare, color: 'var(--accent)',  bg: 'var(--accent-subtle)',  border: 'color-mix(in srgb, var(--accent) 25%, transparent)'  },
    escalated: { icon: AlertTriangle, color: 'var(--danger)',  bg: 'var(--danger-bg)',      border: 'color-mix(in srgb, var(--danger) 25%, transparent)'  },
    sla:       { icon: Clock,         color: 'var(--warning)', bg: 'var(--warning-bg)',     border: 'color-mix(in srgb, var(--warning) 25%, transparent)' },
    critical:  { icon: Zap,           color: '#f59e0b',        bg: 'rgba(245,158,11,.08)',  border: 'rgba(245,158,11,.25)'                                },
  }

  const TABS: [FilterKey, string][] = [
    ['all',       'All'],
    ['messages',  'Messages'],
    ['escalated', 'Escalated'],
    ['sla',       'SLA Breach'],
    ['critical',  'Critical'],
  ]

  const grouped = groupByDate(filtered)

  return (
    <DashboardLayout title="Alerts" subtitle="Notifications & active issues">
      <div className="space-y-4" style={{ maxWidth: 720 }}>

        {/* Summary cards */}
        <div className="grid grid-cols-5 gap-2">
          {TABS.map(([key, label]) => {
            const cfg    = key === 'all' ? null : TYPE_CFG[key as keyof typeof TYPE_CFG]
            const active = filter === key
            const count  = counts[key]
            const unread = key === 'all'
              ? alerts.filter(a => !a.read).length
              : alerts.filter(a => a.type === key && !a.read).length
            return (
              <button key={key} onClick={() => setFilter(key)}
                className="rounded-xl p-3 text-left transition relative"
                style={{
                  background: active ? (cfg ? cfg.bg : 'var(--bg-muted)') : 'var(--bg-card)',
                  border: `1px solid ${active ? (cfg ? cfg.border : 'var(--border)') : 'var(--border)'}`,
                }}>
                <p className="text-xl font-bold" style={{ color: cfg ? cfg.color : 'var(--text)' }}>{count}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{label}</p>
                {unread > 0 && (
                  <span className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ fontSize: 9, background: 'var(--danger)' }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Auto-refreshes every 30s
            </p>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead}
                className="text-xs transition"
                style={{ color: 'var(--accent-text)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.7'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}>
                Mark all read ({unreadCount})
              </button>
            )}
          </div>
          <button onClick={fullLoad} disabled={loading}
            className="flex items-center gap-1.5 text-xs transition disabled:opacity-50"
            style={{ color: 'var(--text-3)' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh now
          </button>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--text-3)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="card rounded-xl p-14 text-center">
            <CheckCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--success)' }} />
            <p className="font-semibold" style={{ color: 'var(--text)' }}>All clear</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>
              No {filter === 'all' ? '' : filter} alerts right now
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(({ label, items }) => (
              <div key={label}>
                {/* Date group header */}
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-3)' }}>{label}</p>
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                    {items.filter(a => !a.read).length > 0
                      ? `${items.filter(a => !a.read).length} unread`
                      : 'All read'}
                  </p>
                </div>

                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {items.map((alert, i) => {
                      const cfg   = TYPE_CFG[alert.type]
                      const Icon  = cfg.icon
                      const isMsg = alert.type === 'message'
                      const isUnread = !alert.read

                      return (
                        <motion.div
                          key={alert.id}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.18, delay: i < 8 ? i * 0.02 : 0 }}
                        >
                          <Link href={`/tickets/${alert.ticketId}`}
                            onClick={() => handleOpen(alert.id)}
                            className="flex items-start gap-3 p-4 rounded-xl transition group relative"
                            style={{
                              background: isUnread ? 'color-mix(in srgb, var(--accent) 4%, var(--bg-card))' : 'var(--bg-card)',
                              border: `1px solid ${isUnread ? cfg.border : 'var(--border)'}`,
                            }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-muted)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isUnread
                              ? 'color-mix(in srgb, var(--accent) 4%, var(--bg-card))' : 'var(--bg-card)'}
                          >
                            {/* Unread dot */}
                            {isUnread && (
                              <span className="absolute top-4 right-4 w-2 h-2 rounded-full"
                                style={{ background: cfg.color }} />
                            )}

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
                            <div className="flex-1 min-w-0 pr-4">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold" style={{ color: isUnread ? cfg.color : 'var(--text-2)' }}>
                                    {isMsg
                                      ? alert.isAi ? 'AI Assistant replied' : `${alert.authorName} replied`
                                      : alert.systemMsg
                                    }
                                  </p>
                                  <p className="text-sm truncate mt-0.5" style={{ color: 'var(--text)', maxWidth: 380 }}>
                                    {alert.ticketTitle}
                                  </p>
                                  {isMsg && alert.preview && (
                                    <p className="text-xs mt-1 line-clamp-2 leading-relaxed"
                                      style={{ color: 'var(--text-3)', maxWidth: 420 }}>
                                      "{alert.preview}"
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                                    {alert.time ? formatAgo(alert.time, now) : ''}
                                  </span>
                                  <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition"
                                    style={{ color: 'var(--text-3)' }} />
                                </div>
                              </div>

                              <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                  {alert.ticketNumber}
                                </span>
                                {alert.department && (
                                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{alert.department}</span>
                                )}
                                {isMsg && alert.authorRole && !alert.isAi && (
                                  <span className="capitalize" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                    {alert.authorRole.replace(/_/g, ' ')}
                                  </span>
                                )}
                                {!isUnread && (
                                  <span className="flex items-center gap-1" style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                    <CheckCircle className="w-3 h-3" /> Read
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
              </div>
            ))}
          </div>
        )}

      </div>
    </DashboardLayout>
  )
}
