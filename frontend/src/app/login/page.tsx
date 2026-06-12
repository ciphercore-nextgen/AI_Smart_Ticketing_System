'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ticket, Mail, Lock, Eye, EyeOff, AlertCircle, Users, Wrench, Shield } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/stores/authStore'

const EMPLOYEES = [
  { label: 'Murunwa Mudzhadzhi',      email: 'm.mudzhadzhi@ticketiq.com', pw: 'Employee@1234', dept: 'Human Resources'        },
  { label: 'Mutshutshudzi Nemanashi', email: 'm.nemanashi@ticketiq.com',  pw: 'Employee@1234', dept: 'Information Technology' },
  { label: 'Lerato Selowa',           email: 'l.selowa.fin@ticketiq.com',    pw: 'Employee@1234', dept: 'Finance'                },
  { label: 'Murunwa Mudzhadzhi',      email: 'm.mudzhadzhi.ops@ticketiq.com',   pw: 'Employee@1234', dept: 'Operations'             },
]

const AGENTS = [
  { label: 'Lehlogonolo Ledwaba', email: 'l.ledwaba@ticketiq.com', pw: 'Agent@1234', handles: 'Data · Reports · Analysis' },
  { label: 'Lerato Selowa',       email: 'l.selowa@ticketiq.com',  pw: 'Agent@1234', handles: 'IT · Hardware · Access'    },
  { label: 'Leslie Kekane',       email: 'l.kekane@ticketiq.com', pw: 'Agent@1234', handles: 'Workflows · Automation'    },
]

export default function LoginPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const doLogin = async (em: string, pw: string) => {
    setError('')
    setLoading(true)
    try {
      const { data } = await authApi.login(em, pw)
      setAuth(data.user, data.access_token, data.refresh_token)
      toast.success(`Welcome, ${data.user.full_name}!`)
      router.push(data.redirect_url)
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || ''
      if (!err.response) {
        setError('Cannot reach the server. Make sure the backend is running on port 8000.')
      } else if (err.response.status === 401) {
        setError('Wrong credentials. Run: python ../scripts/seed_data.py to seed the database.')
      } else {
        setError(msg || 'Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    await doLogin(email, password)
  }

  const quickLogin = (em: string, pw: string) => {
    setEmail(em)
    setPassword(pw)
    doLogin(em, pw)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Left: Login form ──────────────────────────── */}
        <div className="card rounded-2xl p-8 flex flex-col justify-center">

          {/* Brand */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--accent)' }}>
              <Ticket className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <p className="font-bold text-base tracking-tight" style={{ color: 'var(--text)' }}>TicketIQ</p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Enterprise Support Platform</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>Sign in</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--text-3)' }}>Access your support dashboard</p>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 mb-4 text-sm"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 20%, transparent)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-3)' }} />
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com" required
                  className="input" style={{ paddingLeft: 36 }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-2)' }}>Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-3)' }} />
                <input
                  type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                  className="input" style={{ paddingLeft: 36, paddingRight: 36 }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-3)' }}>
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center">
              {loading
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Signing in…</>
                : 'Sign in'}
            </button>
          </form>

          {/* Admin quick-access */}
          <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="text-xs mb-1.5" style={{ color: 'var(--text-3)' }}>Quick admin access</p>
            <button onClick={() => quickLogin('p.sibiya@ticketiq.com', 'Admin@1234')}
              className="flex items-center gap-2 text-xs font-medium transition"
              style={{ color: 'var(--accent)' }}>
              <Shield className="w-3 h-3" />
              p.sibiya@ticketiq.com · Admin@1234
            </button>
          </div>
        </div>

        {/* ── Right: Demo accounts ──────────────────────── */}
        <div className="space-y-4">

          {/* Employees */}
          <div className="card rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
              <p className="section-label">Department Employees</p>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
              Each employee sees and submits only their own tickets. AI routes automatically to the right agent.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {EMPLOYEES.map(acc => (
                <button key={acc.email} onClick={() => quickLogin(acc.email, acc.pw)}
                  className="text-left p-3 rounded-lg transition"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-muted)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)'}
                >
                  <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{acc.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--accent-text)' }}>{acc.dept}</p>
                  <p className="text-xs mt-1 mono truncate" style={{ color: 'var(--text-3)', fontSize: 11 }}>{acc.email}</p>
                </button>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
              Password: <span className="mono" style={{ color: 'var(--text-2)' }}>Employee@1234</span>
            </p>
          </div>

          {/* Agents */}
          <div className="card rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
              <p className="section-label">Support Agents</p>
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
              AI reads each ticket and assigns it to the agent whose expertise matches — IT/access issues go to IT Support, data/reporting requests to AI Intern, and automation/workflow problems to Jr Automation Support. All agents can receive tickets from any department.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {AGENTS.map(acc => (
                <button key={acc.email} onClick={() => quickLogin(acc.email, acc.pw)}
                  className="text-left p-3 rounded-lg transition"
                  style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-muted)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)'}
                >
                  <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{acc.label}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-3)', lineHeight: '1.3' }}>{acc.handles}</p>
                </button>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>
              Password: <span className="mono" style={{ color: 'var(--text-2)' }}>Agent@1234</span>
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
