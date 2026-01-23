"""
Database Service
"""

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from typing import Any

import asyncpg
import structlog

logger = structlog.get_logger(__name__)


def ensure_utc(dt: datetime | None) -> datetime | None:
    """Ensure datetime is UTC-aware. Returns None if input is None."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class DatabaseService:
    """Service for database operations."""

    def __init__(self, database_url: str):
        self.database_url = database_url
        self._pool: asyncpg.Pool | None = None
        self._semaphore = asyncio.Semaphore(15)  # Limit concurrent ops (pool max=20)

    async def connect(self) -> None:
        """Create connection pool with proper timeout handling."""
        try:
            self._pool = await asyncio.wait_for(
                asyncpg.create_pool(
                    self.database_url,
                    min_size=5,
                    max_size=20,
                    command_timeout=30,  # Timeout for individual commands
                    timeout=10,  # Timeout for acquiring a connection from pool
                ),
                timeout=30,  # Global timeout for pool creation
            )
            logger.info("Database connection pool created")
        except asyncio.TimeoutError:
            logger.error("Timeout creating database connection pool")
            raise
        except Exception as e:
            logger.error("Failed to create database connection pool", error=str(e))
            raise

    async def connect_with_retry(
        self, max_retries: int = 3, base_delay: float = 2.0
    ) -> None:
        """Connect with exponential backoff retry.

        Args:
            max_retries: Maximum number of connection attempts
            base_delay: Base delay in seconds (doubles each retry)
        """
        for attempt in range(max_retries):
            try:
                await self.connect()
                return
            except Exception as e:
                if attempt < max_retries - 1:
                    wait_time = base_delay * (2**attempt)
                    logger.warning(
                        f"Connection attempt {attempt + 1} failed, retrying in {wait_time}s",
                        error=str(e),
                    )
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(
                        f"All {max_retries} connection attempts failed",
                        error=str(e),
                    )
                    raise

    async def disconnect(self):
        """Close connection pool."""
        if self._pool:
            await self._pool.close()
            logger.info("Database pool closed")

    async def force_terminate(self) -> None:
        """Forcefully terminate pool (emergency shutdown only)."""
        if self._pool:
            self._pool.terminate()

    def _ensure_connected(self) -> None:
        """Ensure the database connection pool is available.

        Raises:
            RuntimeError: If the pool is not initialized (connect() not called).
        """
        if self._pool is None:
            raise RuntimeError("Database not connected. Call connect() first.")

    async def execute(self, query: str, *args) -> str:
        """Execute a query."""
        self._ensure_connected()
        async with self._semaphore:
            async with self._pool.acquire() as conn:
                return await conn.execute(query, *args)

    async def fetch(self, query: str, *args) -> list[asyncpg.Record]:
        """Fetch multiple rows."""
        self._ensure_connected()
        async with self._semaphore:
            async with self._pool.acquire() as conn:
                return await conn.fetch(query, *args)

    async def fetchrow(self, query: str, *args) -> asyncpg.Record | None:
        """Fetch a single row."""
        self._ensure_connected()
        async with self._semaphore:
            async with self._pool.acquire() as conn:
                return await conn.fetchrow(query, *args)

    async def fetchval(self, query: str, *args) -> Any:
        """Fetch a single value."""
        self._ensure_connected()
        async with self._semaphore:
            async with self._pool.acquire() as conn:
                return await conn.fetchval(query, *args)

    @asynccontextmanager
    async def transaction(self):
        """Context manager for database transactions.

        Usage:
            async with db.transaction() as conn:
                # All operations use the same connection/transaction
                await conn.execute(...)
                await conn.fetch(...)
                # Automatically commits on success, rolls back on exception

        Yields:
            asyncpg.Connection: A connection within an active transaction
        """
        self._ensure_connected()
        async with self._semaphore:
            async with self._pool.acquire() as connection:
                async with connection.transaction():
                    yield connection

    # ==========================================
    # LoL Accounts Operations
    # ==========================================

    async def get_active_accounts(self) -> list[asyncpg.Record]:
        """Get all active LoL accounts grouped by region."""
        return await self.fetch(
            """
            SELECT
                a.puuid,
                a.player_id,
                a.game_name,
                a.tag_line,
                a.region,
                a.last_fetched_at,
                a.last_match_at
            FROM lol_accounts a
            JOIN players p ON a.player_id = p.player_id
            WHERE p.is_active = true AND a.puuid IS NOT NULL
            ORDER BY a.region, a.last_fetched_at NULLS FIRST
            """
        )

    async def get_accounts_without_puuid(self) -> list[asyncpg.Record]:
        """Get all accounts that don't have a PUUID yet (pending validation)."""
        return await self.fetch(
            """
            SELECT
                a.account_id,
                a.player_id,
                a.game_name,
                a.tag_line,
                a.region
            FROM lol_accounts a
            WHERE a.puuid IS NULL
            ORDER BY a.created_at ASC
            """
        )

    async def update_account_puuid(self, account_id: int, puuid: str) -> None:
        """Update the PUUID for an account after validation."""
        await self.execute(
            """
            UPDATE lol_accounts
            SET puuid = $2, updated_at = NOW()
            WHERE account_id = $1
            """,
            account_id,
            puuid,
        )

    async def get_active_accounts_by_region(self, region: str) -> list[asyncpg.Record]:
        """Get active accounts for a specific region."""
        return await self.fetch(
            """
            SELECT
                a.puuid,
                a.player_id,
                a.game_name,
                a.tag_line,
                a.region,
                a.last_fetched_at,
                a.last_match_at
            FROM lol_accounts a
            JOIN players p ON a.player_id = p.player_id
            WHERE p.is_active = true AND a.region = $1 AND a.puuid IS NOT NULL
            ORDER BY a.last_fetched_at NULLS FIRST
            """,
            region,
        )

    async def get_tracked_puuids(self) -> set[str]:
        """Get all tracked PUUIDs for synergy calculation."""
        rows = await self.fetch(
            """
            SELECT a.puuid
            FROM lol_accounts a
            JOIN players p ON a.player_id = p.player_id
            WHERE p.is_active = true AND a.puuid IS NOT NULL
            """
        )
        return {row["puuid"] for row in rows}

    async def update_account_last_match(self, puuid: str, last_match_at: datetime) -> None:
        """Update the last_match_at timestamp for an account."""
        await self.execute(
            """
            UPDATE lol_accounts
            SET last_match_at = $2, updated_at = NOW()
            WHERE puuid = $1
            """,
            puuid,
            last_match_at,
        )

    async def update_account_last_fetched(self, puuid: str) -> None:
        """Update the last_fetched_at timestamp for an account."""
        await self.execute(
            """
            UPDATE lol_accounts
            SET last_fetched_at = NOW(), updated_at = NOW()
            WHERE puuid = $1
            """,
            puuid,
        )

    # ==========================================
    # LoL Matches Operations
    # ==========================================

    async def match_exists(self, match_id: str) -> bool:
        """Check if match exists in database."""
        result = await self.fetchval(
            "SELECT EXISTS(SELECT 1 FROM lol_matches WHERE match_id = $1)",
            match_id,
        )
        return result

    async def insert_match(
        self,
        match_id: str,
        game_start: datetime,
        game_duration: int,
        queue_id: int,
        game_version: str | None = None,
    ) -> None:
        """Insert a new match."""
        await self.execute(
            """
            INSERT INTO lol_matches (match_id, game_start, game_duration, queue_id, game_version)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (match_id) DO NOTHING
            """,
            match_id,
            game_start,
            game_duration,
            queue_id,
            game_version,
        )

    # ==========================================
    # LoL Match Stats Operations
    # ==========================================

    async def insert_match_stats(
        self,
        match_id: str,
        puuid: str,
        champion_id: int,
        win: bool,
        kills: int,
        deaths: int,
        assists: int,
        cs: int,
        vision_score: int,
        damage_dealt: int,
        gold_earned: int,
        role: str | None = None,
        team_id: int | None = None,
    ) -> None:
        """Insert match stats for a participant."""
        await self.execute(
            """
            INSERT INTO lol_match_stats (
                match_id, puuid, champion_id, win, kills, deaths, assists,
                cs, vision_score, damage_dealt, gold_earned, role, team_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (match_id, puuid) DO NOTHING
            """,
            match_id,
            puuid,
            champion_id,
            win,
            kills,
            deaths,
            assists,
            cs,
            vision_score,
            damage_dealt,
            gold_earned,
            role,
            team_id,
        )

    # ==========================================
    # LoL Daily Stats Operations
    # ==========================================

    async def update_daily_stats(
        self,
        puuid: str,
        stats_date: date,
        tier: str | None = None,
        rank: str | None = None,
        lp: int | None = None,
    ) -> None:
        """Update daily stats for an account by aggregating match data.

        Always creates/updates a row, even if there are no matches for that date.
        """
        await self.execute(
            """
            INSERT INTO lol_daily_stats (
                puuid, date, games_played, wins,
                total_kills, total_deaths, total_assists, total_game_duration,
                tier, rank, lp
            )
            SELECT
                $1::varchar(100) as puuid,
                $2::date as date,
                COALESCE(agg.games_played, 0),
                COALESCE(agg.wins, 0),
                COALESCE(agg.total_kills, 0),
                COALESCE(agg.total_deaths, 0),
                COALESCE(agg.total_assists, 0),
                COALESCE(agg.total_game_duration, 0),
                $3 as tier,
                $4 as rank,
                $5 as lp
            FROM (SELECT 1) AS dummy
            LEFT JOIN (
                SELECT
                    COUNT(*) as games_played,
                    SUM(CASE WHEN ms.win THEN 1 ELSE 0 END) as wins,
                    SUM(ms.kills) as total_kills,
                    SUM(ms.deaths) as total_deaths,
                    SUM(ms.assists) as total_assists,
                    SUM(m.game_duration) as total_game_duration
                FROM lol_match_stats ms
                JOIN lol_matches m ON ms.match_id = m.match_id
                WHERE ms.puuid = $1::varchar(100) AND DATE(m.game_start) = $2::date
            ) agg ON true
            ON CONFLICT (puuid, date)
            DO UPDATE SET
                games_played = EXCLUDED.games_played,
                wins = EXCLUDED.wins,
                total_kills = EXCLUDED.total_kills,
                total_deaths = EXCLUDED.total_deaths,
                total_assists = EXCLUDED.total_assists,
                total_game_duration = EXCLUDED.total_game_duration,
                tier = COALESCE(EXCLUDED.tier, lol_daily_stats.tier),
                rank = COALESCE(EXCLUDED.rank, lol_daily_stats.rank),
                lp = COALESCE(EXCLUDED.lp, lol_daily_stats.lp)
            """,
            puuid,
            stats_date,
            tier,
            rank,
            lp,
        )

    # ==========================================
    # LoL Streaks Operations
    # ==========================================

    async def update_streak(self, puuid: str) -> None:
        """Update streak for an account based on match history."""
        matches = await self.fetch(
            """
            SELECT ms.win, m.game_start
            FROM lol_match_stats ms
            JOIN lol_matches m ON ms.match_id = m.match_id
            WHERE ms.puuid = $1
            ORDER BY m.game_start DESC
            LIMIT 100
            """,
            puuid,
        )

        if not matches:
            return

        # Calculate current streak
        current_streak = 0
        current_streak_start = None
        first_result = matches[0]["win"]

        for match in matches:
            if match["win"] == first_result:
                current_streak += 1
                current_streak_start = match["game_start"]
            else:
                break

        # Make streak negative for losses
        if not first_result:
            current_streak = -current_streak

        # Get existing streak record
        existing = await self.fetchrow(
            "SELECT * FROM lol_streaks WHERE puuid = $1",
            puuid,
        )

        best_win_streak = existing["best_win_streak"] if existing else 0
        best_win_streak_start = existing["best_win_streak_start"] if existing else None
        best_win_streak_end = existing["best_win_streak_end"] if existing else None
        worst_loss_streak = existing["worst_loss_streak"] if existing else 0
        worst_loss_streak_start = existing["worst_loss_streak_start"] if existing else None
        worst_loss_streak_end = existing["worst_loss_streak_end"] if existing else None

        # Update best/worst if current is better/worse
        if current_streak > 0 and current_streak > best_win_streak:
            best_win_streak = current_streak
            best_win_streak_start = current_streak_start
            best_win_streak_end = matches[0]["game_start"]

        if current_streak < 0 and abs(current_streak) > worst_loss_streak:
            worst_loss_streak = abs(current_streak)
            worst_loss_streak_start = current_streak_start
            worst_loss_streak_end = matches[0]["game_start"]

        await self.execute(
            """
            INSERT INTO lol_streaks (
                puuid, current_streak, current_streak_start,
                best_win_streak, best_win_streak_start, best_win_streak_end,
                worst_loss_streak, worst_loss_streak_start, worst_loss_streak_end,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (puuid)
            DO UPDATE SET
                current_streak = EXCLUDED.current_streak,
                current_streak_start = EXCLUDED.current_streak_start,
                best_win_streak = EXCLUDED.best_win_streak,
                best_win_streak_start = EXCLUDED.best_win_streak_start,
                best_win_streak_end = EXCLUDED.best_win_streak_end,
                worst_loss_streak = EXCLUDED.worst_loss_streak,
                worst_loss_streak_start = EXCLUDED.worst_loss_streak_start,
                worst_loss_streak_end = EXCLUDED.worst_loss_streak_end,
                updated_at = NOW()
            """,
            puuid,
            current_streak,
            current_streak_start,
            best_win_streak,
            best_win_streak_start,
            best_win_streak_end,
            worst_loss_streak,
            worst_loss_streak_start,
            worst_loss_streak_end,
        )

    # ==========================================
    # LoL Champion Stats Operations
    # ==========================================

    async def update_champion_stats(self, puuid: str, champion_id: int) -> None:
        """Update champion stats for an account."""
        stats = await self.fetchrow(
            """
            SELECT
                COUNT(*) as games_played,
                SUM(CASE WHEN win THEN 1 ELSE 0 END) as wins,
                SUM(kills) as total_kills,
                SUM(deaths) as total_deaths,
                SUM(assists) as total_assists,
                SUM(cs) as total_cs,
                SUM(damage_dealt) as total_damage,
                MAX(m.game_start) as last_played
            FROM lol_match_stats ms
            JOIN lol_matches m ON ms.match_id = m.match_id
            WHERE ms.puuid = $1 AND ms.champion_id = $2
            """,
            puuid,
            champion_id,
        )

        if not stats or stats["games_played"] == 0:
            return

        # Find best KDA match
        best_kda_match = await self.fetchrow(
            """
            SELECT
                ms.match_id,
                CASE
                    WHEN ms.deaths = 0 THEN (ms.kills + ms.assists)::float
                    ELSE (ms.kills + ms.assists)::float / ms.deaths
                END as kda
            FROM lol_match_stats ms
            WHERE ms.puuid = $1 AND ms.champion_id = $2
            ORDER BY kda DESC
            LIMIT 1
            """,
            puuid,
            champion_id,
        )

        best_kda = best_kda_match["kda"] if best_kda_match else None
        best_kda_match_id = best_kda_match["match_id"] if best_kda_match else None

        await self.execute(
            """
            INSERT INTO lol_champion_stats (
                puuid, champion_id, games_played, wins,
                total_kills, total_deaths, total_assists, total_cs, total_damage,
                best_kda, best_kda_match_id, last_played, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
            ON CONFLICT (puuid, champion_id)
            DO UPDATE SET
                games_played = EXCLUDED.games_played,
                wins = EXCLUDED.wins,
                total_kills = EXCLUDED.total_kills,
                total_deaths = EXCLUDED.total_deaths,
                total_assists = EXCLUDED.total_assists,
                total_cs = EXCLUDED.total_cs,
                total_damage = EXCLUDED.total_damage,
                best_kda = EXCLUDED.best_kda,
                best_kda_match_id = EXCLUDED.best_kda_match_id,
                last_played = EXCLUDED.last_played,
                updated_at = NOW()
            """,
            puuid,
            champion_id,
            stats["games_played"],
            stats["wins"],
            stats["total_kills"],
            stats["total_deaths"],
            stats["total_assists"],
            stats["total_cs"],
            stats["total_damage"],
            best_kda,
            best_kda_match_id,
            stats["last_played"],
        )

    # ==========================================
    # LoL Player Synergy Operations
    # ==========================================

    async def update_player_synergies(self, puuid: str, match_id: str) -> None:
        """Update synergies between tracked players for a match.

        Uses batched INSERT with UNNEST to avoid N+1 queries.
        """
        # Get all participants of this match
        participants = await self.fetch(
            """
            SELECT ms.puuid, ms.win, ms.team_id
            FROM lol_match_stats ms
            WHERE ms.match_id = $1
            """,
            match_id,
        )

        if not participants:
            return

        # Find our player
        our_player = None
        for p in participants:
            if p["puuid"] == puuid:
                our_player = p
                break

        if not our_player:
            return

        our_team = our_player["team_id"]
        our_win = our_player["win"]

        # Get tracked PUUIDs
        tracked_puuids = await self.get_tracked_puuids()

        # Collect all synergy updates for batching
        puuids: list[str] = []
        ally_puuids: list[str] = []
        games_together: list[int] = []
        wins_together: list[int] = []
        games_against: list[int] = []
        wins_against: list[int] = []

        for p in participants:
            if p["puuid"] == puuid:
                continue
            if p["puuid"] not in tracked_puuids:
                continue

            is_ally = p["team_id"] == our_team

            puuids.append(puuid)
            ally_puuids.append(p["puuid"])
            games_together.append(1 if is_ally else 0)
            wins_together.append(1 if is_ally and our_win else 0)
            games_against.append(0 if is_ally else 1)
            wins_against.append(0 if is_ally else (1 if our_win else 0))

        # Batch insert all synergies in a single query
        if puuids:
            await self.execute(
                """
                INSERT INTO lol_player_synergy (
                    puuid, ally_puuid, games_together, wins_together, games_against, wins_against, updated_at
                )
                SELECT * FROM UNNEST($1::text[], $2::text[], $3::int[], $4::int[], $5::int[], $6::int[])
                    AS t(puuid, ally_puuid, games_together, wins_together, games_against, wins_against),
                    LATERAL (SELECT NOW() AS updated_at) AS ts
                ON CONFLICT (puuid, ally_puuid)
                DO UPDATE SET
                    games_together = lol_player_synergy.games_together + EXCLUDED.games_together,
                    wins_together = lol_player_synergy.wins_together + EXCLUDED.wins_together,
                    games_against = lol_player_synergy.games_against + EXCLUDED.games_against,
                    wins_against = lol_player_synergy.wins_against + EXCLUDED.wins_against,
                    updated_at = NOW()
                """,
                puuids,
                ally_puuids,
                games_together,
                wins_together,
                games_against,
                wins_against,
            )

    # ==========================================
    # Worker Status Operations
    # ==========================================

    async def set_worker_running(self, is_running: bool) -> None:
        """Set worker running state."""
        if is_running:
            await self.execute(
                """
                UPDATE worker_status
                SET is_running = true,
                    started_at = NOW(),
                    session_lol_matches = 0,
                    session_lol_accounts = 0,
                    session_errors = 0,
                    session_api_requests = 0,
                    updated_at = NOW()
                WHERE id = 1
                """
            )
        else:
            await self.execute(
                """
                UPDATE worker_status
                SET is_running = false,
                    started_at = NULL,
                    current_account_name = NULL,
                    current_account_region = NULL,
                    updated_at = NOW()
                WHERE id = 1
                """
            )

    async def update_worker_current_account(
        self, game_name: str | None, region: str | None
    ) -> None:
        """Update current account being processed."""
        await self.execute(
            """
            UPDATE worker_status
            SET current_account_name = $1,
                current_account_region = $2,
                last_activity_at = NOW(),
                updated_at = NOW()
            WHERE id = 1
            """,
            game_name,
            region,
        )

    async def increment_worker_stats(
        self,
        matches_added: int = 0,
        accounts_processed: int = 0,
        errors: int = 0,
        api_requests: int = 0,
    ) -> None:
        """Increment worker session stats."""
        await self.execute(
            """
            UPDATE worker_status
            SET session_lol_matches = session_lol_matches + $1,
                session_lol_accounts = session_lol_accounts + $2,
                session_errors = session_errors + $3,
                session_api_requests = session_api_requests + $4,
                updated_at = NOW()
            WHERE id = 1
            """,
            matches_added,
            accounts_processed,
            errors,
            api_requests,
        )

    async def set_worker_error(self, error_message: str) -> None:
        """Set last worker error."""
        await self.execute(
            """
            UPDATE worker_status
            SET last_error_at = NOW(),
                last_error_message = $1,
                session_errors = session_errors + 1,
                updated_at = NOW()
            WHERE id = 1
            """,
            error_message,
        )

    async def log_worker_activity(
        self,
        log_type: str,
        severity: str,
        message: str,
        account_name: str | None = None,
        account_puuid: str | None = None,
        details: dict | None = None,
    ) -> None:
        """Log worker activity to worker_logs table."""
        await self.execute(
            """
            INSERT INTO worker_logs (timestamp, log_type, severity, message, account_name, account_puuid, details)
            VALUES (NOW(), $1, $2, $3, $4, $5, $6)
            """,
            log_type,
            severity,
            message,
            account_name,
            account_puuid,
            json.dumps(details) if details else None,
        )

    # ==========================================
    # Priority Queue Operations
    # ==========================================

    async def get_active_accounts_with_activity(self) -> list[asyncpg.Record]:
        """Get active accounts with activity data for priority scoring.

        Returns accounts with:
        - Basic account info (puuid, game_name, etc.)
        - Priority queue fields (activity_score, tier, next_fetch_at)
        - Activity metrics (games today, last 3 days, last 7 days)
        """
        return await self.fetch(
            """
            SELECT
                a.puuid,
                a.player_id,
                a.game_name,
                a.tag_line,
                a.region,
                a.last_fetched_at,
                a.last_match_at,
                a.activity_score,
                a.activity_tier,
                a.next_fetch_at,
                a.consecutive_empty_fetches,
                COALESCE(today.games_played, 0) as games_today,
                COALESCE(recent.games, 0) as games_last_3_days,
                COALESCE(weekly.games, 0) as games_last_7_days
            FROM lol_accounts a
            JOIN players p ON a.player_id = p.player_id
            LEFT JOIN lol_daily_stats today
                ON a.puuid = today.puuid AND today.date = CURRENT_DATE
            LEFT JOIN (
                SELECT puuid, SUM(games_played) as games
                FROM lol_daily_stats
                WHERE date >= CURRENT_DATE - INTERVAL '3 days'
                GROUP BY puuid
            ) recent ON a.puuid = recent.puuid
            LEFT JOIN (
                SELECT puuid, SUM(games_played) as games
                FROM lol_daily_stats
                WHERE date >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY puuid
            ) weekly ON a.puuid = weekly.puuid
            WHERE p.is_active = true AND a.puuid IS NOT NULL
            ORDER BY a.region, a.next_fetch_at NULLS FIRST
            """
        )

    async def get_account_activity_data(
        self,
        puuid: str,
        for_update: bool = False,
        connection: asyncpg.Connection | None = None,
    ) -> dict | None:
        """Get fresh activity data for a single account.

        Used when recalculating score after finding new matches.

        Args:
            puuid: Account PUUID
            for_update: If True, locks the row for update (use within transaction).
                        Uses SKIP LOCKED to avoid blocking on already-locked rows.
            connection: Optional connection for transaction support. If provided,
                        the query runs on this connection (required for FOR UPDATE).

        Returns:
            Dict with activity data, or None if account not found or row was locked.
        """
        if for_update:
            # First, lock the lol_accounts row with FOR UPDATE SKIP LOCKED
            # This must be done separately because FOR UPDATE cannot be used
            # with queries containing GROUP BY in subqueries
            lock_query = """
                SELECT puuid
                FROM lol_accounts
                WHERE puuid = $1
                FOR UPDATE SKIP LOCKED
            """
            if connection:
                lock_result = await connection.fetchrow(lock_query, puuid)
            else:
                lock_result = await self.fetchrow(lock_query, puuid)

            # If row was locked by another process, return None
            if not lock_result:
                return None

        # Now fetch the activity data (without FOR UPDATE since we already have the lock)
        query = """
            SELECT
                a.puuid,
                a.activity_score,
                a.activity_tier,
                a.consecutive_empty_fetches,
                a.last_match_at,
                a.next_fetch_at,
                COALESCE(today.games_played, 0) as games_today,
                COALESCE(recent.games, 0) as games_last_3_days,
                COALESCE(weekly.games, 0) as games_last_7_days
            FROM lol_accounts a
            LEFT JOIN lol_daily_stats today
                ON a.puuid = today.puuid AND today.date = CURRENT_DATE
            LEFT JOIN (
                SELECT puuid, SUM(games_played) as games
                FROM lol_daily_stats
                WHERE date >= CURRENT_DATE - INTERVAL '3 days'
                GROUP BY puuid
            ) recent ON a.puuid = recent.puuid
            LEFT JOIN (
                SELECT puuid, SUM(games_played) as games
                FROM lol_daily_stats
                WHERE date >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY puuid
            ) weekly ON a.puuid = weekly.puuid
            WHERE a.puuid = $1
        """

        if connection:
            row = await connection.fetchrow(query, puuid)
        else:
            row = await self.fetchrow(query, puuid)

        if row:
            return {
                "puuid": row["puuid"],
                "activity_score": row["activity_score"],
                "activity_tier": row["activity_tier"],
                "consecutive_empty_fetches": row["consecutive_empty_fetches"],
                "last_match_at": row["last_match_at"],
                "next_fetch_at": row["next_fetch_at"],
                "games_today": row["games_today"] or 0,
                "games_last_3_days": row["games_last_3_days"] or 0,
                "games_last_7_days": row["games_last_7_days"] or 0,
            }
        return None

    async def update_account_priority(
        self,
        puuid: str,
        activity_score: float,
        tier: str,
        next_fetch_at: datetime,
        consecutive_empty_fetches: int,
        connection: asyncpg.Connection | None = None,
    ) -> None:
        """Update account priority queue data.

        Args:
            puuid: Account PUUID
            activity_score: New activity score (0-100)
            tier: New activity tier (very_active, active, moderate, inactive)
            next_fetch_at: When to next fetch this account
            consecutive_empty_fetches: Count of consecutive fetches with no new matches
            connection: Optional connection for transaction support
        """
        query = """
            UPDATE lol_accounts
            SET
                activity_score = $2,
                activity_tier = $3,
                next_fetch_at = $4,
                consecutive_empty_fetches = $5,
                updated_at = NOW()
            WHERE puuid = $1
        """

        if connection:
            await connection.execute(query, puuid, activity_score, tier, next_fetch_at, consecutive_empty_fetches)
        else:
            await self.execute(query, puuid, activity_score, tier, next_fetch_at, consecutive_empty_fetches)

    async def get_priority_queue_stats(self) -> asyncpg.Record | None:
        """Get statistics about the priority queue state."""
        return await self.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE activity_tier = 'very_active') as very_active_count,
                COUNT(*) FILTER (WHERE activity_tier = 'active') as active_count,
                COUNT(*) FILTER (WHERE activity_tier = 'moderate') as moderate_count,
                COUNT(*) FILTER (WHERE activity_tier = 'inactive') as inactive_count,
                AVG(activity_score) as avg_score,
                COUNT(*) FILTER (WHERE next_fetch_at <= NOW()) as ready_now
            FROM lol_accounts a
            JOIN players p ON a.player_id = p.player_id
            WHERE p.is_active = true
            """
        )

    # ==========================================
    # Pro Stats - Tournaments
    # ==========================================

    async def upsert_pro_tournament(
        self,
        external_id: str,
        name: str,
        slug: str,
        region: str | None = None,
        season: str | None = None,
        split: str | None = None,
        tier: int = 1,
        status: str = "upcoming",
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        logo_url: str | None = None,
        metadata: dict | None = None,
    ) -> int:
        """Insert or update a pro tournament."""
        result = await self.fetchval(
            """
            INSERT INTO pro_tournaments (
                external_id, name, slug, region, season, split, tier,
                status, start_date, end_date, logo_url, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (external_id)
            DO UPDATE SET
                name = EXCLUDED.name,
                status = EXCLUDED.status,
                start_date = COALESCE(EXCLUDED.start_date, pro_tournaments.start_date),
                end_date = COALESCE(EXCLUDED.end_date, pro_tournaments.end_date),
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
            RETURNING tournament_id
            """,
            external_id,
            name,
            slug,
            region,
            season,
            split,
            tier,
            status,
            start_date,
            end_date,
            logo_url,
            json.dumps(metadata) if metadata else None,
        )
        return result

    async def get_pro_tournament_by_external_id(
        self, external_id: str
    ) -> asyncpg.Record | None:
        """Get a tournament by its external ID."""
        return await self.fetchrow(
            "SELECT * FROM pro_tournaments WHERE external_id = $1",
            external_id,
        )

    async def get_active_pro_tournaments(self) -> list[asyncpg.Record]:
        """Get tournaments that are ongoing or upcoming."""
        return await self.fetch(
            """
            SELECT * FROM pro_tournaments
            WHERE status IN ('ongoing', 'upcoming')
            ORDER BY start_date ASC
            """
        )

    # ==========================================
    # Pro Stats - Stages
    # ==========================================

    async def upsert_pro_stage(
        self,
        external_id: str,
        tournament_id: int,
        name: str,
        stage_type: str | None = None,
        stage_order: int = 0,
        status: str = "upcoming",
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        standings: dict | None = None,
        metadata: dict | None = None,
    ) -> int:
        """Insert or update a pro stage."""
        result = await self.fetchval(
            """
            INSERT INTO pro_stages (
                external_id, tournament_id, name, stage_type, stage_order,
                status, start_date, end_date, standings, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (external_id)
            DO UPDATE SET
                name = EXCLUDED.name,
                status = EXCLUDED.status,
                standings = COALESCE(EXCLUDED.standings, pro_stages.standings),
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
            RETURNING stage_id
            """,
            external_id,
            tournament_id,
            name,
            stage_type,
            stage_order,
            status,
            start_date,
            end_date,
            json.dumps(standings) if standings else None,
            json.dumps(metadata) if metadata else None,
        )
        return result

    # ==========================================
    # Pro Stats - Matches
    # ==========================================

    async def upsert_pro_match(
        self,
        external_id: str,
        tournament_id: int,
        team1_id: int | None = None,
        team2_id: int | None = None,
        stage_id: int | None = None,
        team1_score: int = 0,
        team2_score: int = 0,
        winner_team_id: int | None = None,
        format: str = "bo3",
        status: str = "upcoming",
        scheduled_at: datetime | None = None,
        started_at: datetime | None = None,
        ended_at: datetime | None = None,
        stream_url: str | None = None,
        metadata: dict | None = None,
    ) -> int:
        """Insert or update a pro match."""
        result = await self.fetchval(
            """
            INSERT INTO pro_matches (
                external_id, tournament_id, stage_id, team1_id, team2_id,
                team1_score, team2_score, winner_team_id, format, status,
                scheduled_at, started_at, ended_at, stream_url, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (external_id)
            DO UPDATE SET
                team1_score = EXCLUDED.team1_score,
                team2_score = EXCLUDED.team2_score,
                winner_team_id = EXCLUDED.winner_team_id,
                status = EXCLUDED.status,
                started_at = COALESCE(EXCLUDED.started_at, pro_matches.started_at),
                ended_at = COALESCE(EXCLUDED.ended_at, pro_matches.ended_at),
                stream_url = COALESCE(EXCLUDED.stream_url, pro_matches.stream_url),
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
            RETURNING match_id
            """,
            external_id,
            tournament_id,
            stage_id,
            team1_id,
            team2_id,
            team1_score,
            team2_score,
            winner_team_id,
            format,
            status,
            scheduled_at,
            started_at,
            ended_at,
            stream_url,
            json.dumps(metadata) if metadata else None,
        )
        return result

    async def get_pro_match_by_external_id(
        self, external_id: str
    ) -> asyncpg.Record | None:
        """Get a match by its external ID."""
        return await self.fetchrow(
            "SELECT * FROM pro_matches WHERE external_id = $1",
            external_id,
        )

    async def get_live_pro_matches(self) -> list[asyncpg.Record]:
        """Get all currently live matches."""
        return await self.fetch(
            "SELECT * FROM pro_matches WHERE status = 'live' ORDER BY started_at"
        )

    async def get_recent_pro_matches(
        self, limit: int = 20
    ) -> list[asyncpg.Record]:
        """Get recent completed matches."""
        return await self.fetch(
            """
            SELECT * FROM pro_matches
            WHERE status = 'completed'
            ORDER BY ended_at DESC
            LIMIT $1
            """,
            limit,
        )

    # ==========================================
    # Pro Stats - Games
    # ==========================================

    async def upsert_pro_game(
        self,
        external_id: str,
        match_id: int,
        game_number: int,
        blue_team_id: int | None = None,
        red_team_id: int | None = None,
        winner_team_id: int | None = None,
        duration: int | None = None,
        status: str = "upcoming",
        patch: str | None = None,
        objectives: dict | None = None,
        first_objectives: dict | None = None,
        gold_diff_15: dict | None = None,
        timeline_data: dict | None = None,
        metadata: dict | None = None,
        started_at: datetime | None = None,
        ended_at: datetime | None = None,
    ) -> int:
        """Insert or update a pro game."""
        result = await self.fetchval(
            """
            INSERT INTO pro_games (
                external_id, match_id, game_number, blue_team_id, red_team_id,
                winner_team_id, duration, status, patch,
                blue_towers, red_towers, blue_dragons, red_dragons,
                blue_barons, red_barons, blue_heralds, red_heralds,
                blue_grubs, red_grubs,
                first_blood_team, first_tower_team, first_dragon_team,
                first_baron_team, first_herald_team,
                blue_gold_at_15, red_gold_at_15, blue_kills_at_15, red_kills_at_15,
                timeline_data, metadata, started_at, ended_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
                $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
            )
            ON CONFLICT (external_id)
            DO UPDATE SET
                winner_team_id = EXCLUDED.winner_team_id,
                duration = COALESCE(EXCLUDED.duration, pro_games.duration),
                status = EXCLUDED.status,
                blue_towers = COALESCE(EXCLUDED.blue_towers, pro_games.blue_towers),
                red_towers = COALESCE(EXCLUDED.red_towers, pro_games.red_towers),
                blue_dragons = COALESCE(EXCLUDED.blue_dragons, pro_games.blue_dragons),
                red_dragons = COALESCE(EXCLUDED.red_dragons, pro_games.red_dragons),
                blue_barons = COALESCE(EXCLUDED.blue_barons, pro_games.blue_barons),
                red_barons = COALESCE(EXCLUDED.red_barons, pro_games.red_barons),
                timeline_data = COALESCE(EXCLUDED.timeline_data, pro_games.timeline_data),
                metadata = EXCLUDED.metadata,
                ended_at = COALESCE(EXCLUDED.ended_at, pro_games.ended_at),
                updated_at = NOW()
            RETURNING game_id
            """,
            external_id,
            match_id,
            game_number,
            blue_team_id,
            red_team_id,
            winner_team_id,
            duration,
            status,
            patch,
            objectives.get("blue_towers", 0) if objectives else 0,
            objectives.get("red_towers", 0) if objectives else 0,
            objectives.get("blue_dragons", 0) if objectives else 0,
            objectives.get("red_dragons", 0) if objectives else 0,
            objectives.get("blue_barons", 0) if objectives else 0,
            objectives.get("red_barons", 0) if objectives else 0,
            objectives.get("blue_heralds", 0) if objectives else 0,
            objectives.get("red_heralds", 0) if objectives else 0,
            objectives.get("blue_grubs", 0) if objectives else 0,
            objectives.get("red_grubs", 0) if objectives else 0,
            first_objectives.get("blood") if first_objectives else None,
            first_objectives.get("tower") if first_objectives else None,
            first_objectives.get("dragon") if first_objectives else None,
            first_objectives.get("baron") if first_objectives else None,
            first_objectives.get("herald") if first_objectives else None,
            gold_diff_15.get("blue") if gold_diff_15 else None,
            gold_diff_15.get("red") if gold_diff_15 else None,
            gold_diff_15.get("blue_kills") if gold_diff_15 else None,
            gold_diff_15.get("red_kills") if gold_diff_15 else None,
            json.dumps(timeline_data) if timeline_data else None,
            json.dumps(metadata) if metadata else None,
            started_at,
            ended_at,
        )
        return result

    async def get_pro_game_by_external_id(
        self, external_id: str
    ) -> asyncpg.Record | None:
        """Get a game by its external ID."""
        return await self.fetchrow(
            "SELECT * FROM pro_games WHERE external_id = $1",
            external_id,
        )

    # ==========================================
    # Pro Stats - Drafts
    # ==========================================

    async def upsert_pro_draft(
        self,
        game_id: int,
        blue_picks: list[int | None],
        red_picks: list[int | None],
        blue_bans: list[int | None],
        red_bans: list[int | None],
    ) -> int:
        """Insert or update draft for a game."""
        # Pad lists to ensure 5 elements
        blue_picks = (blue_picks + [None] * 5)[:5]
        red_picks = (red_picks + [None] * 5)[:5]
        blue_bans = (blue_bans + [None] * 5)[:5]
        red_bans = (red_bans + [None] * 5)[:5]

        result = await self.fetchval(
            """
            INSERT INTO pro_drafts (
                game_id,
                blue_pick_1, blue_pick_2, blue_pick_3, blue_pick_4, blue_pick_5,
                red_pick_1, red_pick_2, red_pick_3, red_pick_4, red_pick_5,
                blue_ban_1, blue_ban_2, blue_ban_3, blue_ban_4, blue_ban_5,
                red_ban_1, red_ban_2, red_ban_3, red_ban_4, red_ban_5
            )
            VALUES (
                $1,
                $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16,
                $17, $18, $19, $20, $21
            )
            ON CONFLICT (game_id)
            DO UPDATE SET
                blue_pick_1 = EXCLUDED.blue_pick_1,
                blue_pick_2 = EXCLUDED.blue_pick_2,
                blue_pick_3 = EXCLUDED.blue_pick_3,
                blue_pick_4 = EXCLUDED.blue_pick_4,
                blue_pick_5 = EXCLUDED.blue_pick_5,
                red_pick_1 = EXCLUDED.red_pick_1,
                red_pick_2 = EXCLUDED.red_pick_2,
                red_pick_3 = EXCLUDED.red_pick_3,
                red_pick_4 = EXCLUDED.red_pick_4,
                red_pick_5 = EXCLUDED.red_pick_5,
                blue_ban_1 = EXCLUDED.blue_ban_1,
                blue_ban_2 = EXCLUDED.blue_ban_2,
                blue_ban_3 = EXCLUDED.blue_ban_3,
                blue_ban_4 = EXCLUDED.blue_ban_4,
                blue_ban_5 = EXCLUDED.blue_ban_5,
                red_ban_1 = EXCLUDED.red_ban_1,
                red_ban_2 = EXCLUDED.red_ban_2,
                red_ban_3 = EXCLUDED.red_ban_3,
                red_ban_4 = EXCLUDED.red_ban_4,
                red_ban_5 = EXCLUDED.red_ban_5,
                updated_at = NOW()
            RETURNING draft_id
            """,
            game_id,
            *blue_picks,
            *red_picks,
            *blue_bans,
            *red_bans,
        )
        return result

    async def insert_pro_draft_action(
        self,
        game_id: int,
        action_order: int,
        action_type: str,
        team_side: str,
        champion_id: int,
        player_id: int | None = None,
    ) -> None:
        """Insert a draft action."""
        await self.execute(
            """
            INSERT INTO pro_draft_actions (
                game_id, action_order, action_type, team_side, champion_id, player_id
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (game_id, action_order) DO UPDATE SET
                action_type = EXCLUDED.action_type,
                team_side = EXCLUDED.team_side,
                champion_id = EXCLUDED.champion_id,
                player_id = EXCLUDED.player_id
            """,
            game_id,
            action_order,
            action_type,
            team_side,
            champion_id,
            player_id,
        )

    # ==========================================
    # Pro Stats - Player Stats
    # ==========================================

    async def upsert_pro_player_stats(
        self,
        game_id: int,
        player_id: int,
        team_id: int | None,
        team_side: str,
        role: str,
        champion_id: int,
        stats: dict,
    ) -> int:
        """Insert or update player stats for a game."""
        result = await self.fetchval(
            """
            INSERT INTO pro_player_stats (
                game_id, player_id, team_id, team_side, role, champion_id,
                kills, deaths, assists, cs, cs_per_min,
                gold_earned, gold_share, damage_dealt, damage_share, damage_taken,
                vision_score, wards_placed, wards_destroyed, control_wards_purchased,
                cs_at_15, gold_at_15, xp_at_15,
                cs_diff_at_15, gold_diff_at_15, xp_diff_at_15,
                kill_participation, first_blood_participant, first_blood_victim,
                solo_kills, double_kills, triple_kills, quadra_kills, penta_kills,
                items, runes, metadata
            )
            VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16,
                $17, $18, $19, $20,
                $21, $22, $23, $24, $25, $26,
                $27, $28, $29,
                $30, $31, $32, $33, $34,
                $35, $36, $37
            )
            ON CONFLICT (game_id, player_id)
            DO UPDATE SET
                kills = EXCLUDED.kills,
                deaths = EXCLUDED.deaths,
                assists = EXCLUDED.assists,
                cs = EXCLUDED.cs,
                gold_earned = EXCLUDED.gold_earned,
                damage_dealt = EXCLUDED.damage_dealt,
                vision_score = EXCLUDED.vision_score,
                items = EXCLUDED.items,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
            RETURNING stat_id
            """,
            game_id,
            player_id,
            team_id,
            team_side,
            role,
            champion_id,
            stats.get("kills", 0),
            stats.get("deaths", 0),
            stats.get("assists", 0),
            stats.get("cs", 0),
            stats.get("cs_per_min", 0),
            stats.get("gold_earned", 0),
            stats.get("gold_share", 0),
            stats.get("damage_dealt", 0),
            stats.get("damage_share", 0),
            stats.get("damage_taken", 0),
            stats.get("vision_score", 0),
            stats.get("wards_placed", 0),
            stats.get("wards_destroyed", 0),
            stats.get("control_wards", 0),
            stats.get("cs_at_15", 0),
            stats.get("gold_at_15", 0),
            stats.get("xp_at_15", 0),
            stats.get("cs_diff_at_15", 0),
            stats.get("gold_diff_at_15", 0),
            stats.get("xp_diff_at_15", 0),
            stats.get("kill_participation", 0),
            stats.get("first_blood_participant", False),
            stats.get("first_blood_victim", False),
            stats.get("solo_kills", 0),
            stats.get("double_kills", 0),
            stats.get("triple_kills", 0),
            stats.get("quadra_kills", 0),
            stats.get("penta_kills", 0),
            json.dumps(stats.get("items")) if stats.get("items") else None,
            json.dumps(stats.get("runes")) if stats.get("runes") else None,
            json.dumps(stats.get("metadata")) if stats.get("metadata") else None,
        )
        return result

    # ==========================================
    # Pro Stats - Team Lookup
    # ==========================================

    async def find_team_by_name(self, name: str) -> asyncpg.Record | None:
        """Find a team by name or short name."""
        return await self.fetchrow(
            """
            SELECT * FROM teams
            WHERE LOWER(current_name) = LOWER($1)
               OR LOWER(short_name) = LOWER($1)
               OR LOWER(slug) = LOWER($1)
            LIMIT 1
            """,
            name,
        )

    async def find_player_by_name(self, name: str) -> asyncpg.Record | None:
        """Find a player by pseudo."""
        return await self.fetchrow(
            """
            SELECT * FROM players
            WHERE LOWER(current_pseudo) = LOWER($1)
               OR LOWER(slug) = LOWER($1)
            LIMIT 1
            """,
            name,
        )
