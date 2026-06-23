/**
 * lib/alerts.ts — single source of truth for "what counts as an alert" and
 * "has this alert been opened yet".
 *
 * Previously this logic was duplicated between Header.tsx (the bell) and
 * alerts/page.tsx — the bell used a naive "zero the badge whenever you visit
 * /alerts" approach instead of actually checking which items were read, so
 * it didn't reflect what was still genuinely unread. Both now import from
 * here, so there's exactly one definition of an alert and one read-tracking
 * store.
 */

export type AlertType = 'message' | 'escalated' | 'sla' | 'critical' | 'assigned'

export interface AlertItem {
  id:           string
  type:         AlertType
  time:         string
  ticketId:     string
  ticketNumber: string
  ticketTitle:  string
  department?:  string
  authorName?:  string
  authorRole?:  string
  isAi?:        boolean
  preview?:     string
  systemMsg?:   string
}

// ── Read-state persistence ──────────────────────────────────────────────────
const STORAGE_KEY = 'ticketiq-alerts-read'

const READ_STATE_EVENT = 'ticketiq:alerts-read'

export const getReadIds = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')) } catch { return new Set() }
}

const notifyReadStateChanged = () => {
  try { window.dispatchEvent(new Event(READ_STATE_EVENT)) } catch {}
}

export const onReadStateChanged = (handler: () => void) => {
  window.addEventListener(READ_STATE_EVENT, handler)
  return () => window.removeEventListener(READ_STATE_EVENT, handler)
}

export const markRead = (id: string) => {
  try {
    const ids = getReadIds(); ids.add(id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
    notifyReadStateChanged()
  } catch {}
}

export const markAllRead = (ids: string[]) => {
  try {
    const existing = getReadIds()
    ids.forEach(id => existing.add(id))
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing]))
    notifyReadStateChanged()
  } catch {}
}

// ── Building the alert list from raw API data ───────────────────────────────
// currentUserId is optional — when provided (agents/admins), tickets newly
// assigned to that specific person also surface as alerts. Previously there
// was NO signal at all when AI routing assigned a ticket to an agent — they
// only found out by manually checking their queue.
export function buildAlertItems(tickets: any[], notifs: any[], currentUserId?: string): AlertItem[] {
  const sysAlerts: AlertItem[] = tickets.flatMap((t) => {
    const items: AlertItem[] = []
    if (currentUserId && t.assigned_agent?.id === currentUserId)
      items.push({ id: `asg-${t.id}`, type: 'assigned', time: t.created_at,
        ticketId: t.id, ticketNumber: t.ticket_number, ticketTitle: t.title,
        department: t.department?.name, systemMsg: 'New ticket assigned to you' })
    if (t.is_escalated)
      items.push({ id: `esc-${t.id}`, type: 'escalated', time: t.updated_at,
        ticketId: t.id, ticketNumber: t.ticket_number, ticketTitle: t.title,
        department: t.department?.name, systemMsg: 'Ticket escalated — needs attention' })
    if (t.sla_breached)
      items.push({ id: `sla-${t.id}`, type: 'sla', time: t.sla_deadline,
        ticketId: t.id, ticketNumber: t.ticket_number, ticketTitle: t.title,
        department: t.department?.name, systemMsg: 'SLA breached — response overdue' })
    if (t.priority === 'critical' && ['open', 'assigned', 'pending'].includes(t.status))
      items.push({ id: `crit-${t.id}`, type: 'critical', time: t.created_at,
        ticketId: t.id, ticketNumber: t.ticket_number, ticketTitle: t.title,
        department: t.department?.name, systemMsg: 'Critical priority ticket open' })
    return items
  })

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

  return [...msgAlerts, ...sysAlerts]
    .sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime())
}

/** Convenience: fetch everything needed and return items + unread count. */
export async function fetchAlertSummary(
  ticketsApi: { list: (params?: any) => Promise<any> },
  notificationsApi: { list: (since?: string) => Promise<any> },
  currentUserId?: string,
): Promise<{ items: AlertItem[]; unreadCount: number }> {
  const [ticketRes, notifRes] = await Promise.all([
    ticketsApi.list(),
    notificationsApi.list(),
  ])
  const tickets: any[] = ticketRes.data.tickets || []
  const notifs:  any[] = notifRes.data.notifications || []
  const items = buildAlertItems(tickets, notifs, currentUserId)
  const readIds = getReadIds()
  const unreadCount = items.filter(i => !readIds.has(i.id)).length
  return { items, unreadCount }
}
