from pydantic import BaseModel
from typing import Literal, Optional

# The four mutually exclusive delivery-period statuses.
# Pydantic enforces this at construction time — any other value raises ValidationError.
PeriodStatus = Literal["matched", "missing_actual", "missing_forecast", "missing_both"]


class ForecastRecord(BaseModel):
    startTime: str
    publishTime: str
    generation: float


class ActualRecord(BaseModel):
    startTime: str
    generation: float


class PeriodResult(BaseModel):
    deliveryTime: str
    forecastPublishTime: Optional[str]
    forecastGeneration: Optional[float]
    actualGeneration: Optional[float]
    error: Optional[float]
    absoluteError: Optional[float]
    percentageError: Optional[float]
    leadHours: Optional[float]
    status: PeriodStatus = "matched"


class MetricsResult(BaseModel):
    mae: Optional[float]
    rmse: Optional[float]
    bias: Optional[float]
    wape: Optional[float]


class CoverageResult(BaseModel):
    totalForecastPeriods: int
    expectedPeriods: int          # 48 for a full delivery day at 30-min resolution
    matchedPeriods: int
    missingActuals: int
    missingForecasts: int
    missingBoth: int = 0          # periods where neither forecast nor actual is available
    # Periods whose status did not fall into any of the four recognised categories
    # (should always be 0 when PeriodStatus Literal validation is active).
    unclassifiedPeriods: int = 0
    coveragePct: Optional[float]


class LeadTimeBucket(BaseModel):
    label: str
    minHours: float
    maxHours: float
    mae: Optional[float]
    rmse: Optional[float]
    bias: Optional[float]
    periods: int


class AnalysisResponse(BaseModel):
    decisionDate: str
    decisionCutoff: str
    deliveryDate: str             # decision_date + 1 day (the day being analysed)
    resolutionMinutes: int        # 30 — half-hourly resolution
    units: str
    forecastVersionsUsed: int     # distinct publishTimes used in selected forecasts
    peakActualMW: Optional[float]
    peakActualTime: Optional[str]
    worstAbsErrorMW: Optional[float]
    worstAbsErrorTime: Optional[str]
    capacityFactorPct: Optional[float]
    metrics: MetricsResult
    coverage: CoverageResult
    leadTimeBreakdown: list[LeadTimeBucket]
    periods: list[PeriodResult]


class ProcurementPeriod(BaseModel):
    deliveryTime: str
    leadHours: Optional[float]
    windForecast: Optional[float]   # WINDFOR — expected wind output at decision cutoff
    actualWind: Optional[float]     # FUELHH (WIND) — measured output
    # positive = over-forecast (wind < forecast → shortfall exposure)
    # negative = under-forecast (wind > forecast → surplus exposure)
    windError: Optional[float]
    windErrorAbs: Optional[float]
    windErrorPct: Optional[float]


class ProcurementMetrics(BaseModel):
    mae: Optional[float]
    rmse: Optional[float]
    bias: Optional[float]
    wape: Optional[float]
    matchedPeriods: int
    overforecastMWh: Optional[float]    # sum of max(0, windError) × 0.5 h
    underforecastMWh: Optional[float]   # sum of max(0, -windError) × 0.5 h


class ProcurementResponse(BaseModel):
    decisionDate: str
    decisionCutoff: str
    units: str
    methodology: str
    procurementMetrics: ProcurementMetrics
    windMetrics: MetricsResult
    periods: list[ProcurementPeriod]


class TrendDay(BaseModel):
    date: str
    mae: Optional[float]
    rmse: Optional[float]
    bias: Optional[float]
    wape: Optional[float]
    matchedPeriods: int
    coveragePct: Optional[float]
    error: Optional[str]


class TrendResponse(BaseModel):
    cutoff: str
    days: list[TrendDay]
