import math
from typing import Optional
from app.schemas import PeriodResult, MetricsResult, CoverageResult, LeadTimeBucket

LEAD_BUCKETS = [
    ("0–24 h", 0, 24),
    ("24–48 h", 24, 48),
    ("48–72 h", 48, 72),
    ("72 h+", 72, float("inf")),
]


def _metrics_from_periods(periods: list[PeriodResult]) -> MetricsResult:
    valid = [p for p in periods if p.error is not None and p.actualGeneration is not None]
    n = len(valid)
    if n == 0:
        return MetricsResult(mae=None, rmse=None, bias=None, wape=None)
    errors = [p.error for p in valid]
    abs_errors = [p.absoluteError for p in valid]
    actuals = [p.actualGeneration for p in valid]
    mae = sum(abs_errors) / n  # type: ignore[arg-type]
    rmse = math.sqrt(sum(e ** 2 for e in errors) / n)  # type: ignore[operator]
    bias = sum(errors) / n  # type: ignore[arg-type]
    denom = sum(abs(a) for a in actuals)  # type: ignore[arg-type]
    wape = (sum(abs_errors) / denom * 100.0) if denom > 0 else None  # type: ignore[operator]
    return MetricsResult(
        mae=round(mae, 1),
        rmse=round(rmse, 1),
        bias=round(bias, 1),
        wape=round(wape, 2) if wape is not None else None,
    )


def compute_metrics(periods: list[PeriodResult]) -> MetricsResult:
    return _metrics_from_periods(periods)


def compute_coverage(periods: list[PeriodResult], total: int) -> CoverageResult:
    matched = sum(1 for p in periods if p.forecastGeneration is not None and p.actualGeneration is not None)
    missing_actuals = sum(1 for p in periods if p.forecastGeneration is not None and p.actualGeneration is None)
    coverage_pct = round(matched / total * 100, 1) if total > 0 else None
    return CoverageResult(
        totalForecastPeriods=total,
        matchedPeriods=matched,
        missingActuals=missing_actuals,
        missingForecasts=total - len(periods),
        coveragePct=coverage_pct,
    )


def compute_lead_time_breakdown(periods: list[PeriodResult]) -> list[LeadTimeBucket]:
    buckets: list[LeadTimeBucket] = []
    for label, lo, hi in LEAD_BUCKETS:
        subset = [
            p for p in periods
            if p.leadHours is not None and lo <= p.leadHours < hi
        ]
        if not subset:
            continue
        m = _metrics_from_periods(subset)
        buckets.append(LeadTimeBucket(
            label=label,
            minHours=lo,
            maxHours=hi if hi != float("inf") else 999,
            mae=m.mae,
            rmse=m.rmse,
            bias=m.bias,
            periods=len(subset),
        ))
    return buckets
