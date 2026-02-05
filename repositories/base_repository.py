"""
Base Repository
Generic repository pattern for database operations
Provides common CRUD operations and connection management
"""

from abc import ABC
from typing import Any, Dict, List, Optional, Callable, AsyncGenerator
import asyncpg

from utils.logger import get_logger


class BaseRepository(ABC):
    """
    Base repository class for database operations.

    This is an abstract base class - do not instantiate directly.
    Subclasses should provide table_name and primary_key.
    """

    def __init__(
        self,
        pool: asyncpg.Pool,
        table_name: str,
        primary_key: str = "id"
    ):
        """
        Create a new repository instance.

        Args:
            pool: PostgreSQL connection pool
            table_name: Database table name
            primary_key: Primary key column name
        """
        if self.__class__ == BaseRepository:
            raise TypeError("Cannot instantiate abstract BaseRepository directly")

        self.pool = pool
        self.table_name = table_name
        self.primary_key = primary_key
        self.logger = get_logger(self.__class__.__name__)

    def is_connected(self) -> bool:
        """Check if database is connected."""
        return self.pool is not None

    async def query(
        self,
        sql: str,
        params: Optional[List[Any]] = None
    ) -> Optional[asyncpg.Record]:
        """
        Execute a raw query with error handling.

        Args:
            sql: SQL query string
            params: Query parameters

        Returns:
            Query result or None on error
        """
        if not self.is_connected():
            self.logger.warning("Database not connected, query skipped")
            return None

        if params is None:
            params = []

        try:
            async with self.pool.acquire() as conn:
                return await conn.fetchrow(sql, *params)
        except Exception as e:
            self.logger.error(f"Query failed: {e}")
            raise

    async def query_many(
        self,
        sql: str,
        params: Optional[List[Any]] = None
    ) -> List[asyncpg.Record]:
        """
        Execute a raw query returning multiple rows.

        Args:
            sql: SQL query string
            params: Query parameters

        Returns:
            List of query results
        """
        if not self.is_connected():
            self.logger.warning("Database not connected, query skipped")
            return []

        if params is None:
            params = []

        try:
            async with self.pool.acquire() as conn:
                return await conn.fetch(sql, *params)
        except Exception as e:
            self.logger.error(f"Query failed: {e}")
            raise

    async def find_by_id(self, id: Any) -> Optional[Dict[str, Any]]:
        """
        Find a single record by primary key.

        Args:
            id: Primary key value

        Returns:
            Record as dict or None
        """
        sql = f"""
            SELECT * FROM {self.table_name}
            WHERE {self.primary_key} = $1
        """
        row = await self.query(sql, [id])
        return dict(row) if row else None

    async def find_where(
        self,
        conditions: Optional[Dict[str, Any]] = None,
        options: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Find records by conditions.

        Args:
            conditions: Key-value conditions
            options: Query options (limit, offset, order_by, order)

        Returns:
            List of records as dicts
        """
        if conditions is None:
            conditions = {}
        if options is None:
            options = {}

        keys = list(conditions.keys())
        values = list(conditions.values())

        sql = f"SELECT * FROM {self.table_name}"

        if keys:
            where_clause = " AND ".join(
                f"{self.to_snake_case(key)} = ${i + 1}"
                for i, key in enumerate(keys)
            )
            sql += f" WHERE {where_clause}"

        if options.get("order_by"):
            order = options.get("order", "ASC")
            sql += f" ORDER BY {self.to_snake_case(options['order_by'])} {order}"

        if options.get("limit"):
            sql += f" LIMIT {options['limit']}"

        if options.get("offset"):
            sql += f" OFFSET {options['offset']}"

        rows = await self.query_many(sql, values)
        return [dict(row) for row in rows]

    async def find_all(
        self,
        options: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Find all records.

        Args:
            options: Query options

        Returns:
            List of records as dicts
        """
        return await self.find_where({}, options)

    async def create(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Create a new record.

        Args:
            data: Record data

        Returns:
            Created record as dict or None
        """
        keys = list(data.keys())
        values = list(data.values())
        columns = [self.to_snake_case(k) for k in keys]

        placeholders = ", ".join(f"${i + 1}" for i in range(len(values)))

        sql = f"""
            INSERT INTO {self.table_name} ({', '.join(columns)})
            VALUES ({placeholders})
            RETURNING *
        """

        row = await self.query(sql, values)
        return dict(row) if row else None

    async def update(
        self,
        id: Any,
        data: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Update a record by primary key.

        Args:
            id: Primary key value
            data: Update data

        Returns:
            Updated record as dict or None
        """
        keys = list(data.keys())
        values = list(data.values())

        if not keys:
            return None

        set_clause = ", ".join(
            f"{self.to_snake_case(key)} = ${i + 1}"
            for i, key in enumerate(keys)
        )

        sql = f"""
            UPDATE {self.table_name}
            SET {set_clause}, updated_at = CURRENT_TIMESTAMP
            WHERE {self.primary_key} = ${len(keys) + 1}
            RETURNING *
        """

        row = await self.query(sql, values + [id])
        return dict(row) if row else None

    async def upsert(
        self,
        data: Dict[str, Any],
        conflict_columns: List[str]
    ) -> Optional[Dict[str, Any]]:
        """
        Upsert (insert or update) a record.

        Args:
            data: Record data (must include primary key)
            conflict_columns: Columns for conflict resolution

        Returns:
            Upserted record as dict or None
        """
        keys = list(data.keys())
        values = list(data.values())
        columns = [self.to_snake_case(k) for k in keys]

        placeholders = ", ".join(f"${i + 1}" for i in range(len(values)))

        conflict_fields = ", ".join(self.to_snake_case(c) for c in conflict_columns)

        update_columns = [
            f"{self.to_snake_case(k)} = EXCLUDED.{self.to_snake_case(k)}"
            for k in keys
            if k not in conflict_columns
        ]

        if update_columns:
            update_clause = ", ".join(update_columns) + ", updated_at = CURRENT_TIMESTAMP"
        else:
            update_clause = "updated_at = CURRENT_TIMESTAMP"

        sql = f"""
            INSERT INTO {self.table_name} ({', '.join(columns)})
            VALUES ({placeholders})
            ON CONFLICT ({conflict_fields})
            DO UPDATE SET {update_clause}
            RETURNING *
        """

        row = await self.query(sql, values)
        return dict(row) if row else None

    async def delete(self, id: Any) -> bool:
        """
        Delete a record by primary key.

        Args:
            id: Primary key value

        Returns:
            True if deleted, False otherwise
        """
        sql = f"""
            DELETE FROM {self.table_name}
            WHERE {self.primary_key} = $1
        """

        if not self.is_connected():
            self.logger.warning("Database not connected, delete skipped")
            return False

        try:
            async with self.pool.acquire() as conn:
                result = await conn.execute(sql, id)
                # Result is typically "DELETE N" where N is row count
                return result and "DELETE" in result and int(result.split()[1]) > 0
        except Exception as e:
            self.logger.error(f"Delete failed: {e}")
            raise

    async def delete_where(self, conditions: Dict[str, Any]) -> int:
        """
        Delete records by conditions.

        Args:
            conditions: Key-value conditions

        Returns:
            Number of deleted records
        """
        keys = list(conditions.keys())
        values = list(conditions.values())

        if not keys:
            raise ValueError("Delete conditions cannot be empty")

        where_clause = " AND ".join(
            f"{self.to_snake_case(key)} = ${i + 1}"
            for i, key in enumerate(keys)
        )

        sql = f"DELETE FROM {self.table_name} WHERE {where_clause}"

        if not self.is_connected():
            self.logger.warning("Database not connected, delete skipped")
            return 0

        try:
            async with self.pool.acquire() as conn:
                result = await conn.execute(sql, *values)
                # Result is typically "DELETE N" where N is row count
                return int(result.split()[1]) if result and "DELETE" in result else 0
        except Exception as e:
            self.logger.error(f"Delete failed: {e}")
            raise

    async def count(self, conditions: Optional[Dict[str, Any]] = None) -> int:
        """
        Count records.

        Args:
            conditions: Optional filter conditions

        Returns:
            Record count
        """
        if conditions is None:
            conditions = {}

        keys = list(conditions.keys())
        values = list(conditions.values())

        sql = f"SELECT COUNT(*) FROM {self.table_name}"

        if keys:
            where_clause = " AND ".join(
                f"{self.to_snake_case(key)} = ${i + 1}"
                for i, key in enumerate(keys)
            )
            sql += f" WHERE {where_clause}"

        row = await self.query(sql, values)
        return row[0] if row else 0

    async def exists(self, conditions: Dict[str, Any]) -> bool:
        """
        Check if record exists.

        Args:
            conditions: Filter conditions

        Returns:
            True if exists, False otherwise
        """
        count = await self.count(conditions)
        return count > 0

    async def transaction(
        self,
        callback: Callable[[asyncpg.Connection], Any]
    ) -> Any:
        """
        Execute within a transaction.

        Args:
            callback: Async callback receiving connection

        Returns:
            Result from callback
        """
        if not self.is_connected():
            raise RuntimeError("Database not connected")

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                try:
                    return await callback(conn)
                except Exception as e:
                    self.logger.error(f"Transaction failed: {e}")
                    raise

    @staticmethod
    def to_snake_case(s: str) -> str:
        """Convert camelCase to snake_case."""
        result = []
        for i, char in enumerate(s):
            if char.isupper() and i > 0:
                result.append("_")
            result.append(char.lower())
        return "".join(result)

    @staticmethod
    def to_camel_case(s: str) -> str:
        """Convert snake_case to camelCase."""
        parts = s.split("_")
        return parts[0] + "".join(word.capitalize() for word in parts[1:])

    def row_to_object(self, row: Optional[asyncpg.Record]) -> Optional[Dict[str, Any]]:
        """
        Transform database row to camelCase object.

        Args:
            row: Database row

        Returns:
            Dict with camelCase keys
        """
        if not row:
            return None

        return {
            self.to_camel_case(key): value
            for key, value in dict(row).items()
        }
