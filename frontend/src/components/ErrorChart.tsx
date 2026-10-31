import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts'
import type { PeriodResult } from '../types/api'

interface Props {
  periods: PeriodResult[]
  units: string
}

interface ChartRow {
  time: string
  fullTime: string
  error: number | null
}

function formatTick(isoStr: string): string {
  const d = new Date(isoStr)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:00`
}

function formatFull(isoStr: string): string {
  const d = new Date(isoStr)
  return `${d.getUTCDate()} ${d.toLocaleString('en', { month: 'short' })} ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number | null; payload: ChartRow }>
  label?: string
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const err = row.error
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[150px]">
      <p className="font-semibold text-slate-700 mb-2">{row.fullTime}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-500">Error</span>
        <span className={`font-bold ${err !== null && err >= 0 ? 'text-amber-600' : 'text-blue-600'}`}>
          {err !== null ? `${err > 0 ? '+' : ''}${err.toLocaleString()} MW` : '—'}
        </span>
      </div>
      {err !== null && (
        <p className={`mt-1 text-xs ${err > 0 ? 'text-amber-500' : 'text-blue-500'}`}>
          {err > 0 ? '↑ Over-forecast' : '↓ Under-forecast'}
        </p>
      )}
    </div>
  )
}

export default function ErrorChart({ periods, units }: Props) {
  const data: ChartRow[] = periods
    .filter((p) => p.error !== null)
    .map((p) => ({
      time: formatTick(p.deliveryTime),
      fullTime: formatFull(p.deliveryTime),
      error: p.error,
    }))

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Forecast Error by Period</h2>
          <p className="text-xs text-slate-400 mt-0.5">Forecast − Actual · {units} · positive = over-forecast</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" />
            Over-forecast
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-blue-400 inline-block" />
            Under-forecast
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="time"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`}
            width={44}
          />
          <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="error" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.error !== null && entry.error >= 0 ? '#fbbf24' : '#60a5fa'}
                fillOpacity={0.9}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
