"""Tests for forecast selection logic (Stage 1 + 2 of assignment review)."""

from datetime import datetime, timezone
from app.services.forecast_selection import select_latest_forecasts, index_actuals, build_periods

CUTOFF = datetime(2026, 1, 15, 10, 0, 0, tzinfo=timezone.utc)


def dt(h: int, m: int = 0, day: int = 15) -> datetime:
    return datetime(2026, 1, day, h, m, 0, tzinfo=timezone.utc)


# ── select_latest_forecasts ──────────────────────────────────────────────────

def test_forecast_before_cutoff_is_selected():
    forecasts = [{"startTime": dt(14), "publishTime": dt(8), "generation": 5000.0}]
    result = select_latest_forecasts(forecasts, CUTOFF)
    assert dt(14) in result
    assert result[dt(14)]["generation"] == 5000.0


def test_forecast_after_cutoff_is_rejected():
    forecasts = [{"startTime": dt(14), "publishTime": dt(11), "generation": 5000.0}]
    result = select_latest_forecasts(forecasts, CUTOFF)
    assert result == {}


def test_latest_eligible_version_is_selected():
    """Of multiple eligible versions, the latest publishTime wins."""
    forecasts = [
        {"startTime": dt(14), "publishTime": dt(8, 0),  "generation": 4000.0},
        {"startTime": dt(14), "publishTime": dt(8, 30), "generation": 4500.0},  # latest
        {"startTime": dt(14), "publishTime": dt(9, 30), "generation": 4800.0},
        {"startTime": dt(14), "publishTime": dt(10, 15), "generation": 5000.0},  # after cutoff → rejected
    ]
    result = select_latest_forecasts(forecasts, CUTOFF)
    assert result[dt(14)]["generation"] == 4800.0  # 09:30 — latest before cutoff


def test_different_periods_can_have_different_versions():
    """Each delivery period independently picks its latest eligible forecast."""
    forecasts = [
        {"startTime": dt(12, 0), "publishTime": dt(8, 0),  "generation": 3000.0},
        {"startTime": dt(12, 0), "publishTime": dt(9, 0),  "generation": 3200.0},  # latest for 12:00
        {"startTime": dt(12, 30), "publishTime": dt(7, 0),  "generation": 3100.0},  # only version for 12:30
        {"startTime": dt(12, 30), "publishTime": dt(10, 30), "generation": 3500.0},  # rejected
    ]
    result = select_latest_forecasts(forecasts, CUTOFF)
    assert result[dt(12, 0)]["generation"] == 3200.0
    assert result[dt(12, 30)]["generation"] == 3100.0


def test_no_duplicate_delivery_periods():
    """Result has exactly one forecast per startTime."""
    forecasts = [
        {"startTime": dt(14), "publishTime": dt(7), "generation": 4000.0},
        {"startTime": dt(14), "publishTime": dt(9), "generation": 4500.0},
    ]
    result = select_latest_forecasts(forecasts, CUTOFF)
    assert len(result) == 1


# ── index_actuals ────────────────────────────────────────────────────────────

def test_index_actuals_preserves_30min_timestamps():
    actuals = [
        {"startTime": dt(0, 0, 16), "generation": 5000.0},
        {"startTime": dt(0, 30, 16), "generation": 5200.0},
        {"startTime": dt(1, 0, 16), "generation": 5100.0},
    ]
    idx = index_actuals(actuals)
    assert dt(0, 0, 16) in idx
    assert dt(0, 30, 16) in idx
    assert idx[dt(0, 30, 16)] == 5200.0


def test_30min_actual_not_matched_to_wrong_slot():
    """A 00:30 actual must not match a 00:00 forecast."""
    actuals = [{"startTime": dt(0, 30, 16), "generation": 5000.0}]
    idx = index_actuals(actuals)
    assert dt(0, 0, 16) not in idx  # no 00:00 key
    assert dt(0, 30, 16) in idx     # only 00:30


# ── build_periods ────────────────────────────────────────────────────────────

def test_build_periods_matched():
    selected = {dt(14, 0, 16): {"publishTime": dt(9), "generation": 5000.0}}
    actuals = {dt(14, 0, 16): 4800.0}
    periods = build_periods(selected, actuals, CUTOFF)
    assert len(periods) == 1
    p = periods[0]
    assert p.forecastGeneration == 5000.0
    assert p.actualGeneration == 4800.0
    assert p.error == 200.0      # overforecast
    assert p.absoluteError == 200.0


def test_build_periods_missing_actual():
    selected = {dt(14, 0, 16): {"publishTime": dt(9), "generation": 5000.0}}
    periods = build_periods(selected, {}, CUTOFF)
    p = periods[0]
    assert p.actualGeneration is None
    assert p.error is None


