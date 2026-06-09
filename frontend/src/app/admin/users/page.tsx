'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { adminApi } from '@/lib/api'
import { motion } from 'framer-motion'
import { Users, Search, Shield, Cpu, UserCheck, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  employee:              { label: 'Employee',         color: 'text-cyan-400   bg-cyan-400/10' },
  ai_intern:             { label: 'AI Intern',        color: 'text-purple-400 bg-purple-400/10' },
  it_support_technician: { label: 'IT Support',       color: 'text-blue-400   bg-blue-400/10' },
  junior_operations:     { label: 'Jr Operations',    color: 'text-amber-400  bg-amber-400/10' },
  admin:                 { label: 'Admin',            color: 'text-green-400  bg-green-400/10' },
  super_admin:           { label: 'Super Admin',      color: 'text-red-400    bg-red-400/10' },
}

export default function UsersPage() {
  const [users,   setUsers]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')

  const load = () => {
    setLoading(true)
    adminApi.listUsers().then(({ data }) => setUsers(data))
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = users.filter(u =>
    u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.role?.toLowerCase().includes(search.toLowerCase())
  )

  const toggleActive = async (user: any) => {
    try {
      await adminApi.updateUser(user.id, { is_active: !user.is_active })
      toast.success(`${user.full_name} ${user.is_active ? 'deactivated' : 'activated'}`)
      load()
    } catch { toast.error('Failed to update user') }
  }

  return (
    <DashboardLayout title="User Management" subtitle="All system users" requiredRoles={['admin','super_admin']}>
      <div className="space-y-4">

        {/* Header controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, email, or role..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <button onClick={load} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-3 py-2 rounded-lg border border-gray-700 transition">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(ROLE_CONFIG).map(([role, cfg]) => {
            const count = users.filter(u => u.role === role).length
            return (
              <div key={role} className="glass-card rounded-lg p-3 border border-gray-800/60 text-center">
                <p className="text-lg font-bold text-white">{count}</p>
                <p className={`text-xs px-1.5 py-0.5 rounded-full inline-block mt-1 ${cfg.color}`}>{cfg.label}</p>
              </div>
            )
          })}
        </div>

        {/* Users table */}
        <div className="glass-card rounded-xl border border-gray-800/60 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800/60 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-300">{filtered.length} Users</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading users...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800/60 bg-gray-900/40">
                    {['User', 'Email', 'Role', 'Department', 'Employee ID', 'Status', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/40">
                  {filtered.map((u, i) => {
                    const cfg = ROLE_CONFIG[u.role] || { label: u.role, color: 'text-gray-400 bg-gray-400/10' }
                    return (
                      <motion.tr key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        className="hover:bg-gray-900/30 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {u.full_name?.charAt(0)}
                            </div>
                            <div>
                              <p className="text-white font-medium text-sm">{u.full_name}</p>
                              {u.job_title && <p className="text-xs text-gray-500">{u.job_title}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 font-mono">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.color}`}>{cfg.label}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{u.department_name || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-mono">{u.employee_id || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => toggleActive(u)}
                            className={`text-xs px-2 py-1 rounded-lg border transition ${
                              u.is_active
                                ? 'border-red-500/20 text-red-400 hover:bg-red-500/10'
                                : 'border-green-500/20 text-green-400 hover:bg-green-500/10'
                            }`}>
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  )
}
