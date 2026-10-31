# Architecture

## System Overview

```
User Browser
    │
    ▼
React 18 + TypeScript + Vite + Tailwind + Recharts
(Vercel — static build, nginx in Docker)
    │
    │ HTTPS REST
    ▼
FastAPI + Python 3.11 + uvicorn
(Render — Docker container)
    │
    │ HTTPS GET (publishDateTimeFrom/To)
    ▼
Elexon BMRS API v1
datasets: WINDFOR, FUELHH (fuelType=WIND)
```

---

## Backend Components

```
backend/
├── app/
│   ├── main.py              FastAPI app, CORS, logging
│   ├── config.py            Environment variables and defaults
│   ├── schemas.py           Pydantic request/response models
│   ├── api/
│   │   └── routes.py        /analysis, /procurement, /trend, /health
│   └── services/
│       ├── elexon_client.py  HTTP client, retry logic, in-memory cache
│       ├── forecast_selection.py  48-period timeline, forecast selection, period matching
│       ├── metrics.py        MAE, RMSE, Bias, WAPE, coverage, lead-time breakdown
│       └── procurement.py    Wind balancing exposure (wind-only)
└── tests/
    ├── test_forecast_selection.py
    ├── test_metrics.py
    ├── test_procurement.py
    └── test_api_routes.py
```

---

## Frontend Components

```
frontend/src/
├── pages/
│   └── Dashboard.tsx        Main shell: tabs, date controls, error handling
├── components/
│   ├── DateControls.tsx     Date + cutoff inputs
│   ├── MetricCards.tsx      MAE, RMSE, Bias, WAPE cards
│   ├── SummaryStrip.tsx     Coverage and key stats bar
│   ├── ForecastChart.tsx    Forecast vs actual line chart
│   ├── ErrorChart.tsx       Error over time
│   ├── ErrorHistogram.tsx   Error distribution
│   ├── LeadTimeChart.tsx    MAE by lead-time bucket
│   ├── TrendChart.tsx       Multi-day trend
│   ├── PeriodTable.tsx      Full period table with publish times
│   └── ProcurementView.tsx  Wind exposure analysis
├── api/
│   └── client.ts            fetch wrappers, base URL from VITE_API_BASE_URL
└── types/
    └── api.ts               TypeScript interfaces matching backend schemas
```

---

## Data Flow

1. User selects decision date + cutoff time
2. Frontend calls `GET /api/analysis?decision_date=...&cutoff_time=...`
3. Backend computes `delivery_date = decision_date + 1`
4. Backend fetches WINDFOR (publishDateTime window) and FUELHH (WIND, same window)
5. Forecast selection: for each of 48 delivery timestamps, picks latest publishTime ≤ cutoff
6. Actuals indexed by exact 30-min startTime
7. Full 48-period timeline built; missing periods carry explicit status
8. Metrics computed from matched periods only
9. Response returned; frontend renders charts and tables

---

## Caching

The backend uses an in-memory TTL cache:

| Data age | TTL |
|---|---|
| < 48 hours old | 5 minutes (300s) |
| ≥ 48 hours old | 1 hour (3600s) |

Cache key is a SHA-256 hash of the request URL + parameters. The cache is process-local and resets on restart.

---

## Deployment

| Layer | Platform | Config |
|---|---|---|
| Backend | Render (Docker) | `render.yaml`, `backend/Dockerfile` |
| Frontend | Vercel (source build) | `vercel.json`, `vite.config.ts` |
| Local dev | Docker Compose | `docker-compose.yml` |
