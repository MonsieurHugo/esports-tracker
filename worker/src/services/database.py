"""
Database Service
"""

from typing import Any

import asyncpg
import structlog

logger = structlog.get_logger(__name__)


class DatabaseService:
    """Service for database operations."""

    def __init__(self, database_url: str):
        self.database_url = database_url
        self._pool: asyncpg.Pool | None = None

    async def connect(self):
        """Create connection pool."""
        self._pool = await asyncpg.create_pool(
            self.database_url,
            min_size=5,
            max_size=20,
        )
        logger.info("Database pool created")

    async def disconnect(self):
        """Close connection pool."""
        if self._pool:
            await self._pool.close()
            logger.info("Database pool closed")

    async def execute(self, query: str, *args) -> str:
        """Execute a query."""
        async with self._pool.acquire() as conn:
            return await conn.execute(query, *args)

    async def fetch(self, query: str, *args) -> list[asyncpg.Record]:
        """Fetch multiple rows."""
        async with self._pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetchrow(self, query: str, *args) -> asyncpg.Record | None:
        """Fetch a single row."""
        async with self._pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def fetchval(self, query: str, *args) -> Any:
        """Fetch a single value."""
        async with self._pool.acquire() as conn:
            return await conn.fetchval(query, *args)

    # ==========================================
    # Player Operations
    # ==========================================

    async def get_all_players(self) -> list[asyncpg.Record]:
        """Get all tracked players."""
        return await self.fetch(
            "SELECT * FROM players WHERE is_active = true ORDER BY created_at"
        )

    async def get_player_by_puuid(self, puuid: str) -> asyncpg.Record | None:
        """Get player by PUUID."""
        return await self.fetchrow(
            "SELECT * FROM players WHERE riot_puuid = $1",
            puuid,
        )

    async def upsert_player(
        self,
        riot_puuid: str,
        summoner_name: str,
        summoner_id: str | None = None,
        region: str = "EUW1",
    ) -> asyncpg.Record:
        """Insert or update a player."""
        return await self.fetchrow(
            """
            INSERT INTO players (riot_puuid, summoner_name, summoner_id, region)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (riot_puuid)
            DO UPDATE SET
                summoner_name = EXCLUDED.summoner_name,
                summoner_id = EXCLUDED.summoner_id,
                updated_at = NOW()
            RETURNING *
            """,
            riot_puuid,
            summoner_name,
            summoner_id,
            region,
        )

    async def upsert_player_stats(
        self,
        player_id: str,
        queue_type: str,
        tier: str,
        rank: str,
        lp: int,
        wins: int,
        losses: int,
    ) -> asyncpg.Record:
        """Insert or update player stats."""
        return await self.fetchrow(
            """
            INSERT INTO player_stats (player_id, queue_type, tier, rank, lp, wins, losses)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (player_id, queue_type)
            DO UPDATE SET
                tier = EXCLUDED.tier,
                rank = EXCLUDED.rank,
                lp = EXCLUDED.lp,
                wins = EXCLUDED.wins,
                losses = EXCLUDED.losses,
                fetched_at = NOW()
            RETURNING *
            """,
            player_id,
            queue_type,
            tier,
            rank,
            lp,
            wins,
            losses,
        )

    # ==========================================
    # Match Operations
    # ==========================================

    async def get_match_by_riot_id(self, riot_match_id: str) -> asyncpg.Record | None:
        """Check if match exists."""
        return await self.fetchrow(
            "SELECT id FROM matches WHERE riot_match_id = $1",
            riot_match_id,
        )

    async def insert_match(
        self,
        riot_match_id: str,
        game_mode: str,
        game_duration: int,
        game_start_at: int,
    ) -> asyncpg.Record:
        """Insert a new match."""
        return await self.fetchrow(
            """
            INSERT INTO matches (riot_match_id, game_mode, game_duration, game_start_at)
            VALUES ($1, $2, $3, to_timestamp($4 / 1000))
            ON CONFLICT (riot_match_id) DO NOTHING
            RETURNING *
            """,
            riot_match_id,
            game_mode,
            game_duration,
            game_start_at,
        )
