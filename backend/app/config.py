import os
from dotenv import load_dotenv

load_dotenv()

ELEXON_BASE_URL = os.getenv("ELEXON_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1")
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://frontend:3000"
).split(",")
REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "30"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "300"))   # 5 min for recent data
CACHE_TTL_HISTORICAL = int(os.getenv("CACHE_TTL_HISTORICAL", "3600"))  # 1 hr for past days
MAX_TREND_DAYS = int(os.getenv("MAX_TREND_DAYS", "30"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
