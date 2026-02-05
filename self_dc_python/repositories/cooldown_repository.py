"""
Cooldown Repository
Handles command cooldown tracking
"""

from datetime import datetime
from typing import Optional
import asyncpg

from repositories.base_repository import BaseRepository


class CooldownRepository(BaseRepository):
    """Repository for cooldowns table."""

    def __init__(self, pool: asyncpg.Pool):
        """
        Create CooldownRepository instance.

        Args:
            pool: PostgreSQL connection pool
        """
        super().__init__(pool, "cooldowns", "id")

    async def get_cooldown(self, user_id: str, command: str) -> Optional[datetime]:
        """
        Get active cooldown for user and command.

        Args:
            user_id: User ID
            command: Command name

        Returns:
            Expiration datetime or None
        """
        rows = await self.find_where(
            {"user_id": user_id, "command": command},
            {"order_by": "expires_at", "order": "DESC", "limit": 1}
        )

        if not rows:
            return None

        expires_at = rows[0].get("expires_at")
        if not expires_at:
            return None

        # Handle both datetime objects and strings
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)

        # Check if expired
        if expires_at <= datetime.now():
            return None

        return expires_at

    async def set_cooldown(self, user_id: str, command: str, duration_ms: int) -> bool:
        """
        Set cooldown for user and command.

        Args:
            user_id: User ID
            command: Command name
            duration_ms: Duration in milliseconds

        Returns:
            True if successful
        """
        expires_at = datetime.now().timestamp() + (duration_ms / 1000)
        expires_datetime = datetime.fromtimestamp(expires_at)

        sql = f"""
            INSERT INTO {self.table_name} (user_id, command, expires_at, created_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, command)
            DO UPDATE SET expires_at = $3, created_at = CURRENT_TIMESTAMP
        """

        try:
            await self.query(sql, [user_id, command, expires_datetime])
            return True
        except Exception as e:
            self.logger.error(f"Failed to set cooldown: {e}")
            return False

    async def is_on_cooldown(self, user_id: str, command: str) -> bool:
        """
        Check if user is on cooldown.

        Args:
            user_id: User ID
            command: Command name

        Returns:
            True if on cooldown
        """
        expires_at = await self.get_cooldown(user_id, command)
        return expires_at is not None

    async def get_remaining_time(self, user_id: str, command: str) -> int:
        """
        Get remaining cooldown time in milliseconds.

        Args:
            user_id: User ID
            command: Command name

        Returns:
            Remaining milliseconds (0 if not on cooldown)
        """
        expires_at = await self.get_cooldown(user_id, command)

        if not expires_at:
            return 0

        remaining = expires_at.timestamp() - datetime.now().timestamp()
        return max(0, int(remaining * 1000))

    async def clear_cooldown(self, user_id: str, command: str) -> bool:
        """
        Clear cooldown for user and command.

        Args:
            user_id: User ID
            command: Command name

        Returns:
            True if cleared
        """
        deleted = await self.delete_where({"user_id": user_id, "command": command})
        return deleted > 0

    async def clear_expired(self) -> int:
        """
        Clear all expired cooldowns.

        Returns:
            Number of cleared cooldowns
        """
        sql = f"DELETE FROM {self.table_name} WHERE expires_at < NOW()"

        if not self.is_connected():
            self.logger.warning("Database not connected, clear_expired skipped")
            return 0

        try:
            async with self.pool.acquire() as conn:
                result = await conn.execute(sql)
                return int(result.split()[1]) if result and "DELETE" in result else 0
        except Exception as e:
            self.logger.error(f"Failed to clear expired cooldowns: {e}")
            raise

    async def clear_user_cooldowns(self, user_id: str) -> int:
        """
        Clear all cooldowns for a user.

        Args:
            user_id: User ID

        Returns:
            Number of cleared cooldowns
        """
        return await self.delete_where({"user_id": user_id})
