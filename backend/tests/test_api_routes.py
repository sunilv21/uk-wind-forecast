"""Tests for API route contract: response shape, validation, day-ahead logic."""

import pytest
from datetime import date, timedelta
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


# ── /health ──────────────────────────────────────────────────────────────────

def test_health_returns_status():
    with patch("app.api.routes.fetch_windfor", new_callable=AsyncMock) as mock_wf:
        mock_wf.return_value = []
        # health checks upstream — just ensure it returns a status key
        import httpx
        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__ = AsyncMock(
                return_value=type("R", (), {"status_code": 200})()
            )
            mock_client.return_value.__aexit__ = AsyncMock(return_value=None)
            r = client.get("/api/health")
    assert r.status_code == 200
    assert "status" in r.json()


# ── /analysis validation ──────────────────────────────────────────────────────

def test_analysis_missing_date_returns_422():
    r = client.get("/api/analysis")
    assert r.status_code == 422


def test_analysis_future_date_returns_400():
    future = (date.today() + timedelta(days=1)).isoformat()
    r = client.get(f"/api/analysis?decision_date={future}&cutoff_time=10:00")
    assert r.status_code == 400


def test_analysis_invalid_cutoff_returns_400():
    r = client.get("/api/analysis?decision_date=2026-01-15&cutoff_time=99:99")
    assert r.status_code == 400


# ── /analysis response shape ──────────────────────────────────────────────────

MOCK_FORECAST = [
    {
        "startTime": __import__("datetime").datetime(2026, 1, 16, 0, 0, 0,
                                                     tzinfo=__import__("datetime").timezone.utc),
        "publishTime": __import__("datetime").datetime(2026, 1, 15, 9, 0, 0,
                                                       tzinfo=__import__("datetime").timezone.utc),
        "generation": 5000.0,
    }
]
MOCK_ACTUAL = [
    {
        "startTime": __import__("datetime").datetime(2026, 1, 16, 0, 0, 0,
                                                     tzinfo=__import__("datetime").timezone.utc),
        "generation": 4800.0,
    }
]


def test_analysis_response_has_delivery_date():
    with (
        patch("app.api.routes.fetch_windfor", new_callable=AsyncMock, return_value=MOCK_FORECAST),
        patch("app.api.routes.fetch_fuelhh", new_callable=AsyncMock, return_value=MOCK_ACTUAL),
    ):
        r = client.get("/api/analysis?decision_date=2026-01-15&cutoff_time=10:00")
    assert r.status_code == 200
    body = r.json()
    assert "deliveryDate" in body
    assert body["deliveryDate"] == "2026-01-16"   # decision + 1 day


def test_analysis_response_has_resolution_30():
    with (
        patch("app.api.routes.fetch_windfor", new_callable=AsyncMock, return_value=MOCK_FORECAST),
        patch("app.api.routes.fetch_fuelhh", new_callable=AsyncMock, return_value=MOCK_ACTUAL),
    ):
        r = client.get("/api/analysis?decision_date=2026-01-15&cutoff_time=10:00")
    assert r.json()["resolutionMinutes"] == 30


def test_analysis_coverage_has_expected_periods():
    with (
        patch("app.api.routes.fetch_windfor", new_callable=AsyncMock, return_value=MOCK_FORECAST),
        patch("app.api.routes.fetch_fuelhh", new_callable=AsyncMock, return_value=MOCK_ACTUAL),
    ):
        r = client.get("/api/analysis?decision_date=2026-01-15&cutoff_time=10:00")
    body = r.json()
    assert "coverage" in body
    assert "expectedPeriods" in body["coverage"]
    assert body["coverage"]["expectedPeriods"] == 48


def test_analysis_delivery_date_is_next_day():
    """delivery_date must always be decision_date + 1."""
    with (
        patch("app.api.routes.fetch_windfor", new_callable=AsyncMock, return_value=MOCK_FORECAST),
        patch("app.api.routes.fetch_fuelhh", new_callable=AsyncMock, return_value=MOCK_ACTUAL),
    ):
        r = client.get("/api/analysis?decision_date=2026-01-15&cutoff_time=10:00")
    body = r.json()
    decision = date.fromisoformat(body["decisionDate"])
    delivery = date.fromisoformat(body["deliveryDate"])
    assert (delivery - decision).days == 1


# ── /procurement response shape ───────────────────────────────────────────────

def test_procurement_response_has_methodology():
    with (
        patch("app.api.routes.fetch_windfor", new_callable=AsyncMock, return_value=MOCK_FORECAST),
        patch("app.api.routes.fetch_fuelhh", new_callable=AsyncMock, return_value=MOCK_ACTUAL),
    ):
        r = client.get("/api/procurement?decision_date=2026-01-15&cutoff_time=10:00")
    assert r.status_code == 200
    body = r.json()
    assert "methodology" in body
    assert "WINDFOR" in body["methodology"]
    assert "FUELHH" in body["methodology"]


def test_procurement_metrics_has_mwh_fields():
    with (
        patch("app.api.routes.fetch_windfor", new_callable=AsyncMock, return_value=MOCK_FORECAST),
        patch("app.api.routes.fetch_fuelhh", new_callable=AsyncMock, return_value=MOCK_ACTUAL),
    ):
        r = client.get("/api/procurement?decision_date=2026-01-15&cutoff_time=10:00")
    m = r.json()["procurementMetrics"]
    assert "overforecastMWh" in m
    assert "underforecastMWh" in m


def test_analysis_invalid_date_format_returns_422():
    r = client.get("/api/analysis?decision_date=not-a-date&cutoff_time=10:00")
    assert r.status_code == 422


def test_analysis_invalid_cutoff_hour_returns_400():
    r = client.get("/api/analysis?decision_date=2026-01-15&cutoff_time=25:00")
    assert r.status_code == 400


def test_analysis_invalid_cutoff_minutes_returns_400():
    r = client.get("/api/analysis?decision_date=2026-01-15&cutoff_time=10:60")
    assert r.status_code == 400


def test_analysis_missing_forecast_data_returns_404():
    with (
        patch("app.api.routes.fetch_windfor", new_callable=AsyncMock, return_value=[]),
        patch("app.api.routes.fetch_fuelhh", new_callable=AsyncMock, return_value=[]),
    ):
        r = client.get("/api/analysis?decision_date=2026-01-15&cutoff_time=10:00")
    assert r.status_code == 404


def test_health_upstream_ok_when_200():
    """Health endpoint should report upstream ok for a 200 response."""
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"


def test_procurement_periods_have_wind_only_fields():
    with (
        patch("app.api.routes.fetch_windfor", new_callable=AsyncMock, return_value=MOCK_FORECAST),
        patch("app.api.routes.fetch_fuelhh", new_callable=AsyncMock, return_value=MOCK_ACTUAL),
    ):
        r = client.get("/api/procurement?decision_date=2026-01-15&cutoff_time=10:00")
    periods = r.json()["periods"]
    # Full 48-period timeline always returned; 1 matched, 47 missing
    assert len(periods) == 48
    # The matched period at 00:00 has all wind-only fields
    matched = [p for p in periods if p["windForecast"] is not None]
    assert len(matched) == 1
    p = matched[0]
    assert "windForecast" in p
    assert "actualWind" in p
    assert "windError" in p
    assert "ndf" not in p
    assert "demand" not in p
