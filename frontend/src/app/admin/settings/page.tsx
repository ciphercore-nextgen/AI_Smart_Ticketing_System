'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { adminApi } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'
import { useTheme } from '@/components/shared/ThemeProvider'
import { Sun, Moon, Cpu, Bell, Database, Zap, CheckCircle, RefreshCw, Clock, Users, Ticket } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function SettingsPage() {
  const { user }         = useAuthStore()
  const { theme, toggle } = useTheme()
  const [stats,    setStats]    = useState<any>({})
  const [loading,  setLoading]  = useState(true)
  const [saved,    setSaved]    = useState(false)
  const [now,      setNow]      = useState(new Date())

  const [groqModel,   setGroqModel]   = useState('openai/gpt-oss-20b')
  const [autoReply,   setAutoReply]   = useState(true)
  const [selfHelp,    setSelfHelp]    = useState(true)
  const [toneDefault, setToneDefault] = useState('formal')
  const [slaHrs,      setSlaHrs]      = useState({ critical: 4, high: 24, medium: 72, low: 168 })
  const [saving,      setSaving]      = useState(false)

  // Real-time clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    adminApi.systemStats()
      .then(({ data }) => setStats(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    adminApi.getSettings()
      .then(({ data }) => {
        if (data.groq_model)   setGroqModel(data.groq_model)
        if (typeof data.auto_reply === 'boolean') setAutoReply(data.auto_reply)
        if (typeof data.self_help === 'boolean')  setSelfHelp(data.self_help)
        if (data.tone_default) setToneDefault(data.tone_default)
        if (data.sla_hours)    setSlaHrs(data.sla_hours)
      })
      .catch(console.error)
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await adminApi.updateSettings({
        groq_model:   groqModel,
        auto_reply:   autoReply,
        self_help:    selfHelp,
        tone_default: toneDefault,
        sla_hours:    slaHrs,
      })
      setSaved(true)
      toast.success('Settings saved')
      setTimeout(() => setSaved(false), 2000)
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const Row = ({ label, value, mono = false }: { label: string; value: any; mono?: boolean }) => (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: mono ? 'var(--font-mono)' : undefined, fontWeight: 500 }}>{value}</span>
    </div>
  )

  const Toggle = ({ label, desc, value, onChange }: any) => (
    <div className="flex items-center justify-between gap-6 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div>
        <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)' }}>{label}</p>
        {desc && <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{desc}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        className="flex-shrink-0 relative rounded-full transition-colors"
        style={{ width: 40, height: 22, background: value ? 'var(--accent)' : 'var(--bg-muted)', border: '1px solid var(--border)' }}>
        <span className="absolute top-0.5 rounded-full bg-white shadow transition-all"
          style={{ width: 17, height: 17, left: value ? 20 : 2 }} />
      </button>
    </div>
  )

  const Section = ({ title, icon: Icon, children }: any) => (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
        <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{title}</h2>
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  )

  return (
    <DashboardLayout title="Settings" subtitle="System configuration" requiredRoles={['admin','super_admin']}>
      <div style={{ maxWidth: 600 }} className="space-y-4">

        {/* Appearance */}
        <Section title="Appearance" icon={theme === 'dark' ? Moon : Sun}>
          <div className="flex items-center justify-between py-3">
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)' }}>Theme</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Currently using <strong>{theme}</strong> mode
              </p>
            </div>
            <button onClick={toggle} className="btn btn-secondary flex items-center gap-2" style={{ fontSize: 13 }}>
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              Switch to {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </Section>

        {/* AI */}
        <Section title="AI & Routing" icon={Cpu}>
          <div className="py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
              GROQ Model
            </label>
            <select value={groqModel} onChange={e => setGroqModel(e.target.value)} className="input" style={{ height: 36, fontSize: 13 }}>
              <option value="openai/gpt-oss-20b">GPT-OSS · 20B  —  Fast (recommended)</option>
              <option value="openai/gpt-oss-120b">GPT-OSS · 120B  —  More powerful</option>
            </select>
          </div>
          <Toggle label="Automated First Response"
            desc="Post an AI reply the moment a ticket is submitted"
            value={autoReply} onChange={setAutoReply} />
          <Toggle label="Self-Help Suggestions"
            desc="Show employees steps to try before the agent responds"
            value={selfHelp} onChange={setSelfHelp} />
          <div className="py-3">
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Default Response Tone
            </p>
            <div className="flex gap-2">
              {[['formal','Formal','Professional'],['friendly','Friendly','Warm'],['urgent','Urgent','Direct']].map(([k,l,d]) => (
                <button key={k} onClick={() => setToneDefault(k)}
                  className="flex-1 py-2 rounded-lg border text-center transition"
                  style={{
                    fontSize: 13, fontWeight: 500,
                    background: toneDefault === k ? 'var(--accent-subtle)' : 'var(--bg-subtle)',
                    border: `1px solid ${toneDefault === k ? 'var(--accent)' : 'var(--border)'}`,
                    color: toneDefault === k ? 'var(--accent-text)' : 'var(--text-2)',
                  }}>
                  <div>{l}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{d}</div>
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* SLA */}
        <Section title="SLA Response Hours" icon={Zap}>
          <div className="grid grid-cols-2 gap-4 py-3">
            {(Object.entries(slaHrs) as [string, number][]).map(([level, hrs]) => {
              const colors: Record<string, string> = { critical:'#dc2626', high:'#ea580c', medium:'#d97706', low:'#16a34a' }
              return (
                <div key={level}>
                  <label className="flex items-center gap-1.5 mb-1.5" style={{ fontSize: 12, fontWeight: 600, color: colors[level] }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: colors[level] }} />
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={hrs} min={1}
                      onChange={e => setSlaHrs(s => ({ ...s, [level]: +e.target.value }))}
                      className="input" style={{ height: 34, fontSize: 13 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                      {hrs >= 24 ? `${(hrs/24).toFixed(1)}d` : `${hrs}h`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notifications" icon={Bell}>
          <Toggle label="Escalation Alerts" desc="Show alerts page items when a ticket is escalated" value={true} onChange={() => {}} />
          <Toggle label="SLA Breach Warnings" desc="Flag tickets that have exceeded their SLA limit" value={true} onChange={() => {}} />
          <Toggle label="New Ticket Notifications" desc="Notify agents when a new ticket enters their queue" value={false} onChange={() => {}} />
        </Section>

        {/* System info */}
        <Section title="System Information" icon={Database}>
          {loading ? (
            <div className="flex items-center gap-2 py-4" style={{ color: 'var(--text-3)', fontSize: 13 }}>
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : (
            <>
              {/* Live clock */}
              <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2" style={{ color: 'var(--text-3)', fontSize: 13 }}>
                  <Clock className="w-3.5 h-3.5" /> Server Time
                </div>
                <span className="mono" style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                  {format(now, 'dd MMM yyyy  HH:mm:ss')}
                </span>
              </div>
              <Row label="Database"        value="SQLite  ·  Local" mono />
              <Row label="AI Engine"       value={`GROQ  ·  ${groqModel}`} mono />
              <Row label="Auth"            value="JWT  ·  60 min access / 7 day refresh" mono />
              <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="flex items-center gap-1.5" style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  <Users className="w-3.5 h-3.5" /> Total Users
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{stats.total_users ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="flex items-center gap-1.5" style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  <Ticket className="w-3.5 h-3.5" /> Total Tickets
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{stats.total_tickets ?? '—'}</span>
              </div>
            </>
          )}
        </Section>

        {/* Save */}
        <button onClick={save} disabled={saving} className="btn btn-primary" style={{ height: 40, paddingInline: 24, opacity: saving ? 0.6 : 1 }}>
          {saved ? <><CheckCircle className="w-4 h-4" /> Saved</> : saving ? 'Saving...' : 'Save Settings'}
        </button>

      </div>
    </DashboardLayout>
  )
}
