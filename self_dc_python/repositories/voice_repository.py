"""
Voice Repository
Handles voice settings database operations
"""

from typing import Optional, Dict, Any, List
import asyncpg

from repositories.base_repository import BaseRepository


class VoiceRepository(BaseRepository):
    """Repository for voice_settings table."""

    def __init__(self, pool: asyncpg.Pool):
        """
        Create VoiceRepository instance.

        Args:
            pool: PostgreSQL connection pool
        """
        super().__init__(pool, "voice_settings", "guild_id")

    async def get_by_guild_id(self, guild_id: str) -> Optional[Dict[str, Any]]:
        """
        Get voice settings by guild ID.

        Args:
            guild_id: Guild ID

        Returns:
            Voice settings dict or None
        """
        row = await self.find_by_id(guild_id)
        return self.format_settings(row)

    async def save_settings(
        self,
        guild_id: str,
        channel_id: str,
        enabled: bool = True,
        self_mute: bool = True,
        self_deaf: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Save voice settings for a guild.

        Args:
            guild_id: Guild ID
            channel_id: Voice channel ID
            enabled: Auto-join enabled
            self_mute: Self mute
            self_deaf: Self deaf

        Returns:
            Saved settings dict or None
        """
        data = {
            "guild_id": guild_id,
            "channel_id": channel_id,
            "enabled": enabled,
            "self_mute": self_mute,
            "self_deaf": self_deaf,
        }

        row = await self.upsert(data, ["guild_id"])
        return self.format_settings(row)

    async def delete_by_guild_id(self, guild_id: str) -> bool:
        """
        Delete voice settings for a guild.

        Args:
            guild_id: Guild ID

        Returns:
            True if deleted
        """
        return await self.delete(guild_id)

    async def get_all_enabled(self) -> List[Dict[str, Any]]:
        """
        Get all enabled voice settings.

        Returns:
            List of voice settings dicts
        """
        rows = await self.find_where({"enabled": True})
        return [self.format_settings(row) for row in rows if row]

    async def set_enabled(
        self,
        guild_id: str,
        enabled: bool
    ) -> Optional[Dict[str, Any]]:
        """
        Enable/disable voice auto-join for a guild.

        Args:
            guild_id: Guild ID
            enabled: Enabled state

        Returns:
            Updated settings dict or None
        """
        row = await self.update(guild_id, {"enabled": enabled})
        return self.format_settings(row)

    def format_settings(
        self,
        row: Optional[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Format database row to consistent object.

        Args:
            row: Database row

        Returns:
            Formatted settings dict or None
        """
        if not row:
            return None

        return {
            "guild_id": row.get("guild_id"),
            "channel_id": row.get("channel_id"),
            "enabled": row.get("enabled"),
            "self_mute": row.get("self_mute"),
            "self_deaf": row.get("self_deaf"),
            "updated_at": row.get("updated_at"),
        }
