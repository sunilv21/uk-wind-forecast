"""
Accuracy metrics for 30-minute wind forecast/actual pairs.

All metrics exclude unmatched records (missing actuals are never filled with zero).
Coverage reports matched vs expected half-hourly periods.
"""

import logging
import numpy as np
from typing import Optional
from app.schemas import PeriodResult, MetricsResult, CoverageResult, LeadTimeBucket

logger = logging.getLogger(__name__)

LEAD_BUCKETS = [
    ("0–12 h", 0, 12),
    ("12–24 h", 12, 24),
    ("24–36 h", 24, 36),
    ("36–48 h", 36, 48),
]

EXPECTED_PERIODS_PER_DAY = 48  # 30-min resolution → 48 periods in 24 h


def _metrics_from_periods(periods: list[PeriodResult]) -> MetricsResult:
    """Compute MAE, RMSE, Bias, WAPE from matched periods (excludes missing actuals)."""
    valid = [p for p in periods if p.error is not None and p.actualGeneration is not None]
    if not valid:
        return MetricsResult(mae=None, rmse=None, bias=None, wape=None)

    errors = np.array([p.error for p in valid], dtype=float)
    actuals = np.array([p.actualGeneration for p in valid], dtype=float)

    mae = float(np.mean(np.abs(errors)))
    rmse = float(np.sqrt(np.mean(errors ** 2)))
    bias = float(np.mean(errors))

    actual_total = float(np.sum(np.abs(actuals)))
    wape = float(np.sum(np.abs(errors)) / actual_total * 100) if actual_total > 0 else None

    return MetricsResult(
        mae=round(mae, 2),
        rmse=round(rmse, 2),
        bias=round(bias, 2),
        wape=round(wape, 2) if wape is not None else None,
    )


def compute_metrics(periods: list[PeriodResult]) -> MetricsResult:
    return _metrics_from_periods(periods)


_VALID_STATUSES = frozenset({"matched", "missing_actual", "missing_forecast", "missing_both"})


def compute_coverage(
    periods: list[PeriodResult],
    total_forecast_periods: int,
    expected_periods: int = EXPECTED_PERIODS_PER_DAY,
) -> CoverageResult:
    """
    Compute coverage from the four mutually exclusive delivery-period statuses.

    Invariant: matched + missingActuals + missingForecasts + missingBoth == expectedPeriods

    All four counts come exclusively from the `status` field.  `total_forecast_periods`
    is accepted for backward-compatibility; the authoritative value is derived here as
    matched + missingActuals (all periods that carry a forecast).

    Any periods whose status is not one of the four recognised values are counted in
    `unclassifiedPeriods` and excluded from the four main categories.  In normal
    operation this is always 0 because PeriodResult.status is typed as a Pydantic
    Literal and rejects unknown values at construction time.

    If the classified total does not equal expected_periods a warning is logged and
    the `unclassifiedPeriods` field in the returned CoverageResult is set to the
    absolute difference so callers can detect inconsistency from the API response
    rather than only from server logs.
    """
    matched = sum(1 for p in periods if p.status == "matched")
    missing_actuals = sum(1 for p in periods if p.status == "missing_actual")
    missing_forecasts = sum(1 for p in periods if p.status == "missing_forecast")
    missing_both = sum(1 for p in periods if p.status == "missing_both")

    # Belt-and-suspenders: count any status that slipped past Pydantic validation.
    unclassified = sum(1 for p in periods if p.status not in _VALID_STATUSES)
    if unclassified:
        logger.error(
            "compute_coverage: %d period(s) with unrecognised status values — "
            "they are excluded from coverage counts.",
            unclassified,
        )

    classified = matched + missing_actuals + missing_forecasts + missing_both
    if classified != expected_periods:
        logger.warning(
            "Coverage period count mismatch: classified %d (%d+%d+%d+%d) ≠ expected %d. "
            "Periods outside the delivery window are not counted.",
            classified, matched, missing_actuals, missing_forecasts, missing_both,
            expected_periods,
        )

    # Surface the discrepancy in the API response — callers must not have to rely
    # solely on server logs to detect inconsistent coverage.
    visible_mismatch = unclassified + abs(classified - expected_periods)

    coverage_pct = round(matched / expected_periods * 100, 1) if expected_periods > 0 else None

    return CoverageResult(
        totalForecastPeriods=matched + missing_actuals,
        expectedPeriods=expected_periods,
        matchedPeriods=matched,
        missingActuals=missing_actuals,
        missingForecasts=missing_forecasts,
        missingBoth=missing_both,
        unclassifiedPeriods=visible_mismatch,
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
        # Count only matched periods (those used in metric calculations)
        matched_subset = [p for p in subset if p.error is not None and p.actualGeneration is not None]
        m = _metrics_from_periods(subset)
        buckets.append(LeadTimeBucket(
            label=label,
            minHours=lo,
            maxHours=hi,
            mae=m.mae,
            rmse=m.rmse,
            bias=m.bias,
            periods=len(matched_subset),
        ))
    return buckets
