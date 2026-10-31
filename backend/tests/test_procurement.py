"""Tests for wind-only balancing exposure calculations."""

import pytest
from app.schemas import PeriodResult, ProcurementPeriod
from app.services.procurement import build_procurement_periods, compute_procurement_metrics, PERIOD_HOURS


def make_wind_period(forecast, actual, lead=14.0):
    error = round(forecast - actual, 1) if actual is not None else None
    abs_error = round(abs(error), 1) if error is not None else None
    pct_error = round(100 * error / actual, 2) if (error is not None and actual and actual != 0) else None
    return PeriodResult(
        deliveryTime="2026-01-16T00:00:00Z",
        forecastPublishTime="2026-01-15T09:00:00Z",
        forecastGeneration=forecast,
        actualGeneration=actual,
        error=error,
        absoluteError=abs_error,
        percentageError=pct_error,
        leadHours=lead,
    )


# ── build_procurement_periods ────────────────────────────────────────────────

def test_wind_error_overforecast():
    """Forecast > actual → positive windError (shortfall exposure)."""
    periods = build_procurement_periods([make_wind_period(5000, 4000)])
    assert periods[0].windError == 1000.0


def test_wind_error_underforecast():
    """Forecast < actual → negative windError (surplus exposure)."""
    periods = build_procurement_periods([make_wind_period(4000, 5000)])
    assert periods[0].windError == -1000.0


def test_wind_error_zero_when_perfect():
    periods = build_procurement_periods([make_wind_period(5000, 5000)])
    assert periods[0].windError == 0.0


def test_wind_error_none_when_no_actual():
    periods = build_procurement_periods([make_wind_period(5000, None)])
    assert periods[0].windError is None
    assert periods[0].windErrorAbs is None
    assert periods[0].windErrorPct is None


def test_wind_error_abs_always_positive():
    over = build_procurement_periods([make_wind_period(5000, 4000)])[0]
    under = build_procurement_periods([make_wind_period(4000, 5000)])[0]
    assert over.windErrorAbs == 1000.0
    assert under.windErrorAbs == 1000.0


def test_no_ndf_or_demand_fields():
    """ProcurementPeriod must not expose demand-side fields."""
    period = build_procurement_periods([make_wind_period(5000, 4000)])[0]
    assert not hasattr(period, 'ndf')
    assert not hasattr(period, 'demand')
    assert not hasattr(period, 'totalGeneration')


# ── compute_procurement_metrics ──────────────────────────────────────────────

def test_overforecast_mwh_uses_half_hour_factor():
    """Energy = MW × 0.5 h per 30-min period."""
    # 1 period, windError = +1000 MW → overforecastMWh = 1000 × 0.5 = 500 MWh
    periods = build_procurement_periods([make_wind_period(5000, 4000)])
    m = compute_procurement_metrics(periods)
    assert m.overforecastMWh == pytest.approx(500.0, abs=0.1)
    assert m.underforecastMWh == pytest.approx(0.0, abs=0.1)


def test_underforecast_mwh_uses_half_hour_factor():
    # 1 period, windError = -1000 MW → underforecastMWh = 1000 × 0.5 = 500 MWh
    periods = build_procurement_periods([make_wind_period(4000, 5000)])
    m = compute_procurement_metrics(periods)
    assert m.underforecastMWh == pytest.approx(500.0, abs=0.1)
    assert m.overforecastMWh == pytest.approx(0.0, abs=0.1)


def test_mixed_over_and_underforecast():
    raw = [make_wind_period(5000, 4000), make_wind_period(4000, 5000)]  # +1000, -1000
    periods = build_procurement_periods(raw)
    m = compute_procurement_metrics(periods)
    assert m.overforecastMWh == pytest.approx(500.0, abs=0.1)
    assert m.underforecastMWh == pytest.approx(500.0, abs=0.1)
    assert m.bias == pytest.approx(0.0, abs=0.01)   # symmetric: no systematic bias


def test_mae_is_wind_only():
    """MAE is based only on wind error, no demand terms."""
    raw = [make_wind_period(5000, 4000), make_wind_period(3000, 4000)]  # +1000, -1000
    periods = build_procurement_periods(raw)
    m = compute_procurement_metrics(periods)
    assert m.mae == 1000.0


def test_metrics_empty_returns_none():
    m = compute_procurement_metrics([])
    assert m.mae is None
    assert m.overforecastMWh is None
    assert m.matchedPeriods == 0


def test_period_hours_constant_is_half():
    """Verify the energy conversion constant is 0.5 h (30-min period)."""
    assert PERIOD_HOURS == 0.5
