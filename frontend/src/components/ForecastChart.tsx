import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { PeriodResult } from '../types/api'

interface Props {
  periods: PeriodResult[]
  units: string
}

interface ChartRow {
  time: string
  fullTime: string
  publishTime: string | null
  forecast: number | null
  actual: number | null
}

function formatTick(isoStr: string): string {
  const d = new Date(isoStr)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function formatFull(isoStr: string): string {
  const d = new Date(isoStr)
  const month = d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })
  return `${d.getUTCDate()} ${month} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number | null; color: string; payload: ChartRow }>
  label?: string
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-slate-700 mb-2">{row.fullTime}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-slate-600">{p.name}</span>
          </div>
          <span className="font-semibold text-slate-800">
            {p.value !== null && p.value !== undefined
              ? `${p.value.toLocaleString()} MW`
              : '—'}
          </span>
        </div>
      ))}
      {row.publishTime && (
        <p className="text-slate-400 mt-2 pt-2 border-t border-slate-100">
          Published: {formatFull(row.publishTime)}
        </p>
      )}
    </div>
  )
}

export default function ForecastChart({ periods, units }: Props) {
  const data: ChartRow[] = periods.map((p) => ({
    time: formatTick(p.deliveryTime),
    fullTime: formatFull(p.deliveryTime),
    publishTime: p.forecastPublishTime,
    forecast: p.forecastGeneration,
    actual: p.actualGeneration,
  }))

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Forecast vs Actual Generation</h2>
          <p className="text-xs text-slate-400 mt-0.5">30-min wind generation · {units} · UTC · gaps = missing data</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-8 h-0.5 bg-blue-500 rounded-full inline-block" />
            Forecast
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-8 h-0.5 bg-emerald-500 rounded-full inline-block" />
            Actual
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
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
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="Forecast"
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            name="Actual"
            connectNulls={false}
            strokeDasharray="0"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
