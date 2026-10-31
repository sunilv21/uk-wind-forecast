"""Tests for accuracy metric calculations."""

import pytest
from app.schemas import PeriodResult
from app.services.metrics import compute_metrics, compute_coverage, EXPECTED_PERIODS_PER_DAY


def make_period(forecast, actual, lead=12.0, *, status: str | None = None):
    """
    Build a PeriodResult for testing.

    `status` defaults to "matched" when both forecast and actual are present,
    and "missing_actual" when actual is None.  Pass an explicit `status` to
    override (e.g. "missing_forecast", "missing_both").
    """
    error = round(forecast - actual, 1) if (forecast is not None and actual is not None) else None
    abs_error = round(abs(error), 1) if error is not None else None
    pct_error = round(100 * error / actual, 2) if (error is not None and actual and actual != 0) else None

    if status is None:
        if forecast is not None and actual is not None:
            status = "matched"
        elif forecast is not None and actual is None:
            status = "missing_actual"
        elif forecast is None and actual is not None:
            status = "missing_forecast"
        else:
            status = "missing_both"

    return PeriodResult(
        deliveryTime="2026-01-16T00:00:00Z",
        forecastPublishTime="2026-01-15T09:00:00Z" if forecast is not None else None,
        forecastGeneration=forecast,
        actualGeneration=actual,
        error=error,
        absoluteError=abs_error,
        percentageError=pct_error,
        leadHours=lead,
        status=status,
    )


def test_mae_correct():
    periods = [make_period(5000, 4000), make_period(3000, 4000)]  # errors: +1000, -1000
    m = compute_metrics(periods)
    assert m.mae == 1000.0


def test_rmse_correct():
    periods = [make_period(5000, 4000), make_period(3000, 4000)]  # errors: +1000, -1000
    m = compute_metrics(periods)
    assert m.rmse == 1000.0


def test_bias_positive_means_overforecast():
    periods = [make_period(5000, 4000)]  # forecast > actual → positive bias
    m = compute_metrics(periods)
    assert m.bias > 0


def test_bias_negative_means_underforecast():
    periods = [make_period(3000, 4000)]  # forecast < actual → negative bias
    m = compute_metrics(periods)
    assert m.bias < 0


def test_wape_calculation():
    # 2 periods: error=1000, actual=4000 → WAPE = 1000/4000 × 100 = 25%
    periods = [make_period(5000, 4000), make_period(4000, 4000)]
    m = compute_metrics(periods)
    assert m.wape == pytest.approx(12.5, abs=0.1)


def test_missing_actuals_excluded_from_metrics():
    periods = [
        make_period(5000, 4000),   # matched
        make_period(5000, None),   # missing actual → excluded
    ]
    m = compute_metrics(periods)
    # Only one matched period, error = 1000
    assert m.mae == 1000.0


def test_empty_periods_returns_none():
    m = compute_metrics([])
    assert m.mae is None
    assert m.rmse is None
    assert m.bias is None
    assert m.wape is None


def test_coverage_48_matched():
    periods = [make_period(5000, 4800) for _ in range(48)]
    cov = compute_coverage(periods, total_forecast_periods=48, expected_periods=48)
    assert cov.matchedPeriods == 48
    assert cov.coveragePct == 100.0


def test_coverage_missing_actuals_reported():
    periods = [make_period(5000, 4800)] * 40 + [make_period(5000, None)] * 8
    cov = compute_coverage(periods, total_forecast_periods=48, expected_periods=48)
    assert cov.matchedPeriods == 40
    assert cov.missingActuals == 8
    assert cov.coveragePct == pytest.approx(83.3, abs=0.1)


def test_coverage_never_exceeds_100():
    periods = [make_period(5000, 4800)] * 48
    cov = compute_coverage(periods, total_forecast_periods=48, expected_periods=48)
    assert cov.coveragePct is not None
    assert cov.coveragePct <= 100.0


def test_coverage_zero_when_all_missing():
    periods = [make_period(5000, None)] * 48
    cov = compute_coverage(periods, total_forecast_periods=48, expected_periods=48)
    assert cov.matchedPeriods == 0
    assert cov.coveragePct == 0.0


def test_wape_safe_when_zero_actual():
    # If all actuals are zero, WAPE should return None (cannot divide by zero)
    periods = [make_period(500, 0)]
    m = compute_metrics(periods)
    assert m.wape is None


