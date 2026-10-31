"""
Wind Balancing Exposure Analysis — wind-only, 30-minute resolution.

Datasets used:
  WINDFOR   — day-ahead wind generation forecasts (Elexon BMRS)
  FUELHH    — half-hourly actual wind generation, fuelType=WIND (Elexon BMRS)

Consumer demand data (NDF, FUELHH total) is NOT used.
This analysis cannot calculate total electricity procurement requirement
without consumer demand data.

Per 30-min period:
  windError        = windForecast - actualWind
  overforecast_mwh = max(0, windError) × 0.5   [wind produced less than expected]
  underforecast_mwh= max(0, -windError) × 0.5  [wind produced more than expected]
"""

import math
from typing import Optional
import numpy as np
from app.schemas import PeriodResult, ProcurementPeriod, ProcurementMetrics

PERIOD_HOURS = 0.5  # 30-minute periods → energy = MW × 0.5 h = MWh


def build_procurement_periods(wind_periods: list[PeriodResult]) -> list[ProcurementPeriod]:
    periods: list[ProcurementPeriod] = []
    for wp in wind_periods:
        wf = wp.forecastGeneration
        wa = wp.actualGeneration

        wind_error: Optional[float] = None
        wind_error_abs: Optional[float] = None
        wind_error_pct: Optional[float] = None

        if wf is not None and wa is not None:
            wind_error = round(wf - wa, 1)
            wind_error_abs = round(abs(wind_error), 1)
            if wa != 0:
                wind_error_pct = round(100.0 * wind_error / wa, 2)

        periods.append(ProcurementPeriod(
            deliveryTime=wp.deliveryTime,
            leadHours=wp.leadHours,
            windForecast=wf,
            actualWind=wa,
            windError=wind_error,
            windErrorAbs=wind_error_abs,
            windErrorPct=wind_error_pct,
        ))
    return periods


def compute_procurement_metrics(periods: list[ProcurementPeriod]) -> ProcurementMetrics:
    valid = [p for p in periods if p.windError is not None]
    n = len(valid)
    if n == 0:
        return ProcurementMetrics(
            mae=None, rmse=None, bias=None, wape=None, matchedPeriods=0,
            overforecastMWh=None, underforecastMWh=None,
        )

    errors = np.array([p.windError for p in valid], dtype=float)
    actuals = np.array([p.actualWind for p in valid], dtype=float)

    mae = float(np.mean(np.abs(errors)))
    rmse = float(np.sqrt(np.mean(errors ** 2)))
    bias = float(np.mean(errors))
    actual_total = float(np.sum(np.abs(actuals)))
    wape = float(np.sum(np.abs(errors)) / actual_total * 100) if actual_total > 0 else None

    # Energy exposure (MWh) — MW × 0.5 h per 30-min period
    overforecast_mwh = float(np.sum(np.maximum(errors, 0)) * PERIOD_HOURS)
    underforecast_mwh = float(np.sum(np.maximum(-errors, 0)) * PERIOD_HOURS)

    return ProcurementMetrics(
        mae=round(mae, 2),
        rmse=round(rmse, 2),
        bias=round(bias, 2),
        wape=round(wape, 2) if wape is not None else None,
        matchedPeriods=n,
        overforecastMWh=round(overforecast_mwh, 1),
        underforecastMWh=round(underforecast_mwh, 1),
    )
