import type { AnalysisResponse } from '../types/api'

interface Props {
  data: AnalysisResponse
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getUTCDate()).padStart(2, '0')} ${d.toLocaleString('en', { month: 'short' })} ${String(d.getUTCHours()).padStart(2, '0')}:00 UTC`
}

interface HighlightProps {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  bg: string
  iconColor: string
}

function Highlight({ icon, label, value, sub, bg, iconColor }: HighlightProps) {
  return (
    <div className={`${bg} rounded-2xl px-5 py-4 flex items-start gap-4`}>
      <div className={`mt-0.5 ${iconColor}`}>{icon}</div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-800 mt-0.5">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

export default function SummaryStrip({ data }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Highlight
        label="Peak Actual Generation"
        value={data.peakActualMW !== null ? `${data.peakActualMW.toLocaleString()} MW` : '—'}
        sub={fmtTime(data.peakActualTime)}
        bg="bg-emerald-50 border border-emerald-100"
        iconColor="text-emerald-500"
        icon={
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
          </svg>
        }
      />
      <Highlight
        label="Worst Error Period"
        value={data.worstAbsErrorMW !== null ? `${data.worstAbsErrorMW.toLocaleString()} MW` : '—'}
        sub={fmtTime(data.worstAbsErrorTime)}
        bg="bg-red-50 border border-red-100"
        iconColor="text-red-400"
        icon={
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        }
      />
      <Highlight
        label="Forecast Versions Used"
        value={String(data.forecastVersionsUsed)}
        sub="WINDFOR runs before cutoff"
        bg="bg-blue-50 border border-blue-100"
        iconColor="text-blue-500"
        icon={
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        }
      />
      <Highlight
        label="Avg Capacity Factor"
        value={data.capacityFactorPct !== null ? `${data.capacityFactorPct}%` : '—'}
        sub="Actual ÷ 30 GW installed"
        bg="bg-violet-50 border border-violet-100"
        iconColor="text-violet-500"
        icon={
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
      />
    </div>
  )
}
