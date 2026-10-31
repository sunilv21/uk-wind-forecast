export interface PeriodResult {
  deliveryTime: string
  forecastPublishTime: string | null
  forecastGeneration: number | null
  actualGeneration: number | null
  error: number | null
  absoluteError: number | null
  percentageError: number | null
  leadHours: number | null
  status: 'matched' | 'missing_forecast' | 'missing_actual' | 'missing_both'
}

export interface MetricsResult {
  mae: number | null
  rmse: number | null
  bias: number | null
  wape: number | null
}

export interface CoverageResult {
  totalForecastPeriods: number
  expectedPeriods: number      // 48 for a full delivery day at 30-min resolution
  matchedPeriods: number
  missingActuals: number
  missingForecasts: number
  missingBoth: number          // periods with neither forecast nor actual
  coveragePct: number | null
}

export interface LeadTimeBucket {
  label: string
  minHours: number
  maxHours: number
  mae: number | null
  rmse: number | null
  bias: number | null
  periods: number
}

export interface AnalysisResponse {
  decisionDate: string
  decisionCutoff: string
  deliveryDate: string         // decision_date + 1 day
  resolutionMinutes: number    // 30 — half-hourly
  units: string
  forecastVersionsUsed: number
  peakActualMW: number | null
  peakActualTime: string | null
  worstAbsErrorMW: number | null
  worstAbsErrorTime: string | null
  capacityFactorPct: number | null
  metrics: MetricsResult
  coverage: CoverageResult
  leadTimeBreakdown: LeadTimeBucket[]
  periods: PeriodResult[]
}

export interface ProcurementPeriod {
  deliveryTime: string
  leadHours: number | null
  windForecast: number | null   // WINDFOR — expected wind at decision cutoff
  actualWind: number | null     // FUELHH (WIND) — measured output
  windError: number | null      // windForecast − actualWind; positive = shortfall exposure
  windErrorAbs: number | null
  windErrorPct: number | null
}

export interface ProcurementMetrics {
  mae: number | null
  rmse: number | null
  bias: number | null
  wape: number | null
  matchedPeriods: number
  overforecastMWh: number | null    // sum of max(0, windError) × 0.5 h
  underforecastMWh: number | null   // sum of max(0, -windError) × 0.5 h
}

export interface ProcurementResponse {
  decisionDate: string
  decisionCutoff: string
  units: string
  methodology: string
  procurementMetrics: ProcurementMetrics
  windMetrics: MetricsResult
  periods: ProcurementPeriod[]
}

export interface TrendDay {
  date: string
  mae: number | null
  rmse: number | null
  bias: number | null
  wape: number | null
  matchedPeriods: number
  coveragePct: number | null
  error: string | null
}

export interface TrendResponse {
  cutoff: string
  days: TrendDay[]
}
