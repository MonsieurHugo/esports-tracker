"""
Database Service
"""

from datetime import date, datetime
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
            WHERE p.is_active = true
            ORDER BY a.region, a.last_fetched_at NULLS FIRST
            """
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
            WHERE p.is_active = true AND a.region = $1
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
            WHERE p.is_active = true
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
    # LoL Current Ranks Operations
    # ==========================================

    async def upsert_current_rank(
        self,
        puuid: str,
        queue_type: str,
        tier: str | None,
        rank: str | None,
        league_points: int,
        wins: int,
        losses: int,
    ) -> None:
        """Insert or update current rank for an account."""
        await self.execute(
            """
            INSERT INTO lol_current_ranks (puuid, queue_type, tier, rank, league_points, wins, losses, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (puuid, queue_type)
            DO UPDATE SET
                tier = EXCLUDED.tier,
                rank = EXCLUDED.rank,
                league_points = EXCLUDED.league_points,
                wins = EXCLUDED.wins,
                losses = EXCLUDED.losses,
                updated_at = NOW()
            """,
            puuid,
            queue_type,
            tier,
            rank,
            league_points,
            wins,
            losses,
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
        lp: int = 0,
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
        """Update synergies between tracked players for a match."""
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

        # Update synergies with other tracked players
        for p in participants:
            if p["puuid"] == puuid:
                continue
            if p["puuid"] not in tracked_puuids:
                continue

            is_ally = p["team_id"] == our_team

            await self.execute(
                """
                INSERT INTO lol_player_synergy (
                    puuid, ally_puuid, games_together, wins_together, games_against, wins_against, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (puuid, ally_puuid)
                DO UPDATE SET
                    games_together = lol_player_synergy.games_together + EXCLUDED.games_together,
                    wins_together = lol_player_synergy.wins_together + EXCLUDED.wins_together,
                    games_against = lol_player_synergy.games_against + EXCLUDED.games_against,
                    wins_against = lol_player_synergy.wins_against + EXCLUDED.wins_against,
                    updated_at = NOW()
                """,
                puuid,
                p["puuid"],
                1 if is_ally else 0,
                1 if is_ally and our_win else 0,
                0 if is_ally else 1,
                0 if is_ally else (1 if our_win else 0),
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
        import json
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
    # LoL Rank Operations
    # ==========================================

    async def get_accounts_for_rank_update(self) -> list[asyncpg.Record]:
        """Get all active accounts for rank updates."""
        return await self.fetch(
            """
            SELECT
                a.puuid,
                a.player_id,
                a.game_name,
                a.tag_line,
                a.region
            FROM lol_accounts a
            JOIN players p ON a.player_id = p.player_id
            WHERE p.is_active = true
            ORDER BY a.region
            """
        )

    async def upsert_current_rank(
        self,
        puuid: str,
        queue_type: str,
        tier: str | None,
        rank: str | None,
        league_points: int,
        wins: int,
        losses: int,
    ) -> None:
        """Upsert current rank for an account."""
        await self.execute(
            """
            INSERT INTO lol_current_ranks (puuid, queue_type, tier, rank, league_points, wins, losses, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (puuid, queue_type)
            DO UPDATE SET
                tier = EXCLUDED.tier,
                rank = EXCLUDED.rank,
                league_points = EXCLUDED.league_points,
                wins = EXCLUDED.wins,
                losses = EXCLUDED.losses,
                updated_at = NOW()
            """,
            puuid,
            queue_type,
            tier,
            rank,
            league_points,
            wins,
            losses,
        )
