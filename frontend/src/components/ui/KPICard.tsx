'use client'
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'

interface KPICardProps {
  title:     string
  value:     string | number
  icon:      LucideIcon
  trend?:    number
  color?:    'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'cyan'
  subtitle?: string
  index?:    number
}

const COLOR_MAP: Record<string, { color: string; bg: string; border: string }> = {
  blue:   { color: '#60a5fa', bg: 'rgba(59,130,246,.1)',  border: 'rgba(59,130,246,.2)'  },
  green:  { color: 'var(--success)',  bg: 'var(--success-bg)',  border: 'color-mix(in srgb, var(--success) 25%, transparent)'  },
  red:    { color: 'var(--danger)',   bg: 'var(--danger-bg)',   border: 'color-mix(in srgb, var(--danger) 25%, transparent)'   },
  yellow: { color: 'var(--warning)',  bg: 'var(--warning-bg)',  border: 'color-mix(in srgb, var(--warning) 25%, transparent)'  },
  purple: { color: 'var(--accent-text)', bg: 'var(--accent-subtle)', border: 'color-mix(in srgb, var(--accent) 25%, transparent)' },
  cyan:   { color: '#22d3ee', bg: 'rgba(6,182,212,.1)',   border: 'rgba(6,182,212,.2)'   },
}

export default function KPICard({ title, value, icon: Icon, trend, color = 'blue', subtitle }: KPICardProps) {
  const c = COLOR_MAP[color]
  return (
    <div className="card rounded-xl p-5" style={{ borderColor: c.border }}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: c.bg }}>
          <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18, color: c.color }} />
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 text-xs font-medium"
            style={{ color: trend >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold" style={{ color: c.color }}>{value}</p>
      <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>{title}</p>
      {subtitle && <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{subtitle}</p>}
    </div>
  )
}
