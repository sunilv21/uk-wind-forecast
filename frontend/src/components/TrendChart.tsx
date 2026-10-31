import { useState } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { TrendResponse } from '../types/api'
import { fetchTrend } from '../api/client'

interface Props {
  defaultCutoff: string
}

type Metric = 'mae' | 'rmse' | 'bias'

interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number | null; color: string }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((p) => p.value !== null && (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-slate-600">{p.name}</span>
          </div>
          <span className="font-semibold text-slate-800">{p.value?.toLocaleString()} MW</span>
        </div>
      ))}
    </div>
  )
}

export default function TrendChart({ defaultCutoff }: Props) {
  // Default to January 2026 — the assignment's required analysis period
  const [startDate, setStartDate] = useState('2026-01-01')
  const [endDate, setEndDate] = useState('2026-01-31')
  const [metric, setMetric] = useState<Metric>('mae')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<TrendResponse | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchTrend(startDate, endDate, defaultCutoff))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  const chartData = data?.days.map((d) => ({
    date: d.date.slice(5),
    mae: d.mae,
    rmse: d.rmse,
    bias: d.bias,
    error: d.error,
  })) ?? []

  const metricConfig: Record<Metric, { label: string; color: string }> = {
    mae: { label: 'MAE', color: '#3b82f6' },
    rmse: { label: 'RMSE', color: '#8b5cf6' },
    bias: { label: 'Bias', color: '#f59e0b' },
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Multi-Day Accuracy Trend</h2>
          <p className="text-xs text-slate-400 mt-0.5">Daily forecast error over a date range</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              max={endDate}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 font-medium">To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              min={startDate} max={new Date().toISOString().slice(0, 10)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-1">
            {(['mae', 'rmse', 'bias'] as Metric[]).map((m) => (
              <button key={m} onClick={() => setMetric(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${metric === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-lg text-white text-xs font-semibold transition-colors">
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500 mb-3">{error}</p>
      )}

      {!data && !loading && (
        <div className="flex items-center justify-center h-48 bg-slate-50 rounded-xl text-slate-400 text-sm">
          Select a date range and click Load
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-48 bg-slate-50 rounded-xl">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {data && !loading && (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false}
              tickFormatter={(v) => `${v.toLocaleString()}`} width={52} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey={metric} stroke={metricConfig[metric].color}
              strokeWidth={2.5} dot={{ r: 4, fill: metricConfig[metric].color }}
              name={`${metricConfig[metric].label} (MW)`} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
