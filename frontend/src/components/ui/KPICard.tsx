'use client'
import { motion } from 'framer-motion'
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'
import clsx from 'clsx'

interface KPICardProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: number
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'cyan'
  subtitle?: string
  index?: number
}

const colorMap = {
  blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/20',   icon: 'text-blue-400' },
  green:  { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/20',  icon: 'text-green-400' },
  red:    { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/20',    icon: 'text-red-400' },
  yellow: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20', icon: 'text-yellow-400' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', icon: 'text-purple-400' },
  cyan:   { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   border: 'border-cyan-500/20',   icon: 'text-cyan-400' },
}

export default function KPICard({ title, value, icon: Icon, trend, color = 'blue', subtitle, index = 0 }: KPICardProps) {
  const c = colorMap[color]
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className={clsx('glass-card rounded-xl p-5 border', c.border)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', c.bg)}>
          <Icon className={clsx('w-5 h-5', c.icon)} />
        </div>
        {trend !== undefined && (
          <div className={clsx('flex items-center gap-1 text-xs font-medium', trend >= 0 ? 'text-green-400' : 'text-red-400')}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div>
        <p className={clsx('text-2xl font-bold', c.text)}>{value}</p>
        <p className="text-sm text-gray-400 mt-0.5">{title}</p>
        {subtitle && <p className="text-xs text-gray-600 mt-1">{subtitle}</p>}
      </div>
    </motion.div>
  )
}
