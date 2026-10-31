interface Props {
  decisionDate: string
  cutoffTime: string
  loading: boolean
  onDateChange: (v: string) => void
  onCutoffChange: (v: string) => void
  onSubmit: () => void
}

export default function DateControls({
  decisionDate,
  cutoffTime,
  loading,
  onDateChange,
  onCutoffChange,
  onSubmit,
}: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 px-6 py-5">
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Decision Date
          </label>
          <input
            type="date"
            min="2015-01-01"
            max={new Date().toISOString().slice(0, 10)}
            value={decisionDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-44"
          />
          <span className="text-xs text-slate-400">Any date from 2015 to today</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Cutoff Time (UTC)
          </label>
          <input
            type="time"
            value={cutoffTime}
            onChange={(e) => onCutoffChange(e.target.value)}
            className="border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-36"
          />
          <span className="text-xs text-slate-400">Latest forecast published before</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-transparent uppercase tracking-wide select-none">
            &nbsp;
          </label>
          <button
            onClick={onSubmit}
            disabled={loading || !decisionDate}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl text-white font-semibold text-sm transition-colors shadow-sm"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Loading…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Fetch Data
              </>
            )}
          </button>
        </div>

        {decisionDate && (
          <div className="ml-auto flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-xs text-blue-700">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Showing forecasts available at <strong className="ml-1">{decisionDate} {cutoffTime} UTC</strong>
          </div>
        )}
      </div>
    </div>
  )
}
