import logging
import time
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
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["Accept", "Accept-Encoding", "Cache-Control"],
    expose_headers=["X-Request-ID", "X-Response-Time"],
)


@app.middleware("http")
async def add_request_metadata(request: Request, call_next) -> Response:
    start = time.perf_counter()
    request_id = request.headers.get("X-Request-ID", "")
    response = await call_next(request)
    elapsed_ms = round((time.perf_counter() - start) * 1000, 1)
    response.headers["X-Response-Time"] = f"{elapsed_ms}ms"
    if request_id:
        response.headers["X-Request-ID"] = request_id
    logger.info(
        "%s %s %s %sms",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


app.include_router(router, prefix="/api")
