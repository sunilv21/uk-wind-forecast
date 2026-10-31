# Data Sources

## Permitted Datasets

This application uses **only** the two datasets listed below. No other generation, demand or price data is used.

---

### WINDFOR — Wind Generation Forecast

| Property | Value |
|---|---|
| **Elexon dataset** | `WINDFOR` |
| **Stream endpoint** | `GET /datasets/WINDFOR/stream` |
| **Query parameters** | `publishDateTimeFrom`, `publishDateTimeTo`, `format=json` |
| **startTime** | Delivery period timestamp (30-min resolution) |
| **publishTime** | Timestamp when this forecast version was published |
| **generation** | Forecast wind generation in MW |
| **Resolution** | 30 minutes |
| **Coverage** | All GB metered wind generation |

**Usage in this application**: Forecast generation values are selected by delivery period using the latest publish time that falls at or before the decision cutoff.

---

### FUELHH — Half-Hourly Actual Generation by Fuel Type

| Property | Value |
|---|---|
| **Elexon dataset** | `FUELHH` |
| **Stream endpoint** | `GET /datasets/FUELHH/stream` |
| **Query parameters** | `publishDateTimeFrom`, `publishDateTimeTo`, `fuelType=WIND`, `format=json` |
| **startTime** | Delivery period timestamp (30-min resolution) |
| **generation** | Actual wind generation in MW |
| **Resolution** | 30 minutes |
| **fuelType filter** | `WIND` — only wind generation records are retrieved |

**Usage in this application**: Actual generation values are matched to forecasts by exact `startTime`. No aggregation is performed.

---

## Datasets NOT Used

The following datasets are **not used** in this application despite being available from Elexon BMRS:

| Dataset | Reason not used |
|---|---|
| `NDF` (National Demand Forecast) | Consumer demand data is outside the assignment scope |
| `FUELHH` (all fuel types) | Only `fuelType=WIND` is retrieved; total demand is not calculated |
| `INDO` / `ITSDO` | Balancing mechanism data not required |
| `MID` / `DETSYSPRICES` | Price data not in scope |

---

## Important Limitation

Because consumer demand data is excluded, the application **cannot calculate the total electricity procurement requirement**. The "Wind Exposure Analysis" tab shows only the incremental impact of wind forecast error on a wind-backed trading position — not the total volume of power that needs to be purchased.
