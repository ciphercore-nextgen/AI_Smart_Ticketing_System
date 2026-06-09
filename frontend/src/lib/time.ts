/**
 * time.ts — real-time timestamp utilities for TicketIQ
 *
 * All helpers read from a `now` argument so every component
 * that calls useLiveTime() re-renders in sync.
 */

import { useState, useEffect } from 'react'
import {
  differenceInSeconds,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  format,
} from 'date-fns'

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns a `Date` that updates every `intervalMs` milliseconds.
 * Use interval=1000 for per-second counters, 60000 for "ago" text.
 */
export function useLiveTime(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

// ── Formatters ────────────────────────────────────────────────────────────────

/**
 * "2m", "1h 14m", "3d 4h" — compact elapsed time.
 * Pass `now` from useLiveTime() for live updates.
 */
export function formatElapsed(from: string | Date, now: Date): string {
  const start = typeof from === 'string' ? new Date(from) : from
  const secs  = differenceInSeconds(now, start)
  if (secs < 60)   return `${secs}s`
  const mins = differenceInMinutes(now, start)
  if (mins < 60)   return `${mins}m`
  const hrs  = differenceInHours(now, start)
  if (hrs < 24)    return `${hrs}h ${mins % 60}m`
  const days = differenceInDays(now, start)
  return `${days}d ${hrs % 24}h`
}

/**
 * "just now", "2 minutes ago", "3 hours ago", "5 days ago"
 * Pass `now` from useLiveTime() for live updates.
 */
export function formatAgo(from: string | Date, now: Date): string {
  const start = typeof from === 'string' ? new Date(from) : from
  const secs  = differenceInSeconds(now, start)
  if (secs < 5)    return 'just now'
  if (secs < 60)   return `${secs}s ago`
  const mins = differenceInMinutes(now, start)
  if (mins < 60)   return `${mins} min${mins !== 1 ? 's' : ''} ago`
  const hrs  = differenceInHours(now, start)
  if (hrs < 24)    return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`
  const days = differenceInDays(now, start)
  if (days < 30)   return `${days} day${days !== 1 ? 's' : ''} ago`
  return format(start, 'dd MMM yyyy')
}

/**
 * "2m", "1h", "3d" — very short label for table cells.
 */
export function formatElapsedShort(from: string | Date, now: Date): string {
  const start = typeof from === 'string' ? new Date(from) : from
  const mins  = differenceInMinutes(now, start)
  if (mins < 1)    return '<1m'
  if (mins < 60)   return `${mins}m`
  const hrs = differenceInHours(now, start)
  if (hrs < 24)    return `${hrs}h`
  return `${differenceInDays(now, start)}d`
}

/**
 * SLA urgency colour based on minutes elapsed.
 * Returns a CSS variable string for inline styles.
 */
export function slaColor(minutesOpen: number): string {
  if (minutesOpen > 1440) return 'var(--danger)'    // >24h → red
  if (minutesOpen > 240)  return 'var(--warning)'   // >4h  → amber
  return 'var(--success)'                            // ok   → green
}

/**
 * Time remaining until an SLA deadline, or "BREACHED".
 */
export function formatSlaCountdown(deadline: string | Date, now: Date): { label: string; breached: boolean } {
  const end  = typeof deadline === 'string' ? new Date(deadline) : deadline
  const secs = differenceInSeconds(end, now)
  if (secs <= 0) return { label: 'BREACHED', breached: true }
  const mins = Math.floor(secs / 60)
  if (mins < 60)   return { label: `${mins}m`, breached: false }
  const hrs  = Math.floor(mins / 60)
  if (hrs < 24)    return { label: `${hrs}h ${mins % 60}m`, breached: false }
  const days = Math.floor(hrs / 24)
  return { label: `${days}d ${hrs % 24}h`, breached: false }
}
