# UK Wind Generation Forecast & Accuracy Dashboard

A full-stack production-grade dashboard for analysing UK wind generation forecast accuracy and day-ahead procurement gap analysis, built on live data from the [Elexon BMRS API](https://www.elexon.co.uk/data/balancing-mechanism-reporting-service/).

---

## Table of Contents

- [Overview](#overview)
- [Live Data Sources](#live-data-sources)
- [Architecture](#architecture)
- [Features](#features)
- [Key Algorithms](#key-algorithms)
- [Accuracy Metrics](#accuracy-metrics)
- [Procurement Gap Analysis](#procurement-gap-analysis)
- [API Reference](#api-reference)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Future Scope](#future-scope)
- [Tools Used](#tools-used)

---

## Overview

This dashboard answers two questions for GB electricity traders and analysts:

1. **How accurate are wind generation forecasts?** — Compare WINDFOR day-ahead forecasts against FUELHH actuals, broken down by lead time, hour, and trend over multiple days.
2. **What is the procurement gap?** — How much additional power did you need to buy (or sell back) on the balancing market because the wind forecast was wrong? Which hours were you short, and by how much?

All data is pulled live from Elexon BMRS with no API key required.

---

## Live Data Sources

All data comes from the [Elexon BMRS REST API](https://data.elexon.co.uk/bmrs/api/v1).

| Dataset | Description | Granularity | Key Fields |
|---------|-------------|-------------|------------|
| `WINDFOR` | Wind generation forecast | Hourly | `startTime`, `publishTime`, `generation` (MW) |
| `FUELHH` | Half-hourly actuals by fuel type | 30 min | `startTime`, `fuelType`, `generation` (MW) |
| `NDF` | National Demand Forecast | 30 min | `startTime`, `publishTime`, `demand` (MW), `boundary` |

**WINDFOR** — Each row is a forecast for a specific delivery hour, published at a specific time. Multiple forecasts exist per delivery hour (updated every few hours). The system selects the latest forecast published **before** the decision cutoff.

**FUELHH** — Contains actuals for all fuel types: `WIND`, `SOLAR`, `CCGT`, `NUCLEAR`, etc. Summing all `fuelType` values for a settlement period gives total actual demand.

**NDF** — National demand forecast. Filtered with `boundary=N` for the standard GB boundary. Half-hourly granularity matched to FUELHH.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              React Frontend (Vite)          │
│  Dashboard.tsx → 3 tabs                     │
│  ├── Wind Forecast Accuracy                 │
│  ├── Procurement Gap Analysis               │
│  └── Documentation (iframe)                │
└──────────────┬──────────────────────────────┘
               │ HTTP (proxied via nginx in prod)
┌──────────────▼──────────────────────────────┐
│         FastAPI Backend (Python)            │
│  /api/analysis   → wind accuracy            │
│  /api/procurement → procurement gap         │
│  /api/trend      → multi-day trend          │
│  /api/health     → upstream ping            │
└──────────────┬──────────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────────┐
│          Elexon BMRS API                    │
│  data.elexon.co.uk/bmrs/api/v1              │
│  WINDFOR · FUELHH · NDF  (no auth)          │
└─────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v3, Recharts |
| Backend | Python 3.11, FastAPI, httpx, uvicorn |
| Serving | nginx 1.27-alpine (production) |
| Containerisation | Docker, Docker Compose |

---

## Features

### Wind Forecast Accuracy Tab

- **Metric cards** — MAE, RMSE, bias, MAPE, WAPE, correlation, max error, capacity factor
- **Forecast vs Actual chart** — Recharts `ComposedChart` with dual series
- **Error over time chart** — Per-hour error bars colour-coded by magnitude
- **Error histogram** — Distribution of forecast errors across the day
- **Lead-time breakdown** — Accuracy grouped by how far ahead the forecast was made (0–6 h, 6–12 h, etc.)
- **Multi-day trend chart** — Up to 30-day rolling MAE/RMSE trend
- **Period table** — All delivery periods with sortable columns

### Procurement Gap Analysis Tab

- **Summary cards** — Average planned purchase, average actual need, peak actual, shortfall hours count
- **Under-bought panel** — Total MW·h shortfall, worst hour, average shortfall per hour
- **Over-bought panel** — Total MW·h over-buy, average per hour, wind MAE driving it
- **Planned vs Actual chart** — Orange line (planned), slate dashed line (actual), blue bars (shortfall hours), amber bars (over-bought hours)
- **Shortfall Hours table** — Only under-bought periods, **sortable by any column**
- **All Periods table** — Every matched period with gap error, absolute gap, gap %, **sortable by any column**

### Documentation Tab

- Complete project documentation served as a standalone HTML page
- Sections: Introduction, Architecture, Data Flow, API field tables, Forecast Selection, Granularity Mismatch, Accuracy Metrics, Procurement Gap formulas, API Reference, Caching & Retry, Local Dev, Docker, Config, Tools Used, Future Scope

---

## Key Algorithms

### Forecast Selection

For a given `(decision_date, cutoff_time)`:

1. Set `cutoff_dt = decision_date + cutoff_time` (UTC)
2. From WINDFOR, keep only forecasts where `publishTime ≤ cutoff_dt`
3. For each `startTime`, pick the row with the **latest** `publishTime` (most up-to-date forecast available at cutoff)
4. Keep only periods where `startTime > cutoff_dt` (forward-looking only)
5. Compute `leadHours = (startTime − cutoff_dt).total_seconds() / 3600`

### Granularity Mismatch

WINDFOR is **hourly**. FUELHH and NDF are **half-hourly**. Resolution:

- For each hourly forecast bucket, find the two 30-min settlement periods that fall within it
- Average their values to get a single hourly actual
- This ensures a like-for-like comparison

### Residual Demand

```
Residual forecast = NDF demand forecast − WINDFOR wind forecast
Residual actual   = FUELHH total demand − FUELHH wind actual

Procurement gap error = Residual forecast − Residual actual
  > 0  →  Over-bought  (paid for power not needed)
  < 0  →  Under-bought (must buy more on balancing market)
```

---

## Accuracy Metrics

| Metric | Formula | Meaning |
|--------|---------|---------|
| MAE | `mean(|forecast − actual|)` | Average absolute error in MW |
| RMSE | `sqrt(mean((forecast − actual)²))` | Penalises large errors more than MAE |
| Bias | `mean(forecast − actual)` | Systematic over/under-forecasting |
| MAPE | `mean(|error / actual| × 100)` | % error relative to actuals |
| WAPE | `sum(|error|) / sum(|actual|) × 100` | Weighted % — robust when actuals near zero |
| Correlation | Pearson r between forecast and actual | Directional accuracy |
| Capacity Factor | `mean(actual) / 30,000 MW × 100` | Wind output as % of assumed 30 GW installed capacity |

---

## Procurement Gap Analysis

The procurement gap is the commercial consequence of wind forecast error for a power trader who used the day-ahead forecast to decide how much electricity to procure.

```
What you planned to buy  =  NDF forecast  −  WINDFOR forecast
What you actually needed =  Actual demand −  Actual wind generation

Procurement gap          =  Planned to buy − Actually needed
```

| Gap | Meaning | Commercial consequence |
|-----|---------|----------------------|
| Negative (blue) | Under-bought | Must purchase shortfall on balancing market, typically at a premium (SBP) |
| Positive (amber) | Over-bought | Paid for capacity not needed — sell back or absorb as wasted cost (SSP) |

**Metrics computed:**
- Total shortfall MW·h across all under-bought hours
- Worst shortfall hour (delivery time + magnitude)
- Procurement MAE, RMSE, Bias, WAPE across all matched periods

---

## API Reference

Base URL (local dev): `http://localhost:8000`

### `GET /api/analysis`

Wind forecast accuracy analysis for a single day.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `date` | `YYYY-MM-DD` | Yes | Decision date (UTC) |
| `cutoff` | `HH:MM` | Yes | Decision cutoff time (UTC) |

**Returns:** `AnalysisResponse` — metrics object, periods array, lead-time breakdown, coverage stats.

---

### `GET /api/procurement`

Procurement gap analysis for a single day.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `date` | `YYYY-MM-DD` | Yes | Decision date (UTC) |
| `cutoff` | `HH:MM` | Yes | Decision cutoff time (UTC) |

**Returns:** `ProcurementResponse` — procurement metrics, wind metrics, periods array with `residualForecast`, `residualActual`, `procurementGapError`, `procurementGapAbs`, `procurementGapPct`.

---

### `GET /api/trend`

Multi-day rolling accuracy trend.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `end_date` | `YYYY-MM-DD` | Yes | — | Last date in range |
| `cutoff` | `HH:MM` | Yes | — | Decision cutoff time |
| `days` | integer | No | `7` | Number of days (max: `MAX_TREND_DAYS`) |

**Returns:** Array of daily `{ date, mae, rmse, bias, mape }` objects.

---

### `GET /api/health`

Health check — pings Elexon upstream.

**Returns:** `{ status, upstream_elexon, latency_ms }`

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend runs at `http://localhost:8000`. API docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`. The Vite dev server proxies `/api/*` to the backend.

### Environment Variables

Copy `.env.example` to `backend/.env` to override defaults:

```bash
cp .env.example backend/.env
```

---

## Docker Deployment

### Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)

### Run

```bash
docker compose up --build
```

- Frontend: `http://localhost` (port 80)
- Backend: `http://localhost:8000`

The frontend container waits for the backend health check to pass before starting (`depends_on: condition: service_healthy`).

### Production features in Docker

- **Non-root containers** — both backend and frontend run as unprivileged users
- **Health checks** — Docker polls `/api/health` every 30 s
- **nginx** — gzip compression, immutable asset caching (1 year), security headers, SPA fallback
- **Security headers** — `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`, `server_tokens off`

---

## Configuration

All backend settings are environment variables with sensible defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `ELEXON_BASE_URL` | `https://data.elexon.co.uk/bmrs/api/v1` | Elexon API base URL |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Allowed CORS origins (comma-separated) |
| `REQUEST_TIMEOUT_SECONDS` | `30` | Per-request timeout to Elexon |
| `MAX_RETRIES` | `3` | Retry attempts on network/5xx errors |
| `CACHE_TTL_SECONDS` | `300` | Cache TTL for data < 48 h old (5 min) |
| `CACHE_TTL_HISTORICAL` | `3600` | Cache TTL for historical data (1 hr) |
| `MAX_TREND_DAYS` | `30` | Maximum days for trend endpoint |
| `LOG_LEVEL` | `INFO` | Python logging level |

### Caching & Retry

- **In-memory TTL cache** — SHA-256 keyed on URL + params. Recent data (< 48 h old) cached for 5 min; historical for 1 hr.
- **Retry with exponential backoff** — 3 attempts, waiting `2^(attempt−1)` seconds between retries. 4xx errors are not retried.

---

## Project Structure

```
uk-wind-forecast/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes.py          # FastAPI route handlers
│   │   ├── services/
│   │   │   ├── elexon_client.py   # HTTP client with cache + retry
│   │   │   ├── forecast_selection.py  # Latest-forecast-per-slot algorithm
│   │   │   ├── metrics.py         # MAE, RMSE, bias, WAPE, correlation
│   │   │   └── procurement.py     # Residual demand + gap calculations
│   │   ├── config.py              # All env-configurable settings
│   │   ├── main.py                # FastAPI app, middleware, logging
│   │   └── schemas.py             # Pydantic response models
│   ├── Dockerfile
│   ├── .dockerignore
│   └── requirements.txt
├── frontend/
│   ├── public/
│   │   └── docs.html              # Standalone documentation page
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts          # fetch wrappers for all API endpoints
│   │   ├── components/
│   │   │   ├── DateControls.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── ErrorChart.tsx
│   │   │   ├── ErrorHistogram.tsx
│   │   │   ├── ForecastChart.tsx
│   │   │   ├── LeadTimeChart.tsx
│   │   │   ├── MetricCards.tsx
│   │   │   ├── PeriodTable.tsx
│   │   │   ├── ProcurementView.tsx
│   │   │   ├── SummaryStrip.tsx
│   │   │   └── TrendChart.tsx
│   │   ├── pages/
│   │   │   └── Dashboard.tsx      # Three-tab main page
│   │   └── types/
│   │       └── api.ts             # TypeScript interfaces for API responses
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── nginx.conf                 # Production nginx config
│   └── vite.config.ts
├── docs/
│   └── index.html                 # Mirror of frontend/public/docs.html
├── .env.example
├── .gitattributes
├── .gitignore
└── docker-compose.yml
```

---

## Future Scope

### Business & Analytical Gaps

| Priority | Feature | Impact |
|----------|---------|--------|
| 1 — Critical | **Solar generation** (Sheffield Solar API) | Fixes residual demand — solar ignored entirely today |
| 2 — Critical | **Imbalance prices** (Elexon ISPSTACK — SBP/SSP) | Converts MW gap errors into £ cost |
| 3 — High | **Intraday cutoff comparison** | Shows when re-trading pays off |
| 4 — High | **Demand forecast accuracy** (NDF vs actual) | Decompose gap into wind error vs demand error |
| 5 — Medium | **Seasonal / monthly breakdown** | Long-range risk calendar |

### Additional Data Platforms

| Platform | What it adds |
|----------|-------------|
| [Sheffield Solar](https://www.solar.sheffield.ac.uk/) | GB-wide solar forecast, free non-commercial API |
| Elexon ISPSTACK | SBP/SSP imbalance prices — same BMRS API |
| [National Grid ESO Data Portal](https://www.nationalgrideso.com/data-portal) | Interconnector flows, embedded wind/solar |
| N2EX / EPEX SPOT | Day-ahead market clearing prices |
| Elexon SOSO | Balancing Mechanism actions and costs |

### Technical Gaps

- **CSV / Excel export** — download any table from the dashboard
- **Authentication** — API key or OAuth2 for commercial deployment
- **Rate limiting** — per-IP throttle on `/api/trend` (fires up to 30 Elexon requests)
- **Unit & integration tests** — pytest for backend calculations, Vitest for frontend
- **Comparison mode** — side-by-side view of two dates or two cutoff times

---

## Tools Used

### Research & Domain Knowledge
- **ChatGPT** — GB electricity market structure, Elexon BMRS API exploration, procurement gap business logic
- **Google Gemini** — Elexon dataset field definitions, settlement period conventions, balancing mechanism background

### Development
- **Claude Code (VS Code extension + CLI)** — all code written and iterated using Claude Code across four phases:
  1. Backend API design (FastAPI, Elexon client, metrics)
  2. Frontend build (React, Recharts charts, Tailwind layout)
  3. Procurement gap feature (residual demand, under/over analysis, sortable tables)
  4. Production hardening (Docker, nginx, retry, cache, Error Boundary, documentation)

---

## Licence

MIT — free to use, modify and distribute.
