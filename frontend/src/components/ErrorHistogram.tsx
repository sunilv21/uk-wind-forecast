import { useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts'
import type { PeriodResult } from '../types/api'

interface Props {
  periods: PeriodResult[]
}

const BUCKET_SIZE = 500

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: { label: string; count: number; positive: boolean } }>
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-700 mb-1">{d.label} MW</p>
      <p className="text-slate-600">{d.count} period{d.count !== 1 ? 's' : ''}</p>
    </div>
  )
}

export default function ErrorHistogram({ periods }: Props) {
  const { buckets, stats } = useMemo(() => {
    const errors = periods.filter((p) => p.error !== null).map((p) => p.error as number)
    if (!errors.length) return { buckets: [], stats: null }

    const min = Math.floor(Math.min(...errors) / BUCKET_SIZE) * BUCKET_SIZE
    const max = Math.ceil(Math.max(...errors) / BUCKET_SIZE) * BUCKET_SIZE

    const map = new Map<number, number>()
    for (let v = min; v <= max; v += BUCKET_SIZE) map.set(v, 0)
    for (const e of errors) {
      const key = Math.floor(e / BUCKET_SIZE) * BUCKET_SIZE
      map.set(key, (map.get(key) ?? 0) + 1)
    }

    const buckets = Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([v, count]) => ({
        label: v >= 0 ? `+${v}–+${v + BUCKET_SIZE}` : `${v}–${v + BUCKET_SIZE}`,
        midpoint: v,
        count,
        positive: v >= 0,
      }))

    const positive = errors.filter((e) => e > 0).length
    const negative = errors.filter((e) => e < 0).length
    return {
      buckets,
      stats: { positive, negative, total: errors.length },
    }
  }, [periods])

  if (!buckets.length) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Error Distribution</h2>
          <p className="text-xs text-slate-400 mt-0.5">How often errors fall in each {BUCKET_SIZE.toLocaleString()} MW bucket</p>
        </div>
        {stats && (
          <div className="flex gap-3 text-xs">
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 text-center">
              <p className="font-bold text-amber-600">{stats.positive}</p>
              <p className="text-slate-500">Over-forecast</p>
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 text-center">
              <p className="font-bold text-blue-600">{stats.negative}</p>
              <p className="text-slate-500">Under-forecast</p>
            </div>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={buckets} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 10 }}
            tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={0}
            angle={-30} textAnchor="end" height={40} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false}
            axisLine={false} allowDecimals={false} width={32} />
          <ReferenceLine x={0} stroke="#94a3b8" />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
            {buckets.map((b, i) => (
              <Cell key={i} fill={b.positive ? '#fbbf24' : '#60a5fa'} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
