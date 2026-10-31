import asyncio
import logging
from fastapi import APIRouter, HTTPException, Query
from datetime import date, datetime, timezone, timedelta

logger = logging.getLogger(__name__)
from app.schemas import AnalysisResponse, TrendResponse, TrendDay, ProcurementResponse
from app.services.elexon_client import fetch_windfor, fetch_fuelhh, fetch_ndf, fetch_fuelhh_demand
from app.services.forecast_selection import (
    select_latest_forecasts,
    aggregate_actuals_to_hourly,
    build_periods,
    count_forecast_versions,
    peak_actual,
    worst_error,
    capacity_factor,
)
from app.services.metrics import compute_metrics, compute_coverage, compute_lead_time_breakdown

router = APIRouter()
MIN_DATE = date(2015, 1, 1)


@router.get("/health")
async def health():
    from app.config import ELEXON_BASE_URL
    import httpx, time
    start = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{ELEXON_BASE_URL}/datasets/WINDFOR", params={"format": "json"})
        upstream_ok = r.status_code < 500
    except Exception:
        upstream_ok = False
    return {
        "status": "ok" if upstream_ok else "degraded",
        "upstream_elexon": "ok" if upstream_ok else "unreachable",
        "latency_ms": round((time.perf_counter() - start) * 1000, 1),
    }


async def _analyse(decision_date: date, cutoff_dt: datetime) -> AnalysisResponse:
    forecast_from = cutoff_dt - timedelta(days=3)
    raw_forecasts = await fetch_windfor(forecast_from, cutoff_dt)
    if not raw_forecasts:
        raise ValueError("No forecast data found for the selected date and cutoff.")

    selected = select_latest_forecasts(raw_forecasts, cutoff_dt)
    selected = {k: v for k, v in selected.items() if k > cutoff_dt}
    if not selected:
        raise ValueError("No forward-looking delivery periods found.")

    versions_used = count_forecast_versions(raw_forecasts, cutoff_dt)

    delivery_times = sorted(selected.keys())
    actuals_from = delivery_times[0]
    actuals_to = delivery_times[-1] + timedelta(hours=2)
    raw_actuals = await fetch_fuelhh(actuals_from, actuals_to)

    hourly_actuals = aggregate_actuals_to_hourly(raw_actuals)
    periods = build_periods(selected, hourly_actuals, cutoff_dt)
    metrics = compute_metrics(periods)
    coverage = compute_coverage(periods, len(selected))
    lead_breakdown = compute_lead_time_breakdown(periods)

    peak_mw, peak_time = peak_actual(periods)
    worst_mw, worst_time = worst_error(periods)
    cf = capacity_factor(periods)

    return AnalysisResponse(
        decisionDate=decision_date.isoformat(),
        decisionCutoff=cutoff_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        units="MW",
        granularity="hourly",
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
        h, m = [int(x) for x in cutoff_time.split(":")]
        cutoff_dt = datetime(decision_date.year, decision_date.month, decision_date.day,
                             h, m, 0, tzinfo=timezone.utc)
    except (ValueError, TypeError):
        raise HTTPException(400, "cutoff_time must be HH:MM")
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
        h, m = [int(x) for x in cutoff_time.split(":")]
    except (ValueError, TypeError):
        raise HTTPException(400, "cutoff_time must be HH:MM")

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
    Procurement gap analysis.
    Shows residual demand (demand − wind) both forecast and actual,
    and the procurement gap error which drives over/under-buying.
    """
    if decision_date < MIN_DATE:
        raise HTTPException(400, "decision_date must be 2015-01-01 or later")
    if decision_date > date.today():
        raise HTTPException(400, "decision_date cannot be in the future")
    try:
        h, m = [int(x) for x in cutoff_time.split(":")]
        cutoff_dt = datetime(decision_date.year, decision_date.month, decision_date.day,
                             h, m, 0, tzinfo=timezone.utc)
    except (ValueError, TypeError):
        raise HTTPException(400, "cutoff_time must be HH:MM")

    try:
        # Run wind + demand data fetches in parallel
        from app.services.procurement import (
            select_latest, aggregate_to_hourly_avg,
            build_procurement_periods, compute_procurement_metrics,
        )

        forecast_from = cutoff_dt - timedelta(days=3)
        wind_raw, ndf_raw = await asyncio.gather(
            fetch_windfor(forecast_from, cutoff_dt),
            fetch_ndf(forecast_from, cutoff_dt),
        )

        if not wind_raw:
            raise ValueError("No wind forecast data found.")

        # Select latest wind and demand forecasts before cutoff
        selected_wind = select_latest_forecasts(wind_raw, cutoff_dt)
        selected_wind = {k: v for k, v in selected_wind.items() if k > cutoff_dt}
        if not selected_wind:
            raise ValueError("No forward-looking wind forecast periods found.")

        selected_ndf = select_latest(ndf_raw, cutoff_dt)

        # Aggregate NDF (half-hourly) to hourly
        hourly_demand_forecast = aggregate_to_hourly_avg(
            [{"startTime": k, "publishTime": v["publishTime"], "demand": v["demand"]}
             for k, v in selected_ndf.items()
             if k > cutoff_dt],
            "demand",
        )

        # Fetch actuals for delivery range
        delivery_times = sorted(selected_wind.keys())
        actuals_from = delivery_times[0]
        actuals_to = delivery_times[-1] + timedelta(hours=2)

        wind_actual_raw, demand_actual_raw = await asyncio.gather(
            fetch_fuelhh(actuals_from, actuals_to),
            fetch_fuelhh_demand(actuals_from, actuals_to),
        )

        hourly_wind_actuals = aggregate_actuals_to_hourly(wind_actual_raw)
        hourly_demand_actual = aggregate_to_hourly_avg(demand_actual_raw, "demand")

        # Build wind periods (reuse existing logic)
        wind_periods = build_periods(selected_wind, hourly_wind_actuals, cutoff_dt)
        wind_metrics = compute_metrics(wind_periods)

        # Build procurement periods
        proc_periods = build_procurement_periods(
            wind_periods, hourly_demand_forecast, hourly_demand_actual, cutoff_dt
        )
        proc_metrics = compute_procurement_metrics(proc_periods)

        return ProcurementResponse(
            decisionDate=decision_date.isoformat(),
            decisionCutoff=cutoff_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            units="MW",
            procurementMetrics=proc_metrics,
            windMetrics=wind_metrics,
            periods=proc_periods,
        )

    except ValueError as exc:
        raise HTTPException(404, str(exc))
    except Exception as exc:
        logger.exception("Procurement failed for %s", decision_date)
        raise HTTPException(502, f"Upstream error: {exc}")
