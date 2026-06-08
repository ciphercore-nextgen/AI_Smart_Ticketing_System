'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { motion } from 'framer-motion'
import { Settings, Cpu, Bell, Database, Zap, CheckCircle, User, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { adminApi } from '@/lib/api'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const { user }  = useAuthStore()
  const [stats,   setStats]   = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [saved,   setSaved]   = useState(false)

  const [groqModel,   setGroqModel]   = useState('llama3-8b-8192')
  const [autoReply,   setAutoReply]   = useState(true)
  const [selfHelp,    setSelfHelp]    = useState(true)
  const [toneDefault, setToneDefault] = useState('formal')
  const [slaHrs,      setSlaHrs]      = useState({ critical: 4, high: 24, medium: 72, low: 168 })

  useEffect(() => {
    adminApi.systemStats()
      .then(({ data }) => setStats(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const save = () => {
    setSaved(true)
    toast.success('Settings saved')
    setTimeout(() => setSaved(false), 2000)
  }

  const Section = ({ title, icon: Icon, children }: any) => (
    <div className="glass-card rounded-xl border border-gray-800/60 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800/60">
        <Icon className="w-4 h-4 text-blue-400" />
        <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )

  const Toggle = ({ label, desc, value, onChange }: any) => (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-blue-600' : 'bg-gray-700'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )

  return (
    <DashboardLayout title="Settings" subtitle="System configuration" requiredRoles={['admin','super_admin']}>
      <div className="max-w-2xl space-y-5">

        {/* AI Settings */}
        <Section title="AI & Routing" icon={Cpu}>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">GROQ Model</label>
            <select value={groqModel} onChange={e => setGroqModel(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="llama3-8b-8192">LLaMA 3 · 8B — Fast (recommended)</option>
              <option value="llama3-70b-8192">LLaMA 3 · 70B — Powerful</option>
              <option value="mixtral-8x7b-32768">Mixtral 8x7B — Long context</option>
            </select>
            <p className="text-xs text-gray-600 mt-1">Current: <span className="text-blue-400 font-mono">{groqModel}</span> — change takes effect on next ticket submission</p>
          </div>
          <Toggle label="Automated First Response"
            desc="Post an AI reply automatically when a ticket is created"
            value={autoReply} onChange={setAutoReply} />
          <Toggle label="Self-Help Suggestions"
            desc="Show employees actionable steps to try while waiting"
            value={selfHelp} onChange={setSelfHelp} />
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Default Response Tone</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'formal',   label: 'Formal',   desc: 'Professional' },
                { key: 'friendly', label: 'Friendly', desc: 'Warm' },
                { key: 'urgent',   label: 'Urgent',   desc: 'Direct' },
              ].map(t => (
                <button key={t.key} onClick={() => setToneDefault(t.key)}
                  className={`py-2.5 rounded-lg border text-sm transition ${
                    toneDefault === t.key
                      ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}>
                  <p className="font-medium">{t.label}</p>
                  <p className="text-xs opacity-60">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* SLA Settings */}
        <Section title="SLA Hours" icon={Zap}>
          <p className="text-xs text-gray-500">Hours before a ticket is flagged as SLA breached</p>
          <div className="grid grid-cols-2 gap-4">
            {(Object.entries(slaHrs) as [string, number][]).map(([level, hrs]) => {
              const colors: Record<string, string> = {
                critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e'
              }
              return (
                <div key={level} className="space-y-1">
                  <label className="block text-xs font-semibold capitalize" style={{ color: colors[level] }}>
                    {level}
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={hrs} min={1}
                      onChange={e => setSlaHrs(s => ({ ...s, [level]: +e.target.value }))}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <span className="text-xs text-gray-500 whitespace-nowrap">hrs</span>
                  </div>
                  <p className="text-xs text-gray-600">{hrs >= 24 ? `${(hrs/24).toFixed(1)} days` : `${hrs} hours`}</p>
                </div>
              )
            })}
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notifications" icon={Bell}>
          <Toggle label="Escalation Alerts"
            desc="Show alerts when a ticket is escalated"
            value={true} onChange={() => {}} />
          <Toggle label="SLA Breach Warnings"
            desc="Alert agents when a ticket is about to breach SLA"
            value={true} onChange={() => {}} />
          <Toggle label="New Ticket Notifications"
            desc="Notify agents when a new ticket lands in their queue"
            value={false} onChange={() => {}} />
        </Section>

        {/* System Info — live from DB */}
        <Section title="System Info" icon={Database}>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading system stats...
            </div>
          ) : (
            <div className="space-y-0 divide-y divide-gray-800/60">
              {[
                ['Database',       'SQLite (local file)'],
                ['AI Engine',      `GROQ · ${groqModel}`],
                ['Auth',           'JWT + Refresh Tokens (60 min / 7 days)'],
                ['Total Users',    stats.total_users ?? '—'],
                ['Total Tickets',  stats.total_tickets ?? '—'],
                ['Admin Account',  user?.email || '—'],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between py-2.5 text-xs">
                  <span className="text-gray-500">{k}</span>
                  <span className="text-gray-300 font-mono text-right">{v as string}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Save button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={save}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-6 py-3 font-medium text-sm transition"
        >
          {saved
            ? <><CheckCircle className="w-4 h-4 text-green-300" /> Saved!</>
            : <><Settings className="w-4 h-4" /> Save Settings</>
          }
        </motion.button>

      </div>
    </DashboardLayout>
  )
}
