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

    async def executemany(self, query: str, args_list: list[tuple]) -> None:
        """Execute a query many times with different arguments.

        This is more efficient than calling execute() in a loop.

        Args:
            query: SQL query with $1, $2, etc. placeholders
            args_list: List of tuples, each containing args for one execution
        """
        self._ensure_connected()
        async with self._semaphore:
            async with self._pool.acquire() as conn:
                await conn.executemany(query, args_list)

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
        summoner1_id: int | None = None,
        summoner2_id: int | None = None,
        summoner1_casts: int | None = None,
        summoner2_casts: int | None = None,
    ) -> None:
        """Insert match stats for a participant."""
        await self.execute(
            """
            INSERT INTO lol_match_stats (
                match_id, puuid, champion_id, win, kills, deaths, assists,
                cs, vision_score, damage_dealt, gold_earned, role, team_id,
                summoner1_id, summoner2_id, summoner1_casts, summoner2_casts
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
            summoner1_id,
            summoner2_id,
            summoner1_casts,
            summoner2_casts,
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
    # Pro Worker Status Operations
    # ==========================================

    async def set_pro_worker_running(self, is_running: bool) -> None:
        """Set pro worker running state."""
        if is_running:
            await self.execute(
                """
                UPDATE pro_worker_status
                SET is_running = true,
                    started_at = NOW(),
                    session_tournaments = 0,
                    session_matches = 0,
                    session_games = 0,
                    session_errors = 0,
                    session_api_requests = 0,
                    current_task = NULL,
                    current_task_started_at = NULL,
                    updated_at = NOW()
                WHERE id = 1
                """
            )
        else:
            await self.execute(
                """
                UPDATE pro_worker_status
                SET is_running = false,
                    current_task = NULL,
                    current_task_started_at = NULL,
                    updated_at = NOW()
                WHERE id = 1
                """
            )

    async def update_pro_worker_task(self, task_name: str | None) -> None:
        """Update current task for the pro worker."""
        if task_name:
            await self.execute(
                """
                UPDATE pro_worker_status
                SET current_task = $1,
                    current_task_started_at = NOW(),
                    last_activity_at = NOW(),
                    updated_at = NOW()
                WHERE id = 1
                """,
                task_name,
            )
        else:
            # Task finished — move current to last
            await self.execute(
                """
                UPDATE pro_worker_status
                SET last_task = current_task,
                    last_task_completed_at = NOW(),
                    current_task = NULL,
                    current_task_started_at = NULL,
                    last_activity_at = NOW(),
                    updated_at = NOW()
                WHERE id = 1
                """
            )

    async def increment_pro_worker_stats(
        self,
        tournaments: int = 0,
        matches: int = 0,
        games: int = 0,
        errors: int = 0,
        api_requests: int = 0,
    ) -> None:
        """Increment pro worker session stats."""
        await self.execute(
            """
            UPDATE pro_worker_status
            SET session_tournaments = session_tournaments + $1,
                session_matches = session_matches + $2,
                session_games = session_games + $3,
                session_errors = session_errors + $4,
                session_api_requests = session_api_requests + $5,
                updated_at = NOW()
            WHERE id = 1
            """,
            tournaments,
            matches,
            games,
            errors,
            api_requests,
        )

    async def set_pro_worker_error(self, error_message: str) -> None:
        """Set last pro worker error metadata (does not increment session_errors)."""
        await self.execute(
            """
            UPDATE pro_worker_status
            SET last_error_at = NOW(),
                last_error_message = $1,
                updated_at = NOW()
            WHERE id = 1
            """,
            error_message,
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
    # Entity Mapping Operations
    # ==========================================

    async def find_by_source_id(self, entity_type: str, source_id: str) -> int | None:
        """Lookup entity_id via pro_entity_mappings."""
        return await self.fetchval(
            "SELECT entity_id FROM pro_entity_mappings WHERE entity_type = $1 AND source_id = $2 LIMIT 1",
            entity_type,
            source_id,
        )

    async def register_mapping(self, entity_type: str, entity_id: int, source: str, source_id: str) -> None:
        """Register an entity mapping (ON CONFLICT DO NOTHING)."""
        await self.execute(
            """
            INSERT INTO pro_entity_mappings (entity_type, entity_id, source, source_id, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (entity_type, source, source_id) DO NOTHING
            """,
            entity_type,
            entity_id,
            source,
            source_id,
        )

    async def create_proposal(
        self, entity_type: str, source_entity_id: int, target_entity_id: int,
        confidence: float, reason: str, notes: str | None = None,
    ) -> int | None:
        """Create a mapping proposal for admin review. Returns proposal id or None if already exists."""
        return await self.fetchval(
            """
            INSERT INTO pro_mapping_proposals (
                entity_type, source_entity_id, target_entity_id,
                confidence, match_reason, notes, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (entity_type, source_entity_id, target_entity_id) DO NOTHING
            RETURNING id
            """,
            entity_type,
            source_entity_id,
            target_entity_id,
            confidence,
            reason,
            notes,
        )

    # ==========================================
    # Pro League Operations
    # ==========================================

    async def upsert_pro_league(
        self,
        name: str,
        external_id: str | None = None,
        short_name: str | None = None,
        region: str | None = None,
        logo_url: str | None = None,
        tier: int = 1,
    ) -> int:
        """
        Upsert a pro league, checking mapping table first.

        Args:
            name: League name
            external_id: External GRID ID
            short_name: Short name/abbreviation
            region: Region (EMEA, Americas, Asia, etc.)
            logo_url: Logo URL
            tier: League tier (1=major, 2=secondary)

        Returns:
            League ID
        """
        # 1. Check mapping table first
        if external_id:
            mapped_id = await self.find_by_source_id("league", external_id)
            if mapped_id is not None:
                await self.execute(
                    """
                    UPDATE pro_leagues SET
                        short_name = COALESCE($1, short_name),
                        region = COALESCE($2, region),
                        logo_url = COALESCE($3, logo_url),
                        tier = $4,
                        updated_at = NOW()
                    WHERE league_id = $5
                    """,
                    short_name,
                    region,
                    logo_url,
                    tier,
                    mapped_id,
                )
                return mapped_id

        # 2. Standard upsert by name
        result = await self.fetchval(
            """
            INSERT INTO pro_leagues (name, external_id, short_name, region, logo_url, tier, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (name)
            DO UPDATE SET
                external_id = COALESCE(EXCLUDED.external_id, pro_leagues.external_id),
                short_name = COALESCE(EXCLUDED.short_name, pro_leagues.short_name),
                region = COALESCE(EXCLUDED.region, pro_leagues.region),
                logo_url = COALESCE(EXCLUDED.logo_url, pro_leagues.logo_url),
                tier = EXCLUDED.tier,
                updated_at = NOW()
            RETURNING league_id
            """,
            name,
            external_id,
            short_name,
            region,
            logo_url,
            tier,
        )

        # 3. Register mapping
        if external_id:
            source = "leaguepedia" if external_id.startswith("lp:") else "grid"
            await self.register_mapping("league", result, source, external_id)

        return result

    async def get_pro_league_by_name(self, name: str) -> asyncpg.Record | None:
        """Get a pro league by name."""
        return await self.fetchrow(
            "SELECT * FROM pro_leagues WHERE name = $1",
            name,
        )

    # ==========================================
    # Pro Team Operations
    # ==========================================

    async def upsert_pro_team(
        self,
        external_id: str,
        name: str,
        short_name: str | None = None,
        logo_url: str | None = None,
    ) -> int:
        """
        Upsert a pro team, checking mapping table then name match to avoid duplicates.

        Args:
            external_id: External GRID team ID
            name: Team name
            short_name: Short name/abbreviation
            logo_url: Team logo URL

        Returns:
            Team ID (internal)
        """
        # 1. Check mapping table first
        mapped_id = await self.find_by_source_id("team", external_id)
        if mapped_id is not None:
            await self.execute(
                """
                UPDATE teams
                SET short_name = COALESCE($1, short_name),
                    logo_url = COALESCE($2, logo_url),
                    updated_at = NOW()
                WHERE team_id = $3
                """,
                short_name,
                logo_url,
                mapped_id,
            )
            return mapped_id

        # 2. Name match (LoL teams only)
        existing = await self.fetchrow(
            "SELECT team_id FROM teams WHERE LOWER(TRIM(current_name)) = LOWER(TRIM($1)) AND game_id = 1 LIMIT 1",
            name,
        )
        if existing:
            team_id = existing["team_id"]
            await self.execute(
                """
                UPDATE teams
                SET short_name = COALESCE($1, short_name),
                    logo_url = COALESCE($2, logo_url),
                    external_id = COALESCE(external_id, $3),
                    updated_at = NOW()
                WHERE team_id = $4
                """,
                short_name,
                logo_url,
                external_id,
                team_id,
            )
            source = "leaguepedia" if external_id.startswith("lp:") else "grid"
            await self.register_mapping("team", team_id, source, external_id)
            return team_id

        # 3. No match — insert new team
        slug = f"pro-{external_id}"
        result = await self.fetchval(
            """
            INSERT INTO teams (external_id, current_name, short_name, logo_url, game_id, slug, is_active, updated_at)
            VALUES ($1, $2, $3, $4, 1, $5, false, NOW())
            ON CONFLICT (external_id)
            DO UPDATE SET
                current_name = EXCLUDED.current_name,
                short_name = COALESCE(EXCLUDED.short_name, teams.short_name),
                logo_url = COALESCE(EXCLUDED.logo_url, teams.logo_url),
                updated_at = NOW()
            RETURNING team_id
            """,
            external_id,
            name,
            short_name,
            logo_url,
            slug,
        )
        source = "leaguepedia" if external_id.startswith("lp:") else "grid"
        await self.register_mapping("team", result, source, external_id)
        return result

    async def get_pro_team_by_external_id(self, external_id: str) -> asyncpg.Record | None:
        """Get a pro team by external ID."""
        return await self.fetchrow(
            "SELECT * FROM teams WHERE external_id = $1",
            external_id,
        )

    async def get_pro_team_by_name(self, name: str) -> asyncpg.Record | None:
        """Get a pro team by name (case-insensitive)."""
        return await self.fetchrow(
            "SELECT * FROM teams WHERE LOWER(TRIM(current_name)) = LOWER(TRIM($1)) AND game_id = 1 LIMIT 1",
            name,
        )

    # ==========================================
    # Pro Tournament Operations
    # ==========================================

    async def upsert_pro_tournament(
        self,
        external_id: str,
        name: str,
        slug: str | None = None,
        pro_league_id: int | None = None,
        start_date: date | datetime | None = None,
        end_date: date | datetime | None = None,
        year: int | None = None,
        phase: str | None = None,
        split_name: str | None = None,
        **kwargs,  # Accept but ignore extra args for compatibility
    ) -> int:
        """
        Upsert a pro tournament, checking mapping table first.

        Args:
            external_id: External GRID ID
            name: Tournament name
            slug: URL-friendly slug
            pro_league_id: FK to pro_leagues
            start_date: Start date
            end_date: End date
            year: Year
            phase: Tournament phase (e.g. "Regular Season", "Playoffs")
            split_name: Parent split name (e.g. "LEC - Winter 2025")

        Returns:
            Tournament ID
        """
        if slug is None:
            slug = name.lower().replace(" ", "-").replace("'", "")

        # 1. Check mapping table first
        mapped_id = await self.find_by_source_id("tournament", external_id)
        if mapped_id is not None:
            await self.execute(
                """
                UPDATE pro_tournaments SET
                    name = $1, slug = $2,
                    pro_league_id = COALESCE($3, pro_league_id),
                    start_date = COALESCE($4, start_date),
                    end_date = COALESCE($5, end_date),
                    year = COALESCE($6, year),
                    phase = COALESCE($7, phase),
                    split_name = COALESCE($8, split_name),
                    updated_at = NOW()
                WHERE tournament_id = $9
                """,
                name,
                slug,
                pro_league_id,
                start_date,
                end_date,
                year,
                phase,
                split_name,
                mapped_id,
            )
            return mapped_id

        # 2. Standard upsert by external_id
        result = await self.fetchval(
            """
            INSERT INTO pro_tournaments (
                external_id, name, slug, pro_league_id, start_date, end_date, year,
                phase, split_name, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            ON CONFLICT (external_id)
            DO UPDATE SET
                name = EXCLUDED.name,
                slug = EXCLUDED.slug,
                pro_league_id = COALESCE(EXCLUDED.pro_league_id, pro_tournaments.pro_league_id),
                start_date = COALESCE(EXCLUDED.start_date, pro_tournaments.start_date),
                end_date = COALESCE(EXCLUDED.end_date, pro_tournaments.end_date),
                year = COALESCE(EXCLUDED.year, pro_tournaments.year),
                phase = COALESCE(EXCLUDED.phase, pro_tournaments.phase),
                split_name = COALESCE(EXCLUDED.split_name, pro_tournaments.split_name),
                updated_at = NOW()
            RETURNING tournament_id
            """,
            external_id,
            name,
            slug,
            pro_league_id,
            start_date,
            end_date,
            year,
            phase,
            split_name,
        )

        # 3. Register mapping
        source = "leaguepedia" if external_id.startswith("lp:") else "grid"
        await self.register_mapping("tournament", result, source, external_id)
        return result

    async def get_pro_tournament_by_external_id(self, external_id: str) -> asyncpg.Record | None:
        """Get a tournament by external ID."""
        return await self.fetchrow(
            "SELECT * FROM pro_tournaments WHERE external_id = $1",
            external_id,
        )

    async def get_pro_tournaments_by_year(self, year: int) -> list[asyncpg.Record]:
        """Get all tournaments for a specific year."""
        return await self.fetch(
            "SELECT * FROM pro_tournaments WHERE year = $1 ORDER BY start_date",
            year,
        )

    async def resolve_tournament_id(self, grid_external_id: str) -> int | None:
        """Resolve a GRID external tournament ID to an internal tournament_id.

        Checks pro_entity_mappings first, then falls back to direct external_id lookup.
        """
        # 1. Check mapping table
        mapped_id = await self.find_by_source_id("tournament", grid_external_id)
        if mapped_id is not None:
            return mapped_id

        # 2. Fallback: direct external_id lookup
        result = await self.fetchval(
            "SELECT tournament_id FROM pro_tournaments WHERE external_id = $1",
            grid_external_id,
        )
        return result

    async def set_tournament_parent(self, tournament_id: int, parent_tournament_id: int) -> None:
        """Set the parent tournament for a given tournament.

        Guards against self-reference and circular references using a recursive CTE.
        """
        # Guard: no self-reference
        if tournament_id == parent_tournament_id:
            return

        # Guard: no circular reference (check parent is not a descendant)
        is_circular = await self.fetchval(
            """
            WITH RECURSIVE ancestors AS (
                SELECT parent_tournament_id FROM pro_tournaments WHERE tournament_id = $1
                UNION ALL
                SELECT t.parent_tournament_id
                FROM pro_tournaments t
                JOIN ancestors a ON t.tournament_id = a.parent_tournament_id
                WHERE t.parent_tournament_id IS NOT NULL
            )
            SELECT EXISTS (SELECT 1 FROM ancestors WHERE parent_tournament_id = $2)
            """,
            parent_tournament_id,
            tournament_id,
        )
        if is_circular:
            return

        await self.execute(
            "UPDATE pro_tournaments SET parent_tournament_id = $1 WHERE tournament_id = $2",
            parent_tournament_id,
            tournament_id,
        )

    # ==========================================
    # Pro Match (Series) Operations
    # ==========================================

    async def upsert_pro_match(
        self,
        external_id: str,
        tournament_id: int | None = None,
        team1_id: int | None = None,
        team2_id: int | None = None,
        team1_external_id: str | None = None,
        team2_external_id: str | None = None,
        team1_score: int = 0,
        team2_score: int = 0,
        winner_team_id: int | None = None,
        format: str = "bo3",
        status: str = "completed",
        scheduled_at: datetime | None = None,
        started_at: datetime | None = None,
        ended_at: datetime | None = None,
    ) -> int:
        """
        Upsert a pro match (series).

        Args:
            external_id: External GRID series ID
            tournament_id: FK to pro_tournaments (optional)
            team1_id: Unused (kept for API compatibility)
            team2_id: Unused (kept for API compatibility)
            team1_external_id: GRID team 1 external ID
            team2_external_id: GRID team 2 external ID
            team1_score: Team 1 score
            team2_score: Team 2 score
            winner_team_id: Unused (kept for API compatibility)
            format: Match format (bo1, bo3, bo5)
            status: Match status
            scheduled_at: Scheduled start time
            started_at: Actual start time
            ended_at: End time

        Returns:
            Match ID
        """
        result = await self.fetchval(
            """
            INSERT INTO pro_matches (
                external_id, tournament_id, team1_external_id, team2_external_id,
                team1_score, team2_score, format, status,
                scheduled_at, started_at, ended_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            ON CONFLICT (external_id)
            DO UPDATE SET
                tournament_id = COALESCE(EXCLUDED.tournament_id, pro_matches.tournament_id),
                team1_external_id = COALESCE(EXCLUDED.team1_external_id, pro_matches.team1_external_id),
                team2_external_id = COALESCE(EXCLUDED.team2_external_id, pro_matches.team2_external_id),
                team1_score = EXCLUDED.team1_score,
                team2_score = EXCLUDED.team2_score,
                format = EXCLUDED.format,
                -- Don't overwrite 'processed' status
                status = CASE
                    WHEN pro_matches.status = 'processed' THEN 'processed'
                    ELSE EXCLUDED.status
                END,
                scheduled_at = COALESCE(EXCLUDED.scheduled_at, pro_matches.scheduled_at),
                started_at = COALESCE(EXCLUDED.started_at, pro_matches.started_at),
                ended_at = COALESCE(EXCLUDED.ended_at, pro_matches.ended_at),
                updated_at = NOW()
            RETURNING match_id
            """,
            external_id,
            tournament_id,
            team1_external_id,
            team2_external_id,
            team1_score,
            team2_score,
            format,
            status,
            scheduled_at,
            started_at,
            ended_at,
        )
        return result

    async def pro_match_exists(self, external_id: str) -> bool:
        """Check if a pro match exists by external ID."""
        result = await self.fetchval(
            "SELECT EXISTS(SELECT 1 FROM pro_matches WHERE external_id = $1)",
            external_id,
        )
        return result

    async def get_pro_match_by_external_id(self, external_id: str) -> asyncpg.Record | None:
        """Get a pro match by external ID."""
        return await self.fetchrow(
            "SELECT * FROM pro_matches WHERE external_id = $1",
            external_id,
        )

    async def is_pro_match_processed(self, external_id: str) -> bool:
        """Check if a pro match is already processed."""
        result = await self.fetchval(
            "SELECT status = 'processed' FROM pro_matches WHERE external_id = $1",
            external_id,
        )
        return result or False

    async def is_series_already_merged(self, external_id: str) -> bool:
        """Check if a GRID series was already merged into another match."""
        result = await self.fetchval(
            "SELECT EXISTS(SELECT 1 FROM pro_entity_mappings WHERE entity_type = 'match' AND source = 'grid_merged' AND source_id = $1)",
            external_id,
        )
        return result or False

    async def find_duplicate_pro_match(
        self,
        external_id: str,
        tournament_id: int | None,
        team1_external_id: str | None,
        team2_external_id: str | None,
        started_at: datetime | None,
        format: str,
    ) -> asyncpg.Record | None:
        """Find an existing pro match that looks like a duplicate of a new GRID series.

        Two detection levels:
        - Cancelled matches: same tournament + same teams + started_at ±1 day
        - Non-cancelled matches: same tournament + same teams + same format + started_at ±3 hours
        """
        if not tournament_id or not team1_external_id or not team2_external_id or not started_at:
            return None

        return await self.fetchrow(
            """
            SELECT match_id, external_id, status, started_at, format, team1_external_id
            FROM pro_matches
            WHERE external_id != $1
              AND tournament_id = $2
              AND (
                (team1_external_id = $3 AND team2_external_id = $4)
                OR (team1_external_id = $4 AND team2_external_id = $3)
              )
              AND started_at IS NOT NULL
              AND (
                (status = 'cancelled'
                 AND started_at BETWEEN $5::timestamptz - INTERVAL '1 day' AND $5::timestamptz + INTERVAL '1 day')
                OR
                (status != 'cancelled'
                 AND format = $6
                 AND started_at BETWEEN $5::timestamptz - INTERVAL '3 hours' AND $5::timestamptz + INTERVAL '3 hours')
              )
            LIMIT 1
            """,
            external_id,
            tournament_id,
            team1_external_id,
            team2_external_id,
            started_at,
            format,
        )

    async def merge_duplicate_pro_match(
        self,
        primary_match_id: int,
        primary_external_id: str,
        secondary_match_id: int,
        secondary_external_id: str,
    ) -> int:
        """Merge games from secondary match into primary match, then delete secondary.

        Steps (all in one transaction):
        1. Find max game_number in primary
        2. Renumber secondary's games (shift by max)
        3. Re-parent games to primary (pro_games.match_id)
        4. Re-parent team_stats to primary (pro_team_stats.match_id)
        5. Audit trail via pro_entity_mappings
        6. Delete orphaned secondary match

        Other child tables (pro_player_stats, pro_drafts, pro_draft_actions,
        pro_player_timing_stats, pro_game_events) only reference game_id
        and don't need updating.

        Returns number of games moved.
        """
        async with self.transaction() as conn:
            # 1. Find max game_number in primary match
            max_game_num = await conn.fetchval(
                "SELECT COALESCE(MAX(game_number), 0) FROM pro_games WHERE match_id = $1",
                primary_match_id,
            )

            # 2. Renumber games from secondary (shift by max_game_num)
            # Must happen BEFORE re-parent to avoid UNIQUE(match_id, game_number) violation
            await conn.execute(
                "UPDATE pro_games SET game_number = game_number + $1 WHERE match_id = $2",
                max_game_num, secondary_match_id,
            )

            # 3. Re-parent games to primary match
            games_moved = await conn.fetchval(
                "WITH moved AS ("
                "  UPDATE pro_games SET match_id = $1 WHERE match_id = $2 RETURNING 1"
                ") SELECT COUNT(*) FROM moved",
                primary_match_id, secondary_match_id,
            )

            # 4. Re-parent team_stats (denormalized match_id)
            await conn.execute(
                "UPDATE pro_team_stats SET match_id = $1 WHERE match_id = $2",
                primary_match_id, secondary_match_id,
            )

            # 5. Audit trail
            await conn.execute(
                """INSERT INTO pro_entity_mappings (entity_type, entity_id, source, source_id, created_at)
                   VALUES ('match', $1, 'grid_merged', $2, NOW())
                   ON CONFLICT (entity_type, source, source_id) DO NOTHING""",
                primary_match_id, secondary_external_id,
            )

            # 6. Delete orphaned secondary match (no more children)
            await conn.execute(
                "DELETE FROM pro_matches WHERE match_id = $1",
                secondary_match_id,
            )

            return games_moved

    async def mark_pro_match_processed(self, match_id: int) -> None:
        """Mark a pro match as fully processed."""
        await self.execute(
            """
            UPDATE pro_matches
            SET status = 'processed', updated_at = NOW()
            WHERE match_id = $1
            """,
            match_id,
        )

    # ==========================================
    # Pro Game Operations
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
        status: str = "completed",
        patch: str | None = None,
        blue_towers: int = 0,
        red_towers: int = 0,
        blue_dragons: int = 0,
        red_dragons: int = 0,
        blue_barons: int = 0,
        red_barons: int = 0,
        blue_heralds: int = 0,
        red_heralds: int = 0,
        blue_grubs: int = 0,
        red_grubs: int = 0,
        first_blood_team: str | None = None,
        first_tower_team: str | None = None,
        first_dragon_team: str | None = None,
        first_baron_team: str | None = None,
        first_herald_team: str | None = None,
        blue_gold_at_15: int | None = None,
        red_gold_at_15: int | None = None,
        blue_kills_at_15: int | None = None,
        red_kills_at_15: int | None = None,
        blue_kills: int = 0,
        red_kills: int = 0,
        blue_plates: int = 0,
        red_plates: int = 0,
        plates_detail: dict | None = None,
        objectives_timeline: dict | None = None,
        started_at: datetime | None = None,
        ended_at: datetime | None = None,
        timeline_data: dict | None = None,
        metadata: dict | None = None,
    ) -> int:
        """
        Upsert a pro game.

        Returns:
            Game ID
        """
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
                blue_kills, red_kills, blue_plates, red_plates,
                plates_detail, objectives_timeline,
                started_at, ended_at, timeline_data, metadata, updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
                $29, $30, $31, $32, $33, $34,
                $35, $36, $37, $38, NOW()
            )
            ON CONFLICT (external_id)
            DO UPDATE SET
                match_id = EXCLUDED.match_id,
                game_number = EXCLUDED.game_number,
                blue_team_id = COALESCE(EXCLUDED.blue_team_id, pro_games.blue_team_id),
                red_team_id = COALESCE(EXCLUDED.red_team_id, pro_games.red_team_id),
                winner_team_id = EXCLUDED.winner_team_id,
                duration = COALESCE(EXCLUDED.duration, pro_games.duration),
                -- Don't overwrite 'processed' status
                status = CASE
                    WHEN pro_games.status = 'processed' THEN 'processed'
                    ELSE EXCLUDED.status
                END,
                patch = COALESCE(EXCLUDED.patch, pro_games.patch),
                blue_towers = EXCLUDED.blue_towers,
                red_towers = EXCLUDED.red_towers,
                blue_dragons = EXCLUDED.blue_dragons,
                red_dragons = EXCLUDED.red_dragons,
                blue_barons = EXCLUDED.blue_barons,
                red_barons = EXCLUDED.red_barons,
                blue_heralds = EXCLUDED.blue_heralds,
                red_heralds = EXCLUDED.red_heralds,
                blue_grubs = EXCLUDED.blue_grubs,
                red_grubs = EXCLUDED.red_grubs,
                first_blood_team = EXCLUDED.first_blood_team,
                first_tower_team = EXCLUDED.first_tower_team,
                first_dragon_team = EXCLUDED.first_dragon_team,
                first_baron_team = EXCLUDED.first_baron_team,
                first_herald_team = EXCLUDED.first_herald_team,
                blue_gold_at_15 = COALESCE(EXCLUDED.blue_gold_at_15, pro_games.blue_gold_at_15),
                red_gold_at_15 = COALESCE(EXCLUDED.red_gold_at_15, pro_games.red_gold_at_15),
                blue_kills_at_15 = COALESCE(EXCLUDED.blue_kills_at_15, pro_games.blue_kills_at_15),
                red_kills_at_15 = COALESCE(EXCLUDED.red_kills_at_15, pro_games.red_kills_at_15),
                blue_kills = EXCLUDED.blue_kills,
                red_kills = EXCLUDED.red_kills,
                blue_plates = EXCLUDED.blue_plates,
                red_plates = EXCLUDED.red_plates,
                plates_detail = COALESCE(EXCLUDED.plates_detail, pro_games.plates_detail),
                objectives_timeline = COALESCE(EXCLUDED.objectives_timeline, pro_games.objectives_timeline),
                started_at = COALESCE(EXCLUDED.started_at, pro_games.started_at),
                ended_at = COALESCE(EXCLUDED.ended_at, pro_games.ended_at),
                timeline_data = COALESCE(EXCLUDED.timeline_data, pro_games.timeline_data),
                metadata = COALESCE(EXCLUDED.metadata, pro_games.metadata),
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
            blue_towers,
            red_towers,
            blue_dragons,
            red_dragons,
            blue_barons,
            red_barons,
            blue_heralds,
            red_heralds,
            blue_grubs,
            red_grubs,
            first_blood_team,
            first_tower_team,
            first_dragon_team,
            first_baron_team,
            first_herald_team,
            blue_gold_at_15,
            red_gold_at_15,
            blue_kills_at_15,
            red_kills_at_15,
            blue_kills,
            red_kills,
            blue_plates,
            red_plates,
            json.dumps(plates_detail) if plates_detail else None,
            json.dumps(objectives_timeline) if objectives_timeline else None,
            started_at,
            ended_at,
            json.dumps(timeline_data) if timeline_data else None,
            json.dumps(metadata) if metadata else None,
        )
        return result

    async def pro_game_exists(self, external_id: str) -> bool:
        """Check if a pro game exists by external ID."""
        result = await self.fetchval(
            "SELECT EXISTS(SELECT 1 FROM pro_games WHERE external_id = $1)",
            external_id,
        )
        return result

    async def get_pro_game_by_external_id(self, external_id: str) -> asyncpg.Record | None:
        """Get a pro game by external ID."""
        return await self.fetchrow(
            "SELECT * FROM pro_games WHERE external_id = $1",
            external_id,
        )

    async def is_pro_game_processed(self, external_id: str) -> bool:
        """Check if a pro game is already processed."""
        result = await self.fetchval(
            "SELECT status = 'processed' FROM pro_games WHERE external_id = $1",
            external_id,
        )
        return result or False

    async def mark_pro_game_processed(self, game_id: int) -> None:
        """Mark a pro game as fully processed."""
        await self.execute(
            """
            UPDATE pro_games
            SET status = 'processed', updated_at = NOW()
            WHERE game_id = $1
            """,
            game_id,
        )

    # ==========================================
    # Pro Team Game Stats Operations
    # ==========================================

    async def upsert_pro_team_game_stats(
        self,
        game_id: int,
        match_id: int,
        tournament_id: int,
        blue_team_id: int | None,
        red_team_id: int | None,
        winner_team_id: int | None,
        duration: int | None,
        blue_towers: int = 0,
        red_towers: int = 0,
        blue_dragons: int = 0,
        red_dragons: int = 0,
        blue_barons: int = 0,
        red_barons: int = 0,
        blue_heralds: int = 0,
        red_heralds: int = 0,
        blue_grubs: int = 0,
        red_grubs: int = 0,
        blue_plates: int = 0,
        red_plates: int = 0,
        blue_kills: int = 0,
        red_kills: int = 0,
        blue_gold_at_15: int | None = None,
        red_gold_at_15: int | None = None,
        blue_kills_at_15: int | None = None,
        red_kills_at_15: int | None = None,
        first_blood_team: str | None = None,
        first_blood_time: int | None = None,
        first_tower_team: str | None = None,
        first_dragon_team: str | None = None,
        first_baron_team: str | None = None,
        first_herald_team: str | None = None,
        first_grubs_team: str | None = None,
        blue_total_gold: int = 0,
        red_total_gold: int = 0,
        blue_vision_score: int = 0,
        red_vision_score: int = 0,
        blue_wards_placed: int = 0,
        red_wards_placed: int = 0,
        blue_wards_destroyed: int = 0,
        red_wards_destroyed: int = 0,
        blue_control_wards: int = 0,
        red_control_wards: int = 0,
        objectives_timeline: dict | None = None,
        connection: object | None = None,
    ) -> None:
        """Insert 2 rows per game into pro_team_stats (one per team side)."""
        if not tournament_id:
            return

        # Extract objectives detail from timeline
        obj = self._extract_objectives_detail(objectives_timeline) if objectives_timeline else {}

        rows = [
            ("blue", blue_team_id, blue_kills, red_kills, blue_towers, blue_dragons,
             blue_barons, blue_heralds, blue_grubs, blue_plates,
             blue_gold_at_15, blue_kills_at_15, red_gold_at_15,
             blue_total_gold, blue_vision_score, blue_wards_placed,
             blue_wards_destroyed, blue_control_wards),
            ("red", red_team_id, red_kills, blue_kills, red_towers, red_dragons,
             red_barons, red_heralds, red_grubs, red_plates,
             red_gold_at_15, red_kills_at_15, blue_gold_at_15,
             red_total_gold, red_vision_score, red_wards_placed,
             red_wards_destroyed, red_control_wards),
        ]

        for (side, team_id, kills, deaths, towers, dragons, barons, heralds,
             grubs, plates, gold15, kills15, opp_gold15,
             total_gold, vis_score, wards_pl, wards_destr, ctrl_wards) in rows:
            if not team_id:
                continue

            gold_diff_at_15 = (
                (gold15 - opp_gold15)
                if gold15 is not None and opp_gold15 is not None
                else None
            )
            win = winner_team_id == team_id if winner_team_id else False

            # Get side-specific objectives detail
            side_obj = obj.get(side, {})

            query = """
                INSERT INTO pro_team_stats (
                    game_id, match_id, tournament_id, team_id,
                    side, win, duration,
                    kills, deaths, towers, dragons, barons, heralds, grubs, plates,
                    gold_at_15, kills_at_15, gold_diff_at_15,
                    first_blood, first_tower, first_dragon, first_baron, first_herald,
                    first_grubs,
                    first_blood_time, first_tower_time, first_dragon_time,
                    first_herald_time, first_baron_time, first_grubs_time,
                    fire_dragons, ocean_dragons, mountain_dragons,
                    air_dragons, hextech_dragons, chemtech_dragons, elder_dragons,
                    dragon_soul, dragon_soul_type,
                    dragons_at_15, towers_at_15,
                    total_gold, vision_score, wards_placed, wards_destroyed, control_wards,
                    created_at
                )
                VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7,
                    $8, $9, $10, $11, $12, $13, $14, $15,
                    $16, $17, $18,
                    $19, $20, $21, $22, $23,
                    $24,
                    $25, $26, $27, $28, $29, $30,
                    $31, $32, $33, $34, $35, $36, $37,
                    $38, $39,
                    $40, $41,
                    $42, $43, $44, $45, $46,
                    NOW()
                )
                ON CONFLICT (game_id, team_id) DO UPDATE SET
                    match_id = EXCLUDED.match_id,
                    tournament_id = EXCLUDED.tournament_id,
                    side = EXCLUDED.side,
                    win = EXCLUDED.win,
                    duration = EXCLUDED.duration,
                    kills = EXCLUDED.kills,
                    deaths = EXCLUDED.deaths,
                    towers = EXCLUDED.towers,
                    dragons = EXCLUDED.dragons,
                    barons = EXCLUDED.barons,
                    heralds = EXCLUDED.heralds,
                    grubs = EXCLUDED.grubs,
                    plates = EXCLUDED.plates,
                    gold_at_15 = EXCLUDED.gold_at_15,
                    kills_at_15 = EXCLUDED.kills_at_15,
                    gold_diff_at_15 = EXCLUDED.gold_diff_at_15,
                    first_blood = EXCLUDED.first_blood,
                    first_tower = EXCLUDED.first_tower,
                    first_dragon = EXCLUDED.first_dragon,
                    first_baron = EXCLUDED.first_baron,
                    first_herald = EXCLUDED.first_herald,
                    first_grubs = EXCLUDED.first_grubs,
                    first_blood_time = EXCLUDED.first_blood_time,
                    first_tower_time = EXCLUDED.first_tower_time,
                    first_dragon_time = EXCLUDED.first_dragon_time,
                    first_herald_time = EXCLUDED.first_herald_time,
                    first_baron_time = EXCLUDED.first_baron_time,
                    first_grubs_time = EXCLUDED.first_grubs_time,
                    fire_dragons = EXCLUDED.fire_dragons,
                    ocean_dragons = EXCLUDED.ocean_dragons,
                    mountain_dragons = EXCLUDED.mountain_dragons,
                    air_dragons = EXCLUDED.air_dragons,
                    hextech_dragons = EXCLUDED.hextech_dragons,
                    chemtech_dragons = EXCLUDED.chemtech_dragons,
                    elder_dragons = EXCLUDED.elder_dragons,
                    dragon_soul = EXCLUDED.dragon_soul,
                    dragon_soul_type = EXCLUDED.dragon_soul_type,
                    dragons_at_15 = EXCLUDED.dragons_at_15,
                    towers_at_15 = EXCLUDED.towers_at_15,
                    total_gold = EXCLUDED.total_gold,
                    vision_score = EXCLUDED.vision_score,
                    wards_placed = EXCLUDED.wards_placed,
                    wards_destroyed = EXCLUDED.wards_destroyed,
                    control_wards = EXCLUDED.control_wards
            """

            is_first_blood = first_blood_team == side if first_blood_team else False
            is_first_tower = first_tower_team == side if first_tower_team else False
            is_first_dragon = first_dragon_team == side if first_dragon_team else False
            is_first_baron = first_baron_team == side if first_baron_team else False
            is_first_herald = first_herald_team == side if first_herald_team else False
            is_first_grubs = first_grubs_team == side if first_grubs_team else False

            args = (
                game_id, match_id, tournament_id, team_id,
                side, win, duration,
                kills or 0, deaths or 0, towers or 0, dragons or 0,
                barons or 0, heralds or 0, grubs or 0, plates or 0,
                gold15, kills15, gold_diff_at_15,
                is_first_blood, is_first_tower, is_first_dragon,
                is_first_baron, is_first_herald,
                is_first_grubs,
                # Timings: only set if this team got the first objective
                first_blood_time if is_first_blood else None,
                side_obj.get("first_tower_time") if is_first_tower else None,
                side_obj.get("first_dragon_time") if is_first_dragon else None,
                side_obj.get("first_herald_time") if is_first_herald else None,
                side_obj.get("first_baron_time") if is_first_baron else None,
                side_obj.get("first_grubs_time") if is_first_grubs else None,
                # Dragon type counts
                side_obj.get("fire_dragons", 0),
                side_obj.get("ocean_dragons", 0),
                side_obj.get("mountain_dragons", 0),
                side_obj.get("air_dragons", 0),
                side_obj.get("hextech_dragons", 0),
                side_obj.get("chemtech_dragons", 0),
                side_obj.get("elder_dragons", 0),
                # Dragon soul
                side_obj.get("dragon_soul", False),
                side_obj.get("dragon_soul_type"),
                # Early game @15min
                side_obj.get("dragons_at_15", 0),
                side_obj.get("towers_at_15", 0),
                # Gold and vision
                total_gold or 0,
                vis_score or 0,
                wards_pl or 0,
                wards_destr or 0,
                ctrl_wards or 0,
            )

            if connection:
                await connection.execute(query, *args)
            else:
                await self.execute(query, *args)

    @staticmethod
    def _extract_objectives_detail(timeline: dict) -> dict:
        """Extract per-side objectives detail from objectives_timeline JSONB.

        Returns:
            dict with 'blue' and 'red' keys, each containing:
            - Dragon type counts (fire_dragons, ocean_dragons, etc.)
            - Elder dragon count
            - Dragon soul info
            - First objective timings
        """
        result: dict[str, dict] = {
            "blue": {
                "fire_dragons": 0, "ocean_dragons": 0, "mountain_dragons": 0,
                "air_dragons": 0, "hextech_dragons": 0, "chemtech_dragons": 0,
                "elder_dragons": 0,
                "dragon_soul": False, "dragon_soul_type": None,
                "first_dragon_time": None, "first_herald_time": None,
                "first_baron_time": None, "first_grubs_time": None,
                "first_tower_time": None,
                "dragons_at_15": 0, "towers_at_15": 0,
            },
            "red": {
                "fire_dragons": 0, "ocean_dragons": 0, "mountain_dragons": 0,
                "air_dragons": 0, "hextech_dragons": 0, "chemtech_dragons": 0,
                "elder_dragons": 0,
                "dragon_soul": False, "dragon_soul_type": None,
                "first_dragon_time": None, "first_herald_time": None,
                "first_baron_time": None, "first_grubs_time": None,
                "first_tower_time": None,
                "dragons_at_15": 0, "towers_at_15": 0,
            },
        }

        # Dragon type counts + first dragon time + dragons at 15
        for d in timeline.get("dragons", []):
            team = d.get("team")
            dtype = d.get("type", "")
            if team not in result:
                continue
            key = f"{dtype}_dragons"
            if key in result[team]:
                result[team][key] += 1
            # First dragon time (first occurrence for this team)
            if result[team]["first_dragon_time"] is None:
                result[team]["first_dragon_time"] = d.get("time_s")
            # Count dragons before 15 min (900s)
            time_s = d.get("time_s")
            if time_s is not None and time_s < 900:
                result[team]["dragons_at_15"] += 1

        # Elder dragons
        for e in timeline.get("elder_dragons", []):
            team = e.get("team")
            if team in result:
                result[team]["elder_dragons"] += 1

        # Dragon soul
        soul = timeline.get("dragon_soul")
        if soul and isinstance(soul, dict):
            team = soul.get("team")
            if team in result:
                result[team]["dragon_soul"] = True
                result[team]["dragon_soul_type"] = soul.get("type")

        # First herald time
        for h in timeline.get("heralds", []):
            team = h.get("team")
            if team in result and result[team]["first_herald_time"] is None:
                result[team]["first_herald_time"] = h.get("time_s")

        # First baron time
        for b in timeline.get("barons", []):
            team = b.get("team")
            if team in result and result[team]["first_baron_time"] is None:
                result[team]["first_baron_time"] = b.get("time_s")

        # First grubs time
        for g in timeline.get("grubs", []):
            team = g.get("team")
            if team in result and result[team]["first_grubs_time"] is None:
                result[team]["first_grubs_time"] = g.get("time_s")

        # First tower time
        ft = timeline.get("first_tower")
        if ft and isinstance(ft, dict):
            team = ft.get("team")
            if team in result:
                result[team]["first_tower_time"] = ft.get("time_s")

        # Towers at 15 (towers destroyed before 900s)
        for t in timeline.get("towers", []):
            team = t.get("team")
            if team not in result:
                continue
            time_s = t.get("time_s")
            if time_s is not None and time_s < 900:
                result[team]["towers_at_15"] += 1

        return result

    # ==========================================
    # Pro Player Stats Operations
    # ==========================================

    async def insert_pro_player_stats_batch(
        self,
        game_id: int,
        stats_list: list[dict],
        connection: asyncpg.Connection | None = None,
    ) -> None:
        """
        Insert player stats for a game in batch.

        Uses DELETE + INSERT pattern since the unique index uses an expression
        (COALESCE) that can't be directly referenced in ON CONFLICT.

        Args:
            game_id: FK to pro_games
            stats_list: List of player stats dictionaries
            connection: Optional connection for transaction support
        """
        if not stats_list:
            return

        # Delete existing stats for this game (idempotent re-sync)
        delete_query = "DELETE FROM pro_player_stats WHERE game_id = $1"
        if connection:
            await connection.execute(delete_query, game_id)
        else:
            await self.execute(delete_query, game_id)

        # Build batch insert with UNNEST (simplified structure with JSONB columns)
        query = """
            INSERT INTO pro_player_stats (
                game_id, player_id, team_id, team_side, role,
                champion_id,
                kills, deaths, assists, cs, gold_earned, damage_dealt, damage_taken,
                first_blood,
                vision, max_diffs, multi_kills, solo_stats,
                items, runes, timing_data, proximity, isolation, quest_completed_at, plates
            )
            SELECT * FROM UNNEST(
                $1::int[], $2::int[], $3::int[], $4::text[], $5::text[],
                $6::int[],
                $7::int[], $8::int[], $9::int[], $10::int[], $11::int[], $12::int[], $13::int[],
                $14::jsonb[],
                $15::jsonb[], $16::jsonb[], $17::jsonb[], $18::jsonb[],
                $19::jsonb[], $20::jsonb[], $21::jsonb[], $22::jsonb[], $23::int[], $24::int[], $25::jsonb[]
            )
        """

        # Prepare arrays for UNNEST
        game_ids = []
        player_ids = []
        team_ids = []
        team_sides = []
        roles = []
        champion_ids = []
        kills = []
        deaths = []
        assists = []
        cs_list = []
        gold_earneds = []
        damage_dealts = []
        damage_takens = []
        first_blood_list = []
        vision_list = []
        max_diffs_list = []
        multi_kills_list = []
        solo_stats_list = []
        items_list = []
        runes_list = []
        timing_datas = []
        proximity_list = []
        isolation_list = []
        quest_completed_ats = []
        plates_list = []

        for s in stats_list:
            game_ids.append(game_id)
            player_ids.append(s.get("player_id"))
            team_ids.append(s.get("team_id"))
            team_sides.append(s.get("team_side"))
            roles.append(s.get("role"))
            champion_ids.append(s.get("champion_id", 0))
            kills.append(s.get("kills", 0))
            deaths.append(s.get("deaths", 0))
            assists.append(s.get("assists", 0))
            cs_list.append(s.get("cs", 0))
            gold_earneds.append(s.get("gold_earned", 0))
            damage_dealts.append(s.get("damage_dealt", 0))
            damage_takens.append(s.get("damage_taken", 0))
            fb = s.get("first_blood")
            first_blood_list.append(json.dumps(fb) if fb is not None else None)
            vision_list.append(json.dumps(s.get("vision", {})))
            max_diffs_list.append(json.dumps(s.get("max_diffs", {})))
            multi_kills_list.append(json.dumps(s.get("multi_kills", {})))
            solo_stats_list.append(json.dumps(s.get("solo_stats", {})))
            items_list.append(json.dumps(s.get("items", [])))
            runes_list.append(json.dumps(s.get("runes", {})))
            timing_datas.append(json.dumps(s.get("timing_data", {})))
            proximity_list.append(json.dumps(s.get("proximity", {})))
            isolation_list.append(s.get("isolation", 0))
            quest_completed_ats.append(s.get("quest_completed_at"))
            plates_list.append(json.dumps(s.get("plates", {})))

        if connection:
            await connection.execute(
                query,
                game_ids, player_ids, team_ids, team_sides, roles,
                champion_ids,
                kills, deaths, assists, cs_list, gold_earneds, damage_dealts, damage_takens,
                first_blood_list,
                vision_list, max_diffs_list, multi_kills_list, solo_stats_list,
                items_list, runes_list, timing_datas, proximity_list, isolation_list, quest_completed_ats, plates_list,
            )
        else:
            await self.execute(
                query,
                game_ids, player_ids, team_ids, team_sides, roles,
                champion_ids,
                kills, deaths, assists, cs_list, gold_earneds, damage_dealts, damage_takens,
                first_blood_list,
                vision_list, max_diffs_list, multi_kills_list, solo_stats_list,
                items_list, runes_list, timing_datas, proximity_list, isolation_list, quest_completed_ats, plates_list,
            )

    # ==========================================
    # Pro Draft Actions Operations
    # ==========================================

    async def insert_pro_draft_actions_batch(
        self,
        game_id: int,
        actions: list[dict],
        connection: asyncpg.Connection | None = None,
    ) -> None:
        """
        Insert draft actions for a game in batch.

        Uses DELETE + INSERT pattern for idempotent syncs.
        team_side values are converted to 'team1'/'team2' format.

        Args:
            game_id: FK to pro_games
            actions: List of draft action dictionaries
            connection: Optional connection for transaction support
        """
        if not actions:
            return

        # Delete existing actions for this game
        delete_query = "DELETE FROM pro_draft_actions WHERE game_id = $1"
        if connection:
            await connection.execute(delete_query, game_id)
        else:
            await self.execute(delete_query, game_id)

        # Note: player_name is not in the schema, only player_id (FK)
        # Role is available from migration 57
        query = """
            INSERT INTO pro_draft_actions (
                game_id, action_order, action_type, team_side,
                champion_id, role
            )
            SELECT * FROM UNNEST(
                $1::int[], $2::int[], $3::text[], $4::text[],
                $5::int[], $6::text[]
            )
        """

        game_ids = []
        action_orders = []
        action_types = []
        team_sides = []
        champion_ids = []
        roles = []

        # Map for team_side conversion (blue/red -> team1/team2)
        side_map = {"blue": "team1", "red": "team2"}

        for a in actions:
            game_ids.append(game_id)
            action_orders.append(a.get("action_order", 0))
            action_types.append(a.get("action_type", "pick"))

            # Convert team_side if needed
            raw_side = a.get("team_side", "team1")
            team_sides.append(side_map.get(raw_side, raw_side))

            champion_ids.append(a.get("champion_id", 0))
            roles.append(a.get("role"))

        if connection:
            await connection.execute(
                query,
                game_ids, action_orders, action_types, team_sides,
                champion_ids, roles,
            )
        else:
            await self.execute(
                query,
                game_ids, action_orders, action_types, team_sides,
                champion_ids, roles,
            )

        # Also insert into pro_drafts (denormalized table for faster queries)
        await self._upsert_pro_drafts(game_id, actions, connection)

    async def _upsert_pro_drafts(
        self,
        game_id: int,
        actions: list[dict],
        connection: asyncpg.Connection | None = None,
    ) -> None:
        """
        Upsert denormalized draft data into pro_drafts table.

        Organizes picks and bans by team into separate columns.
        Also tracks roles and whether each pick is a counter pick.
        A counter pick = opponent already picked that role before you.
        """
        side_map = {"blue": "team1", "red": "team2"}

        # Organize actions by team and type, tracking order and role
        team1_picks: list[dict] = []
        team2_picks: list[dict] = []
        team1_bans: list[int] = []
        team2_bans: list[int] = []

        # Sort by action_order to maintain draft order
        sorted_actions = sorted(actions, key=lambda x: x.get("action_order", 0))

        # Track which roles have been picked by each team (for counter detection)
        team1_picked_roles: dict[str, int] = {}  # role -> action_order
        team2_picked_roles: dict[str, int] = {}

        for a in sorted_actions:
            raw_side = a.get("team_side", "team1")
            team = side_map.get(raw_side, raw_side)
            action_type = a.get("action_type", "pick")
            champion_id = a.get("champion_id", 0)
            role = a.get("role")
            action_order = a.get("action_order", 0)

            if action_type == "pick":
                # Determine if this is a counter pick
                # Counter = opponent already picked this role at an earlier action_order
                is_counter = False
                if role:
                    opponent_roles = team2_picked_roles if team == "team1" else team1_picked_roles
                    if role in opponent_roles and opponent_roles[role] < action_order:
                        is_counter = True

                    # Track this pick's role
                    if team == "team1":
                        team1_picked_roles[role] = action_order
                    else:
                        team2_picked_roles[role] = action_order

                pick_data = {
                    "champion_id": champion_id,
                    "role": role,
                    "is_counter": is_counter,
                }

                if team == "team1":
                    team1_picks.append(pick_data)
                else:
                    team2_picks.append(pick_data)

            elif action_type == "ban":
                if team == "team1":
                    team1_bans.append(champion_id)
                else:
                    team2_bans.append(champion_id)

        # Pad arrays to 5 elements
        def pad_picks(arr: list[dict], size: int = 5) -> list[dict]:
            empty = {"champion_id": None, "role": None, "is_counter": False}
            return (arr + [empty] * size)[:size]

        def pad_bans(arr: list[int], size: int = 5) -> list:
            return (arr + [None] * size)[:size]

        team1_picks = pad_picks(team1_picks)
        team2_picks = pad_picks(team2_picks)
        team1_bans = pad_bans(team1_bans)
        team2_bans = pad_bans(team2_bans)

        upsert_query = """
            INSERT INTO pro_drafts (
                game_id,
                team1_pick_1, team1_pick_2, team1_pick_3, team1_pick_4, team1_pick_5,
                team2_pick_1, team2_pick_2, team2_pick_3, team2_pick_4, team2_pick_5,
                team1_ban_1, team1_ban_2, team1_ban_3, team1_ban_4, team1_ban_5,
                team2_ban_1, team2_ban_2, team2_ban_3, team2_ban_4, team2_ban_5,
                team1_role_1, team1_role_2, team1_role_3, team1_role_4, team1_role_5,
                team2_role_1, team2_role_2, team2_role_3, team2_role_4, team2_role_5,
                team1_counter_1, team1_counter_2, team1_counter_3, team1_counter_4, team1_counter_5,
                team2_counter_1, team2_counter_2, team2_counter_3, team2_counter_4, team2_counter_5
            ) VALUES (
                $1,
                $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16,
                $17, $18, $19, $20, $21,
                $22, $23, $24, $25, $26,
                $27, $28, $29, $30, $31,
                $32, $33, $34, $35, $36,
                $37, $38, $39, $40, $41
            )
            ON CONFLICT (game_id) DO UPDATE SET
                team1_pick_1 = EXCLUDED.team1_pick_1,
                team1_pick_2 = EXCLUDED.team1_pick_2,
                team1_pick_3 = EXCLUDED.team1_pick_3,
                team1_pick_4 = EXCLUDED.team1_pick_4,
                team1_pick_5 = EXCLUDED.team1_pick_5,
                team2_pick_1 = EXCLUDED.team2_pick_1,
                team2_pick_2 = EXCLUDED.team2_pick_2,
                team2_pick_3 = EXCLUDED.team2_pick_3,
                team2_pick_4 = EXCLUDED.team2_pick_4,
                team2_pick_5 = EXCLUDED.team2_pick_5,
                team1_ban_1 = EXCLUDED.team1_ban_1,
                team1_ban_2 = EXCLUDED.team1_ban_2,
                team1_ban_3 = EXCLUDED.team1_ban_3,
                team1_ban_4 = EXCLUDED.team1_ban_4,
                team1_ban_5 = EXCLUDED.team1_ban_5,
                team2_ban_1 = EXCLUDED.team2_ban_1,
                team2_ban_2 = EXCLUDED.team2_ban_2,
                team2_ban_3 = EXCLUDED.team2_ban_3,
                team2_ban_4 = EXCLUDED.team2_ban_4,
                team2_ban_5 = EXCLUDED.team2_ban_5,
                team1_role_1 = EXCLUDED.team1_role_1,
                team1_role_2 = EXCLUDED.team1_role_2,
                team1_role_3 = EXCLUDED.team1_role_3,
                team1_role_4 = EXCLUDED.team1_role_4,
                team1_role_5 = EXCLUDED.team1_role_5,
                team2_role_1 = EXCLUDED.team2_role_1,
                team2_role_2 = EXCLUDED.team2_role_2,
                team2_role_3 = EXCLUDED.team2_role_3,
                team2_role_4 = EXCLUDED.team2_role_4,
                team2_role_5 = EXCLUDED.team2_role_5,
                team1_counter_1 = EXCLUDED.team1_counter_1,
                team1_counter_2 = EXCLUDED.team1_counter_2,
                team1_counter_3 = EXCLUDED.team1_counter_3,
                team1_counter_4 = EXCLUDED.team1_counter_4,
                team1_counter_5 = EXCLUDED.team1_counter_5,
                team2_counter_1 = EXCLUDED.team2_counter_1,
                team2_counter_2 = EXCLUDED.team2_counter_2,
                team2_counter_3 = EXCLUDED.team2_counter_3,
                team2_counter_4 = EXCLUDED.team2_counter_4,
                team2_counter_5 = EXCLUDED.team2_counter_5,
                updated_at = NOW()
        """

        args = [
            game_id,
            # Picks (champion IDs)
            team1_picks[0]["champion_id"], team1_picks[1]["champion_id"],
            team1_picks[2]["champion_id"], team1_picks[3]["champion_id"],
            team1_picks[4]["champion_id"],
            team2_picks[0]["champion_id"], team2_picks[1]["champion_id"],
            team2_picks[2]["champion_id"], team2_picks[3]["champion_id"],
            team2_picks[4]["champion_id"],
            # Bans
            *team1_bans,
            *team2_bans,
            # Roles
            team1_picks[0]["role"], team1_picks[1]["role"],
            team1_picks[2]["role"], team1_picks[3]["role"],
            team1_picks[4]["role"],
            team2_picks[0]["role"], team2_picks[1]["role"],
            team2_picks[2]["role"], team2_picks[3]["role"],
            team2_picks[4]["role"],
            # Counters
            team1_picks[0]["is_counter"], team1_picks[1]["is_counter"],
            team1_picks[2]["is_counter"], team1_picks[3]["is_counter"],
            team1_picks[4]["is_counter"],
            team2_picks[0]["is_counter"], team2_picks[1]["is_counter"],
            team2_picks[2]["is_counter"], team2_picks[3]["is_counter"],
            team2_picks[4]["is_counter"],
        ]

        if connection:
            await connection.execute(upsert_query, *args)
        else:
            await self.execute(upsert_query, *args)

    # ==========================================
    # Pro Game Events Operations
    # ==========================================

    async def insert_pro_game_events_batch(
        self,
        game_id: int,
        events: list[dict],
        connection: asyncpg.Connection | None = None,
    ) -> None:
        """
        Insert game events for a game in batch.

        Uses DELETE + INSERT pattern for idempotent syncs.

        Args:
            game_id: FK to pro_games
            events: List of event dictionaries
            connection: Optional connection for transaction support
        """
        if not events:
            return

        # Delete existing events for this game
        delete_query = "DELETE FROM pro_game_events WHERE game_id = $1"
        if connection:
            await connection.execute(delete_query, game_id)
        else:
            await self.execute(delete_query, game_id)

        query = """
            INSERT INTO pro_game_events (
                game_id, event_type, game_time, actor_player_name, target_player_name,
                position_x, position_y, event_data
            )
            SELECT * FROM UNNEST(
                $1::int[], $2::text[], $3::int[], $4::text[], $5::text[],
                $6::int[], $7::int[], $8::jsonb[]
            )
            ON CONFLICT DO NOTHING
        """

        game_ids = []
        event_types = []
        game_times = []
        actor_names = []
        target_names = []
        position_xs = []
        position_ys = []
        event_datas = []

        for e in events:
            game_ids.append(game_id)
            event_types.append(e.get("event_type", ""))
            game_times.append(e.get("game_time", 0))
            actor_names.append(e.get("actor_player_name"))
            target_names.append(e.get("target_player_name"))
            position_xs.append(e.get("position_x"))
            position_ys.append(e.get("position_y"))
            event_datas.append(json.dumps(e.get("event_data", {})))

        if connection:
            await connection.execute(
                query,
                game_ids, event_types, game_times, actor_names, target_names,
                position_xs, position_ys, event_datas,
            )
        else:
            await self.execute(
                query,
                game_ids, event_types, game_times, actor_names, target_names,
                position_xs, position_ys, event_datas,
            )

    async def resolve_player_id(
        self,
        player_name: str | None = None,
    ) -> int | None:
        """Resolve a player_id from player name.

        Resolution order:
        1. players by slug
        2. player_aliases by name (case-insensitive)
        3. Create new player + alias if name is available

        Args:
            player_name: Player display name

        Returns:
            player_id or None if unresolvable
        """
        if not player_name:
            return None

        # 1. Try players by slug
        slug = player_name.lower().replace(" ", "-")
        row = await self.fetchrow(
            "SELECT player_id FROM players WHERE slug = $1 LIMIT 1",
            slug,
        )
        if row:
            return row["player_id"]

        # 2. Try player_aliases by name
        row = await self.fetchrow(
            "SELECT player_id FROM player_aliases WHERE LOWER(alias) = LOWER($1) LIMIT 1",
            player_name,
        )
        if row:
            return row["player_id"]

        # 3. Create new player + alias
        player_id = await self.fetchval(
            """
            INSERT INTO players (slug, current_pseudo)
            VALUES ($1, $2)
            ON CONFLICT (slug) DO UPDATE SET current_pseudo = EXCLUDED.current_pseudo
            RETURNING player_id
            """,
            slug,
            player_name,
        )

        if player_id:
            await self.execute(
                """
                INSERT INTO player_aliases (player_id, alias, source)
                VALUES ($1, $2, 'grid')
                ON CONFLICT (player_id, alias) DO NOTHING
                """,
                player_id,
                player_name,
            )

        return player_id

    async def get_tracked_tournament_ids(self) -> list[str]:
        """Get all tournament external IDs that should be tracked for new matches."""
        rows = await self.fetch(
            """
            SELECT external_id FROM pro_tournaments
            WHERE external_id IS NOT NULL
            ORDER BY created_at DESC
            """
        )
        return [row["external_id"] for row in rows]
