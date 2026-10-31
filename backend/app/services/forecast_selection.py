"""
Forecast selection and period building.

Resolution: 30-minute (both WINDFOR and FUELHH publish half-hourly startTime values).
Actuals are matched on exact startTime — no hourly aggregation.

The 48-period delivery timeline is always generated in full first, then populated.
Missing forecasts or actuals are explicitly represented, never silently dropped.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from app.schemas import PeriodResult
from app.config import UK_INSTALLED_WIND_MW

HALF_HOUR = timedelta(minutes=30)
PERIODS_PER_DAY = 48


def generate_delivery_timeline(delivery_date_start: datetime) -> list[datetime]:
    """
    Generate the complete list of 48 expected half-hourly delivery timestamps
    for a UTC day, starting at 00:00 and ending at 23:30.
    """
    return [delivery_date_start + HALF_HOUR * i for i in range(PERIODS_PER_DAY)]


def select_latest_forecasts(
    forecasts: list[dict],
    cutoff: datetime,
) -> dict[datetime, dict]:
    """
    For each delivery startTime, select the latest forecast published before cutoff.

    This prevents look-ahead bias: a forecast published after the decision cutoff
    cannot influence the day-ahead position.

    Example (cutoff = 10:00):
        publishTime 08:00 → eligible
        publishTime 09:30 → eligible (selected — latest before cutoff)
        publishTime 10:15 → rejected
    """
    eligible = [f for f in forecasts if f["publishTime"] <= cutoff]
    best: dict[datetime, dict] = {}
    for record in eligible:
        key = record["startTime"]
        if key not in best:
            best[key] = record
        else:
            existing = best[key]
            # Prefer later publishTime; ties broken by higher generation (deterministic)
            if record["publishTime"] > existing["publishTime"] or (
                record["publishTime"] == existing["publishTime"]
                and record["generation"] > existing["generation"]
            ):
                best[key] = record
    return best


def index_actuals(actuals: list[dict]) -> dict[datetime, float]:
    """
    Index 30-minute actual generation records by their exact startTime.
    No aggregation — preserves original half-hourly resolution.

    Revision-selection rule (deterministic, documented):
      1. If two records share the same startTime, the one with the later
         publishTime is authoritative (latest Elexon revision wins).
      2. If publishTime is absent on both candidates, source ordering is used
         (the first record in the stream is kept).  This matches the FUELHH
         stream contract where earlier records precede later revisions.
      3. If only one record has publishTime, that one is preferred over the
         one without, regardless of source position.

    Records that are missing required fields (startTime, generation) are
    silently skipped; optional fields (publishTime) never cause a record to
    be discarded.
    """
    # {startTime: (publishTime | None, generation)}
    best: dict[datetime, tuple[Optional[datetime], float]] = {}
    for rec in actuals:
        try:
            st: datetime = rec["startTime"]
            gen: float = rec["generation"]
        except KeyError:
            continue  # startTime or generation absent — skip, do not discard others
        pub: Optional[datetime] = rec.get("publishTime")  # optional — may be absent

        if st not in best:
            best[st] = (pub, gen)
        else:
            existing_pub, _ = best[st]
            # Replace when the incoming record is demonstrably newer:
            #   – new record has a publishTime and existing does not, OR
            #   – both have publishTime and new is strictly later.
            # Equal publishTimes: keep first-seen (source order).
            if pub is not None and (existing_pub is None or pub > existing_pub):
                best[st] = (pub, gen)

    return {st: gen for st, (_, gen) in best.items()}


def build_periods(
    selected_forecasts: dict[datetime, dict],
    actuals_by_starttime: dict[datetime, float],
    cutoff: datetime,
    delivery_start: Optional[datetime] = None,
) -> list[PeriodResult]:
    """
    Build the complete 48-period delivery timeline at 30-minute resolution.

    Every expected period is always represented. Missing forecasts or actuals
    result in null values with an explicit status label:
        matched          — forecast and actual both present
        missing_forecast — no forecast available before cutoff
        missing_actual   — forecast present but actual not yet published
        missing_both     — neither forecast nor actual available

    delivery_start: if provided, generates the full 48-period timeline from it.
    If omitted, the timeline is derived from the keys of selected_forecasts only
    (backward-compatible mode — missing-forecast periods won't appear).
    """
    if delivery_start is not None:
        timeline = generate_delivery_timeline(delivery_start)
    else:
        timeline = sorted(selected_forecasts)

    periods: list[PeriodResult] = []
    for delivery_time in timeline:
        forecast = selected_forecasts.get(delivery_time)
        actual_gen = actuals_by_starttime.get(delivery_time)

        has_forecast = forecast is not None
        has_actual = actual_gen is not None

        if has_forecast and has_actual:
            status = "matched"
        elif has_forecast and not has_actual:
            status = "missing_actual"
        elif not has_forecast and has_actual:
            status = "missing_forecast"
        else:
            status = "missing_both"

        forecast_gen = forecast["generation"] if forecast else None
        publish_time_str = forecast["publishTime"].strftime("%Y-%m-%dT%H:%M:%SZ") if forecast else None

        lead_hours: Optional[float] = None
        if forecast and has_forecast:
            # Lead time from actual publish time of selected forecast to delivery
            lead_hours = round((delivery_time - forecast["publishTime"]).total_seconds() / 3600, 2)

        error: Optional[float] = None
        abs_error: Optional[float] = None
        pct_error: Optional[float] = None

        if forecast_gen is not None and actual_gen is not None:
            error = round(forecast_gen - actual_gen, 1)
            abs_error = round(abs(error), 1)
            if actual_gen != 0:
                pct_error = round(100.0 * error / actual_gen, 2)

        periods.append(PeriodResult(
            deliveryTime=delivery_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            forecastPublishTime=publish_time_str,
            forecastGeneration=round(forecast_gen, 1) if forecast_gen is not None else None,
            actualGeneration=round(actual_gen, 1) if actual_gen is not None else None,
            error=error,
            absoluteError=abs_error,
            percentageError=pct_error,
            leadHours=lead_hours,
            status=status,
        ))
    return periods


def count_forecast_versions_used(selected_forecasts: dict[datetime, dict]) -> int:
    """Count distinct publishTimes actually used in the selected forecast set."""
    return len({record["publishTime"] for record in selected_forecasts.values()})


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
    """Average actual wind as % of assumed installed capacity (from config)."""
    valid = [p.actualGeneration for p in periods if p.actualGeneration is not None]
    if not valid:
        return None
    avg = sum(valid) / len(valid)
    return round(avg / UK_INSTALLED_WIND_MW * 100, 1)
