'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { adminApi } from '@/lib/api'
import { motion } from 'framer-motion'
import { Building2, Cpu, Users, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

const AGENT_LABELS: Record<string, string> = {
  ai_intern:             'AI Intern',
  it_support_technician: 'IT Support Technician',
  junior_operations:     'Junior Operations Agent',
}

export default function DepartmentsPage() {
  const [depts,   setDepts]   = useState<any[]>([])
  const [users,   setUsers]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([adminApi.listDepartments(), adminApi.listUsers()])
      .then(([d, u]) => { setDepts(d.data); setUsers(u.data) })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  return (
    <DashboardLayout title="Departments" subtitle="Department structure and AI routing" requiredRoles={['admin','super_admin']}>
      <div className="space-y-4">

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{depts.length} departments configured</p>
          <button onClick={load} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-3 py-2 rounded-lg border border-gray-700 transition">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading departments...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {depts.map((dept, i) => {
              const deptUsers = users.filter(u => u.department_name === dept.name)
              const agentRole = dept.routed_agent_role
              const agentLabel = AGENT_LABELS[agentRole] || agentRole

              return (
                <motion.div key={dept.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="glass-card rounded-xl p-5 border border-gray-800/60">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: dept.color + '20', border: `1px solid ${dept.color}40` }}>
                      <Building2 className="w-5 h-5" style={{ color: dept.color }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-white">{dept.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${dept.is_active ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                          {dept.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{dept.description}</p>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {/* AI Routing */}
                    <div className="flex items-center gap-2 bg-blue-500/5 border border-blue-500/15 rounded-lg p-3">
                      <Cpu className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">AI routes tickets to</p>
                        <p className="text-sm font-semibold text-blue-400">{agentLabel}</p>
                        <p className="text-xs text-gray-600 mt-0.5">Based on skill token matching — any agent can receive tickets from this dept</p>
                      </div>
                    </div>

                    {/* Employees in dept */}
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span className="text-xs text-gray-500">{deptUsers.length} employees</span>
                      <div className="flex -space-x-1 ml-1">
                        {deptUsers.slice(0, 4).map(u => (
                          <div key={u.id} className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold border border-gray-900"
                            title={u.full_name}>
                            {u.full_name?.charAt(0)}
                          </div>
                        ))}
                        {deptUsers.length > 4 && (
                          <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-xs border border-gray-900">
                            +{deptUsers.length - 4}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
