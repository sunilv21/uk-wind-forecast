# API Reference

Base URL: `https://uk-wind-forecast-1vw9.onrender.com/api`

All endpoints accept GET requests. All times are UTC. All generation values are in MW unless noted.

---

## GET /health

Check backend and upstream Elexon API availability.

**Response:**
```json
{
  "status": "ok",
  "upstream_elexon": "ok",
  "latency_ms": 142.3
}
```

---

## GET /analysis

Wind forecast accuracy analysis for a single day-ahead decision.

**Query parameters:**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `decision_date` | Yes | — | Date in `YYYY-MM-DD` format |
| `cutoff_time` | No | `10:00` | UTC cutoff in `HH:MM` format |

**Example:**
```
GET /api/analysis?decision_date=2026-01-15&cutoff_time=10:00
```

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `decisionDate` | string | Decision date (YYYY-MM-DD) |
| `decisionCutoff` | string | Cutoff datetime (ISO 8601 UTC) |
| `deliveryDate` | string | Delivery date = decision + 1 day |
| `resolutionMinutes` | integer | Always 30 |
| `forecastVersionsUsed` | integer | Distinct publishTimes used |
| `peakActualMW` | float\|null | Highest actual generation |
| `worstAbsErrorMW` | float\|null | Largest absolute error |
| `capacityFactorPct` | float\|null | Avg actual / 30 GW × 100 |
| `metrics.mae` | float\|null | Mean Absolute Error (MW) |
| `metrics.rmse` | float\|null | Root Mean Square Error (MW) |
| `metrics.bias` | float\|null | Mean Error, positive = over-forecast |
| `metrics.wape` | float\|null | Weighted Absolute % Error |
| `coverage.expectedPeriods` | integer | Always 48 |
| `coverage.matchedPeriods` | integer | Periods with both forecast and actual |
| `coverage.missingActuals` | integer | Periods missing actual generation |
| `coverage.missingForecasts` | integer | Periods missing eligible forecast |
| `coverage.coveragePct` | float\|null | matchedPeriods / 48 × 100 |
| `leadTimeBreakdown` | array | MAE by lead-time bucket |
| `periods` | array | Full 48-period detail |

**Period status values:** `matched`, `missing_forecast`, `missing_actual`, `missing_both`

---

## GET /procurement

Wind balancing exposure analysis. Same decision/delivery logic as `/analysis`.

**Query parameters:** same as `/analysis`

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `methodology` | string | Description of the wind-only scope |
| `procurementMetrics.overforecastMWh` | float\|null | Total shortfall energy (MWh) |
| `procurementMetrics.underforecastMWh` | float\|null | Total surplus energy (MWh) |
| `procurementMetrics.mae` | float\|null | Wind error MAE |
| `procurementMetrics.bias` | float\|null | Wind error bias |
| `windMetrics` | object | Same shape as `/analysis` metrics |
| `periods` | array | Per-period wind forecast, actual, error |

**Period fields:**

| Field | Type | Description |
|---|---|---|
| `windForecast` | float\|null | WINDFOR value (MW) |
| `actualWind` | float\|null | FUELHH fuelType=WIND (MW) |
| `windError` | float\|null | windForecast − actualWind (positive = shortfall) |
| `windErrorAbs` | float\|null | \|windError\| |
| `windErrorPct` | float\|null | windError / actualWind × 100 |

---

## GET /trend

Day-by-day accuracy metrics over a date range.

**Query parameters:**

| Parameter | Required | Default | Description |
|---|---|---|---|
| `start_date` | Yes | — | YYYY-MM-DD |
| `end_date` | Yes | — | YYYY-MM-DD (max 30-day range) |
| `cutoff_time` | No | `10:00` | UTC cutoff HH:MM |

**Response:** array of daily MAE, RMSE, Bias, WAPE and coverage values.

---

## Error Codes

| HTTP | Meaning |
|---|---|
| 400 | Invalid parameters (future date, bad cutoff format, date out of range) |
| 404 | No data found for the requested date |
| 422 | Missing required query parameters |
| 502 | Elexon API unavailable after retries |
