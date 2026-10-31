import { useState, useCallback, useEffect } from 'react'
import type { AnalysisResponse, ProcurementResponse } from '../types/api'
import { fetchAnalysis, fetchProcurement } from '../api/client'
import DateControls from '../components/DateControls'
import MetricCards from '../components/MetricCards'
import SummaryStrip from '../components/SummaryStrip'
import ForecastChart from '../components/ForecastChart'
import ErrorChart from '../components/ErrorChart'
import ErrorHistogram from '../components/ErrorHistogram'
import LeadTimeChart from '../components/LeadTimeChart'
import TrendChart from '../components/TrendChart'
import PeriodTable from '../components/PeriodTable'
import ProcurementView from '../components/ProcurementView'

// Default to mid-January 2026 — the assignment's required analysis period
function defaultDate(): string {
  return '2026-01-15'
}

type Tab = 'wind' | 'procurement' | 'docs'

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('wind')
  const [decisionDate, setDecisionDate] = useState(defaultDate)
  const [cutoffTime, setCutoffTime] = useState('10:00')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [windData, setWindData] = useState<AnalysisResponse | null>(null)
  const [procData, setProcData] = useState<ProcurementResponse | null>(null)

  const run = useCallback(async (date = decisionDate, cutoff = cutoffTime, activeTab = tab) => {
    if (!date) return
    setLoading(true)
    setError(null)
    try {
      if (activeTab === 'wind') {
        setWindData(await fetchAnalysis(date, cutoff))
      } else {
        setProcData(await fetchProcurement(date, cutoff))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }, [decisionDate, cutoffTime, tab])

  useEffect(() => { run(defaultDate(), cutoffTime, 'wind') }, [])

  function switchTab(t: Tab) {
    setTab(t)
    setError(null)
    // Load tab data if not yet loaded
    if (t === 'wind' && !windData) run(decisionDate, cutoffTime, 'wind')
    if (t === 'procurement' && !procData) run(decisionDate, cutoffTime, 'procurement')
  }

  const currentData = tab === 'wind' ? windData : procData

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 shadow-md">
        <div className="max-w-screen-xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">UK Wind & Procurement Dashboard</h1>
              <p className="text-blue-200 text-xs mt-0.5">Elexon BMRS · WINDFOR · FUELHH (WIND) · 30-minute data</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white text-xs font-medium">Live · Elexon BMRS</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-screen-xl mx-auto px-6 pb-0 flex gap-1">
          {([
            { key: 'wind', label: 'Wind Forecast Accuracy', icon: '🌬️' },
            { key: 'procurement', label: 'Wind Exposure Analysis', icon: '⚡' },
            { key: 'docs', label: 'Documentation', icon: '📖' },
          ] as { key: Tab; label: string; icon: string }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              className={`px-5 py-3 text-sm font-semibold rounded-t-xl transition-colors ${
                tab === t.key
                  ? 'bg-slate-100 text-slate-800'
                  : 'text-blue-200 hover:text-white hover:bg-white/10'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
        {/* Controls — hidden on docs tab */}
        {tab !== 'docs' && <DateControls
          decisionDate={decisionDate}
          cutoffTime={cutoffTime}
          loading={loading}
          onDateChange={(v) => { setDecisionDate(v); setWindData(null); setProcData(null) }}
          onCutoffChange={(v) => { setCutoffTime(v); setWindData(null); setProcData(null) }}
          onSubmit={() => run()}
        />}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-red-700">Failed to load data</p>
              <p className="text-xs text-red-500 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex flex-col gap-4">
            {[4, 5].map((cols, i) => (
              <div key={i} className={`grid grid-cols-2 md:grid-cols-${cols} gap-4`}>
                {Array.from({ length: cols }).map((_, j) => (
                  <div key={j} className="bg-white rounded-2xl border border-slate-200 p-5 h-28 animate-pulse">
                    <div className="w-8 h-8 bg-slate-100 rounded-xl mb-3" />
                    <div className="w-20 h-5 bg-slate-100 rounded" />
                  </div>
                ))}
              </div>
            ))}
            <div className="bg-white rounded-2xl border border-slate-200 h-72 animate-pulse flex items-center justify-center">
              <div className="flex items-center gap-3 text-slate-400 text-sm">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                Fetching from Elexon BMRS…
              </div>
            </div>
          </div>
        )}

        {/* ── WIND ACCURACY TAB ── */}
        {tab === 'wind' && windData && !loading && (
          <>
            {/* Context strip */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-6 py-3 flex flex-wrap gap-x-8 gap-y-2">
              {[
                ['Decision date', windData.decisionDate],
                ['Delivery date', windData.deliveryDate],
                ['Cutoff (UTC)', windData.decisionCutoff.replace('T', ' ').replace('Z', '')],
                ['Resolution', `${windData.resolutionMinutes}-min`],
                ['Expected periods', String(windData.coverage.expectedPeriods)],
                ['Matched', `${windData.coverage.matchedPeriods} / ${windData.coverage.expectedPeriods}`],
                ['Forecast runs used', String(windData.forecastVersionsUsed)],
                ['Units', windData.units],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">{label}:</span>
                  <span className="font-semibold text-slate-700">{value}</span>
                </div>
              ))}
            </div>

            {windData.coverage.coveragePct !== null && windData.coverage.coveragePct < 80 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 text-xs text-amber-700">
                Coverage {windData.coverage.coveragePct}% — {windData.coverage.missingActuals} period(s) missing actuals.
              </div>
            )}

            <SummaryStrip data={windData} />
            <MetricCards metrics={windData.metrics} coverage={windData.coverage} units={windData.units} />

            {/* Key Findings for the Buyer */}
            {windData.metrics.mae !== null && (() => {
              const bias = windData.metrics.bias ?? 0
              const worstBucket = windData.leadTimeBreakdown.reduce((a, b) =>
                (b.mae ?? 0) > (a.mae ?? 0) ? b : a, windData.leadTimeBreakdown[0])
              return (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-base font-semibold text-slate-800 mb-1">Key Findings for the Buyer</h2>
                  <p className="text-xs text-slate-400 mb-4">
                    Derived from WINDFOR forecasts vs FUELHH actuals · January 2026 analysis period
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className={`rounded-xl p-4 border ${bias > 0 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Systematic Bias</p>
                      <p className={`text-lg font-bold ${bias > 0 ? 'text-amber-700' : 'text-blue-700'}`}>
                        {bias > 0 ? 'Over-forecast' : 'Under-forecast'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {bias > 0
                          ? `Wind was forecast ${Math.abs(bias).toLocaleString()} MW higher than actual on average. Traders systematically over-estimated available wind.`
                          : `Wind was forecast ${Math.abs(bias).toLocaleString()} MW lower than actual on average. Traders under-estimated available wind.`}
                      </p>
                    </div>
                    <div className="rounded-xl p-4 border bg-red-50 border-red-200">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Largest Error</p>
                      <p className="text-lg font-bold text-red-700">
                        {windData.worstAbsErrorMW !== null ? `${windData.worstAbsErrorMW.toLocaleString()} MW` : '—'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Peak single-period absolute error
                        {windData.worstAbsErrorTime ? ` at ${new Date(windData.worstAbsErrorTime).toUTCString().slice(5, 22)} UTC` : ''}.
                        This period required the largest balancing adjustment.
                      </p>
                    </div>
                    <div className="rounded-xl p-4 border bg-purple-50 border-purple-200">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Highest-Risk Lead Time</p>
                      <p className="text-lg font-bold text-purple-700">{worstBucket?.label ?? '—'}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        MAE {worstBucket?.mae?.toLocaleString() ?? '—'} MW in this window.
                        Forecast accuracy deteriorates most at this horizon — apply wider procurement margins.
                      </p>
                    </div>
                    <div className="rounded-xl p-4 border bg-emerald-50 border-emerald-200">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Capacity Factor</p>
                      <p className="text-lg font-bold text-emerald-700">
                        {windData.capacityFactorPct !== null ? `${windData.capacityFactorPct.toFixed(1)}%` : '—'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Of assumed 30 GW installed GB wind capacity.
                        {(windData.capacityFactorPct ?? 0) < 30
                          ? ' Low output day — wind contribution to supply was below average.'
                          : ' Wind contributed meaningfully to supply on this day.'}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2"><ForecastChart periods={windData.periods} units={windData.units} /></div>
              <div className="lg:col-span-1"><ErrorChart periods={windData.periods} units={windData.units} /></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <LeadTimeChart buckets={windData.leadTimeBreakdown} />
              <ErrorHistogram periods={windData.periods} />
            </div>

            <TrendChart defaultCutoff={cutoffTime} />
            <PeriodTable periods={windData.periods} units={windData.units} />
          </>
        )}

        {/* ── PROCUREMENT TAB ── */}
        {tab === 'procurement' && procData && !loading && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-6 py-3 flex flex-wrap gap-x-8 gap-y-2">
              {[
                ['Decision date', procData.decisionDate],
                ['Cutoff (UTC)', procData.decisionCutoff.replace('T', ' ').replace('Z', '')],
                ['Matched periods', String(procData.procurementMetrics.matchedPeriods)],
                ['Units', procData.units],
                ['Dataset', 'WINDFOR + FUELHH (wind only)'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">{label}:</span>
                  <span className="font-semibold text-slate-700">{value}</span>
                </div>
              ))}
            </div>
            <ProcurementView data={procData} />
          </>
        )}

        {/* ── DOCS TAB ── */}
        {tab === 'docs' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden" style={{ height: 'calc(100vh - 180px)', minHeight: '600px' }}>
            <iframe
              src="/docs.html"
              title="Documentation"
              className="w-full h-full border-0"
              style={{ display: 'block' }}
            />
          </div>
        )}

        {/* Empty state */}
        {!currentData && !loading && !error && tab !== 'docs' && (
          <div className="bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center py-28 gap-3">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-3xl">
              {tab === 'wind' ? '🌬️' : '⚡'}
            </div>
            <p className="text-slate-700 font-semibold">
              {tab === 'wind' ? 'Select a date and click Fetch Data' : 'Switch to this tab to load procurement analysis'}
            </p>
            <p className="text-slate-400 text-sm">Data pulled live from Elexon BMRS</p>
          </div>
        )}

        <footer className="text-center text-xs text-slate-400 pb-4">
          Elexon BMRS: WINDFOR · FUELHH (WIND) · 30-min resolution · All times UTC · Wind capacity assumed 30 GW (not from Elexon)
        </footer>
      </main>
    </div>
  )
}
