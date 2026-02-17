"""
Champion Stats Aggregation Job

Aggregates champion pick/ban statistics per day into pro_champion_daily_stats table.
Supports Fearless draft (champions picked in game N are unavailable for games N+1 in same match).
"""

from datetime import date, timedelta

import structlog

from src.services.database import DatabaseService

logger = structlog.get_logger(__name__)


class AggregateChampionStatsJob:
    """Job for aggregating champion statistics per day."""

    def __init__(self, db: DatabaseService):
        """
        Initialize aggregation job.

        Args:
            db: Database service
        """
        self.db = db

    async def run(self, target_date: date | None = None, days_back: int = 1) -> dict[str, int]:
        """
        Run aggregation for a specific date or range.

        Args:
            target_date: Specific date to aggregate (defaults to yesterday)
            days_back: Number of days to process if target_date is None

        Returns:
            Stats dictionary with counts
        """
        if target_date:
            dates_to_process = [target_date]
        else:
            # Process last N days by default
            today = date.today()
            dates_to_process = [today - timedelta(days=i) for i in range(days_back)]

        total_rows = 0
        total_dates = 0

        for process_date in dates_to_process:
            rows = await self._aggregate_date(process_date)
            if rows > 0:
                total_rows += rows
                total_dates += 1
                logger.info(
                    "Aggregated champion stats",
                    date=str(process_date),
                    rows=rows,
                )

        logger.info(
            "Champion stats aggregation complete",
            dates_processed=total_dates,
            total_rows=total_rows,
        )

        return {
            "dates_processed": total_dates,
            "rows_upserted": total_rows,
        }

    async def _aggregate_date(self, target_date: date) -> int:
        """
        Aggregate champion stats for a specific date.

        Args:
            target_date: Date to aggregate

        Returns:
            Number of rows upserted
        """
        query = """
        WITH games_on_date AS (
            SELECT
                g.game_id,
                g.match_id,
                g.game_number,
                g.winner_team_id,
                g.blue_team_id,
                g.red_team_id,
                g.patch,
                m.tournament_id,
                t1.team_id as team1_id,
                t2.team_id as team2_id
            FROM pro_games g
            JOIN pro_matches m ON g.match_id = m.match_id
            LEFT JOIN teams t1 ON m.team1_external_id = t1.external_id
            LEFT JOIN teams t2 ON m.team2_external_id = t2.external_id
            WHERE g.status IN ('completed', 'processed')
              AND DATE(m.started_at) = $1
        ),
        total_games AS (
            SELECT tournament_id, patch, COUNT(DISTINCT game_id) as total
            FROM games_on_date
            GROUP BY tournament_id, patch
        ),
        -- For Fearless: find the first game where each champion was picked per match
        first_pick_per_match AS (
            SELECT
                gs.match_id,
                da.champion_id,
                MIN(gs.game_number) as first_pick_game
            FROM games_on_date gs
            JOIN pro_draft_actions da ON da.game_id = gs.game_id
            WHERE da.action_type = 'pick'
            GROUP BY gs.match_id, da.champion_id
        ),
        picks_bans AS (
            SELECT
                da.champion_id,
                da.action_type,
                da.role,
                da.team_side,
                gs.game_id,
                gs.tournament_id,
                gs.patch,
                gs.match_id,
                gs.game_number,
                gs.winner_team_id,
                gs.blue_team_id,
                gs.red_team_id,
                gs.team1_id,
                gs.team2_id,
                CASE da.team_side
                    WHEN 'team1' THEN gs.team1_id
                    WHEN 'team2' THEN gs.team2_id
                END as action_team_id,
                -- Check if champion was already picked in a previous game of this match (Fearless)
                CASE WHEN fp.first_pick_game IS NOT NULL AND gs.game_number > fp.first_pick_game
                    THEN true ELSE false
                END as is_fearless_unavailable
            FROM pro_draft_actions da
            JOIN games_on_date gs ON da.game_id = gs.game_id
            LEFT JOIN first_pick_per_match fp ON fp.match_id = gs.match_id AND fp.champion_id = da.champion_id
        ),
        aggregated AS (
            SELECT
                champion_id,
                tournament_id,
                patch,
                COUNT(*) FILTER (WHERE action_type = 'pick') as picks,
                COUNT(*) FILTER (WHERE action_type = 'ban') as bans,
                COUNT(*) FILTER (WHERE action_type = 'ban' AND is_fearless_unavailable) as fearless_bans,
                COUNT(*) FILTER (WHERE action_type = 'pick' AND winner_team_id = action_team_id) as wins,
                -- Blue side stats
                COUNT(*) FILTER (WHERE action_type = 'pick' AND action_team_id = blue_team_id) as blue_picks,
                COUNT(*) FILTER (WHERE action_type = 'pick' AND action_team_id = blue_team_id AND winner_team_id = action_team_id) as blue_wins,
                -- Red side stats
                COUNT(*) FILTER (WHERE action_type = 'pick' AND action_team_id = red_team_id) as red_picks,
                COUNT(*) FILTER (WHERE action_type = 'pick' AND action_team_id = red_team_id AND winner_team_id = action_team_id) as red_wins,
                -- By role
                COUNT(*) FILTER (WHERE action_type = 'pick' AND role = 'Top') as top_picks,
                COUNT(*) FILTER (WHERE action_type = 'pick' AND role = 'Top' AND winner_team_id = action_team_id) as top_wins,
                COUNT(*) FILTER (WHERE action_type = 'pick' AND role = 'Jungle') as jungle_picks,
                COUNT(*) FILTER (WHERE action_type = 'pick' AND role = 'Jungle' AND winner_team_id = action_team_id) as jungle_wins,
                COUNT(*) FILTER (WHERE action_type = 'pick' AND role = 'Mid') as mid_picks,
                COUNT(*) FILTER (WHERE action_type = 'pick' AND role = 'Mid' AND winner_team_id = action_team_id) as mid_wins,
                COUNT(*) FILTER (WHERE action_type = 'pick' AND role = 'ADC') as adc_picks,
                COUNT(*) FILTER (WHERE action_type = 'pick' AND role = 'ADC' AND winner_team_id = action_team_id) as adc_wins,
                COUNT(*) FILTER (WHERE action_type = 'pick' AND role = 'Support') as support_picks,
                COUNT(*) FILTER (WHERE action_type = 'pick' AND role = 'Support' AND winner_team_id = action_team_id) as support_wins
            FROM picks_bans
            GROUP BY champion_id, tournament_id, patch
        )
        INSERT INTO pro_champion_daily_stats (
            champion_id, date, tournament_id, patch,
            picks, bans, fearless_bans, wins, total_games,
            blue_picks, blue_wins, red_picks, red_wins,
            top_picks, top_wins, jungle_picks, jungle_wins,
            mid_picks, mid_wins, adc_picks, adc_wins,
            support_picks, support_wins,
            created_at, updated_at
        )
        SELECT
            a.champion_id,
            $1 as date,
            a.tournament_id,
            a.patch,
            a.picks,
            a.bans,
            a.fearless_bans,
            a.wins,
            tg.total as total_games,
            a.blue_picks,
            a.blue_wins,
            a.red_picks,
            a.red_wins,
            a.top_picks,
            a.top_wins,
            a.jungle_picks,
            a.jungle_wins,
            a.mid_picks,
            a.mid_wins,
            a.adc_picks,
            a.adc_wins,
            a.support_picks,
            a.support_wins,
            NOW(),
            NOW()
        FROM aggregated a
        JOIN total_games tg ON tg.tournament_id = a.tournament_id AND tg.patch = a.patch
        ON CONFLICT (champion_id, date, tournament_id, patch) DO UPDATE SET
            picks = EXCLUDED.picks,
            bans = EXCLUDED.bans,
            fearless_bans = EXCLUDED.fearless_bans,
            wins = EXCLUDED.wins,
            total_games = EXCLUDED.total_games,
            blue_picks = EXCLUDED.blue_picks,
            blue_wins = EXCLUDED.blue_wins,
            red_picks = EXCLUDED.red_picks,
            red_wins = EXCLUDED.red_wins,
            top_picks = EXCLUDED.top_picks,
            top_wins = EXCLUDED.top_wins,
            jungle_picks = EXCLUDED.jungle_picks,
            jungle_wins = EXCLUDED.jungle_wins,
            mid_picks = EXCLUDED.mid_picks,
            mid_wins = EXCLUDED.mid_wins,
            adc_picks = EXCLUDED.adc_picks,
            adc_wins = EXCLUDED.adc_wins,
            support_picks = EXCLUDED.support_picks,
            support_wins = EXCLUDED.support_wins,
            updated_at = NOW()
        """

        result = await self.db.execute(query, target_date)

        # Extract row count from result (format: "INSERT 0 N" or similar)
        if result and isinstance(result, str):
            parts = result.split()
            if len(parts) >= 3:
                try:
                    return int(parts[-1])
                except ValueError:
                    pass

        return 0

    async def backfill(self, start_date: date, end_date: date) -> dict[str, int]:
        """
        Backfill aggregation for a date range.

        Args:
            start_date: Start date (inclusive)
            end_date: End date (inclusive)

        Returns:
            Stats dictionary with counts
        """
        total_rows = 0
        total_dates = 0
        current = start_date

        while current <= end_date:
            rows = await self._aggregate_date(current)
            if rows > 0:
                total_rows += rows
                total_dates += 1
            current += timedelta(days=1)

        logger.info(
            "Backfill complete",
            start_date=str(start_date),
            end_date=str(end_date),
            dates_processed=total_dates,
            total_rows=total_rows,
        )

        return {
            "dates_processed": total_dates,
            "rows_upserted": total_rows,
        }
