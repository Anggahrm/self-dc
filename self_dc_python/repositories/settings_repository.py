"""
Settings Repository
Handles application settings storage and retrieval
"""

from typing import Any, Optional, Dict
import asyncpg
import json

from repositories.base_repository import BaseRepository


class SettingsRepository(BaseRepository):
    """Repository for settings table."""

    def __init__(self, pool: asyncpg.Pool):
        """
        Create SettingsRepository instance.

        Args:
            pool: PostgreSQL connection pool
        """
        super().__init__(pool, "settings", "key")

    async def get(self, key: str, default_value: Any = None) -> Any:
        """
        Get a setting value by key.

        Args:
            key: Setting key
            default_value: Default value if not found

        Returns:
            Setting value or default
        """
        row = await self.find_by_id(key)

        if not row:
            return default_value

        value = row.get("value")
        if value is None:
            return default_value

        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            # Value is not JSON, return as string
            return value

    async def set(self, key: str, value: Any) -> bool:
        """
        Set a setting value.

        Args:
            key: Setting key
            value: Value to store

        Returns:
            True if successful
        """
        value_str = value if isinstance(value, str) else json.dumps(value)

        sql = f"""
            INSERT INTO {self.table_name} (key, value, updated_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (key)
            DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
        """

        try:
            await self.query(sql, [key, value_str])
            return True
        except Exception as e:
            self.logger.error(f"Failed to set setting: {e}")
            return False

    async def delete(self, key: str) -> bool:
        """
        Delete a setting.

        Args:
            key: Setting key

        Returns:
            True if deleted
        """
        return await super().delete(key)

    async def get_all(self) -> Dict[str, Any]:
        """
        Get all settings as an object.

        Returns:
            Dict of all settings
        """
        rows = await self.find_all()
        settings: Dict[str, Any] = {}

        for row in rows:
            key = row.get("key")
            value = row.get("value")
            if key is None:
                continue

            try:
                settings[key] = json.loads(value) if value else None
            except (json.JSONDecodeError, TypeError):
                settings[key] = value

        return settings