def test_lead_hours_correct():
    # Delivery at 16 Jan 00:00, selected forecast publishTime at 15 Jan 09:00
    # lead = (delivery - publishTime) = 15 h
    delivery = datetime(2026, 1, 16, 0, 0, 0, tzinfo=timezone.utc)
    selected = {delivery: {"publishTime": dt(9), "generation": 5000.0}}
    actuals = {delivery: 4800.0}
    periods = build_periods(selected, actuals, CUTOFF)
    assert periods[0].leadHours == 15.0  # delivery - publishTime (not cutoff)


def test_48_periods_full_day():
    """A full delivery day should produce 48 half-hourly periods."""
    from datetime import timedelta
    base = datetime(2026, 1, 16, 0, 0, 0, tzinfo=timezone.utc)
    selected = {
        base + timedelta(minutes=30 * i): {"publishTime": dt(9), "generation": 5000.0}
        for i in range(48)
    }
    actuals = {ts: 4800.0 for ts in selected}
    periods = build_periods(selected, actuals, CUTOFF)
    assert len(periods) == 48
    matched = [p for p in periods if p.error is not None]
    assert len(matched) == 48


def test_january_31_to_feb_1():
    """Delivery on Feb 1 when decision is Jan 31 — timestamps must cross month boundary."""
    cutoff_jan31 = datetime(2026, 1, 31, 10, 0, 0, tzinfo=timezone.utc)
    delivery_feb1 = datetime(2026, 2, 1, 0, 0, 0, tzinfo=timezone.utc)
    selected = {delivery_feb1: {"publishTime": datetime(2026, 1, 31, 9, 0, 0, tzinfo=timezone.utc), "generation": 6000.0}}
    actuals = {delivery_feb1: 5800.0}
    periods = build_periods(selected, actuals, cutoff_jan31)
    assert len(periods) == 1
    assert periods[0].error == 200.0


# ── Duplicate publishTime handling ───────────────────────────────────────────

def test_duplicate_publish_time_higher_generation_wins():
    """Tie on publishTime → higher generation value wins (deterministic)."""
    forecasts = [
        {"startTime": dt(14), "publishTime": dt(9), "generation": 4500.0},
        {"startTime": dt(14), "publishTime": dt(9), "generation": 5000.0},  # same publish, higher gen
    ]
    result = select_latest_forecasts(forecasts, CUTOFF)
    assert result[dt(14)]["generation"] == 5000.0


def test_out_of_order_records_selects_latest():
    """Records delivered in reverse chronological order still select correctly."""
    forecasts = [
        {"startTime": dt(14), "publishTime": dt(9, 30), "generation": 4800.0},  # later, presented first
        {"startTime": dt(14), "publishTime": dt(8, 0),  "generation": 4000.0},
    ]
    result = select_latest_forecasts(forecasts, CUTOFF)
    assert result[dt(14)]["generation"] == 4800.0


# ── Status field ─────────────────────────────────────────────────────────────

def test_status_matched():
    selected = {dt(14, 0, 16): {"publishTime": dt(9), "generation": 5000.0}}
    actuals = {dt(14, 0, 16): 4800.0}
    periods = build_periods(selected, actuals, CUTOFF)
    assert periods[0].status == "matched"


def test_status_missing_actual():
    selected = {dt(14, 0, 16): {"publishTime": dt(9), "generation": 5000.0}}
    periods = build_periods(selected, {}, CUTOFF)
    assert periods[0].status == "missing_actual"


def test_status_missing_forecast_with_delivery_start():
    from datetime import timedelta
    delivery_start = datetime(2026, 1, 16, 0, 0, 0, tzinfo=timezone.utc)
    # Only forecast period 1 (00:30), not 00:00
    period_1 = delivery_start + timedelta(minutes=30)
    selected = {period_1: {"publishTime": dt(9), "generation": 5000.0}}
    # Provide an actual for 00:00 but no forecast → status should be missing_forecast
    actuals = {delivery_start: 4800.0, period_1: 4800.0}
    periods = build_periods(selected, actuals, CUTOFF, delivery_start=delivery_start)
    assert len(periods) == 48
    first = next(p for p in periods if p.deliveryTime.endswith("00:00:00Z"))
    assert first.status == "missing_forecast"


def test_status_missing_both():
    from datetime import timedelta
    delivery_start = datetime(2026, 1, 16, 0, 0, 0, tzinfo=timezone.utc)
    # Empty selected and empty actuals
    periods = build_periods({}, {}, CUTOFF, delivery_start=delivery_start)
    assert all(p.status == "missing_both" for p in periods)
    assert len(periods) == 48


# ── generate_delivery_timeline ────────────────────────────────────────────────

def test_generate_delivery_timeline_produces_48():
    from app.services.forecast_selection import generate_delivery_timeline
    from datetime import timedelta
    start = datetime(2026, 1, 16, 0, 0, 0, tzinfo=timezone.utc)
    timeline = generate_delivery_timeline(start)
    assert len(timeline) == 48
    assert timeline[0] == start
    assert timeline[-1] == start + timedelta(hours=23, minutes=30)
    # All 30-min gaps
    for i in range(1, len(timeline)):
        assert (timeline[i] - timeline[i - 1]).total_seconds() == 1800
