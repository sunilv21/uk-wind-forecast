import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts'
import type { LeadTimeBucket } from '../types/api'

interface Props {
  buckets: LeadTimeBucket[]
}

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
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-slate-600">{p.name}</span>
          </div>
          <span className="font-semibold text-slate-800">
            {p.value !== null && p.value !== undefined ? `${p.value.toLocaleString()} MW` : '—'}
          </span>
        </div>
      ))}
    </div>
  )
}

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444']

export default function LeadTimeChart({ buckets }: Props) {
  if (!buckets.length) return null

  const data = buckets.map((b) => ({
    label: b.label,
    MAE: b.mae,
    RMSE: b.rmse,
    periods: b.periods,
  }))

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-800">Accuracy by Forecast Lead Time</h2>
        <p className="text-xs text-slate-400 mt-0.5">How error grows as the delivery hour is further from the decision cutoff</p>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false}
            tickFormatter={(v) => `${v.toLocaleString()}`} width={52} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 8 }} />
          <Bar dataKey="MAE" name="MAE (MW)" fill="#3b82f6" radius={[4, 4, 0, 0]} fillOpacity={0.9} />
          <Bar dataKey="RMSE" name="RMSE (MW)" fill="#8b5cf6" radius={[4, 4, 0, 0]} fillOpacity={0.9} />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-4 flex gap-3 flex-wrap">
        {buckets.map((b) => (
          <div key={b.label} className="bg-slate-50 rounded-lg px-3 py-2 text-xs">
            <span className="text-slate-500">{b.label}: </span>
            <span className="font-semibold text-slate-700">{b.periods} periods</span>
          </div>
        ))}
      </div>
    </div>
  )
}
