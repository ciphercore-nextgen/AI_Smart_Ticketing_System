'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { governanceApi } from '@/lib/api'
import { Shield, AlertTriangle, RefreshCw, FileText, Search } from 'lucide-react'
import toast from 'react-hot-toast'

type Tab = 'logs' | 'checker' | 'reports'

const RISK_COLOR: Record<string, string> = {
  low: 'var(--success)', medium: 'var(--warning)', high: 'var(--danger)',
}

export default function GovernancePage() {
  const [tab, setTab] = useState<Tab>('logs')

  return (
    <DashboardLayout title="AI Risk & Compliance" subtitle="Transparency log, bias detection, and governance reports">
      <div className="space-y-4" style={{ maxWidth: 880 }}>
        <div className="flex gap-2">
          {([['logs', 'Activity Log', FileText], ['checker', 'Bias Checker', Search], ['reports', 'Risk Reports', Shield]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-3 py-2 rounded-lg text-sm flex items-center gap-1.5 transition"
              style={{
                background: tab === key ? 'var(--accent-subtle)' : 'var(--bg-card)',
                color: tab === key ? 'var(--accent)' : 'var(--text-2)',
                border: '1px solid var(--border)',
              }}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === 'logs' && <ActivityLogTab />}
        {tab === 'checker' && <BiasCheckerTab />}
        {tab === 'reports' && <RiskReportsTab />}
      </div>
    </DashboardLayout>
  )
}

function ActivityLogTab() {
  const [logs, setLogs] = useState<any[]>([])
  const [days, setDays] = useState(7)
  const [risk, setRisk] = useState('all')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await governanceApi.listLogs(days, risk)
      setLogs(data.logs)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days, risk]) // eslint-disable-line

  return (
    <div className="space-y-3">
      <div className="rounded-xl p-4 flex flex-wrap items-center gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <select className="input" style={{ height: 36, fontSize: 13, width: 140 }} value={days} onChange={e => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
        </select>
        <select className="input" style={{ height: 36, fontSize: 13, width: 140 }} value={risk} onChange={e => setRisk(e.target.value)}>
          <option value="all">All risk levels</option>
          <option value="low">Low only</option>
          <option value="medium">Medium only</option>
          <option value="high">High only</option>
        </select>
        <button onClick={load} className="btn-secondary flex items-center gap-1.5 ml-auto" style={{ height: 36, fontSize: 13 }}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {logs.length === 0 ? (
          <p className="text-sm text-center py-10" style={{ color: 'var(--text-3)' }}>No AI activity logged in this period.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {logs.map(log => (
              <div key={log.id} className="p-3 flex items-start gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 mt-0.5"
                  style={{ color: RISK_COLOR[log.risk_level], background: 'color-mix(in srgb, ' + RISK_COLOR[log.risk_level] + ' 12%, transparent)' }}
                >
                  {log.risk_level}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{log.action.replace(/_/g, ' ')}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>{log.output_summary}</p>
                  {log.risk_notes && <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>⚠ {log.risk_notes}</p>}
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                  {log.model_used} · {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BiasCheckerTab() {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [result, setResult] = useState<any>(null)
  const [checking, setChecking] = useState(false)

  const handleCheck = async () => {
    if (!input.trim()) { toast.error('Enter some text to check'); return }
    setChecking(true)
    try {
      const { data } = await governanceApi.checkBias(input, output)
      setResult(data)
    } catch (e) {
      toast.error('Bias check failed')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Evaluate AI-generated text for bias or risk</p>
      <textarea
        className="input w-full" rows={3} placeholder="Input (e.g. 'Recommend candidates for hiring')"
        value={input} onChange={e => setInput(e.target.value)}
      />
      <textarea
        className="input w-full" rows={3} placeholder="AI output to evaluate (optional)"
        value={output} onChange={e => setOutput(e.target.value)}
      />
      <button onClick={handleCheck} disabled={checking} className="btn-primary" style={{ height: 36, fontSize: 13 }}>
        {checking ? 'Checking…' : 'Check for Bias'}
      </button>

      {result && (
        <div className="mt-3 p-4 rounded-lg" style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" style={{ color: RISK_COLOR[result.risk_level] }} />
            <span className="text-sm font-semibold" style={{ color: RISK_COLOR[result.risk_level] }}>
              Risk Score: {result.risk_level.charAt(0).toUpperCase() + result.risk_level.slice(1)}
            </span>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-2)' }}>{result.explanation}</p>
          {result.concerns?.length > 0 && (
            <ul className="text-sm mt-2 list-disc pl-5" style={{ color: 'var(--text-2)' }}>
              {result.concerns.map((c: string, i: number) => <li key={i}>{c}</li>)}
            </ul>
          )}
          <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>Checked by: {result.checked_by}</p>
        </div>
      )}
    </div>
  )
}

function RiskReportsTab() {
  const [reports, setReports] = useState<any[]>([])
  const [generating, setGenerating] = useState(false)

  const load = async () => {
    try {
      const { data } = await governanceApi.listReports()
      setReports(data)
    } catch (e) { console.error(e) }
  }

  useEffect(() => { load() }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await governanceApi.createReport(7)
      await load()
      toast.success('Risk report generated')
    } catch (e) {
      toast.error('Could not generate report')
    } finally {
      setGenerating(false)
    }
  }

  const statusColor: Record<string, string> = {
    compliant: 'var(--success)', needs_review: 'var(--warning)', non_compliant: 'var(--danger)',
  }

  return (
    <div className="space-y-3">
      <button onClick={handleGenerate} disabled={generating} className="btn-primary flex items-center gap-1.5" style={{ height: 36, fontSize: 13 }}>
        <Shield className="w-3.5 h-3.5" /> {generating ? 'Generating…' : 'Generate New Risk Report (last 7 days)'}
      </button>

      {reports.map(r => (
        <div key={r.id} className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{r.feature_evaluated} — last {r.period_days} days</p>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ color: statusColor[r.compliance_status], background: 'color-mix(in srgb, ' + statusColor[r.compliance_status] + ' 12%, transparent)' }}>
              {r.compliance_status.replace('_', ' ')}
            </span>
          </div>
          <p className="text-sm mb-2" style={{ color: 'var(--text-2)' }}>{r.summary}</p>
          <p className="text-xs" style={{ color: 'var(--text-3)' }}>{new Date(r.created_at).toLocaleString()}</p>
        </div>
      ))}
    </div>
  )
}
