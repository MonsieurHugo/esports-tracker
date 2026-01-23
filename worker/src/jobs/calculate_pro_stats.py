"""
Calculate Pro Stats Job
Recalculates aggregated statistics for pro matches
"""

import asyncio
from datetime import datetime, timezone

import structlog

from src.services.database import DatabaseService

logger = structlog.get_logger(__name__)


class CalculateProStatsJob:
    """Job to calculate aggregated pro statistics.

    This job handles:
    - Team aggregated stats per tournament
    - Player aggregated stats per tournament
    - Champion presence and win rates per tournament

    Triggered after matches complete or on a schedule (e.g., hourly).
    """

    def __init__(
        self,
        db: DatabaseService,
        interval: int = 3600,  # 1 hour default
    ):
        self.db = db
        self._interval = interval
        self._running = False

        # Metrics
        self._calculation_count = 0
        self._tournaments_calculated = 0

    async def run(self) -> None:
        """Execute the job continuously."""
        self._running = True
        logger.info("Starting pro stats calculation job")

        try:
            while self._running:
                await self._run_calculation()

                logger.info(
                    "Pro stats calculation complete",
                    next_calculation_in=self._interval,
                )

                await asyncio.sleep(self._interval)

        except asyncio.CancelledError:
            logger.info("Pro stats calculation job cancelled")
        except Exception as e:
            logger.exception("Pro stats calculation job failed", error=str(e))

    async def stop(self) -> None:
        """Stop the job gracefully."""
        self._running = False

    async def run_once(self) -> None:
        """Run a single calculation cycle."""
        await self._run_calculation()

    async def run_for_tournament(self, tournament_id: int) -> None:
        """Run calculations for a specific tournament."""
        await self._calculate_tournament_stats(tournament_id)
        await self._calculate_player_stats(tournament_id)
        await self._calculate_champion_stats(tournament_id)

    async def _run_calculation(self) -> None:
        """Run one calculation cycle."""
        self._calculation_count += 1

        try:
            # Get active tournaments
            tournaments = await self.db.get_active_pro_tournaments()

            for tournament in tournaments:
                tournament_id = tournament["tournament_id"]

                await self._calculate_tournament_stats(tournament_id)
                await self._calculate_player_stats(tournament_id)
                await self._calculate_champion_stats(tournament_id)

                self._tournaments_calculated += 1

            logger.info(
                "Pro stats calculation completed",
                calculation_count=self._calculation_count,
                tournaments=len(tournaments),
            )

        except Exception as e:
            logger.exception("Error during pro stats calculation", error=str(e))

    async def _calculate_tournament_stats(self, tournament_id: int) -> None:
        """Calculate team aggregated stats for a tournament."""
        try:
            # This query aggregates team stats from completed games
            await self.db.execute(
                """
                INSERT INTO pro_team_stats (
                    team_id, tournament_id,
                    matches_played, matches_won, games_played, games_won,
                    match_win_rate, game_win_rate,
                    avg_game_duration, avg_kills, avg_deaths,
                    avg_towers, avg_dragons, avg_barons,
                    avg_gold_at_15, avg_gold_diff_at_15,
                    first_blood_rate, first_tower_rate, first_dragon_rate,
                    first_herald_rate, first_baron_rate,
                    blue_side_games, blue_side_wins,
                    red_side_games, red_side_wins
                )
                SELECT
                    t.team_id,
                    $1 as tournament_id,
                    COUNT(DISTINCT m.match_id) as matches_played,
                    COUNT(DISTINCT CASE WHEN m.winner_team_id = t.team_id THEN m.match_id END) as matches_won,
                    COUNT(g.game_id) as games_played,
                    COUNT(CASE WHEN g.winner_team_id = t.team_id THEN 1 END) as games_won,
                    CASE WHEN COUNT(DISTINCT m.match_id) > 0
                        THEN ROUND(COUNT(DISTINCT CASE WHEN m.winner_team_id = t.team_id THEN m.match_id END)::numeric
                             / COUNT(DISTINCT m.match_id) * 100, 2)
                        ELSE 0 END as match_win_rate,
                    CASE WHEN COUNT(g.game_id) > 0
                        THEN ROUND(COUNT(CASE WHEN g.winner_team_id = t.team_id THEN 1 END)::numeric
                             / COUNT(g.game_id) * 100, 2)
                        ELSE 0 END as game_win_rate,
                    COALESCE(AVG(g.duration), 0) as avg_game_duration,
                    COALESCE(AVG(
                        CASE WHEN g.blue_team_id = t.team_id THEN
                            (SELECT SUM(kills) FROM pro_player_stats WHERE game_id = g.game_id AND team_side = 'blue')
                        ELSE
                            (SELECT SUM(kills) FROM pro_player_stats WHERE game_id = g.game_id AND team_side = 'red')
                        END
                    ), 0) as avg_kills,
                    COALESCE(AVG(
                        CASE WHEN g.blue_team_id = t.team_id THEN
                            (SELECT SUM(deaths) FROM pro_player_stats WHERE game_id = g.game_id AND team_side = 'blue')
                        ELSE
                            (SELECT SUM(deaths) FROM pro_player_stats WHERE game_id = g.game_id AND team_side = 'red')
                        END
                    ), 0) as avg_deaths,
                    COALESCE(AVG(CASE WHEN g.blue_team_id = t.team_id THEN g.blue_towers ELSE g.red_towers END), 0) as avg_towers,
                    COALESCE(AVG(CASE WHEN g.blue_team_id = t.team_id THEN g.blue_dragons ELSE g.red_dragons END), 0) as avg_dragons,
                    COALESCE(AVG(CASE WHEN g.blue_team_id = t.team_id THEN g.blue_barons ELSE g.red_barons END), 0) as avg_barons,
                    COALESCE(AVG(CASE WHEN g.blue_team_id = t.team_id THEN g.blue_gold_at_15 ELSE g.red_gold_at_15 END), 0) as avg_gold_at_15,
                    COALESCE(AVG(
                        CASE WHEN g.blue_team_id = t.team_id
                            THEN COALESCE(g.blue_gold_at_15, 0) - COALESCE(g.red_gold_at_15, 0)
                            ELSE COALESCE(g.red_gold_at_15, 0) - COALESCE(g.blue_gold_at_15, 0)
                        END
                    ), 0) as avg_gold_diff_at_15,
                    CASE WHEN COUNT(g.game_id) > 0
                        THEN ROUND(COUNT(CASE WHEN
                            (g.blue_team_id = t.team_id AND g.first_blood_team = 'blue') OR
                            (g.red_team_id = t.team_id AND g.first_blood_team = 'red')
                            THEN 1 END)::numeric / COUNT(g.game_id) * 100)
                        ELSE 0 END as first_blood_rate,
                    CASE WHEN COUNT(g.game_id) > 0
                        THEN ROUND(COUNT(CASE WHEN
                            (g.blue_team_id = t.team_id AND g.first_tower_team = 'blue') OR
                            (g.red_team_id = t.team_id AND g.first_tower_team = 'red')
                            THEN 1 END)::numeric / COUNT(g.game_id) * 100)
                        ELSE 0 END as first_tower_rate,
                    CASE WHEN COUNT(g.game_id) > 0
                        THEN ROUND(COUNT(CASE WHEN
                            (g.blue_team_id = t.team_id AND g.first_dragon_team = 'blue') OR
                            (g.red_team_id = t.team_id AND g.first_dragon_team = 'red')
                            THEN 1 END)::numeric / COUNT(g.game_id) * 100)
                        ELSE 0 END as first_dragon_rate,
                    CASE WHEN COUNT(g.game_id) > 0
                        THEN ROUND(COUNT(CASE WHEN
                            (g.blue_team_id = t.team_id AND g.first_herald_team = 'blue') OR
                            (g.red_team_id = t.team_id AND g.first_herald_team = 'red')
                            THEN 1 END)::numeric / COUNT(g.game_id) * 100)
                        ELSE 0 END as first_herald_rate,
                    CASE WHEN COUNT(g.game_id) > 0
                        THEN ROUND(COUNT(CASE WHEN
                            (g.blue_team_id = t.team_id AND g.first_baron_team = 'blue') OR
                            (g.red_team_id = t.team_id AND g.first_baron_team = 'red')
                            THEN 1 END)::numeric / COUNT(g.game_id) * 100)
                        ELSE 0 END as first_baron_rate,
                    COUNT(CASE WHEN g.blue_team_id = t.team_id THEN 1 END) as blue_side_games,
                    COUNT(CASE WHEN g.blue_team_id = t.team_id AND g.winner_team_id = t.team_id THEN 1 END) as blue_side_wins,
                    COUNT(CASE WHEN g.red_team_id = t.team_id THEN 1 END) as red_side_games,
                    COUNT(CASE WHEN g.red_team_id = t.team_id AND g.winner_team_id = t.team_id THEN 1 END) as red_side_wins
                FROM teams t
                JOIN pro_matches m ON (m.team1_id = t.team_id OR m.team2_id = t.team_id)
                    AND m.tournament_id = $1
                    AND m.status = 'completed'
                LEFT JOIN pro_games g ON g.match_id = m.match_id
                    AND g.status = 'completed'
                    AND (g.blue_team_id = t.team_id OR g.red_team_id = t.team_id)
                GROUP BY t.team_id
                ON CONFLICT (team_id, tournament_id)
                DO UPDATE SET
                    matches_played = EXCLUDED.matches_played,
                    matches_won = EXCLUDED.matches_won,
                    games_played = EXCLUDED.games_played,
                    games_won = EXCLUDED.games_won,
                    match_win_rate = EXCLUDED.match_win_rate,
                    game_win_rate = EXCLUDED.game_win_rate,
                    avg_game_duration = EXCLUDED.avg_game_duration,
                    avg_kills = EXCLUDED.avg_kills,
                    avg_deaths = EXCLUDED.avg_deaths,
                    avg_towers = EXCLUDED.avg_towers,
                    avg_dragons = EXCLUDED.avg_dragons,
                    avg_barons = EXCLUDED.avg_barons,
                    avg_gold_at_15 = EXCLUDED.avg_gold_at_15,
                    avg_gold_diff_at_15 = EXCLUDED.avg_gold_diff_at_15,
                    first_blood_rate = EXCLUDED.first_blood_rate,
                    first_tower_rate = EXCLUDED.first_tower_rate,
                    first_dragon_rate = EXCLUDED.first_dragon_rate,
                    first_herald_rate = EXCLUDED.first_herald_rate,
                    first_baron_rate = EXCLUDED.first_baron_rate,
                    blue_side_games = EXCLUDED.blue_side_games,
                    blue_side_wins = EXCLUDED.blue_side_wins,
                    red_side_games = EXCLUDED.red_side_games,
                    red_side_wins = EXCLUDED.red_side_wins,
                    updated_at = NOW()
                """,
                tournament_id,
            )

        except Exception as e:
            logger.warning(
                "Failed to calculate team stats",
                tournament_id=tournament_id,
                error=str(e),
            )

    async def _calculate_player_stats(self, tournament_id: int) -> None:
        """Calculate player aggregated stats for a tournament."""
        try:
            await self.db.execute(
                """
                INSERT INTO pro_player_aggregated_stats (
                    player_id, tournament_id, team_id, role,
                    games_played, games_won, win_rate,
                    total_kills, total_deaths, total_assists,
                    total_cs, total_gold, total_damage, total_vision_score,
                    avg_kills, avg_deaths, avg_assists,
                    avg_cs_per_min, avg_gold_per_min, avg_damage_per_min,
                    avg_vision_score, avg_kda, avg_kill_participation,
                    avg_gold_share, avg_damage_share,
                    avg_cs_diff_at_15, avg_gold_diff_at_15, avg_xp_diff_at_15,
                    first_blood_participations, first_blood_victims,
                    double_kills, triple_kills, quadra_kills, penta_kills,
                    unique_champions_played
                )
                SELECT
                    ps.player_id,
                    $1 as tournament_id,
                    ps.team_id,
                    ps.role,
                    COUNT(*) as games_played,
                    COUNT(CASE WHEN g.winner_team_id = ps.team_id THEN 1 END) as games_won,
                    ROUND(COUNT(CASE WHEN g.winner_team_id = ps.team_id THEN 1 END)::numeric / COUNT(*) * 100, 2) as win_rate,
                    SUM(ps.kills) as total_kills,
                    SUM(ps.deaths) as total_deaths,
                    SUM(ps.assists) as total_assists,
                    SUM(ps.cs) as total_cs,
                    SUM(ps.gold_earned) as total_gold,
                    SUM(ps.damage_dealt) as total_damage,
                    SUM(ps.vision_score) as total_vision_score,
                    ROUND(AVG(ps.kills), 2) as avg_kills,
                    ROUND(AVG(ps.deaths), 2) as avg_deaths,
                    ROUND(AVG(ps.assists), 2) as avg_assists,
                    ROUND(AVG(ps.cs_per_min), 2) as avg_cs_per_min,
                    ROUND(AVG(ps.gold_earned::numeric / NULLIF(g.duration, 0) * 60), 2) as avg_gold_per_min,
                    ROUND(AVG(ps.damage_dealt::numeric / NULLIF(g.duration, 0) * 60), 2) as avg_damage_per_min,
                    ROUND(AVG(ps.vision_score), 2) as avg_vision_score,
                    ROUND(AVG(
                        CASE WHEN ps.deaths = 0 THEN (ps.kills + ps.assists)
                        ELSE (ps.kills + ps.assists)::numeric / ps.deaths END
                    ), 2) as avg_kda,
                    ROUND(AVG(ps.kill_participation::numeric / 100), 2) as avg_kill_participation,
                    ROUND(AVG(ps.gold_share::numeric / 100), 2) as avg_gold_share,
                    ROUND(AVG(ps.damage_share::numeric / 100), 2) as avg_damage_share,
                    ROUND(AVG(ps.cs_diff_at_15), 2) as avg_cs_diff_at_15,
                    ROUND(AVG(ps.gold_diff_at_15), 2) as avg_gold_diff_at_15,
                    ROUND(AVG(ps.xp_diff_at_15), 2) as avg_xp_diff_at_15,
                    COUNT(CASE WHEN ps.first_blood_participant THEN 1 END) as first_blood_participations,
                    COUNT(CASE WHEN ps.first_blood_victim THEN 1 END) as first_blood_victims,
                    SUM(ps.double_kills) as double_kills,
                    SUM(ps.triple_kills) as triple_kills,
                    SUM(ps.quadra_kills) as quadra_kills,
                    SUM(ps.penta_kills) as penta_kills,
                    COUNT(DISTINCT ps.champion_id) as unique_champions_played
                FROM pro_player_stats ps
                JOIN pro_games g ON ps.game_id = g.game_id AND g.status = 'completed'
                JOIN pro_matches m ON g.match_id = m.match_id AND m.tournament_id = $1
                GROUP BY ps.player_id, ps.team_id, ps.role
                ON CONFLICT (player_id, tournament_id)
                DO UPDATE SET
                    team_id = EXCLUDED.team_id,
                    role = EXCLUDED.role,
                    games_played = EXCLUDED.games_played,
                    games_won = EXCLUDED.games_won,
                    win_rate = EXCLUDED.win_rate,
                    total_kills = EXCLUDED.total_kills,
                    total_deaths = EXCLUDED.total_deaths,
                    total_assists = EXCLUDED.total_assists,
                    total_cs = EXCLUDED.total_cs,
                    total_gold = EXCLUDED.total_gold,
                    total_damage = EXCLUDED.total_damage,
                    total_vision_score = EXCLUDED.total_vision_score,
                    avg_kills = EXCLUDED.avg_kills,
                    avg_deaths = EXCLUDED.avg_deaths,
                    avg_assists = EXCLUDED.avg_assists,
                    avg_cs_per_min = EXCLUDED.avg_cs_per_min,
                    avg_gold_per_min = EXCLUDED.avg_gold_per_min,
                    avg_damage_per_min = EXCLUDED.avg_damage_per_min,
                    avg_vision_score = EXCLUDED.avg_vision_score,
                    avg_kda = EXCLUDED.avg_kda,
                    avg_kill_participation = EXCLUDED.avg_kill_participation,
                    avg_gold_share = EXCLUDED.avg_gold_share,
                    avg_damage_share = EXCLUDED.avg_damage_share,
                    avg_cs_diff_at_15 = EXCLUDED.avg_cs_diff_at_15,
                    avg_gold_diff_at_15 = EXCLUDED.avg_gold_diff_at_15,
                    avg_xp_diff_at_15 = EXCLUDED.avg_xp_diff_at_15,
                    first_blood_participations = EXCLUDED.first_blood_participations,
                    first_blood_victims = EXCLUDED.first_blood_victims,
                    double_kills = EXCLUDED.double_kills,
                    triple_kills = EXCLUDED.triple_kills,
                    quadra_kills = EXCLUDED.quadra_kills,
                    penta_kills = EXCLUDED.penta_kills,
                    unique_champions_played = EXCLUDED.unique_champions_played,
                    updated_at = NOW()
                """,
                tournament_id,
            )

        except Exception as e:
            logger.warning(
                "Failed to calculate player stats",
                tournament_id=tournament_id,
                error=str(e),
            )

    async def _calculate_champion_stats(self, tournament_id: int) -> None:
        """Calculate champion presence and win rates for a tournament."""
        try:
            # First, get total games count for presence calculation
            total_games = await self.db.fetchval(
                """
                SELECT COUNT(*)
                FROM pro_games g
                JOIN pro_matches m ON g.match_id = m.match_id
                WHERE m.tournament_id = $1 AND g.status = 'completed'
                """,
                tournament_id,
            )

            if not total_games:
                return

            # Calculate champion stats from picks
            await self.db.execute(
                """
                INSERT INTO pro_champion_stats (
                    champion_id, tournament_id,
                    picks, bans, wins, losses,
                    presence_rate, pick_rate, ban_rate, win_rate,
                    avg_kills, avg_deaths, avg_assists, avg_kda, avg_cs_per_min,
                    blue_side_picks, blue_side_wins,
                    red_side_picks, red_side_wins,
                    top_picks, jungle_picks, mid_picks, adc_picks, support_picks
                )
                SELECT
                    champion_id,
                    $1 as tournament_id,
                    COUNT(*) as picks,
                    COALESCE(ban_stats.bans, 0) as bans,
                    COUNT(CASE WHEN won THEN 1 END) as wins,
                    COUNT(CASE WHEN NOT won THEN 1 END) as losses,
                    ROUND((COUNT(*) + COALESCE(ban_stats.bans, 0))::numeric / $2 * 100, 2) as presence_rate,
                    ROUND(COUNT(*)::numeric / $2 * 100, 2) as pick_rate,
                    ROUND(COALESCE(ban_stats.bans, 0)::numeric / $2 * 100, 2) as ban_rate,
                    CASE WHEN COUNT(*) > 0
                        THEN ROUND(COUNT(CASE WHEN won THEN 1 END)::numeric / COUNT(*) * 100, 2)
                        ELSE 0 END as win_rate,
                    ROUND(AVG(kills), 2) as avg_kills,
                    ROUND(AVG(deaths), 2) as avg_deaths,
                    ROUND(AVG(assists), 2) as avg_assists,
                    ROUND(AVG(kda), 2) as avg_kda,
                    ROUND(AVG(cs_per_min), 2) as avg_cs_per_min,
                    COUNT(CASE WHEN side = 'blue' THEN 1 END) as blue_side_picks,
                    COUNT(CASE WHEN side = 'blue' AND won THEN 1 END) as blue_side_wins,
                    COUNT(CASE WHEN side = 'red' THEN 1 END) as red_side_picks,
                    COUNT(CASE WHEN side = 'red' AND won THEN 1 END) as red_side_wins,
                    COUNT(CASE WHEN role = 'Top' THEN 1 END) as top_picks,
                    COUNT(CASE WHEN role IN ('Jungle', 'JGL') THEN 1 END) as jungle_picks,
                    COUNT(CASE WHEN role IN ('Mid', 'Middle') THEN 1 END) as mid_picks,
                    COUNT(CASE WHEN role IN ('ADC', 'Bot', 'Bottom') THEN 1 END) as adc_picks,
                    COUNT(CASE WHEN role IN ('Support', 'SUP') THEN 1 END) as support_picks
                FROM (
                    SELECT
                        ps.champion_id,
                        ps.role,
                        ps.team_side as side,
                        g.winner_team_id = ps.team_id as won,
                        ps.kills,
                        ps.deaths,
                        ps.assists,
                        ps.cs_per_min,
                        CASE WHEN ps.deaths = 0 THEN (ps.kills + ps.assists)
                             ELSE (ps.kills + ps.assists)::numeric / ps.deaths END as kda
                    FROM pro_player_stats ps
                    JOIN pro_games g ON ps.game_id = g.game_id AND g.status = 'completed'
                    JOIN pro_matches m ON g.match_id = m.match_id AND m.tournament_id = $1
                ) picks
                LEFT JOIN (
                    SELECT champion_id, COUNT(*) as bans
                    FROM (
                        SELECT blue_ban_1 as champion_id FROM pro_drafts d
                        JOIN pro_games g ON d.game_id = g.game_id
                        JOIN pro_matches m ON g.match_id = m.match_id WHERE m.tournament_id = $1
                        UNION ALL
                        SELECT blue_ban_2 FROM pro_drafts d
                        JOIN pro_games g ON d.game_id = g.game_id
                        JOIN pro_matches m ON g.match_id = m.match_id WHERE m.tournament_id = $1
                        UNION ALL
                        SELECT blue_ban_3 FROM pro_drafts d
                        JOIN pro_games g ON d.game_id = g.game_id
                        JOIN pro_matches m ON g.match_id = m.match_id WHERE m.tournament_id = $1
                        UNION ALL
                        SELECT blue_ban_4 FROM pro_drafts d
                        JOIN pro_games g ON d.game_id = g.game_id
                        JOIN pro_matches m ON g.match_id = m.match_id WHERE m.tournament_id = $1
                        UNION ALL
                        SELECT blue_ban_5 FROM pro_drafts d
                        JOIN pro_games g ON d.game_id = g.game_id
                        JOIN pro_matches m ON g.match_id = m.match_id WHERE m.tournament_id = $1
                        UNION ALL
                        SELECT red_ban_1 FROM pro_drafts d
                        JOIN pro_games g ON d.game_id = g.game_id
                        JOIN pro_matches m ON g.match_id = m.match_id WHERE m.tournament_id = $1
                        UNION ALL
                        SELECT red_ban_2 FROM pro_drafts d
                        JOIN pro_games g ON d.game_id = g.game_id
                        JOIN pro_matches m ON g.match_id = m.match_id WHERE m.tournament_id = $1
                        UNION ALL
                        SELECT red_ban_3 FROM pro_drafts d
                        JOIN pro_games g ON d.game_id = g.game_id
                        JOIN pro_matches m ON g.match_id = m.match_id WHERE m.tournament_id = $1
                        UNION ALL
                        SELECT red_ban_4 FROM pro_drafts d
                        JOIN pro_games g ON d.game_id = g.game_id
                        JOIN pro_matches m ON g.match_id = m.match_id WHERE m.tournament_id = $1
                        UNION ALL
                        SELECT red_ban_5 FROM pro_drafts d
                        JOIN pro_games g ON d.game_id = g.game_id
                        JOIN pro_matches m ON g.match_id = m.match_id WHERE m.tournament_id = $1
                    ) all_bans
                    WHERE champion_id IS NOT NULL
                    GROUP BY champion_id
                ) ban_stats ON picks.champion_id = ban_stats.champion_id
                GROUP BY picks.champion_id, ban_stats.bans
                ON CONFLICT (champion_id, tournament_id)
                DO UPDATE SET
                    picks = EXCLUDED.picks,
                    bans = EXCLUDED.bans,
                    wins = EXCLUDED.wins,
                    losses = EXCLUDED.losses,
                    presence_rate = EXCLUDED.presence_rate,
                    pick_rate = EXCLUDED.pick_rate,
                    ban_rate = EXCLUDED.ban_rate,
                    win_rate = EXCLUDED.win_rate,
                    avg_kills = EXCLUDED.avg_kills,
                    avg_deaths = EXCLUDED.avg_deaths,
                    avg_assists = EXCLUDED.avg_assists,
                    avg_kda = EXCLUDED.avg_kda,
                    avg_cs_per_min = EXCLUDED.avg_cs_per_min,
                    blue_side_picks = EXCLUDED.blue_side_picks,
                    blue_side_wins = EXCLUDED.blue_side_wins,
                    red_side_picks = EXCLUDED.red_side_picks,
                    red_side_wins = EXCLUDED.red_side_wins,
                    top_picks = EXCLUDED.top_picks,
                    jungle_picks = EXCLUDED.jungle_picks,
                    mid_picks = EXCLUDED.mid_picks,
                    adc_picks = EXCLUDED.adc_picks,
                    support_picks = EXCLUDED.support_picks,
                    updated_at = NOW()
                """,
                tournament_id,
                total_games,
            )

        except Exception as e:
            logger.warning(
                "Failed to calculate champion stats",
                tournament_id=tournament_id,
                error=str(e),
            )

    def get_metrics(self) -> dict:
        """Get job metrics for monitoring."""
        return {
            "calculation_count": self._calculation_count,
            "tournaments_calculated": self._tournaments_calculated,
        }