def test_lead_time_bucket_uses_matched_only():
    """Lead-time sample count should only reflect matched records."""
    from app.services.metrics import compute_lead_time_breakdown
    matched = [make_period(5000, 4800, lead=6.0)] * 5
    missing = [make_period(5000, None, lead=6.0)] * 3
    breakdown = compute_lead_time_breakdown(matched + missing)
    bucket = next((b for b in breakdown if b.label == "0–12 h"), None)
    assert bucket is not None
    assert bucket.periods == 5  # only matched


# ── Coverage invariant ────────────────────────────────────────────────────────

def test_coverage_four_categories_sum_to_expected():
    """matched + missing_actuals + missing_forecasts + missing_both == expected_periods."""
    matched_p   = [make_period(5000, 4800)] * 20           # status=matched
    no_actual_p = [make_period(5000, None)] * 10           # status=missing_actual
    no_fcast_p  = [make_period(None, 4800, status="missing_forecast")] * 8   # status=missing_forecast
    both_miss_p = [make_period(None, None, status="missing_both")] * 10      # status=missing_both
    # total = 48
    periods = matched_p + no_actual_p + no_fcast_p + both_miss_p
    cov = compute_coverage(periods, total_forecast_periods=30, expected_periods=48)
    assert cov.matchedPeriods == 20
    assert cov.missingActuals == 10
    assert cov.missingForecasts == 8
    assert cov.missingBoth == 10
    assert cov.matchedPeriods + cov.missingActuals + cov.missingForecasts + cov.missingBoth == 48


def test_coverage_total_forecast_periods_derived_from_status():
    """totalForecastPeriods == matched + missingActuals (not the passed-in parameter)."""
    matched_p   = [make_period(5000, 4800)] * 30
    no_actual_p = [make_period(5000, None)] * 5
    no_fcast_p  = [make_period(None, 4800, status="missing_forecast")] * 5
    both_miss_p = [make_period(None, None, status="missing_both")] * 8
    periods = matched_p + no_actual_p + no_fcast_p + both_miss_p
    cov = compute_coverage(periods, total_forecast_periods=99, expected_periods=48)
    # totalForecastPeriods must be derived from status, not from the parameter
    assert cov.totalForecastPeriods == 35  # matched(30) + missing_actual(5)


def test_coverage_missing_both_not_double_counted():
    """
    Before the fix, missing_both periods were counted inside missing_forecasts
    (max(0, expected − total_forecast_periods)) AND in missing_both.
    After the fix the four categories must be mutually exclusive.
    """
    # 10 matched, 38 missing_both → expected sum = 48
    periods = (
        [make_period(5000, 4800)] * 10
        + [make_period(None, None, status="missing_both")] * 38
    )
    cov = compute_coverage(periods, total_forecast_periods=10, expected_periods=48)
    total = cov.matchedPeriods + cov.missingActuals + cov.missingForecasts + cov.missingBoth
    assert total == 48, f"Categories sum to {total}, expected 48"
    assert cov.missingBoth == 38
    assert cov.missingForecasts == 0  # NOT 38 under the old (broken) formula


def test_coverage_missing_forecast_counted_separately_from_missing_both():
    """missing_forecast (has actual, no forecast) is distinct from missing_both."""
    periods = (
        [make_period(5000, 4800)] * 20            # matched
        + [make_period(None, 4800, status="missing_forecast")] * 18  # no forecast, has actual
        + [make_period(None, None, status="missing_both")] * 10       # neither
    )
    cov = compute_coverage(periods, total_forecast_periods=20, expected_periods=48)
    assert cov.matchedPeriods == 20
    assert cov.missingForecasts == 18
    assert cov.missingBoth == 10
    assert cov.missingActuals == 0
    total = cov.matchedPeriods + cov.missingActuals + cov.missingForecasts + cov.missingBoth
    assert total == 48


# ── Validated status type ─────────────────────────────────────────────────────

def test_invalid_status_raises_validation_error():
    """PeriodResult rejects unknown status values at construction time."""
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        PeriodResult(
            deliveryTime="2026-01-16T00:00:00Z",
            forecastPublishTime=None,
            forecastGeneration=5000.0,
            actualGeneration=4800.0,
            error=200.0,
            absoluteError=200.0,
            percentageError=4.17,
            leadHours=14.0,
            status="unknown_status",  # not a valid PeriodStatus
        )


def test_all_four_valid_statuses_accepted():
    """All four recognised statuses must be accepted without error."""
    from app.schemas import PeriodStatus
    for s in ("matched", "missing_actual", "missing_forecast", "missing_both"):
        p = PeriodResult(
            deliveryTime="2026-01-16T00:00:00Z",
            forecastPublishTime=None,
            forecastGeneration=None,
            actualGeneration=None,
            error=None,
            absoluteError=None,
            percentageError=None,
            leadHours=None,
            status=s,  # type: ignore[arg-type]
        )
        assert p.status == s


