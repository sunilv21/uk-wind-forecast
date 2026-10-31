import { useState } from 'react'
import type { PeriodResult } from '../types/api'

interface Props {
  periods: PeriodResult[]
  units: string
}

function exportCSV(periods: PeriodResult[], units: string) {
  const header = `Delivery Time (UTC),Published At (UTC),Forecast (${units}),Actual (${units}),Error (${units}),|Error| (${units}),Error %,Lead Hours`
  const rows = periods.map((p) =>
    [
      p.deliveryTime,
      p.forecastPublishTime ?? '',
      p.forecastGeneration ?? '',
      p.actualGeneration ?? '',
      p.error ?? '',
      p.absoluteError ?? '',
      p.percentageError ?? '',
      p.leadHours ?? '',
    ].join(',')
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `wind-forecast-periods.csv`
  a.click()
  URL.revokeObjectURL(url)
}

type SortKey = 'deliveryTime' | 'absoluteError' | 'error' | 'forecastGeneration' | 'actualGeneration'

function fmt(v: number | null, dec = 0): string {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getUTCDate()).padStart(2, '0')} ${d.toLocaleString('en', { month: 'short' })} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export default function PeriodTable({ periods, units }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('absoluteError')
  const [sortDesc, setSortDesc] = useState(true)

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc((d) => !d)
    else { setSortKey(key); setSortDesc(true) }
  }

  const sorted = [...periods].sort((a, b) => {
    const av = a[sortKey] ?? (sortDesc ? -Infinity : Infinity)
    const bv = b[sortKey] ?? (sortDesc ? -Infinity : Infinity)
    if (typeof av === 'string' && typeof bv === 'string') {
      return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv)
    }
    return sortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number)
  })

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="ml-1 text-slate-300">↕</span>
    return <span className="ml-1 text-blue-500">{sortDesc ? '↓' : '↑'}</span>
  }

  function Th({ label, k }: { label: string; k?: SortKey }) {
    return (
      <th
        className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap ${k ? 'cursor-pointer hover:text-slate-700 select-none' : ''}`}
        onClick={k ? () => toggleSort(k) : undefined}
      >
        {label}{k && <SortIcon k={k} />}
      </th>
    )
  }

  const matched = periods.filter((p) => p.actualGeneration !== null && p.forecastGeneration !== null).length

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Delivery Periods</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {periods.length} forecast periods · {matched} with actuals · click column headers to sort
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded-full font-medium">
            {units} · UTC
          </span>
          <button
            onClick={() => exportCSV(periods, units)}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <Th label="Delivery Time" k="deliveryTime" />
              <Th label="Published At" />
              <Th label="Lead (h)" />
              <Th label={`Forecast (${units})`} k="forecastGeneration" />
              <Th label={`Actual (${units})`} k="actualGeneration" />
              <Th label={`Error (${units})`} k="error" />
              <Th label={`|Error| (${units})`} k="absoluteError" />
              <Th label="Error %" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {sorted.map((p) => {
              const hasActual = p.actualGeneration !== null
              const errBig = p.absoluteError !== null && p.absoluteError > 500
              return (
                <tr
                  key={p.deliveryTime}
                  className={`hover:bg-slate-50 transition-colors ${!hasActual ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                    {fmtTime(p.deliveryTime)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">
                    {fmtTime(p.forecastPublishTime)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 font-medium">
                    {p.leadHours !== null ? `+${p.leadHours}h` : '—'}
                  </td>
                  <td className="px-4 py-3 text-blue-600 font-medium">{fmt(p.forecastGeneration)}</td>
                  <td className="px-4 py-3 text-emerald-600 font-medium">{fmt(p.actualGeneration)}</td>
                  <td className={`px-4 py-3 font-semibold ${
                    p.error === null ? 'text-slate-400' :
                    p.error > 0 ? 'text-amber-600' : 'text-blue-600'
                  }`}>
                    {p.error !== null ? `${p.error > 0 ? '+' : ''}${fmt(p.error)}` : '—'}
                  </td>
                  <td className={`px-4 py-3 font-medium ${errBig ? 'text-red-500' : 'text-slate-700'}`}>
                    {fmt(p.absoluteError)}
                  </td>
                  <td className={`px-4 py-3 text-xs font-medium ${
                    p.percentageError === null ? 'text-slate-400' :
                    Math.abs(p.percentageError) > 20 ? 'text-red-500' : 'text-slate-600'
                  }`}>
                    {p.percentageError !== null
                      ? `${p.percentageError > 0 ? '+' : ''}${p.percentageError.toFixed(1)}%`
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
