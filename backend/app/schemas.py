from pydantic import BaseModel
from typing import Optional


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


class MetricsResult(BaseModel):
    mae: Optional[float]
    rmse: Optional[float]
    bias: Optional[float]
    wape: Optional[float]


class CoverageResult(BaseModel):
    totalForecastPeriods: int
    matchedPeriods: int
    missingActuals: int
    missingForecasts: int
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
    units: str
    granularity: str
    forecastVersionsUsed: int
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
    demandForecast: Optional[float]
    actualDemand: Optional[float]
    windForecast: Optional[float]
    actualWind: Optional[float]
    residualForecast: Optional[float]
    residualActual: Optional[float]
    procurementGapError: Optional[float]
    procurementGapAbs: Optional[float]
    procurementGapPct: Optional[float]


class ProcurementMetrics(BaseModel):
    mae: Optional[float]
    rmse: Optional[float]
    bias: Optional[float]
    wape: Optional[float]
    matchedPeriods: int


class ProcurementResponse(BaseModel):
    decisionDate: str
    decisionCutoff: str
    units: str
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
