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
                FOR UPDATE SKIP LOCKED
            """
        else:
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
