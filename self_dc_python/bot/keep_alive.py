"""
Keep-alive web server for Heroku deployment.
Prevents dyno from sleeping.
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from bot.config import config
from bot.database import is_connected
from utils.logger import get_logger

logger = get_logger("KeepAlive")

# Track bot status
_bot_status = {
    "status": "starting",
    "uptime": 0,
    "discord_connected": False,
    "database_connected": False,
}


def update_bot_status(**kwargs):
    """Update bot status for health endpoint."""
    _bot_status.update(kwargs)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events."""
    logger.info("Keep-alive server starting...")
    _bot_status["status"] = "running"
    yield
    logger.info("Keep-alive server shutting down...")


app = FastAPI(
    title="Self-DC Bot",
    description="Discord self-bot keep-alive server",
    version="2.0.0",
    lifespan=lifespan,
)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Self-DC Bot",
        "version": "2.0.0",
        "status": _bot_status.get("status", "unknown"),
    }


@app.get("/health")
async def health():
    """Health check endpoint for monitoring."""
    database_ok = is_connected()

    status = "healthy"
    if not _bot_status.get("discord_connected"):
        status = "degraded"
    if not database_ok:
        status = "degraded"

    return JSONResponse(
        status_code=200 if status == "healthy" else 503,
        content={
            "status": status,
            "discord": "connected" if _bot_status.get("discord_connected") else "disconnected",
            "database": "connected" if database_ok else "disconnected",
            "uptime": _bot_status.get("uptime", 0),
        },
    )


@app.get("/ping")
async def ping():
    """Simple ping endpoint."""
    return {"pong": True}


async def start_server():
    """Start the keep-alive server."""
    import uvicorn

    config_uvicorn = uvicorn.Config(
        app,
        host=config.HOST,
        port=config.PORT,
        log_level="warning",
        access_log=False,
    )
    server = uvicorn.Server(config_uvicorn)

    logger.info(f"Keep-alive server listening on port {config.PORT}")
    await server.serve()


async def run_server():
    """Run server in background task."""
    asyncio.create_task(start_server())
