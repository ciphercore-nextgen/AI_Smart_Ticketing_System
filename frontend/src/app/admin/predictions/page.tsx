'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/shared/DashboardLayout'
import { predictionsApi, adminApi } from '@/lib/api'
import { TrendingUp, RefreshCw, Lightbulb, Calendar } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface Department { id: string; name: string; slug: string }

export default function PredictionsPage() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [department,  setDepartment]  = useState('all')
  const [data,        setData]        = useState<any>(null)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    adminApi.listDepartments().then(({ data }) => setDepartments(data)).catch(() => {})
  }, [])

  const load = async (dept = department) => {
    setLoading(true)
    try {
      const { data } = await predictionsApi.forecast(dept, 30, 7)
      setData(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const chartData = data
    ? [
        ...data.history.slice(-14).map((h: any) => ({ label: h.day_name.slice(0, 3), actual: h.count, predicted: null })),
        ...data.forecast.map((f: any) => ({ label: f.day_name.slice(0, 3), actual: null, predicted: f.predicted_count })),
      ]
    : []

  return (
    <DashboardLayout title="Predictive Insights" subtitle="Forecasted ticket volume, based on historical trends">
      <div className="space-y-4" style={{ maxWidth: 880 }}>

        <div className="rounded-xl p-4 flex flex-wrap items-center gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <Calendar className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
          <select
            className="input" style={{ height: 36, fontSize: 13, width: 200 }}
            value={department}
            onChange={e => { setDepartment(e.target.value); load(e.target.value) }}
          >
            <option value="all">All Departments</option>
            {departments.map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </select>
          <button onClick={() => load()} className="btn-secondary flex items-center gap-1.5" style={{ height: 36, fontSize: 13 }}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {loading && !data && (
          <div className="text-center py-16 text-sm" style={{ color: 'var(--text-3)' }}>Generating forecast…</div>
        )}

        {!loading && data && (
          <>
            <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Forecast Explanation</p>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-2)' }}>{data.explanation}</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-3)' }}>Next 7 Days Forecast</p>
                </div>
                <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{data.total_forecast}</p>
              </div>
              {data.peak_day && (
                <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>Expected Peak Day</p>
                  <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{data.peak_day.day_name}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>{data.peak_day.predicted_count} tickets expected</p>
                </div>
              )}
              <div className="rounded-xl p-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <p className="text-xs mb-2" style={{ color: 'var(--text-3)' }}>Scope</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{data.scope}</p>
              </div>
            </div>

            <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold mb-4 section-label">Last 14 Days + Next 7 Days Forecast</p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--text-3)" fontSize={11} />
                  <YAxis stroke="var(--text-3)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 12 }} />
                  <ReferenceLine x={chartData[13]?.label} stroke="var(--border)" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="actual" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} name="Actual" connectNulls />
                  <Line type="monotone" dataKey="predicted" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} name="Forecast" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
