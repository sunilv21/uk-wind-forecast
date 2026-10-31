import type { MetricsResult, CoverageResult } from '../types/api'

interface Props {
  metrics: MetricsResult
  coverage: CoverageResult
  units: string
}

function fmt(v: number | null, decimals = 0): string {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

interface CardProps {
  label: string
  value: string
  sub: string
  tag?: string
  tagColor?: string
  borderColor: string
  iconBg: string
  icon: React.ReactNode
}

function Card({ label, value, sub, tag, tagColor, borderColor, iconBg, icon }: CardProps) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col gap-3 border-t-4 ${borderColor}`}>
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
        {tag && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tagColor}`}>
            {tag}
          </span>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
        <p className="text-2xl font-bold text-slate-800 leading-none">{value}</p>
        <p className="text-xs text-slate-400 mt-1">{sub}</p>
      </div>
    </div>
  )
}

export default function MetricCards({ metrics, coverage, units }: Props) {
  const biasSign = metrics.bias !== null && metrics.bias > 0 ? '+' : ''
  const biasTag =
    metrics.bias === null ? undefined :
    metrics.bias > 100 ? 'Over-forecast' :
    metrics.bias < -100 ? 'Under-forecast' : 'Near-neutral'
  const biasTagColor =
    metrics.bias === null ? '' :
    Math.abs(metrics.bias ?? 0) > 100 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <Card
        label="MAE"
        value={`${fmt(metrics.mae)} ${units}`}
        sub="Mean absolute error"
        borderColor="border-t-blue-500"
        iconBg="bg-blue-50"
        icon={
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        }
      />
      <Card
        label="RMSE"
        value={`${fmt(metrics.rmse)} ${units}`}
        sub="Root mean squared error"
        borderColor="border-t-indigo-500"
        iconBg="bg-indigo-50"
        icon={
          <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        }
      />
      <Card
        label="Bias"
        value={`${biasSign}${fmt(metrics.bias)} ${units}`}
        sub="Mean forecast error"
        tag={biasTag}
        tagColor={biasTagColor}
        borderColor={Math.abs(metrics.bias ?? 0) > 100 ? 'border-t-amber-500' : 'border-t-green-500'}
        iconBg={Math.abs(metrics.bias ?? 0) > 100 ? 'bg-amber-50' : 'bg-green-50'}
        icon={
          <svg className={`w-5 h-5 ${Math.abs(metrics.bias ?? 0) > 100 ? 'text-amber-500' : 'text-green-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        }
      />
      <Card
        label="WAPE"
        value={metrics.wape !== null ? `${fmt(metrics.wape, 2)}%` : '—'}
        sub="Weighted abs % error"
        borderColor="border-t-violet-500"
        iconBg="bg-violet-50"
        icon={
          <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
          </svg>
        }
      />
      <Card
        label="Coverage"
        value={coverage.coveragePct !== null ? `${coverage.coveragePct}%` : '—'}
        sub={`${coverage.matchedPeriods} of ${coverage.totalForecastPeriods} periods matched`}
        tag={coverage.missingActuals > 0 ? `${coverage.missingActuals} missing` : 'Complete'}
        tagColor={coverage.missingActuals > 0 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}
        borderColor={coverage.missingActuals > 0 ? 'border-t-red-400' : 'border-t-emerald-500'}
        iconBg={coverage.missingActuals > 0 ? 'bg-red-50' : 'bg-emerald-50'}
        icon={
          <svg className={`w-5 h-5 ${coverage.missingActuals > 0 ? 'text-red-400' : 'text-emerald-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
    </div>
  )
}
