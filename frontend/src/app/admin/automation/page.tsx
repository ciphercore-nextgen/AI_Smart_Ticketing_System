'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { adminApi } from '@/lib/api'
import { Zap, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'

export default function AutomationPage() {
  const [rules, setRules] = useState<any[]>([])
  const [name, setName] = useState('')
  const [conditionType, setConditionType] = useState('priority')
  const [conditionValue, setConditionValue] = useState('critical')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const { data } = await adminApi.listAutomationRules()
      setRules(data)
    } catch (e) { console.error(e) }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!name.trim()) { toast.error('Give this rule a name'); return }
    setSaving(true)
    try {
      await adminApi.createAutomationRule({ name, condition_type: conditionType, condition_value: conditionValue, is_active: true })
      setName('')
      await load()
      toast.success('Rule created')
    } catch (e) {
      toast.error('Could not create rule')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (rule: any) => {
    try {
      await adminApi.updateAutomationRule(rule.id, { ...rule, is_active: !rule.is_active })
      await load()
    } catch (e) { toast.error('Could not update rule') }
  }

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteAutomationRule(id)
      await load()
    } catch (e) { toast.error('Could not delete rule') }
  }

  return (
    <DashboardLayout title="Workflow Automation" subtitle="Rules that require manager approval before support action begins">
      <div className="space-y-4" style={{ maxWidth: 720 }}>

        <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <Plus className="w-4 h-4" /> New Approval Rule
          </p>
          <input className="input w-full" placeholder="Rule name, e.g. 'Critical tickets need sign-off'"
            value={name} onChange={e => setName(e.target.value)} />
          <div className="flex gap-2">
            <select className="input flex-1" value={conditionType} onChange={e => setConditionType(e.target.value)}>
              <option value="priority">When priority is</option>
              <option value="department">When department is</option>
            </select>
            {conditionType === 'priority' ? (
              <select className="input flex-1" value={conditionValue} onChange={e => setConditionValue(e.target.value)}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            ) : (
              <select className="input flex-1" value={conditionValue} onChange={e => setConditionValue(e.target.value)}>
                <option value="it">Information Technology</option>
                <option value="hr">Human Resources</option>
                <option value="finance">Finance</option>
                <option value="operations">Operations</option>
              </select>
            )}
          </div>
          <button onClick={handleCreate} disabled={saving} className="btn-primary" style={{ height: 36, fontSize: 13 }}>
            {saving ? 'Creating…' : 'Create Rule'}
          </button>
        </div>

        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          {rules.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--text-3)' }}>
              No automation rules yet — tickets will route normally with no approval gate.
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {rules.map(rule => (
                <div key={rule.id} className="p-3 flex items-center gap-3">
                  <button onClick={() => handleToggle(rule)} className="flex-shrink-0">
                    {rule.is_active
                      ? <ToggleRight className="w-6 h-6" style={{ color: 'var(--accent)' }} />
                      : <ToggleLeft className="w-6 h-6" style={{ color: 'var(--text-3)' }} />}
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: rule.is_active ? 'var(--text)' : 'var(--text-3)' }}>{rule.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                      When {rule.condition_type} = {rule.condition_value} → requires manager approval
                    </p>
                  </div>
                  <button onClick={() => handleDelete(rule.id)} className="flex-shrink-0 p-1.5 rounded hover:bg-red-500/10">
                    <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--danger)' }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: 'var(--accent-subtle)' }}>
          <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <p className="text-xs" style={{ color: 'var(--text-2)' }}>
            Ticket routing itself (detecting category, assigning department and priority) already happens
            automatically for every ticket — these rules only control the extra manager-approval step on top
            of that, for tickets that meet a condition you set.
          </p>
        </div>
      </div>
    </DashboardLayout>
  )
}
