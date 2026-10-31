# UK Wind Generation Forecast & Accuracy Dashboard

**Live demo:** [uk-wind-forecast-topaz.vercel.app](https://uk-wind-forecast-topaz.vercel.app)  
**API:** [uk-wind-forecast-1vw9.onrender.com/api/health](https://uk-wind-forecast-1vw9.onrender.com/api/health)  
**GitHub:** [github.com/sunilv21/uk-wind-forecast](https://github.com/sunilv21/uk-wind-forecast)

A full-stack production-grade dashboard for analysing GB wind generation forecast accuracy and wind balancing exposure, built on live data from the [Elexon BMRS API](https://www.elexon.co.uk/data/balancing-mechanism-reporting-service/).

---

## Table of Contents

- [Business Problem](#business-problem)
- [Features](#features)
- [Data Sources](#data-sources)
- [Architecture](#architecture)
- [Forecast Selection Methodology](#forecast-selection-methodology)
- [Accuracy Metrics](#accuracy-metrics)
- [Wind Balancing Exposure](#wind-balancing-exposure)
- [Assumptions and Limitations](#assumptions-and-limitations)
- [Installation](#installation)
- [Local Development](#local-development)
- [Docker](#docker)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [AI Tools Used](#ai-tools-used)

---

## Business Problem

GB electricity traders making day-ahead procurement decisions rely on wind generation forecasts. When forecasts are wrong, the imbalance must be corrected in the balancing market — often at significantly higher cost.

This dashboard answers:

1. **How accurate are WINDFOR day-ahead forecasts?** — MAE, RMSE, Bias and WAPE by delivery period, lead time and multi-day trend.
2. **What was the wind forecast exposure?** — When wind produced less or more than forecast, how large was the deviation, and what energy (MWh) was involved?

> **Important:** Consumer demand data is not included in the permitted dataset scope. This application measures *wind forecast error exposure only*, not total electricity procurement requirement.

---

## Features

- **Wind Forecast Accuracy** tab: MAE, RMSE, Bias, WAPE; 48-period forecast vs actual chart; lead-time breakdown; error histogram; multi-day trend; full period table with publish timestamps and missing-data status
- **Wind Exposure Analysis** tab: overforecast (shortfall) and underforecast (surplus) exposure in MWh; sortable detail tables; wind error chart
- **Documentation** tab: embedded in-app docs
- 30-minute resolution preserved throughout (no hourly aggregation)
- Explicit missing-data status for every delivery period
- Default analysis period: January 2026

---

## Data Sources

Only two Elexon BMRS datasets are used:

| Dataset | Description | Resolution | Key Fields |
|---|---|---|---|
| `WINDFOR` | Wind generation forecast | 30 min | `startTime`, `publishTime`, `generation` (MW) |
| `FUELHH` `fuelType=WIND` | Actual wind generation | 30 min | `startTime`, `generation` (MW) |

NDF, total FUELHH demand and all other datasets are **not used**.

API documentation: [bmrs.elexon.co.uk/api-documentation](https://bmrs.elexon.co.uk/api-documentation)

See [docs/data-sources.md](docs/data-sources.md) for full details.

---

## Architecture

```
React 18 + TypeScript + Vite + Tailwind + Recharts
          (Vercel static build)
                  │
                  │ HTTPS REST
                  ▼
       FastAPI + Python 3.11 + uvicorn
          (Render Docker container)
                  │
                  │ HTTPS GET
                  ▼
         Elexon BMRS API v1
    WINDFOR + FUELHH (fuelType=WIND)
```

See [docs/architecture.md](docs/architecture.md) for component diagram.

---

## Forecast Selection Methodology

For each of the 48 expected delivery periods on the delivery date:

1. Generate the complete 48-period timeline (00:00–23:30 UTC on delivery date)
2. For each period, select the **latest forecast published on or before the decision cutoff**:
   ```
   selected_publishTime = MAX(publishTime WHERE publishTime ≤ cutoff)
   ```
3. Match against actual generation by exact 30-minute `startTime`
4. Assign status: `matched`, `missing_forecast`, `missing_actual`, or `missing_both`

**Day-ahead rule:** delivery date = decision date + 1 calendar day.

See [docs/methodology.md](docs/methodology.md) for full details.

---

## Accuracy Metrics

Computed from matched periods only. Missing values are never treated as zero.

| Metric | Formula |
|---|---|
| MAE | Mean(|Forecast − Actual|) |
| RMSE | √(Mean((Forecast − Actual)²)) |
| Bias | Mean(Forecast − Actual) — positive = systematic over-forecast |
| WAPE | Sum(|Error|) / Sum(|Actual|) × 100 |
| Coverage | Matched periods / 48 × 100 |

---

## Wind Balancing Exposure

Per 30-minute matched period:

```
windError = windForecast − actualWind

overforecast_energy  = max(0, windError)  × 0.5 h   [MWh]
underforecast_energy = max(0, −windError) × 0.5 h   [MWh]
```

The 0.5-hour factor is essential — each period is 30 minutes, not 1 hour.

See [docs/assumptions-and-limitations.md](docs/assumptions-and-limitations.md) for scope limitations.

---

## Assumptions and Limitations

- **No consumer demand data** — total electricity procurement cannot be calculated
- **Capacity factor** uses assumed 30 GW installed GB wind capacity (not from Elexon)
- **UTC timestamps** throughout — no local time conversion
- **January 2026** is the default analysis period

See [docs/assumptions-and-limitations.md](docs/assumptions-and-limitations.md) for full list.

---

## Installation

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker + Docker Compose (for containerised run)

### Clone

```bash
git clone https://github.com/sunilv21/uk-wind-forecast.git
cd uk-wind-forecast
```

---

## Local Development

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Mac/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API available at: http://localhost:8000/api/health

### Run backend tests

```bash
cd backend
python -m pytest tests/ -v
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App available at: http://localhost:5173

Set backend URL:
```bash
# frontend/.env.local
VITE_API_BASE_URL=http://localhost:8000
```

---

## Docker

### Run both services

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000/api/health

### Stop

```bash
docker compose down
```

---

## Environment Variables

See [.env.example](.env.example) for all variables with descriptions.

Key variables:

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend URL (frontend build-time) |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Allowed frontend origins |
| `UK_INSTALLED_WIND_MW` | `30000` | Assumed GB installed wind capacity |
| `LOG_LEVEL` | `INFO` | Backend log level |

---

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Backend and upstream health check |
| `GET /api/analysis?decision_date=YYYY-MM-DD&cutoff_time=HH:MM` | Wind forecast accuracy analysis |
| `GET /api/procurement?decision_date=YYYY-MM-DD&cutoff_time=HH:MM` | Wind balancing exposure |
| `GET /api/trend?start_date=...&end_date=...&cutoff_time=...` | Multi-day accuracy trend |

Full documentation: [docs/api-reference.md](docs/api-reference.md)

---

## Project Structure

```
uk-wind-forecast/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── schemas.py
│   │   ├── api/routes.py
│   │   └── services/
│   │       ├── elexon_client.py
│   │       ├── forecast_selection.py
│   │       ├── metrics.py
│   │       └── procurement.py
│   ├── tests/
│   │   ├── test_forecast_selection.py
│   │   ├── test_metrics.py
│   │   ├── test_procurement.py
│   │   └── test_api_routes.py
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/Dashboard.tsx
│   │   ├── components/
│   │   ├── api/client.ts
│   │   └── types/api.ts
│   ├── public/docs.html
│   ├── Dockerfile
│   └── vercel.json
├── docs/
│   ├── architecture.md
│   ├── data-sources.md
│   ├── methodology.md
│   ├── api-reference.md
│   └── assumptions-and-limitations.md
├── docker-compose.yml
├── .env.example
├── render.yaml
└── README.md
```

---

## AI Tools Used

This project was developed with the assistance of AI tools:

- **Claude (Anthropic)** — code generation, architecture design, test writing, documentation
- **Claude Code** — iterative implementation, debugging, deployment configuration

All AI-generated code was reviewed, tested and validated against the Elexon BMRS API and assignment requirements.
