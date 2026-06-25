'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { reportsApi, adminApi } from '@/lib/api'
import {
  FileText, Download, RefreshCw, TrendingUp, AlertTriangle,
  Clock, CheckCircle, Lightbulb, Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface Department { id: string; name: string; slug: string }

const PERIODS = [
  { label: 'Last 7 days',  days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
]

export default function ReportsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [department,  setDepartment]  = useState('all')
  const [days,        setDays]        = useState(7)
  const [report,      setReport]      = useState<any>(null)
  const [loading,     setLoading]     = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    adminApi.listDepartments().then(({ data }) => setDepartments(data)).catch(() => {})
  }, [])

  const loadReport = async (dept = department, d = days) => {
    setLoading(true)
    try {
      const { data } = await reportsApi.weeklySummary(dept, d)
      setReport(data)
    } catch (e) {
      console.error(e)
      toast.error('Could not generate report')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadReport() }, []) // eslint-disable-line

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const res = await reportsApi.weeklySummaryPdf(department, days)
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const scopeLabel = (report?.metrics?.scope || 'report').replace(/\s+/g, '-').toLowerCase()
      const a = document.createElement('a')
      a.href = url
      a.download = `ticketiq-weekly-report-${scopeLabel}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      toast.error('Could not download PDF')
    } finally {
      setDownloading(false)
    }
  }

  const m = report?.metrics

  return (
    <DashboardLayout title="Reports" subtitle="Automated weekly business reporting">
      <div className="space-y-4" style={{ maxWidth: 880 }}>

        {/* Controls */}
        <div className="rounded-xl p-4 flex flex-wrap items-center gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <FileText className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
          <select
            className="input" style={{ height: 36, fontSize: 13, width: 200 }}
            value={department}
            onChange={e => { setDepartment(e.target.value); loadReport(e.target.value, days) }}
          >
            <option value="all">All Departments</option>
            {departments.map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </select>

          <select
            className="input" style={{ height: 36, fontSize: 13, width: 160 }}
            value={days}
            onChange={e => { const d = Number(e.target.value); setDays(d); loadReport(department, d) }}
          >
            {PERIODS.map(p => <option key={p.days} value={p.days}>{p.label}</option>)}
          </select>

          <button
            onClick={() => loadReport()}
            className="btn-secondary flex items-center gap-1.5"
            style={{ height: 36, fontSize: 13 }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>

          <button
            onClick={handleDownload}
            disabled={downloading || loading || !report}
            className="btn-primary flex items-center gap-1.5 ml-auto"
            style={{ height: 36, fontSize: 13 }}
          >
            <Download className="w-3.5 h-3.5" /> {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>

        {loading && !report && (
          <div className="text-center py-16 text-sm" style={{ color: 'var(--text-3)' }}>
            Generating report…
          </div>
        )}

        {!loading && m && (
          <>
            {/* Executive summary */}
            <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Executive Summary</p>
                <span className="text-xs ml-auto" style={{ color: 'var(--text-3)' }}>
                  {m.scope} · Last {m.days} days
                </span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{report.summary}</p>
            </div>

            {/* Key metric cards */}
            <div className="grid grid-cols-4 gap-3">
              <MetricCard icon={TrendingUp}    label="Total Tickets"     value={m.total_tickets} />
              <MetricCard icon={CheckCircle}   label="Resolution Rate"   value={`${m.resolution_rate}%`} />
              <MetricCard icon={Clock}         label="Avg Resolution"    value={m.avg_resolution_hours != null ? `${m.avg_resolution_hours}h` : '—'} />
              <MetricCard icon={AlertTriangle} label="SLA Breaches"      value={m.sla_breached} sub={`${m.sla_breach_rate}%`} warn={m.sla_breached > 0} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <MetricCard icon={Zap}           label="Escalated"          value={m.escalated_count} warn={m.escalated_count > 0} />
              <MetricCard icon={Lightbulb}     label="Self-Help Shown"    value={m.self_help_shown_count} />
              <MetricCard icon={CheckCircle}   label="Self-Help Resolved" value={m.self_help_resolved_count} sub={`${m.self_help_success_rate}%`} />
            </div>

            {/* Breakdown tables */}
            <div className="grid grid-cols-2 gap-3">
              <BreakdownTable title="By Status"   rows={m.by_status} />
              <BreakdownTable title="By Priority" rows={m.by_priority} />
              {m.department_slug === 'all' && <BreakdownTable title="By Department" rows={m.by_department} />}
              {Object.keys(m.by_agent || {}).length > 0 && (
                <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold mb-3 section-label">By Agent (assigned / resolved)</p>
                  <div className="space-y-2">
                    {Object.entries(m.by_agent as Record<string, { assigned: number; resolved: number }>)
                      .sort((a, b) => b[1].assigned - a[1].assigned)
                      .map(([name, s]) => (
                        <div key={name} className="flex items-center justify-between text-sm">
                          <span style={{ color: 'var(--text-2)' }}>{name}</span>
                          <span className="font-semibold" style={{ color: 'var(--text)' }}>{s.assigned} / {s.resolved}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

function MetricCard({ icon: Icon, label, value, sub, warn }: { icon: any; label: string; value: any; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color: warn ? 'var(--danger)' : 'var(--text-3)' }} />
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>{label}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color: warn ? 'var(--danger)' : 'var(--text)' }}>
        {value}{sub && <span className="text-sm font-normal ml-1.5" style={{ color: 'var(--text-3)' }}>({sub})</span>}
      </p>
    </div>
  )
}

function BreakdownTable({ title, rows }: { title: string; rows: Record<string, number> }) {
  const entries = Object.entries(rows || {}).sort((a, b) => b[1] - a[1])
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold mb-3 section-label">{title}</p>
      {entries.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>No data for this period.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm">
              <span className="capitalize" style={{ color: 'var(--text-2)' }}>{k.replace(/_/g, ' ')}</span>
              <span className="font-semibold" style={{ color: 'var(--text)' }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
