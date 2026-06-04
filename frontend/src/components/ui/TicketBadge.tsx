import clsx from 'clsx'

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
  high:     'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  medium:   'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  low:      'bg-green-500/20 text-green-400 border border-green-500/30',
}

const STATUS_STYLES: Record<string, string> = {
  open:             'bg-blue-500/20 text-blue-400',
  pending:          'bg-yellow-500/20 text-yellow-400',
  assigned:         'bg-cyan-500/20 text-cyan-400',
  in_progress:      'bg-purple-500/20 text-purple-400',
  escalated:        'bg-red-500/20 text-red-400',
  waiting_for_user: 'bg-gray-500/20 text-gray-400',
  resolved:         'bg-green-500/20 text-green-400',
  closed:           'bg-gray-600/20 text-gray-500',
}

const PRIORITY_DOTS: Record<string, string> = {
  critical: 'bg-red-400 animate-pulse',
  high:     'bg-orange-400',
  medium:   'bg-yellow-400',
  low:      'bg-green-400',
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
      PRIORITY_STYLES[priority] || PRIORITY_STYLES.low
    )}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', PRIORITY_DOTS[priority] || 'bg-gray-400')} />
      {priority?.toUpperCase()}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full',
      STATUS_STYLES[status] || STATUS_STYLES.open
    )}>
      {status?.replace(/_/g, ' ').toUpperCase()}
    </span>
  )
}

export function DepartmentBadge({ name, color = '#3B82F6' }: { name: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-gray-800 text-gray-300">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {name}
    </span>
  )
}
