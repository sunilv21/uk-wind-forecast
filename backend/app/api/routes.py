import asyncio
import logging
from fastapi import APIRouter, HTTPException, Query
from datetime import date, datetime, timezone, timedelta

logger = logging.getLogger(__name__)
from app.schemas import AnalysisResponse, TrendResponse, TrendDay, ProcurementResponse
from app.services.elexon_client import fetch_windfor, fetch_fuelhh
from app.services.forecast_selection import (
    select_latest_forecasts,
    index_actuals,
    build_periods,
    count_forecast_versions_used,
    peak_actual,
    worst_error,
    capacity_factor,
    generate_delivery_timeline,
)
from app.services.metrics import compute_metrics, compute_coverage, compute_lead_time_breakdown, EXPECTED_PERIODS_PER_DAY

router = APIRouter()
MIN_DATE = date(2015, 1, 1)


@router.get("/health")
async def health():
    """
    Application health check.
    Always returns HTTP 200 — Docker health checks must not fail due to Elexon being unavailable.
    Elexon probe is informational only.
    """
    from app.config import ELEXON_BASE_URL
    import httpx, time
    start = time.perf_counter()
    upstream_status = "unknown"
    upstream_latency_ms = None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{ELEXON_BASE_URL}/datasets/WINDFOR", params={"format": "json"})
        upstream_latency_ms = round((time.perf_counter() - start) * 1000, 1)
        # Only 2xx responses from Elexon indicate a healthy upstream
        if 200 <= r.status_code < 300:
            upstream_status = "ok"
        elif r.status_code == 429:
            upstream_status = "rate_limited"
        elif r.status_code >= 500:
            upstream_status = "server_error"
        else:
            upstream_status = f"unexpected_{r.status_code}"
    except Exception as exc:
        upstream_latency_ms = round((time.perf_counter() - start) * 1000, 1)
        upstream_status = "unreachable"
        logger.warning("Elexon health probe failed: %s", exc)

    return {
        "status": "ok",          # application is always healthy if it responds
        "upstream_elexon": upstream_status,
        "upstream_latency_ms": upstream_latency_ms,
    }


async def _analyse(decision_date: date, cutoff_dt: datetime) -> AnalysisResponse:
    """
    Wind forecast accuracy analysis for a day-ahead decision.

    - Decision date:  the day the procurement decision is made
    - Cutoff:         the moment forecasts are locked in (e.g. 10:00 UTC)
    - Delivery date:  decision_date + 1 day (the 48 half-hourly periods being analysed)
    """
    delivery_date = decision_date + timedelta(days=1)
    delivery_start = datetime(
        delivery_date.year, delivery_date.month, delivery_date.day,
        0, 0, 0, tzinfo=timezone.utc,
    )
    delivery_end = delivery_start + timedelta(days=1)

    # Fetch forecasts published in the 3-day window ending at cutoff
    forecast_from = cutoff_dt - timedelta(days=3)
    raw_forecasts = await fetch_windfor(forecast_from, cutoff_dt)
    if not raw_forecasts:
        raise ValueError("No forecast data found for the selected date and cutoff.")

    # Select latest forecast per delivery period, published before cutoff
    all_selected = select_latest_forecasts(raw_forecasts, cutoff_dt)

    # Filter to delivery day only (day-ahead: decision_date + 1)
    selected = {
        ts: fc for ts, fc in all_selected.items()
        if delivery_start <= ts < delivery_end
    }
    if not selected:
        raise ValueError(
            f"No forecasts found for delivery date {delivery_date.isoformat()} "
            f"before cutoff {cutoff_dt.strftime('%H:%M UTC')}."
        )

    versions_used = count_forecast_versions_used(selected)

    # Fetch FUELHH actuals with a wider publishDateTime window to catch late revisions.
    # FUELHH records for the delivery day are published throughout the day; SP48 (23:30)
    # can appear up to several hours after midnight.  We widen to +12 h and then filter
    # in Python so we don't inadvertently include records from the following day.
    raw_actuals = await fetch_fuelhh(delivery_start, delivery_end + timedelta(hours=12))
    delivery_actuals = [r for r in raw_actuals if delivery_start <= r["startTime"] < delivery_end]
    actuals = index_actuals(delivery_actuals)  # exact 30-min startTime matching

    periods = build_periods(selected, actuals, cutoff_dt, delivery_start=delivery_start)
    metrics = compute_metrics(periods)
    coverage = compute_coverage(periods, len(selected), expected_periods=EXPECTED_PERIODS_PER_DAY)
    lead_breakdown = compute_lead_time_breakdown(periods)

    peak_mw, peak_time = peak_actual(periods)
    worst_mw, worst_time = worst_error(periods)
    cf = capacity_factor(periods)

    return AnalysisResponse(
        decisionDate=decision_date.isoformat(),
        decisionCutoff=cutoff_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        deliveryDate=delivery_date.isoformat(),
        resolutionMinutes=30,
        units="MW",
        forecastVersionsUsed=versions_used,
        peakActualMW=peak_mw,
        peakActualTime=peak_time,
        worstAbsErrorMW=worst_mw,
        worstAbsErrorTime=worst_time,
        capacityFactorPct=cf,
        metrics=metrics,
        coverage=coverage,
        leadTimeBreakdown=lead_breakdown,
        periods=periods,
    )


