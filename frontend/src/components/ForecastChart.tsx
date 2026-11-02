import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
  shortfall: number | null
  surplus: number | null
}

function formatTick(isoStr: string): string {
  const d = new Date(isoStr)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:00`
}

function formatFull(isoStr: string): string {
  const d = new Date(isoStr)
  return `${d.getUTCDate()} Jan ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number | null; color: string; payload: ChartRow }>
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const order = ['Forecast', 'Actual', 'Shortfall', 'Surplus']
  const sorted = [...payload].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[170px]">
      <p className="font-semibold text-slate-700 mb-2">{row.fullTime}</p>
      {sorted.map((p) =>
        p.value !== null && p.value !== undefined ? (
          <div key={p.name} className="flex items-center justify-between gap-4 mb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-slate-600">{p.name}</span>
            </div>
            <span className="font-semibold text-slate-800">{p.value.toLocaleString()} MW</span>
          </div>
        ) : null
      )}
      {row.publishTime && (
        <p className="text-slate-400 mt-2 pt-2 border-t border-slate-100">
          Published: {formatFull(row.publishTime)}
        </p>
      )}
    </div>
  )
}

export default function ForecastChart({ periods, units }: Props) {
  // Use only the :00 periods (hourly) — WINDFOR publishes hourly, :30 slots are null
  const hourly = periods.filter((p) => {
    const d = new Date(p.deliveryTime)
    return d.getUTCMinutes() === 0
  })

  const data: ChartRow[] = hourly.map((p) => {
    const forecast = p.forecastGeneration
    const actual = p.actualGeneration
    let shortfall: number | null = null
    let surplus: number | null = null
    if (forecast !== null && actual !== null) {
      if (actual < forecast) shortfall = Math.round(forecast - actual)
      else if (actual > forecast) surplus = Math.round(actual - forecast)
    }
    return {
      time: formatTick(p.deliveryTime),
      fullTime: formatFull(p.deliveryTime),
      publishTime: p.forecastPublishTime,
      forecast,
      actual,
      shortfall,
      surplus,
    }
  })

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Forecast vs Actual Generation</h2>
          <p className="text-xs text-slate-400 mt-0.5">Hourly wind generation · {units} · UTC</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-8 h-0.5 bg-blue-500 rounded-full inline-block" />
            Forecast
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-8 h-0.5 bg-emerald-500 rounded-full inline-block" />
            Actual
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-blue-400 inline-block opacity-80" />
            Shortfall
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-400 inline-block opacity-80" />
            Surplus
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 4, right: 56, left: 0, bottom: 4 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="time"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          {/* Left axis: wind generation (MW) */}
          <YAxis
            yAxisId="gen"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            width={40}
            domain={['auto', 'auto']}
          />
          {/* Right axis: exposure (MW) */}
          <YAxis
            yAxisId="exp"
            orientation="right"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
            domain={[0, 'auto']}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />

          {/* Bars on right axis */}
          <Bar yAxisId="exp" dataKey="shortfall" name="Shortfall" fill="#60a5fa" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
          <Bar yAxisId="exp" dataKey="surplus" name="Surplus" fill="#fbbf24" fillOpacity={0.8} radius={[3, 3, 0, 0]} />

          {/* Lines on left axis */}
          <Line
            yAxisId="gen"
            type="monotone"
            dataKey="forecast"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
            name="Forecast"
            connectNulls={false}
          />
          <Line
            yAxisId="gen"
            type="monotone"
            dataKey="actual"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            name="Actual"
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
