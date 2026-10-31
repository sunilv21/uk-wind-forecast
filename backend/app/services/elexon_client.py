import logging
import asyncio
import hashlib
import json
import math
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
        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
                r = await client.get(url, params=params)
            elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
            r.raise_for_status()
            data = r.json()
            ttl = _ttl_for(to_dt)
            _cache_set(key, data, ttl)
            logger.info("Elexon %s → %d records in %sms (ttl=%ds)",
                        url.split("/")[-1], len(data), elapsed_ms, ttl)
            return data
        except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as exc:
            last_exc = exc
            if isinstance(exc, httpx.HTTPStatusError):
                if exc.response.status_code == 429:
                    wait = 10 * attempt  # back off more on rate-limit
                elif exc.response.status_code < 500:
                    raise  # 4xx client error — no point retrying
                else:
                    wait = 2 ** (attempt - 1)
            else:
                wait = 2 ** (attempt - 1)
            logger.warning("Elexon attempt %d/%d failed (%s), retrying in %ds", attempt, MAX_RETRIES, exc, wait)
            if attempt < MAX_RETRIES:
                await asyncio.sleep(wait)

    raise RuntimeError(f"Elexon API unavailable after {MAX_RETRIES} attempts: {last_exc}") from last_exc


async def fetch_windfor(from_dt: datetime, to_dt: datetime) -> list[dict]:
    """
    Fetch WINDFOR wind generation forecasts.
    Filtered by publishDateTime window: from_dt to to_dt.
    Returns records with startTime (delivery), publishTime, generation (MW).
    Non-finite generation values are rejected and counted.
    """
    raw = await _get(f"{ELEXON_BASE_URL}/datasets/WINDFOR/stream", _time_params(from_dt, to_dt), to_dt)
    records = []
    rejected = 0
    for item in raw:
        try:
            gen = float(item["generation"])
            if not math.isfinite(gen):
                rejected += 1
                continue
            records.append({
                "startTime": _parse_dt(item["startTime"]),
                "publishTime": _parse_dt(item["publishTime"]),
                "generation": gen,
            })
        except (KeyError, ValueError, TypeError):
            rejected += 1
            continue
    if rejected:
        logger.warning("WINDFOR: rejected %d malformed/non-finite records", rejected)
    logger.debug("WINDFOR: %d valid records returned", len(records))
    return records


async def fetch_fuelhh_wind(from_dt: datetime, to_dt: datetime) -> list[dict]:
    """
    Fetch FUELHH actual wind generation, fuelType=WIND only.
    Filtered by publishDateTime window: from_dt to to_dt.

    Caller should use a window wide enough to capture late revisions
    (e.g. delivery_start to delivery_end + 12h) and then filter by
    startTime in Python.

    Returns de-duplicated records with startTime, generation (MW), and
    publishTime (revision metadata).  Duplicate startTimes are resolved
    deterministically: the record with the latest publishTime is kept.
    Non-finite and non-WIND records are rejected.
    """
    params = {**_time_params(from_dt, to_dt), "fuelType": "WIND"}
    raw = await _get(f"{ELEXON_BASE_URL}/datasets/FUELHH/stream", params, to_dt)
    # best: startTime → {startTime, generation, publishTime}
    best: dict[datetime, dict] = {}
    rejected = 0
    for item in raw:
        try:
            if item.get("fuelType", "").upper() != "WIND":
                continue
            gen = float(item["generation"])
            if not math.isfinite(gen):
                rejected += 1
                continue
            st = _parse_dt(item["startTime"])
            pub = _parse_dt(item["publishTime"]) if "publishTime" in item else None
            if st not in best:
                best[st] = {"startTime": st, "generation": gen, "publishTime": pub}
            else:
                existing_pub = best[st]["publishTime"]
                # Latest publishTime wins — deterministic revision selection
                if pub is not None and (existing_pub is None or pub > existing_pub):
                    best[st] = {"startTime": st, "generation": gen, "publishTime": pub}
        except (KeyError, ValueError, TypeError):
            rejected += 1
            continue
    if rejected:
        logger.warning("FUELHH: rejected %d malformed/non-finite records", rejected)
    duplicates = len(raw) - len(best) - rejected
    if duplicates > 0:
        logger.info("FUELHH: resolved %d duplicate startTime records (kept latest publishTime)", duplicates)
    return list(best.values())


# Backward-compat alias used by routes.py
fetch_fuelhh = fetch_fuelhh_wind