@router.get("/analysis", response_model=AnalysisResponse)
async def analysis(
    decision_date: date = Query(...),
    cutoff_time: str = Query("10:00"),
):
    if decision_date < MIN_DATE:
        raise HTTPException(400, "decision_date must be 2015-01-01 or later")
    if decision_date > date.today():
        raise HTTPException(400, "decision_date cannot be in the future")
    try:
        parts = cutoff_time.split(":")
        if len(parts) != 2:
            raise ValueError
        h, m = int(parts[0]), int(parts[1])
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError
        cutoff_dt = datetime(decision_date.year, decision_date.month, decision_date.day,
                             h, m, 0, tzinfo=timezone.utc)
    except (ValueError, TypeError):
        raise HTTPException(400, "cutoff_time must be HH:MM with valid hours (0-23) and minutes (0-59)")
    try:
        return await _analyse(decision_date, cutoff_dt)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        logger.exception("Analysis failed for %s", decision_date)
        raise HTTPException(502, f"Upstream error: {exc}")


@router.get("/trend", response_model=TrendResponse)
async def trend(
    start_date: date = Query(...),
    end_date: date = Query(...),
    cutoff_time: str = Query("10:00"),
):
    if start_date < MIN_DATE:
        raise HTTPException(400, "start_date must be 2015-01-01 or later")
    if end_date > date.today():
        end_date = date.today() - timedelta(days=1)
    if (end_date - start_date).days > 30:
        raise HTTPException(400, "Date range cannot exceed 30 days")
    if end_date < start_date:
        raise HTTPException(400, "end_date must be >= start_date")
    try:
        parts = cutoff_time.split(":")
        if len(parts) != 2:
            raise ValueError
        h, m = int(parts[0]), int(parts[1])
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError
    except (ValueError, TypeError):
        raise HTTPException(400, "cutoff_time must be HH:MM with valid hours (0-23) and minutes (0-59)")

    days_range = []
    current = start_date
    while current <= end_date:
        days_range.append(current)
        current += timedelta(days=1)

    async def _day(d: date) -> TrendDay:
        try:
            cutoff_dt = datetime(d.year, d.month, d.day, h, m, 0, tzinfo=timezone.utc)
            result = await _analyse(d, cutoff_dt)
            return TrendDay(
                date=d.isoformat(),
                mae=result.metrics.mae,
                rmse=result.metrics.rmse,
                bias=result.metrics.bias,
                wape=result.metrics.wape,
                matchedPeriods=result.coverage.matchedPeriods,
                coveragePct=result.coverage.coveragePct,
                error=None,
            )
        except Exception as exc:
            return TrendDay(
                date=d.isoformat(),
                mae=None, rmse=None, bias=None, wape=None,
                matchedPeriods=0, coveragePct=None,
                error=str(exc),
            )

    results = await asyncio.gather(*[_day(d) for d in days_range])
    return TrendResponse(cutoff=cutoff_time, days=list(results))


@router.get("/procurement", response_model=ProcurementResponse)
async def procurement(
    decision_date: date = Query(...),
    cutoff_time: str = Query("10:00"),
):
    """
    Wind Balancing Exposure — day-ahead.

    Uses only WINDFOR (forecasts) and FUELHH fuelType=WIND (actuals).
    Consumer demand data is not included — this is wind-only.

    windError = windForecast − actualWind  (per 30-min period)
      > 0 → over-forecast → shortfall exposure → energy = windError × 0.5 MWh
      < 0 → under-forecast → surplus exposure  → energy = |windError| × 0.5 MWh
    """
    if decision_date < MIN_DATE:
        raise HTTPException(400, "decision_date must be 2015-01-01 or later")
    if decision_date > date.today():
        raise HTTPException(400, "decision_date cannot be in the future")
    try:
        parts = cutoff_time.split(":")
        if len(parts) != 2:
            raise ValueError
        h, m = int(parts[0]), int(parts[1])
        if not (0 <= h <= 23 and 0 <= m <= 59):
            raise ValueError
        cutoff_dt = datetime(decision_date.year, decision_date.month, decision_date.day,
                             h, m, 0, tzinfo=timezone.utc)
    except (ValueError, TypeError):
        raise HTTPException(400, "cutoff_time must be HH:MM with valid hours (0-23) and minutes (0-59)")

    try:
        from app.services.procurement import build_procurement_periods, compute_procurement_metrics

        analysis = await _analyse(decision_date, cutoff_dt)
        proc_periods = build_procurement_periods(analysis.periods)
        proc_metrics = compute_procurement_metrics(proc_periods)

        return ProcurementResponse(
            decisionDate=decision_date.isoformat(),
            decisionCutoff=cutoff_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            units="MW",
            methodology=(
                "Wind-only balancing exposure (Elexon BMRS: WINDFOR + FUELHH fuelType=WIND). "
                "Consumer demand data not included. "
                "windError = WINDFOR − FUELHH_WIND per 30-min period. "
                "Energy exposure = windError × 0.5 h (MWh). "
                "Positive windError = over-forecast = shortfall exposure. "
                "Negative windError = under-forecast = surplus exposure."
            ),
            procurementMetrics=proc_metrics,
            windMetrics=analysis.metrics,
            periods=proc_periods,
        )

    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        logger.exception("Procurement failed for %s", decision_date)
        raise HTTPException(502, f"Upstream error: {exc}")
