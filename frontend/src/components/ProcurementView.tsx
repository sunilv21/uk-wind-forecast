import { useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts'
import type { ProcurementResponse, ProcurementPeriod } from '../types/api'

interface Props {
  data: ProcurementResponse
}

function fmt(v: number | null, dec = 0): string {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCDate()).padStart(2, '0')} ${d.toLocaleString('en', { month: 'short' })} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number | null; color: string }>
  label?: string
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[180px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((p) => p.value !== null && p.value !== undefined && (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-slate-500">{p.name}</span>
          </div>
          <span className="font-semibold text-slate-800">{p.value.toLocaleString()} MW</span>
        </div>
      ))}
    </div>
  )
}

function avg(vals: (number | null)[]): number | null {
  const v = vals.filter((x): x is number => x !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

type SortDir = 'asc' | 'desc'
type ShortfallCol = 'deliveryTime' | 'leadHours' | 'windForecast' | 'actualWind' | 'windError' | 'windErrorPct'
type FullCol = 'deliveryTime' | 'leadHours' | 'windForecast' | 'actualWind' | 'windError' | 'windErrorAbs' | 'windErrorPct'

function sortIcon(active: boolean, dir: SortDir) {
  if (!active) return <span className="ml-1 text-slate-300 text-[10px]">⇅</span>
  return <span className="ml-1 text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>
}

function sortRows<T>(rows: T[], key: string, dir: SortDir, getter?: (r: T) => number | null): T[] {
  return [...rows].sort((a, b) => {
    const av = getter ? (getter(a) ?? (dir === 'asc' ? Infinity : -Infinity)) : ((a as Record<string, unknown>)[key] as number | string | null) ?? (dir === 'asc' ? Infinity : -Infinity)
    const bv = getter ? (getter(b) ?? (dir === 'asc' ? Infinity : -Infinity)) : ((b as Record<string, unknown>)[key] as number | string | null) ?? (dir === 'asc' ? Infinity : -Infinity)
    if (typeof av === 'string' && typeof bv === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })
}

export default function ProcurementView({ data }: Props) {
  const pm = data.procurementMetrics
  const wm = data.windMetrics

  const [sfSort, setSfSort] = useState<{ col: ShortfallCol; dir: SortDir }>({ col: 'windError', dir: 'desc' })
  const [fullSort, setFullSort] = useState<{ col: FullCol; dir: SortDir }>({ col: 'windErrorAbs', dir: 'desc' })

  function toggleSf(col: ShortfallCol) {
    setSfSort(s => s.col === col ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' })
  }
  function toggleFull(col: FullCol) {
    setFullSort(s => s.col === col ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' })
  }

  // Periods with full actuals
  const matched = data.periods.filter(p => p.windError !== null)

  // Overforecast (shortfall exposure): wind produced LESS than forecast → windError > 0
  const shortfallPeriods = matched.filter(p => (p.windError ?? 0) > 0)
  // Energy = MW × 0.5 h per 30-min period
  const totalShortfallMWh = shortfallPeriods.reduce((s, p) => s + (p.windError ?? 0) * 0.5, 0)
  const peakShortfall = shortfallPeriods.length ? Math.max(...shortfallPeriods.map(p => p.windError ?? 0)) : null
  const worstShortfallTime = shortfallPeriods.length
    ? fmtTime(shortfallPeriods.reduce((a, b) => (a.windError ?? 0) > (b.windError ?? 0) ? a : b).deliveryTime)
    : null

  // Underforecast (surplus exposure): wind produced MORE than forecast → windError < 0
  const surplusPeriods = matched.filter(p => (p.windError ?? 0) < 0)
  // Energy = |windError| × 0.5 h per 30-min period
  const totalSurplusMWh = surplusPeriods.reduce((s, p) => s + Math.abs(p.windError ?? 0) * 0.5, 0)

  const avgForecast = avg(data.periods.map(p => p.windForecast))
  const avgActual = avg(data.periods.map(p => p.actualWind))

  const chartData = data.periods.map((p) => ({
    time: fmtTime(p.deliveryTime),
    'Forecast wind': p.windForecast,
    'Actual wind': p.actualWind,
    'Shortfall exposure': p.windError !== null && p.windError > 0 ? p.windError : null,
    'Surplus exposure': p.windError !== null && p.windError < 0 ? Math.abs(p.windError) : null,
  }))

  const shortfallTable = sortRows(shortfallPeriods, sfSort.col, sfSort.dir)
  const fullTable = sortRows(matched, fullSort.col, fullSort.dir)

  return (
    <div className="flex flex-col gap-5">

      {/* Methodology disclaimer */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 flex gap-3">
        <span className="text-slate-400 text-lg mt-0.5">ℹ</span>
        <div>
          <p className="text-sm font-semibold text-slate-700">Wind-Only Balancing Exposure</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            This analysis uses <strong>WINDFOR</strong> (wind forecasts) and <strong>FUELHH fuelType=WIND</strong> (actuals) from Elexon BMRS only.
            Consumer demand data is not included. The metric shown is the incremental wind generation shortfall or surplus
            relative to the day-ahead forecast position — <strong>not total electricity procurement requirement</strong>.
            <br />
            <span className="text-slate-400">
              Wind Error = WINDFOR − FUELHH_WIND. Positive = over-forecast (wind produced less than expected). Negative = under-forecast (wind produced more than expected).
              Energy calculated as MW × 0.5 h per 30-minute delivery period (MWh).
            </span>
          </p>
        </div>
      </div>

      {/* ── HEADER CARDS ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center text-lg">⚡</div>
          <div>
            <h2 className="text-base font-semibold text-slate-800">Indicative Wind Balancing Exposure</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Based on the wind forecast available at decision cutoff vs what wind actually generated
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100">
          <div className="px-5 py-5 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Avg Forecast Wind</p>
            <p className="text-2xl font-bold text-slate-800">{fmt(avgForecast)}</p>
            <p className="text-xs text-slate-400 mt-0.5">MW avg</p>
            <p className="text-xs text-slate-500 mt-1">WINDFOR at decision cutoff</p>
          </div>
          <div className="px-5 py-5 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Avg Actual Wind</p>
            <p className="text-2xl font-bold text-slate-800">{fmt(avgActual)}</p>
            <p className="text-xs text-slate-400 mt-0.5">MW avg</p>
            <p className="text-xs text-slate-500 mt-1">FUELHH measured output</p>
          </div>
          <div className="px-5 py-5 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Wind MAE</p>
            <p className="text-2xl font-bold text-red-600">{fmt(wm.mae)}</p>
            <p className="text-xs text-slate-400 mt-0.5">MW mean absolute error</p>
            <p className="text-xs text-slate-500 mt-1">Avg forecast miss per 30-min period</p>
          </div>
          <div className={`px-5 py-5 ${shortfallPeriods.length > 0 ? 'bg-blue-50' : 'bg-emerald-50'}`}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Overforecast Periods</p>
            <p className={`text-2xl font-bold ${shortfallPeriods.length > 0 ? 'text-blue-700' : 'text-emerald-700'}`}>
              {shortfallPeriods.length}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">of {matched.length} matched periods</p>
            <p className="text-xs text-slate-500 mt-1">
              {shortfallPeriods.length > 0 ? '30-min periods where wind < forecast' : 'No shortfall periods'}
            </p>
          </div>
        </div>
      </div>

      {/* ── SHORTFALL vs SURPLUS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Overforecast / shortfall */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
            <h3 className="text-sm font-semibold text-blue-800">Overforecast Exposure — Wind Shortfall</h3>
          </div>
          <p className="text-3xl font-bold text-blue-700">{fmt(totalShortfallMWh)} MWh</p>
          <p className="text-xs text-blue-600 mt-1">Total exposure across {shortfallPeriods.length} half-hour period(s)</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="bg-white/60 rounded-xl p-3">
              <p className="text-blue-500 font-semibold">Worst period</p>
              <p className="text-blue-800 font-bold text-lg mt-0.5">{fmt(peakShortfall)} MW</p>
              <p className="text-blue-400 mt-0.5">{worstShortfallTime ?? '—'}</p>
            </div>
            <div className="bg-white/60 rounded-xl p-3">
              <p className="text-blue-500 font-semibold">Avg deviation</p>
              <p className="text-blue-800 font-bold text-lg mt-0.5">
                {shortfallPeriods.length ? fmt(shortfallPeriods.reduce((s, p) => s + (p.windError ?? 0), 0) / shortfallPeriods.length) : '—'} MW
              </p>
              <p className="text-blue-400 mt-0.5">per overforecast period</p>
            </div>
          </div>
          <p className="text-xs text-blue-500 mt-3">
            ↳ Wind generation was below forecast during this period, indicating a potential shortfall in the wind position. This does not establish the total balancing-market procurement requirement.
          </p>
        </div>

        {/* Underforecast / surplus */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
            <h3 className="text-sm font-semibold text-amber-800">Underforecast Exposure — Wind Surplus</h3>
          </div>
          <p className="text-3xl font-bold text-amber-600">{fmt(totalSurplusMWh)} MWh</p>
          <p className="text-xs text-amber-600 mt-1">Total surplus across {surplusPeriods.length} half-hour period(s)</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="bg-white/60 rounded-xl p-3">
              <p className="text-amber-500 font-semibold">Avg deviation</p>
              <p className="text-amber-800 font-bold text-lg mt-0.5">
                {surplusPeriods.length ? fmt(surplusPeriods.reduce((s, p) => s + Math.abs(p.windError ?? 0), 0) / surplusPeriods.length) : '—'} MW
              </p>
              <p className="text-amber-400 mt-0.5">per underforecast period</p>
            </div>
            <div className="bg-white/60 rounded-xl p-3">
              <p className="text-amber-500 font-semibold">Wind Bias</p>
              <p className="text-amber-800 font-bold text-lg mt-0.5">
                {wm.bias !== null ? `${wm.bias > 0 ? '+' : ''}${fmt(wm.bias)} MW` : '—'}
              </p>
              <p className="text-amber-400 mt-0.5">systematic over/under-forecast</p>
            </div>
          </div>
          <p className="text-xs text-amber-500 mt-3">
            ↳ Wind produced more than forecast — position may be over-hedged relative to actual output
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-800">Forecast vs Actual Wind — 30-min periods</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Blue bars = periods wind produced less than forecast (shortfall exposure) ·
            Amber bars = periods wind produced more than forecast (surplus exposure) · MW
          </p>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }} interval="preserveStartEnd" />
            <YAxis yAxisId="gen" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false}
              axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={44}
              domain={['auto', 'auto']} />
            <YAxis yAxisId="err" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false} axisLine={false} width={52} domain={[0, 'auto']} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 8 }} />
            <Line yAxisId="gen" type="monotone" dataKey="Forecast wind"
              stroke="#f97316" strokeWidth={2} dot={false} connectNulls={false} />
            <Line yAxisId="gen" type="monotone" dataKey="Actual wind"
              stroke="#64748b" strokeWidth={2} dot={false} strokeDasharray="5 3" connectNulls={false} />
            <Bar yAxisId="err" dataKey="Shortfall exposure" fill="#60a5fa" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
            <Bar yAxisId="err" dataKey="Surplus exposure" fill="#fbbf24" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Shortfall table */}
      {shortfallTable.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-blue-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-blue-100 bg-blue-50 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <div>
              <h2 className="text-base font-semibold text-blue-800">Overforecast Periods — Shortfall Exposure</h2>
              <p className="text-xs text-blue-500 mt-0.5">
                30-min periods where wind generated less than forecast · sorted by largest shortfall · click any column to sort ↕
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {([
                    { label: 'Delivery (UTC)', col: 'deliveryTime' },
                    { label: 'Lead', col: 'leadHours' },
                    { label: 'Forecast Wind', col: 'windForecast' },
                    { label: 'Actual Wind', col: 'actualWind' },
                    { label: 'Shortfall (MW)', col: 'windError' },
                    { label: 'Shortfall %', col: 'windErrorPct' },
                  ] as { label: string; col: ShortfallCol }[]).map(({ label, col }) => (
                    <th
                      key={col}
                      onClick={() => toggleSf(col)}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      {label}{sortIcon(sfSort.col === col, sfSort.dir)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {shortfallTable.map((p) => (
                  <tr key={p.deliveryTime} className="hover:bg-blue-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">{fmtTime(p.deliveryTime)}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{p.leadHours !== null ? `+${p.leadHours}h` : '—'}</td>
                    <td className="px-4 py-2.5 font-semibold text-orange-600">{fmt(p.windForecast)}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-700">{fmt(p.actualWind)}</td>
                    <td className="px-4 py-2.5 font-bold text-blue-600">+{fmt(p.windError)} MW</td>
                    <td className={`px-4 py-2.5 text-xs font-semibold ${Math.abs(p.windErrorPct ?? 0) > 10 ? 'text-red-500' : 'text-blue-600'}`}>
                      {p.windErrorPct !== null ? `${p.windErrorPct.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full detail table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">All Periods — Wind Forecast vs Actual (30-min)</h2>
          <p className="text-xs text-slate-400 mt-0.5">Click any column header to sort ↕ · MW · blue rows = shortfall · '—' = missing data</p>
        </div>
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-6 text-xs">
          {[
            ['Wind MAE', `${fmt(pm.mae)} MW`],
            ['Wind RMSE', `${fmt(pm.rmse)} MW`],
            ['Wind Bias', `${pm.bias !== null && pm.bias > 0 ? '+' : ''}${fmt(pm.bias)} MW`],
            ['WAPE', `${pm.wape !== null ? pm.wape.toFixed(1) + '%' : '—'}`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-slate-400">{label}:</span>
              <span className="font-semibold text-slate-700">{value}</span>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {([
                  { label: 'Delivery (UTC)', col: 'deliveryTime' },
                  { label: 'Lead', col: 'leadHours' },
                  { label: 'Forecast Wind', col: 'windForecast' },
                  { label: 'Actual Wind', col: 'actualWind' },
                  { label: 'Wind Error', col: 'windError' },
                  { label: '|Error|', col: 'windErrorAbs' },
                  { label: 'Error %', col: 'windErrorPct' },
                ] as { label: string; col: FullCol }[]).map(({ label, col }) => (
                  <th
                    key={col}
                    onClick={() => toggleFull(col)}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    {label}{sortIcon(fullSort.col === col, fullSort.dir)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {fullTable.map((p) => (
                <tr key={p.deliveryTime} className={`hover:bg-slate-50 transition-colors ${(p.windError ?? 0) > 0 ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">{fmtTime(p.deliveryTime)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{p.leadHours !== null ? `+${p.leadHours}h` : '—'}</td>
                  <td className="px-4 py-2.5 font-semibold text-orange-600">{fmt(p.windForecast)}</td>
                  <td className="px-4 py-2.5 font-semibold text-emerald-600">{fmt(p.actualWind)}</td>
                  <td className={`px-4 py-2.5 font-bold ${
                    p.windError === null ? 'text-slate-400' :
                    p.windError > 0 ? 'text-blue-600' : 'text-amber-600'
                  }`}>
                    {p.windError !== null
                      ? `${p.windError > 0 ? '+' : ''}${fmt(p.windError)}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{fmt(p.windErrorAbs)}</td>
                  <td className={`px-4 py-2.5 text-xs ${
                    p.windErrorPct === null ? 'text-slate-400' :
                    Math.abs(p.windErrorPct) > 10 ? 'text-red-500' : 'text-slate-600'
                  }`}>
                    {p.windErrorPct !== null ? `${p.windErrorPct > 0 ? '+' : ''}${p.windErrorPct.toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
