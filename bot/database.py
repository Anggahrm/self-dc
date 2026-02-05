"""
Database connection management using asyncpg.
"""

import asyncpg
from typing import Optional

from bot.config import config
from utils.logger import get_logger

logger = get_logger("Database")

_pool: Optional[asyncpg.Pool] = None


async def init_database() -> None:
    """Initialize database connection pool."""
    global _pool

    if not config.DATABASE_URL:
        logger.warning("DATABASE_URL not set - database features disabled")
        return

    try:
        _pool = await asyncpg.create_pool(
            config.DATABASE_URL,
            min_size=1,
            max_size=10,
            command_timeout=60,
        )
        logger.success("Database connected successfully")
        await _init_tables()
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise


async def _init_tables() -> None:
    """Initialize database tables if they don't exist."""
    if not _pool:
        return

    async with _pool.acquire() as conn:
        # Create tables
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id VARCHAR(255) PRIMARY KEY,
                auto_farm_enabled BOOLEAN DEFAULT FALSE,
                auto_farm_channel_id VARCHAR(255),
                auto_farm_type VARCHAR(50) DEFAULT 'adventure',
                auto_farm_cooldown INTEGER DEFAULT 17,
                auto_enchant_enabled BOOLEAN DEFAULT FALSE,
                auto_enchant_channel_id VARCHAR(255),
                auto_enchant_target VARCHAR(50),
                auto_refine_enabled BOOLEAN DEFAULT FALSE,
                auto_refine_target VARCHAR(50),
                auto_divorce_enabled BOOLEAN DEFAULT FALSE,
                auto_divorce_channel_id VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS voice_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                channel_id VARCHAR(255) NOT NULL,
                enabled BOOLEAN DEFAULT TRUE,
                self_mute BOOLEAN DEFAULT TRUE,
                self_deaf BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS cooldowns (
                user_id VARCHAR(255) NOT NULL,
                command VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                PRIMARY KEY (user_id, command)
            )
        """)

        logger.info("Database tables initialized")


async def close_database() -> None:
    """Close database connection pool."""
    global _pool

    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Database connection closed")


def is_connected() -> bool:
    """Check if database is connected."""
    return _pool is not None


async def get_pool() -> Optional[asyncpg.Pool]:
    """Get the database connection pool."""
    return _pool


async def execute(query: str, *args) -> str:
    """Execute a query."""
    if not _pool:
        raise RuntimeError("Database not connected")

    async with _pool.acquire() as conn:
        return await conn.execute(query, *args)


async def fetch(query: str, *args):
    """Fetch multiple rows."""
    if not _pool:
        raise RuntimeError("Database not connected")

    async with _pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args):
    """Fetch a single row."""
    if not _pool:
        raise RuntimeError("Database not connected")

    async with _pool.acquire() as conn:
        return await conn.fetchrow(query, *args)
