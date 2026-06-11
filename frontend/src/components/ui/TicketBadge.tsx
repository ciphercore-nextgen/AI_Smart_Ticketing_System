'use client'

const PRIORITY_STYLES: Record<string, { bg: string; color: string; border: string; dot: string; pulse?: boolean }> = {
  critical: { bg: 'var(--danger-bg)',  color: 'var(--danger)',  border: 'color-mix(in srgb, var(--danger) 30%, transparent)',  dot: 'var(--danger)',  pulse: true  },
  high:     { bg: 'rgba(249,115,22,.1)', color: '#f97316',      border: 'rgba(249,115,22,.3)',                                  dot: '#f97316'                     },
  medium:   { bg: 'var(--warning-bg)', color: 'var(--warning)', border: 'color-mix(in srgb, var(--warning) 30%, transparent)', dot: 'var(--warning)'               },
  low:      { bg: 'var(--success-bg)', color: 'var(--success)', border: 'color-mix(in srgb, var(--success) 30%, transparent)', dot: 'var(--success)'               },
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  open:             { bg: 'color-mix(in srgb, #3b82f6 12%, transparent)', color: '#60a5fa' },
  pending:          { bg: 'var(--warning-bg)',                             color: 'var(--warning)' },
  assigned:         { bg: 'color-mix(in srgb, #06b6d4 12%, transparent)', color: '#22d3ee' },
  in_progress:      { bg: 'var(--accent-subtle)',                          color: 'var(--accent-text)' },
  escalated:        { bg: 'var(--danger-bg)',                              color: 'var(--danger)' },
  waiting_for_user: { bg: 'var(--bg-muted)',                               color: 'var(--text-3)' },
  resolved:         { bg: 'var(--success-bg)',                             color: 'var(--success)' },
  closed:           { bg: 'var(--bg-muted)',                               color: 'var(--text-3)' },
}

export function PriorityBadge({ priority }: { priority: string }) {
  const s = PRIORITY_STYLES[priority] || PRIORITY_STYLES.low
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.pulse ? 'animate-pulse' : ''}`}
        style={{ background: s.dot }} />
      {priority?.toUpperCase()}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.open
  return (
    <span className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full"
      style={{ background: s.bg, color: s.color }}>
      {status?.replace(/_/g, ' ')}
    </span>
  )
}

export function DepartmentBadge({ name, color = '#3B82F6' }: { name: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={{ background: 'var(--bg-muted)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      {name}
    </span>
  )
}
