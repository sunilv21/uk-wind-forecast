from datetime import datetime
from typing import Optional
from app.schemas import PeriodResult

UK_INSTALLED_WIND_MW = 30_000.0


def select_latest_forecasts(
    forecasts: list[dict],
    cutoff: datetime,
) -> dict[datetime, dict]:
    eligible = [f for f in forecasts if f["publishTime"] <= cutoff]
    best: dict[datetime, dict] = {}
    for record in eligible:
        key = record["startTime"]
        if key not in best or record["publishTime"] > best[key]["publishTime"]:
            best[key] = record
    return best


def aggregate_actuals_to_hourly(actuals: list[dict]) -> dict[datetime, float]:
    buckets: dict[datetime, list[float]] = {}
    for rec in actuals:
        hour_key = rec["startTime"].replace(minute=0, second=0, microsecond=0)
        buckets.setdefault(hour_key, []).append(rec["generation"])
    return {k: sum(v) / len(v) for k, v in buckets.items()}


def build_periods(
    selected_forecasts: dict[datetime, dict],
    hourly_actuals: dict[datetime, float],
    cutoff: datetime,
) -> list[PeriodResult]:
    periods: list[PeriodResult] = []
    for delivery_time in sorted(selected_forecasts):
        forecast = selected_forecasts[delivery_time]
        actual_gen = hourly_actuals.get(delivery_time)
        forecast_gen = forecast["generation"]

        lead_hours = round((delivery_time - cutoff).total_seconds() / 3600, 1)

        error: Optional[float] = None
        abs_error: Optional[float] = None
        pct_error: Optional[float] = None

        if actual_gen is not None:
            error = round(forecast_gen - actual_gen, 1)
            abs_error = round(abs(error), 1)
            if actual_gen != 0:
                pct_error = round(100.0 * error / actual_gen, 2)

        periods.append(PeriodResult(
            deliveryTime=delivery_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            forecastPublishTime=forecast["publishTime"].strftime("%Y-%m-%dT%H:%M:%SZ"),
            forecastGeneration=round(forecast_gen, 1),
            actualGeneration=round(actual_gen, 1) if actual_gen is not None else None,
            error=error,
            absoluteError=abs_error,
            percentageError=pct_error,
            leadHours=lead_hours,
        ))
    return periods


def count_forecast_versions(forecasts: list[dict], cutoff: datetime) -> int:
    eligible = [f for f in forecasts if f["publishTime"] <= cutoff]
    return len({f["publishTime"] for f in eligible})


def peak_actual(periods: list[PeriodResult]) -> tuple[Optional[float], Optional[str]]:
    valid = [p for p in periods if p.actualGeneration is not None]
    if not valid:
        return None, None
    best = max(valid, key=lambda p: p.actualGeneration)  # type: ignore[arg-type]
    return best.actualGeneration, best.deliveryTime


def worst_error(periods: list[PeriodResult]) -> tuple[Optional[float], Optional[str]]:
    valid = [p for p in periods if p.absoluteError is not None]
    if not valid:
        return None, None
    worst = max(valid, key=lambda p: p.absoluteError)  # type: ignore[arg-type]
    return worst.absoluteError, worst.deliveryTime


def capacity_factor(periods: list[PeriodResult]) -> Optional[float]:
    valid = [p.actualGeneration for p in periods if p.actualGeneration is not None]
    if not valid:
        return None
    avg = sum(valid) / len(valid)
    return round(avg / UK_INSTALLED_WIND_MW * 100, 1)
