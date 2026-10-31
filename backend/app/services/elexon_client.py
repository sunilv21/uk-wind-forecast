import logging
import asyncio
import hashlib
import json
import time
from datetime import datetime, timezone
from app.config import ELEXON_BASE_URL, REQUEST_TIMEOUT, MAX_RETRIES, CACHE_TTL_SECONDS, CACHE_TTL_HISTORICAL

import httpx

logger = logging.getLogger(__name__)

# Simple in-memory TTL cache: {cache_key: (expire_ts, data)}
_cache: dict[str, tuple[float, list]] = {}


def _cache_key(url: str, params: dict) -> str:
    raw = url + json.dumps(params, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()


def _cache_get(key: str) -> list | None:
    entry = _cache.get(key)
    if entry and time.monotonic() < entry[0]:
        return entry[1]
    _cache.pop(key, None)
    return None


def _cache_set(key: str, data: list, ttl: int) -> None:
    _cache[key] = (time.monotonic() + ttl, data)


def _ttl_for(to_dt: datetime) -> int:
    """Recent data (last 2 days) uses short TTL; historical uses long TTL."""
    age_hours = (datetime.now(timezone.utc) - to_dt).total_seconds() / 3600
    return CACHE_TTL_SECONDS if age_hours < 48 else CACHE_TTL_HISTORICAL


def _parse_dt(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _time_params(from_dt: datetime, to_dt: datetime) -> dict:
    return {
        "publishDateTimeFrom": from_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "publishDateTimeTo": to_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "format": "json",
    }


async def _get(url: str, params: dict, to_dt: datetime) -> list:
    key = _cache_key(url, params)
    cached = _cache_get(key)
    if cached is not None:
        logger.debug("Cache hit: %s", url.split("/")[-1])
        return cached

    last_exc: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()
            ttl = _ttl_for(to_dt)
            _cache_set(key, data, ttl)
            logger.debug("Fetched %s: %d records (ttl=%ds)", url.split("/")[-1], len(data), ttl)
            return data
        except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as exc:
            last_exc = exc
            if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code < 500:
                raise  # 4xx — no point retrying
            wait = 2 ** (attempt - 1)
            logger.warning("Elexon attempt %d/%d failed (%s), retrying in %ds", attempt, MAX_RETRIES, exc, wait)
            if attempt < MAX_RETRIES:
                await asyncio.sleep(wait)

    raise RuntimeError(f"Elexon API unavailable after {MAX_RETRIES} attempts: {last_exc}") from last_exc


async def fetch_windfor(from_dt: datetime, to_dt: datetime) -> list[dict]:
    raw = await _get(f"{ELEXON_BASE_URL}/datasets/WINDFOR/stream", _time_params(from_dt, to_dt), to_dt)
    records = []
    for item in raw:
        try:
            records.append({
                "startTime": _parse_dt(item["startTime"]),
                "publishTime": _parse_dt(item["publishTime"]),
                "generation": float(item["generation"]),
            })
        except (KeyError, ValueError, TypeError):
            continue
    return records


async def fetch_fuelhh_wind(from_dt: datetime, to_dt: datetime) -> list[dict]:
    params = {**_time_params(from_dt, to_dt), "fuelType": "WIND"}
    raw = await _get(f"{ELEXON_BASE_URL}/datasets/FUELHH/stream", params, to_dt)
    records = []
    for item in raw:
        try:
            if item.get("fuelType", "").upper() != "WIND":
                continue
            records.append({
                "startTime": _parse_dt(item["startTime"]),
                "generation": float(item["generation"]),
            })
        except (KeyError, ValueError, TypeError):
            continue
    return records


async def fetch_fuelhh_demand(from_dt: datetime, to_dt: datetime) -> list[dict]:
    """Total actual demand = sum of all fuel types per half-hour period."""
    raw = await _get(f"{ELEXON_BASE_URL}/datasets/FUELHH/stream", _time_params(from_dt, to_dt), to_dt)
    totals: dict[datetime, float] = {}
    for item in raw:
        try:
            t = _parse_dt(item["startTime"])
            totals[t] = totals.get(t, 0.0) + float(item["generation"])
        except (KeyError, ValueError, TypeError):
            continue
    return [{"startTime": t, "demand": v} for t, v in sorted(totals.items())]


async def fetch_ndf(from_dt: datetime, to_dt: datetime) -> list[dict]:
    """Half-hourly national demand forecast (NDF), boundary=N only."""
    raw = await _get(f"{ELEXON_BASE_URL}/datasets/NDF/stream", _time_params(from_dt, to_dt), to_dt)
    records = []
    for item in raw:
        try:
            if item.get("boundary", "N").upper() != "N":
                continue
            records.append({
                "startTime": _parse_dt(item["startTime"]),
                "publishTime": _parse_dt(item["publishTime"]),
                "demand": float(item["demand"]),
            })
        except (KeyError, ValueError, TypeError):
            continue
    return records


# Backward-compat alias
fetch_fuelhh = fetch_fuelhh_wind
