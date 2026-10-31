import logging
import time
import uuid
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from app.api.routes import router
from app.config import CORS_ORIGINS, LOG_LEVEL

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("app")

# Strip whitespace that can creep in via env var configuration
_cors_origins = [o.strip() for o in CORS_ORIGINS if o.strip()]

app = FastAPI(
    title="UK Wind Forecast Dashboard API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET"],
    allow_headers=["Accept", "Accept-Encoding", "Cache-Control"],
    expose_headers=["X-Request-ID", "X-Response-Time"],
)


@app.middleware("http")
async def add_request_metadata(request: Request, call_next) -> Response:
    start = time.perf_counter()
    # Generate a request ID if the caller did not supply one
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:8]
    response = await call_next(request)
    elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
    response.headers["X-Response-Time"] = f"{elapsed_ms}ms"
    response.headers["X-Request-ID"] = request_id
    logger.info(
        "[%s] %s %s %s %sms",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


app.include_router(router, prefix="/api")
