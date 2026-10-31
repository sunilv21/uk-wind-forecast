import os
import logging
from dotenv import load_dotenv

load_dotenv()

ELEXON_BASE_URL = os.getenv("ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1").rstrip("/")
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://frontend:3000"
).split(",")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

try:
    REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "30"))
    assert REQUEST_TIMEOUT > 0, "REQUEST_TIMEOUT_SECONDS must be positive"
except (ValueError, AssertionError) as e:
    raise RuntimeError(f"Invalid REQUEST_TIMEOUT_SECONDS: {e}") from e

try:
    MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
    assert 1 <= MAX_RETRIES <= 10, "MAX_RETRIES must be 1–10"
except (ValueError, AssertionError) as e:
    raise RuntimeError(f"Invalid MAX_RETRIES: {e}") from e

try:
    CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "300"))
    assert CACHE_TTL_SECONDS > 0, "CACHE_TTL_SECONDS must be positive"
    CACHE_TTL_HISTORICAL = int(os.getenv("CACHE_TTL_HISTORICAL", "3600"))
    assert CACHE_TTL_HISTORICAL > 0, "CACHE_TTL_HISTORICAL must be positive"
except (ValueError, AssertionError) as e:
    raise RuntimeError(f"Invalid cache TTL config: {e}") from e

try:
    MAX_TREND_DAYS = int(os.getenv("MAX_TREND_DAYS", "30"))
    assert 1 <= MAX_TREND_DAYS <= 365, "MAX_TREND_DAYS must be 1–365"
except (ValueError, AssertionError) as e:
    raise RuntimeError(f"Invalid MAX_TREND_DAYS: {e}") from e

try:
    # Assumed GB installed wind capacity. NOT from Elexon. Used only for capacity factor display.
    # Source: DESNZ/DUKES (approx. 30 GW onshore + offshore, early 2026).
    UK_INSTALLED_WIND_MW = float(os.getenv("UK_INSTALLED_WIND_MW", "30000"))
    assert UK_INSTALLED_WIND_MW > 0, "UK_INSTALLED_WIND_MW must be positive"
except (ValueError, AssertionError) as e:
    raise RuntimeError(f"Invalid UK_INSTALLED_WIND_MW: {e}") from e

if LOG_LEVEL not in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
    logging.warning("Unknown LOG_LEVEL '%s', defaulting to INFO", LOG_LEVEL)
    LOG_LEVEL = "INFO"
