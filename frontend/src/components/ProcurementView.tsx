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
  return `${String(d.getUTCDate()).padStart(2, '0')} ${d.toLocaleString('en', { month: 'short' })} ${String(d.getUTCHours()).padStart(2, '0')}:00`
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

function peakPeriod(periods: ProcurementPeriod[], key: 'residualActual' | 'residualForecast'): string | null {
  const matched = periods.filter(p => p[key] !== null)
  if (!matched.length) return null
  const top = matched.reduce((a, b) => ((a[key] ?? 0) > (b[key] ?? 0) ? a : b))
  return fmtTime(top.deliveryTime)
}

type SortDir = 'asc' | 'desc'

type ShortfallCol = 'deliveryTime' | 'leadHours' | 'residualForecast' | 'residualActual' | 'shortfall' | 'shortfallPct' | 'windError'
type FullCol = 'deliveryTime' | 'leadHours' | 'residualForecast' | 'residualActual' | 'windForecast' | 'actualWind' | 'procurementGapError' | 'procurementGapAbs' | 'procurementGapPct'

function sortIcon(active: boolean, dir: SortDir) {
  if (!active) return <span className="ml-1 text-slate-300 text-[10px]">⇅</span>
  return <span className="ml-1 text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>
}

function sortRows<T>(rows: T[], key: keyof T | string, dir: SortDir, getter?: (r: T) => number | null): T[] {
  return [...rows].sort((a, b) => {
    const av = getter ? (getter(a) ?? (dir === 'asc' ? Infinity : -Infinity)) : (a[key as keyof T] as unknown as number | string | null) ?? (dir === 'asc' ? Infinity : -Infinity)
    const bv = getter ? (getter(b) ?? (dir === 'asc' ? Infinity : -Infinity)) : (b[key as keyof T] as unknown as number | string | null) ?? (dir === 'asc' ? Infinity : -Infinity)
    if (typeof av === 'string' && typeof bv === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    return dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })
}

export default function ProcurementView({ data }: Props) {
  const pm = data.procurementMetrics
  const wm = data.windMetrics

  const [sfSort, setSfSort] = useState<{ col: ShortfallCol; dir: SortDir }>({ col: 'shortfall', dir: 'desc' })
  const [fullSort, setFullSort] = useState<{ col: FullCol; dir: SortDir }>({ col: 'procurementGapAbs', dir: 'desc' })

  function toggleSf(col: ShortfallCol) {
    setSfSort(s => s.col === col ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' })
  }
  function toggleFull(col: FullCol) {
    setFullSort(s => s.col === col ? { col, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' })
  }

  // Periods with full actuals
  const matched = data.periods.filter(p => p.procurementGapError !== null)

  // Under-bought: gap < 0 → still need to procure more from balancing market
  const underPeriods = matched.filter(p => (p.procurementGapError ?? 0) < 0)
  const totalUnder = underPeriods.reduce((s, p) => s + Math.abs(p.procurementGapError ?? 0), 0)
  const peakUnder = underPeriods.length
    ? Math.max(...underPeriods.map(p => Math.abs(p.procurementGapError ?? 0)))
    : null
  const worstUnderTime = underPeriods.length
    ? fmtTime(underPeriods.reduce((a, b) =>
        Math.abs(a.procurementGapError ?? 0) > Math.abs(b.procurementGapError ?? 0) ? a : b
      ).deliveryTime)
    : null

  // Over-bought: gap > 0 → bought too much
  const overPeriods = matched.filter(p => (p.procurementGapError ?? 0) > 0)
  const totalOver = overPeriods.reduce((s, p) => s + (p.procurementGapError ?? 0), 0)

  const avgActual = avg(data.periods.map(p => p.residualActual))
  const avgForecast = avg(data.periods.map(p => p.residualForecast))
  const peakActualTime = peakPeriod(data.periods, 'residualActual')
  const peakActualVal = data.periods
    .filter(p => p.residualActual !== null)
    .reduce((a, b) => ((a.residualActual ?? 0) > (b.residualActual ?? 0) ? a : b), data.periods[0])
    ?.residualActual ?? null

  const chartData = data.periods.map((p) => ({
    time: fmtTime(p.deliveryTime),
    'Planned to buy': p.residualForecast,
    'Actually needed': p.residualActual,
    'Still to procure': p.procurementGapError !== null && p.procurementGapError < 0 ? Math.abs(p.procurementGapError) : null,
    'Over-bought': p.procurementGapError !== null && p.procurementGapError > 0 ? p.procurementGapError : null,
  }))

  // Shortfall table — sortable
  const sfGetters: Partial<Record<ShortfallCol, (p: ProcurementPeriod) => number | null>> = {
    shortfall: (p) => Math.abs(p.procurementGapError ?? 0),
    shortfallPct: (p) => Math.abs(p.procurementGapPct ?? 0),
    windError: (p) => p.windForecast !== null && p.actualWind !== null ? Math.abs(p.windForecast - p.actualWind) : null,
  }
  const shortfallTable = sortRows(
    underPeriods,
    sfSort.col,
    sfSort.dir,
    sfGetters[sfSort.col],
  )

  // Full table — sortable
  const fullTable = sortRows(matched, fullSort.col, fullSort.dir)

  return (
    <div className="flex flex-col gap-5">

      {/* ── WHAT YOU NEED TO PROCURE ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center text-lg">⚡</div>
          <div>
            <h2 className="text-base font-semibold text-slate-800">Power You Need to Procure</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Based on forecasts available at cutoff — what your day-ahead procurement decision was based on
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100">
          <div className="px-5 py-5 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Avg Planned Purchase</p>
            <p className="text-2xl font-bold text-slate-800">{fmt(avgForecast)}</p>
            <p className="text-xs text-slate-400 mt-0.5">MW / hour</p>
            <p className="text-xs text-slate-500 mt-1">From day-ahead forecast</p>
          </div>
          <div className="px-5 py-5 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Avg Actual Need</p>
            <p className="text-2xl font-bold text-slate-800">{fmt(avgActual)}</p>
            <p className="text-xs text-slate-400 mt-0.5">MW / hour</p>
            <p className="text-xs text-slate-500 mt-1">What was truly needed</p>
          </div>
          <div className="px-5 py-5 bg-slate-50">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Peak Actual Need</p>
            <p className="text-2xl font-bold text-red-600">{fmt(peakActualVal)}</p>
            <p className="text-xs text-slate-400 mt-0.5">MW in worst hour</p>
            <p className="text-xs text-slate-500 mt-1">{peakActualTime ?? '—'}</p>
          </div>
          <div className={`px-5 py-5 ${underPeriods.length > 0 ? 'bg-blue-50' : 'bg-emerald-50'}`}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Shortfall Hours</p>
            <p className={`text-2xl font-bold ${underPeriods.length > 0 ? 'text-blue-700' : 'text-emerald-700'}`}>
              {underPeriods.length}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">of {matched.length} hours</p>
            <p className="text-xs text-slate-500 mt-1">
              {underPeriods.length > 0 ? 'Hours under-bought → balancing market' : 'No shortfall hours'}
            </p>
          </div>
        </div>
      </div>

      {/* ── UNDER vs OVER ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Under-bought */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
            <h3 className="text-sm font-semibold text-blue-800">Under-bought — Still Need to Procure</h3>
          </div>
          <p className="text-3xl font-bold text-blue-700">{fmt(totalUnder)} MW·h</p>
          <p className="text-xs text-blue-600 mt-1">Total shortfall across {underPeriods.length} hour(s)</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="bg-white/60 rounded-xl p-3">
              <p className="text-blue-500 font-semibold">Worst shortfall</p>
              <p className="text-blue-800 font-bold text-lg mt-0.5">{fmt(peakUnder)} MW</p>
              <p className="text-blue-400 mt-0.5">{worstUnderTime ?? '—'}</p>
            </div>
            <div className="bg-white/60 rounded-xl p-3">
              <p className="text-blue-500 font-semibold">Avg shortfall</p>
              <p className="text-blue-800 font-bold text-lg mt-0.5">
                {underPeriods.length ? fmt(totalUnder / underPeriods.length) : '—'} MW
              </p>
              <p className="text-blue-400 mt-0.5">per under-bought hour</p>
            </div>
          </div>
          <p className="text-xs text-blue-500 mt-3">
            ↳ These hours require balancing market or spot purchases — typically at a premium
          </p>
        </div>

        {/* Over-bought */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
            <h3 className="text-sm font-semibold text-amber-800">Over-bought — Excess Procurement</h3>
          </div>
          <p className="text-3xl font-bold text-amber-600">{fmt(totalOver)} MW·h</p>
          <p className="text-xs text-amber-600 mt-1">Total over-buy across {overPeriods.length} hour(s)</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="bg-white/60 rounded-xl p-3">
              <p className="text-amber-500 font-semibold">Avg over-buy</p>
              <p className="text-amber-800 font-bold text-lg mt-0.5">
                {overPeriods.length ? fmt(totalOver / overPeriods.length) : '—'} MW
              </p>
              <p className="text-amber-400 mt-0.5">per over-bought hour</p>
            </div>
            <div className="bg-white/60 rounded-xl p-3">
              <p className="text-amber-500 font-semibold">Wind MAE</p>
              <p className="text-amber-800 font-bold text-lg mt-0.5">{fmt(wm.mae)} MW</p>
              <p className="text-amber-400 mt-0.5">forecast error driving this</p>
            </div>
          </div>
          <p className="text-xs text-amber-500 mt-3">
            ↳ Paid for capacity not needed — sell back or absorb as wasted cost
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-800">Planned vs Actual Procurement by Hour</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Blue bars = hours you still needed to buy more · Amber bars = hours you over-bought · MW
          </p>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }} interval="preserveStartEnd" />
            <YAxis yAxisId="res" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false}
              axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={44} />
            <YAxis yAxisId="gap" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickLine={false} axisLine={false} width={52} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 8 }} />
            <Line yAxisId="res" type="monotone" dataKey="Planned to buy"
              stroke="#f97316" strokeWidth={2} dot={false} connectNulls={false} />
            <Line yAxisId="res" type="monotone" dataKey="Actually needed"
              stroke="#64748b" strokeWidth={2} dot={false} strokeDasharray="5 3" connectNulls={false} />
            <Bar yAxisId="gap" dataKey="Still to procure" fill="#60a5fa" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
            <Bar yAxisId="gap" dataKey="Over-bought" fill="#fbbf24" radius={[3, 3, 0, 0]} fillOpacity={0.8} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Shortfall table */}
      {shortfallTable.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-blue-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-blue-100 bg-blue-50 flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <div>
              <h2 className="text-base font-semibold text-blue-800">Shortfall Hours — Additional Procurement Needed</h2>
              <p className="text-xs text-blue-500 mt-0.5">
                Hours where your day-ahead position was short · click any column header to sort ↕
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
                    { label: 'Planned to buy', col: 'residualForecast' },
                    { label: 'Actually needed', col: 'residualActual' },
                    { label: 'Shortfall', col: 'shortfall' },
                    { label: 'Shortfall %', col: 'shortfallPct' },
                    { label: 'Wind forecast error', col: 'windError' },
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
                {shortfallTable.map((p) => {
                  const shortfall = Math.abs(p.procurementGapError ?? 0)
                  return (
                    <tr key={p.deliveryTime} className="hover:bg-blue-50 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">{fmtTime(p.deliveryTime)}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-400">{p.leadHours !== null ? `+${p.leadHours}h` : '—'}</td>
                      <td className="px-4 py-2.5 font-semibold text-orange-600">{fmt(p.residualForecast)}</td>
                      <td className="px-4 py-2.5 font-semibold text-slate-700">{fmt(p.residualActual)}</td>
                      <td className="px-4 py-2.5 font-bold text-blue-600">−{fmt(shortfall)} MW</td>
                      <td className={`px-4 py-2.5 text-xs font-semibold ${Math.abs(p.procurementGapPct ?? 0) > 5 ? 'text-red-500' : 'text-blue-600'}`}>
                        {p.procurementGapPct !== null ? `${p.procurementGapPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">
                        {p.windForecast !== null && p.actualWind !== null
                          ? `${(p.windForecast - p.actualWind) > 0 ? 'Over-forecast by ' : 'Under-forecast by '}${fmt(Math.abs(p.windForecast - p.actualWind))} MW`
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full detail table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">All Periods — Full Detail</h2>
          <p className="text-xs text-slate-400 mt-0.5">Click any column header to sort · MW · procurement accuracy metrics below</p>
        </div>
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-6 text-xs">
          {[
            ['Procurement MAE', `${fmt(pm.mae)} MW`],
            ['Procurement RMSE', `${fmt(pm.rmse)} MW`],
            ['Procurement Bias', `${pm.bias !== null && pm.bias > 0 ? '+' : ''}${fmt(pm.bias)} MW`],
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
                  { label: 'Planned to buy', col: 'residualForecast' },
                  { label: 'Actually needed', col: 'residualActual' },
                  { label: 'Wind F/cast', col: 'windForecast' },
                  { label: 'Actual Wind', col: 'actualWind' },
                  { label: 'Gap Error', col: 'procurementGapError' },
                  { label: '|Gap|', col: 'procurementGapAbs' },
                  { label: 'Gap %', col: 'procurementGapPct' },
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
                <tr key={p.deliveryTime} className={`hover:bg-slate-50 transition-colors ${(p.procurementGapError ?? 0) < 0 ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">{fmtTime(p.deliveryTime)}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{p.leadHours !== null ? `+${p.leadHours}h` : '—'}</td>
                  <td className="px-4 py-2.5 font-semibold text-orange-600">{fmt(p.residualForecast)}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-700">{fmt(p.residualActual)}</td>
                  <td className="px-4 py-2.5 text-blue-500">{fmt(p.windForecast)}</td>
                  <td className="px-4 py-2.5 text-emerald-600">{fmt(p.actualWind)}</td>
                  <td className={`px-4 py-2.5 font-bold ${
                    p.procurementGapError === null ? 'text-slate-400' :
                    p.procurementGapError > 0 ? 'text-amber-600' : 'text-blue-600'
                  }`}>
                    {p.procurementGapError !== null
                      ? `${p.procurementGapError > 0 ? '+' : '−'}${fmt(Math.abs(p.procurementGapError))}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{fmt(p.procurementGapAbs)}</td>
                  <td className={`px-4 py-2.5 text-xs ${
                    p.procurementGapPct === null ? 'text-slate-400' :
                    Math.abs(p.procurementGapPct) > 5 ? 'text-red-500' : 'text-slate-600'
                  }`}>
                    {p.procurementGapPct !== null ? `${p.procurementGapPct > 0 ? '+' : ''}${p.procurementGapPct.toFixed(1)}%` : '—'}
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
