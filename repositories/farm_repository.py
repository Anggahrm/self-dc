"""
Farm Repository
Handles farm settings database operations
"""

from typing import Optional, Dict, Any, List
import asyncpg

from repositories.base_repository import BaseRepository


class FarmRepository(BaseRepository):
    """Repository for farm settings in user_settings table."""

    def __init__(self, pool: asyncpg.Pool):
        """
        Create FarmRepository instance.

        Args:
            pool: PostgreSQL connection pool
        """
        super().__init__(pool, "user_settings", "user_id")

    async def get_farm_settings(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get farm settings for a user.

        Args:
            user_id: User ID

        Returns:
            Farm settings dict or None
        """
        row = await self.find_by_id(user_id)
        if not row:
            return None

        return {
            "user_id": row.get("user_id"),
            "enabled": row.get("auto_farm_enabled", False),
            "channel_id": row.get("auto_farm_channel_id"),
            "guild_id": row.get("auto_farm_guild_id"),
        }

    async def save_farm_settings(
        self,
        user_id: str,
        channel_id: str,
        guild_id: str,
        enabled: bool = True,
    ) -> bool:
        """
        Save farm settings for a user.

        Args:
            user_id: User ID
            channel_id: Channel ID for farming
            guild_id: Guild ID
            enabled: Auto-farm enabled

        Returns:
            True if successful
        """
        sql = """
            INSERT INTO user_settings (user_id, auto_farm_enabled, auto_farm_channel_id, auto_farm_guild_id, updated_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id)
            DO UPDATE SET
                auto_farm_enabled = $2,
                auto_farm_channel_id = $3,
                auto_farm_guild_id = $4,
                updated_at = CURRENT_TIMESTAMP
        """

        try:
            await self.query(sql, [user_id, enabled, channel_id, guild_id])
            return True
        except Exception as e:
            self.logger.error(f"Failed to save farm settings: {e}")
            return False

    async def disable_farm(self, user_id: str) -> bool:
        """
        Disable farm for a user.

        Args:
            user_id: User ID

        Returns:
            True if successful
        """
        sql = """
            UPDATE user_settings
            SET auto_farm_enabled = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $1
        """

        try:
            await self.query(sql, [user_id])
            return True
        except Exception as e:
            self.logger.error(f"Failed to disable farm: {e}")
            return False

    async def get_all_enabled(self) -> List[Dict[str, Any]]:
        """
        Get all users with farm enabled.

        Returns:
            List of farm settings
        """
        sql = """
            SELECT user_id, auto_farm_channel_id, auto_farm_guild_id
            FROM user_settings
            WHERE auto_farm_enabled = TRUE
        """

        rows = await self.query(sql)
        return [
            {
                "user_id": row.get("user_id"),
                "channel_id": row.get("auto_farm_channel_id"),
                "guild_id": row.get("auto_farm_guild_id"),
            }
            for row in rows
        ]
