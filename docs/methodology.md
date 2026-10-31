# Forecast Selection Methodology

## Overview

The dashboard analyses GB wind generation forecast accuracy for **day-ahead procurement decisions**. It uses only two Elexon BMRS datasets: **WINDFOR** (wind forecasts) and **FUELHH fuelType=WIND** (actual wind generation). Consumer demand data is not included.

---

## Decision and Delivery Dates

| Concept | Definition |
|---|---|
| **Decision date** | The day on which the procurement decision is made |
| **Decision cutoff** | The moment (UTC) when forecast positions are locked in (e.g. 10:00) |
| **Delivery date** | `decision_date + 1 calendar day` |
| **Delivery window** | 48 half-hourly periods: 00:00–23:30 UTC on the delivery date |

Example:
- Decision date: 2026-01-15
- Cutoff: 2026-01-15 10:00 UTC
- Delivery date: 2026-01-16
- Expected periods: 48 × 30-min (00:00, 00:30, 01:00 … 23:30)

---

## Forecast Selection (per delivery period)

For each delivery timestamp, the **latest forecast published on or before the cutoff** is selected:

```
selected_publish_time = MAX(publishTime WHERE publishTime ≤ cutoff)
```

This is applied **independently for each 30-minute delivery period**. Different periods may use different forecast publication versions — the API produces rolling updates and each delivery slot may have been updated at a different time.

**Look-ahead bias prevention**: forecasts published after the cutoff are strictly excluded, even if they are available in the API response.

---

## 48-Period Timeline

The backend generates the complete expected delivery timeline (48 periods) regardless of API coverage. Each period carries one of four statuses:

| Status | Meaning |
|---|---|
| `matched` | Forecast and actual both available |
| `missing_forecast` | No eligible forecast found before cutoff |
| `missing_actual` | Forecast available, actual not yet published |
| `missing_both` | Neither forecast nor actual found |

Missing values are `null` — they are never replaced with zero.

---

## Lead Time

Lead time measures how far ahead the selected forecast was published relative to the delivery period:

```
lead_hours = (delivery_time − selected_publishTime).total_seconds() / 3600
```

---

## Accuracy Metrics

All metrics are computed only from **matched periods** (both forecast and actual non-null).

| Metric | Formula |
|---|---|
| **Error** | Forecast − Actual |
| **Absolute Error** | \|Forecast − Actual\| |
| **MAE** | Mean(\|Forecast − Actual\|) |
| **RMSE** | √(Mean((Forecast − Actual)²)) |
| **Bias** | Mean(Forecast − Actual) — positive = systematic over-forecast |
| **WAPE** | Sum(\|Error\|) / Sum(\|Actual\|) × 100 |
| **Coverage** | Matched periods / 48 × 100 |

---

## Wind Balancing Exposure

This replaces any demand-based procurement calculation, which is impossible without consumer demand data.

Per 30-minute matched period:

```
windError = WINDFOR − FUELHH_WIND

overforecast_energy  = max(0, windError) × 0.5 h     (MWh)
underforecast_energy = max(0, −windError) × 0.5 h    (MWh)
```

| Sign | Meaning | Market implication |
|---|---|---|
| windError > 0 | Wind produced **less** than forecast (over-forecast) | Shortfall — may need to buy additional power |
| windError < 0 | Wind produced **more** than forecast (under-forecast) | Surplus — position may be over-hedged |
| windError = 0 | Perfect forecast | No balancing required |

The energy factor is **0.5 h** (not 1 h) because each period is 30 minutes.

---

## Capacity Factor

```
capacity_factor = avg_actual_wind_MW / UK_INSTALLED_WIND_MW × 100
```

`UK_INSTALLED_WIND_MW` is a configurable assumption (default 30,000 MW) based on DESNZ/DUKES statistics. It is **not** retrieved from Elexon and is used for display purposes only.