def test_coverage_unclassified_periods_zero_for_clean_data():
    """unclassifiedPeriods is 0 when all periods carry a valid status and sum to expected."""
    periods = (
        [make_period(5000, 4800)] * 24
        + [make_period(5000, None)] * 12
        + [make_period(None, 4800, status="missing_forecast")] * 6
        + [make_period(None, None, status="missing_both")] * 6
    )
    cov = compute_coverage(periods, total_forecast_periods=36, expected_periods=48)
    assert cov.unclassifiedPeriods == 0


def test_coverage_unclassified_periods_nonzero_when_count_mismatch():
    """unclassifiedPeriods is nonzero when the period list is shorter than expected."""
    # Only 40 periods supplied; expected is 48 → discrepancy of 8
    periods = [make_period(5000, 4800)] * 40
    cov = compute_coverage(periods, total_forecast_periods=40, expected_periods=48)
    assert cov.unclassifiedPeriods == 8  # 48 − 40


# ── index_actuals revision handling ──────────────────────────────────────────

def test_index_actuals_duplicate_latest_publishtime_wins():
    """When two records share a startTime, the one with the later publishTime is kept."""
    from datetime import timezone
    from app.services.forecast_selection import index_actuals

    base = __import__("datetime").datetime(2026, 1, 16, 0, 0, 0, tzinfo=timezone.utc)
    pub_early = __import__("datetime").datetime(2026, 1, 16, 1, 0, 0, tzinfo=timezone.utc)
    pub_late  = __import__("datetime").datetime(2026, 1, 16, 2, 0, 0, tzinfo=timezone.utc)

    records = [
        {"startTime": base, "generation": 4000.0, "publishTime": pub_early},
        {"startTime": base, "generation": 4800.0, "publishTime": pub_late},  # newer revision
    ]
    idx = index_actuals(records)
    assert idx[base] == 4800.0  # latest publishTime wins


def test_index_actuals_equal_publishtime_keeps_first_seen():
    """When two records share both startTime and publishTime, source order decides (first kept)."""
    from datetime import timezone
    from app.services.forecast_selection import index_actuals

    base = __import__("datetime").datetime(2026, 1, 16, 0, 30, 0, tzinfo=timezone.utc)
    pub  = __import__("datetime").datetime(2026, 1, 16, 1, 0,  0, tzinfo=timezone.utc)

    records = [
        {"startTime": base, "generation": 5000.0, "publishTime": pub},
        {"startTime": base, "generation": 9999.0, "publishTime": pub},  # same publish time
    ]
    idx = index_actuals(records)
    assert idx[base] == 5000.0  # first-seen wins on equal publishTime


def test_index_actuals_missing_publishtime_uses_source_order():
    """Records without publishTime are accepted; first-seen is kept when both lack it."""
    from datetime import timezone
    from app.services.forecast_selection import index_actuals

    base = __import__("datetime").datetime(2026, 1, 16, 1, 0, 0, tzinfo=timezone.utc)
    records = [
        {"startTime": base, "generation": 3000.0},  # no publishTime
        {"startTime": base, "generation": 9999.0},  # no publishTime
    ]
    idx = index_actuals(records)
    assert idx[base] == 3000.0  # first-seen kept (both lack publishTime)


def test_index_actuals_publishtime_preferred_over_no_publishtime():
    """A record with publishTime wins over one without, regardless of source order."""
    from datetime import timezone
    from app.services.forecast_selection import index_actuals

    base = __import__("datetime").datetime(2026, 1, 16, 2, 0, 0, tzinfo=timezone.utc)
    pub  = __import__("datetime").datetime(2026, 1, 16, 3, 0, 0, tzinfo=timezone.utc)

    records = [
        {"startTime": base, "generation": 3000.0},         # no publishTime (first-seen)
        {"startTime": base, "generation": 5500.0, "publishTime": pub},  # has publishTime
    ]
    idx = index_actuals(records)
    assert idx[base] == 5500.0  # publishTime present → wins over missing-publishTime


def test_index_actuals_skips_record_missing_required_fields():
    """Records missing startTime or generation are skipped; valid records are unaffected."""
    from datetime import timezone
    from app.services.forecast_selection import index_actuals

    base = __import__("datetime").datetime(2026, 1, 16, 4, 0, 0, tzinfo=timezone.utc)
    records = [
        {"generation": 4000.0},                   # missing startTime
        {"startTime": base},                       # missing generation
        {"startTime": base, "generation": 5000.0}, # valid
    ]
    idx = index_actuals(records)
    assert idx[base] == 5000.0
    assert len(idx) == 1
