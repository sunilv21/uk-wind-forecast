"""
Procurement gap analysis.

Residual demand (what the trader must buy from the market) =
    Total consumer demand − Wind generation

Forecasted procurement need = Demand forecast − Wind forecast
Actual procurement need      = Actual demand  − Actual wind
Procurement gap error        = Forecasted need − Actual need
  Positive: over-bought (forecast said buy more than needed → surplus cost)
  Negative: under-bought (forecast said buy less than needed → shortfall / spot top-up)
"""

import math
from datetime import datetime
from typing import Optional
from app.schemas import PeriodResult, ProcurementPeriod, ProcurementMetrics


def select_latest(records: list[dict], cutoff: datetime) -> dict[datetime, dict]:
    """Generic latest-before-cutoff selector by publishTime."""
    eligible = [r for r in records if r["publishTime"] <= cutoff]
    best: dict[datetime, dict] = {}
    for r in eligible:
        k = r["startTime"]
        if k not in best or r["publishTime"] > best[k]["publishTime"]:
            best[k] = r
    return best


def aggregate_to_hourly_avg(records: list[dict], value_key: str) -> dict[datetime, float]:
    buckets: dict[datetime, list[float]] = {}
    for r in records:
        hour = r["startTime"].replace(minute=0, second=0, microsecond=0)
        buckets.setdefault(hour, []).append(r[value_key])
    return {k: sum(v) / len(v) for k, v in buckets.items()}


def build_procurement_periods(
    wind_periods: list[PeriodResult],
    hourly_demand_forecast: dict[datetime, float],
    hourly_actual_demand: dict[datetime, float],
    cutoff: datetime,
) -> list[ProcurementPeriod]:
    periods: list[ProcurementPeriod] = []
    for wp in wind_periods:
        dt = datetime.fromisoformat(wp.deliveryTime.replace("Z", "+00:00"))

        wf = wp.forecastGeneration
        wa = wp.actualGeneration
        df = hourly_demand_forecast.get(dt)
        da = hourly_actual_demand.get(dt)

        res_forecast: Optional[float] = round(df - wf, 1) if df is not None and wf is not None else None
        res_actual: Optional[float] = round(da - wa, 1) if da is not None and wa is not None else None

        gap_error: Optional[float] = None
        gap_abs: Optional[float] = None
        gap_pct: Optional[float] = None

        if res_forecast is not None and res_actual is not None:
            gap_error = round(res_forecast - res_actual, 1)
            gap_abs = round(abs(gap_error), 1)
            if res_actual != 0:
                gap_pct = round(100.0 * gap_error / res_actual, 2)

        periods.append(ProcurementPeriod(
            deliveryTime=wp.deliveryTime,
            leadHours=wp.leadHours,
            demandForecast=round(df, 1) if df is not None else None,
            actualDemand=round(da, 1) if da is not None else None,
            windForecast=wf,
            actualWind=wa,
            residualForecast=res_forecast,
            residualActual=res_actual,
            procurementGapError=gap_error,
            procurementGapAbs=gap_abs,
            procurementGapPct=gap_pct,
        ))
    return periods


def compute_procurement_metrics(periods: list[ProcurementPeriod]) -> ProcurementMetrics:
    valid = [p for p in periods if p.procurementGapError is not None]
    n = len(valid)
    if n == 0:
        return ProcurementMetrics(mae=None, rmse=None, bias=None, wape=None, matchedPeriods=0)

    errors = [p.procurementGapError for p in valid]
    abs_errors = [p.procurementGapAbs for p in valid]
    actuals = [p.residualActual for p in valid]

    mae = sum(abs_errors) / n  # type: ignore
    rmse = math.sqrt(sum(e ** 2 for e in errors) / n)  # type: ignore
    bias = sum(errors) / n  # type: ignore
    denom = sum(abs(a) for a in actuals)  # type: ignore
    wape = (sum(abs_errors) / denom * 100.0) if denom > 0 else None  # type: ignore

    return ProcurementMetrics(
        mae=round(mae, 1),
        rmse=round(rmse, 1),
        bias=round(bias, 1),
        wape=round(wape, 2) if wape is not None else None,
        matchedPeriods=n,
    )
