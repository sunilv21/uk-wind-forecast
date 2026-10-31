# Assumptions and Limitations

## Scope Limitation — No Consumer Demand Data

**The most important limitation of this application:**

Consumer demand data (`NDF`, full `FUELHH` totals) is not included in the permitted dataset scope. Therefore:

- The application **cannot calculate the total electricity procurement requirement**.
- The "Wind Exposure Analysis" tab shows **wind forecast error exposure only** — not total procurement gap.
- Labels such as "procurement gap" or "under-bought / over-bought" have been replaced with accurate wind-only terminology.

---

## Installed Wind Capacity Assumption

Capacity factor is calculated using an assumed GB installed wind capacity of **30,000 MW** (30 GW). This value:

- Is **not** retrieved from Elexon BMRS.
- Is based on DESNZ/DUKES GB wind statistics (approximate 2024–2026 figure).
- Can be changed via the `UK_INSTALLED_WIND_MW` environment variable.
- Is for display purposes only. It does not affect forecast accuracy metrics.

---

## Forecast Version Selection

- Only forecasts published **on or before the decision cutoff** are used.
- Each delivery period selects its own latest eligible forecast independently.
- If Elexon's API returns no eligible forecast for a period, that period is marked `missing_forecast`.

---

## 30-Minute Resolution

Both WINDFOR and FUELHH publish half-hourly `startTime` values. The application preserves this resolution throughout and never aggregates to hourly values. MWh energy figures use the correct 0.5-hour factor.

---

## Day-Ahead Constraint

The primary analysis covers exactly one delivery day (decision date + 1). The 48 expected half-hourly periods span 00:00–23:30 UTC on the delivery date.

---

## API Data Availability

- Recent data (last 48 hours) may be subject to revision by Elexon.
- Historical data for January 2026 is considered stable.
- The application may return `missing_actual` for very recent periods where FUELHH has not yet been published.

---

## UTC Timestamps

All timestamps in the API response are UTC. The frontend displays times in UTC with no local-time conversion.

---

## Not a Trading System

This application is an educational and analytical tool. It does not constitute financial advice or a recommendation to trade. Balancing market exposure and procurement volumes depend on many additional factors not captured here.
