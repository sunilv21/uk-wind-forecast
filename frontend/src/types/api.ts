export interface PeriodResult {
  deliveryTime: string
  forecastPublishTime: string | null
  forecastGeneration: number | null
  actualGeneration: number | null
  error: number | null
  absoluteError: number | null
  percentageError: number | null
  leadHours: number | null
}

export interface MetricsResult {
  mae: number | null
  rmse: number | null
  bias: number | null
  wape: number | null
}

export interface CoverageResult {
  totalForecastPeriods: number
  matchedPeriods: number
  missingActuals: number
  missingForecasts: number
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
  units: string
  granularity: string
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
  demandForecast: number | null
  actualDemand: number | null
  windForecast: number | null
  actualWind: number | null
  residualForecast: number | null
  residualActual: number | null
  procurementGapError: number | null
  procurementGapAbs: number | null
  procurementGapPct: number | null
}

export interface ProcurementMetrics {
  mae: number | null
  rmse: number | null
  bias: number | null
  wape: number | null
  matchedPeriods: number
}

export interface ProcurementResponse {
  decisionDate: string
  decisionCutoff: string
  units: string
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
