"""
Fetch Pro Matches Job
Fetches professional League of Legends match data from GRID API
"""

import asyncio
from datetime import datetime, timezone

import structlog

from src.services.database import DatabaseService
from src.services.grid_api import GridAPIError, GridAPIService, GridRateLimiter

logger = structlog.get_logger(__name__)


class FetchProMatchesJob:
    """Job to fetch and store professional match data from GRID API.

    Polling behavior:
    - During live matches: 30 second intervals
    - When no live matches: 15 minute intervals (idle mode)

    Fetches:
    - Tournaments and stages
    - Match schedules and results
    - Game details (drafts, objectives)
    - Player performance stats
    """

    def __init__(
        self,
        db: DatabaseService,
        grid_api_key: str,
        live_interval: int = 30,
        idle_interval: int = 900,
    ):
        self.db = db
        self._grid: GridAPIService | None = None
        self._grid_api_key = grid_api_key
        self._live_interval = live_interval
        self._idle_interval = idle_interval
        self._running = False

        # Metrics
        self._cycle_count = 0
        self._matches_processed = 0
        self._games_processed = 0
        self._errors = 0

    def _get_grid_client(self) -> GridAPIService:
        """Get or create GRID API client."""
        if self._grid is None:
            self._grid = GridAPIService(
                api_key=self._grid_api_key,
                rate_limiter=GridRateLimiter(requests_per_second=10),
            )
        return self._grid

    async def run(self) -> None:
        """Execute the job continuously."""
        self._running = True
        logger.info("Starting pro matches fetch job")

        try:
            while self._running:
                has_live = await self._run_cycle()

                # Use shorter interval when there are live matches
                sleep_time = self._live_interval if has_live else self._idle_interval

                logger.debug(
                    "Pro fetch cycle complete",
                    next_check_in=sleep_time,
                    has_live_matches=has_live,
                )

                await asyncio.sleep(sleep_time)

        except asyncio.CancelledError:
            logger.info("Pro matches fetch job cancelled")
        except Exception as e:
            logger.exception("Pro matches fetch job failed", error=str(e))
        finally:
            await self._cleanup()

    async def stop(self) -> None:
        """Stop the job gracefully."""
        self._running = False

    async def _cleanup(self) -> None:
        """Clean up resources."""
        if self._grid:
            await self._grid.close()
            self._grid = None

    async def _run_cycle(self) -> bool:
        """Run one fetch cycle.

        Returns:
            True if there are live matches, False otherwise
        """
        self._cycle_count += 1
        has_live_matches = False

        try:
            grid = self._get_grid_client()

            # 1. Sync active tournaments
            await self._sync_tournaments(grid)

            # 2. Check for live matches
            live_data = await grid.get_live_matches()
            live_matches = live_data.get("data", [])

            if live_matches:
                has_live_matches = True
                logger.info(
                    "Processing live matches",
                    count=len(live_matches),
                )

                for match in live_matches:
                    await self._process_match(grid, match)

            # 3. Sync upcoming matches (next 24h)
            upcoming_data = await grid.get_upcoming_matches(hours_ahead=24, limit=50)
            upcoming_matches = upcoming_data.get("data", [])

            for match in upcoming_matches:
                await self._sync_match_basic(match)

            # 4. Check recently completed matches for final stats
            await self._sync_recent_completed(grid)

            logger.info(
                "Pro fetch cycle completed",
                cycle=self._cycle_count,
                live_matches=len(live_matches),
                upcoming_matches=len(upcoming_matches),
                total_matches_processed=self._matches_processed,
            )

        except GridAPIError as e:
            self._errors += 1
            logger.error(
                "GRID API error during cycle",
                error=str(e),
                status_code=e.status_code,
            )
        except Exception as e:
            self._errors += 1
            logger.exception("Error during pro fetch cycle", error=str(e))

        return has_live_matches

    async def _sync_tournaments(self, grid: GridAPIService) -> None:
        """Sync active and upcoming tournaments."""
        try:
            # Get ongoing tournaments
            ongoing = await grid.get_tournaments(status="ongoing", limit=50)
            for tournament in ongoing.get("data", []):
                await self._upsert_tournament(tournament)

            # Get upcoming tournaments (for schedule)
            upcoming = await grid.get_tournaments(status="upcoming", limit=20)
            for tournament in upcoming.get("data", []):
                await self._upsert_tournament(tournament)

        except GridAPIError as e:
            logger.warning("Failed to sync tournaments", error=str(e))

    async def _upsert_tournament(self, data: dict) -> int | None:
        """Insert or update a tournament from GRID data."""
        try:
            external_id = data.get("id")
            if not external_id:
                return None

            # Parse dates
            start_date = None
            end_date = None
            if data.get("startDate"):
                start_date = datetime.fromisoformat(
                    data["startDate"].replace("Z", "+00:00")
                )
            if data.get("endDate"):
                end_date = datetime.fromisoformat(
                    data["endDate"].replace("Z", "+00:00")
                )

            tournament_id = await self.db.upsert_pro_tournament(
                external_id=external_id,
                name=data.get("name", "Unknown"),
                slug=data.get("slug", external_id),
                region=data.get("region"),
                season=data.get("season"),
                split=data.get("split"),
                tier=data.get("tier", 1),
                status=data.get("status", "upcoming"),
                start_date=start_date,
                end_date=end_date,
                logo_url=data.get("logoUrl"),
                metadata=data,
            )

            return tournament_id

        except Exception as e:
            logger.warning(
                "Failed to upsert tournament",
                external_id=data.get("id"),
                error=str(e),
            )
            return None

    async def _sync_match_basic(self, data: dict) -> int | None:
        """Sync basic match info (for upcoming matches)."""
        try:
            external_id = data.get("id")
            if not external_id:
                return None

            # Get tournament
            tournament_ext_id = data.get("tournamentId")
            tournament = await self.db.get_pro_tournament_by_external_id(
                tournament_ext_id
            ) if tournament_ext_id else None
            tournament_id = tournament["tournament_id"] if tournament else None

            if not tournament_id:
                logger.debug(
                    "Skipping match without known tournament",
                    match_id=external_id,
                )
                return None

            # Find teams
            team1 = await self._find_or_skip_team(data.get("team1", {}))
            team2 = await self._find_or_skip_team(data.get("team2", {}))

            # Parse scheduled time
            scheduled_at = None
            if data.get("scheduledAt"):
                scheduled_at = datetime.fromisoformat(
                    data["scheduledAt"].replace("Z", "+00:00")
                )

            match_id = await self.db.upsert_pro_match(
                external_id=external_id,
                tournament_id=tournament_id,
                team1_id=team1,
                team2_id=team2,
                format=data.get("format", "bo3"),
                status=data.get("status", "upcoming"),
                scheduled_at=scheduled_at,
                metadata=data,
            )

            return match_id

        except Exception as e:
            logger.warning(
                "Failed to sync match",
                external_id=data.get("id"),
                error=str(e),
            )
            return None

    async def _process_match(self, grid: GridAPIService, data: dict) -> None:
        """Process a live or recently completed match with full details."""
        try:
            external_id = data.get("id")
            if not external_id:
                return

            # First sync basic info
            match_id = await self._sync_match_basic(data)
            if not match_id:
                return

            self._matches_processed += 1

            # Get detailed match data
            match_detail = await grid.get_match(external_id)

            # Update scores
            await self.db.upsert_pro_match(
                external_id=external_id,
                tournament_id=match_detail.get("tournamentId", 0),
                team1_score=match_detail.get("team1Score", 0),
                team2_score=match_detail.get("team2Score", 0),
                status=match_detail.get("status", "live"),
                started_at=self._parse_datetime(match_detail.get("startedAt")),
                ended_at=self._parse_datetime(match_detail.get("endedAt")),
            )

            # Process games
            games_data = await grid.get_match_games(external_id)
            for game in games_data.get("data", []):
                await self._process_game(grid, match_id, game)

        except GridAPIError as e:
            logger.warning(
                "Failed to process match",
                match_id=data.get("id"),
                error=str(e),
            )
        except Exception as e:
            logger.warning(
                "Error processing match",
                match_id=data.get("id"),
                error=str(e),
            )

    async def _process_game(
        self, grid: GridAPIService, match_id: int, game_data: dict
    ) -> None:
        """Process a single game with draft and stats."""
        try:
            external_id = game_data.get("id")
            if not external_id:
                return

            # Find teams
            blue_team = await self._find_or_skip_team(game_data.get("blueTeam", {}))
            red_team = await self._find_or_skip_team(game_data.get("redTeam", {}))
            winner = None
            if game_data.get("winner") == "blue":
                winner = blue_team
            elif game_data.get("winner") == "red":
                winner = red_team

            # Insert game
            game_id = await self.db.upsert_pro_game(
                external_id=external_id,
                match_id=match_id,
                game_number=game_data.get("gameNumber", 1),
                blue_team_id=blue_team,
                red_team_id=red_team,
                winner_team_id=winner,
                duration=game_data.get("duration"),
                status=game_data.get("status", "upcoming"),
                patch=game_data.get("patch"),
                started_at=self._parse_datetime(game_data.get("startedAt")),
                ended_at=self._parse_datetime(game_data.get("endedAt")),
            )

            self._games_processed += 1

            # Get and process draft if game is live/completed
            if game_data.get("status") in ("live", "completed"):
                try:
                    draft_data = await grid.get_game_draft(external_id)
                    await self._process_draft(game_id, draft_data)
                except GridAPIError:
                    pass  # Draft may not be available yet

            # Get and process stats if game is completed
            if game_data.get("status") == "completed":
                try:
                    stats_data = await grid.get_game_stats(external_id)
                    await self._process_game_stats(game_id, stats_data)
                except GridAPIError:
                    pass  # Stats may not be available yet

        except Exception as e:
            logger.warning(
                "Failed to process game",
                game_id=game_data.get("id"),
                error=str(e),
            )

    async def _process_draft(self, game_id: int, draft_data: dict) -> None:
        """Process draft data for a game."""
        try:
            blue_picks = []
            red_picks = []
            blue_bans = []
            red_bans = []

            # Extract picks
            for pick in draft_data.get("picks", []):
                champion_id = pick.get("championId")
                if pick.get("team") == "blue":
                    blue_picks.append(champion_id)
                else:
                    red_picks.append(champion_id)

            # Extract bans
            for ban in draft_data.get("bans", []):
                champion_id = ban.get("championId")
                if ban.get("team") == "blue":
                    blue_bans.append(champion_id)
                else:
                    red_bans.append(champion_id)

            await self.db.upsert_pro_draft(
                game_id=game_id,
                blue_picks=blue_picks,
                red_picks=red_picks,
                blue_bans=blue_bans,
                red_bans=red_bans,
            )

            # Insert individual draft actions
            action_order = 0
            for action in draft_data.get("actions", []):
                action_order += 1
                await self.db.insert_pro_draft_action(
                    game_id=game_id,
                    action_order=action_order,
                    action_type=action.get("type", "pick"),
                    team_side=action.get("team", "blue"),
                    champion_id=action.get("championId", 0),
                    player_id=await self._find_or_skip_player(action.get("player", {})),
                )

        except Exception as e:
            logger.warning("Failed to process draft", game_id=game_id, error=str(e))

    async def _process_game_stats(self, game_id: int, stats_data: dict) -> None:
        """Process player stats for a game."""
        try:
            players = stats_data.get("players", [])

            for player_stats in players:
                player_id = await self._find_or_skip_player(
                    player_stats.get("player", {})
                )
                if not player_id:
                    continue

                team_id = await self._find_or_skip_team(player_stats.get("team", {}))

                stats = {
                    "kills": player_stats.get("kills", 0),
                    "deaths": player_stats.get("deaths", 0),
                    "assists": player_stats.get("assists", 0),
                    "cs": player_stats.get("cs", 0),
                    "cs_per_min": player_stats.get("csPerMin", 0),
                    "gold_earned": player_stats.get("goldEarned", 0),
                    "gold_share": player_stats.get("goldShare", 0),
                    "damage_dealt": player_stats.get("damageDealt", 0),
                    "damage_share": player_stats.get("damageShare", 0),
                    "damage_taken": player_stats.get("damageTaken", 0),
                    "vision_score": player_stats.get("visionScore", 0),
                    "wards_placed": player_stats.get("wardsPlaced", 0),
                    "wards_destroyed": player_stats.get("wardsDestroyed", 0),
                    "control_wards": player_stats.get("controlWardsPurchased", 0),
                    "cs_at_15": player_stats.get("csAt15", 0),
                    "gold_at_15": player_stats.get("goldAt15", 0),
                    "xp_at_15": player_stats.get("xpAt15", 0),
                    "cs_diff_at_15": player_stats.get("csDiffAt15", 0),
                    "gold_diff_at_15": player_stats.get("goldDiffAt15", 0),
                    "xp_diff_at_15": player_stats.get("xpDiffAt15", 0),
                    "kill_participation": player_stats.get("killParticipation", 0),
                    "first_blood_participant": player_stats.get(
                        "firstBloodParticipant", False
                    ),
                    "first_blood_victim": player_stats.get("firstBloodVictim", False),
                    "solo_kills": player_stats.get("soloKills", 0),
                    "double_kills": player_stats.get("doubleKills", 0),
                    "triple_kills": player_stats.get("tripleKills", 0),
                    "quadra_kills": player_stats.get("quadraKills", 0),
                    "penta_kills": player_stats.get("pentaKills", 0),
                    "items": player_stats.get("items"),
                    "runes": player_stats.get("runes"),
                }

                await self.db.upsert_pro_player_stats(
                    game_id=game_id,
                    player_id=player_id,
                    team_id=team_id,
                    team_side=player_stats.get("side", "blue"),
                    role=player_stats.get("role", ""),
                    champion_id=player_stats.get("championId", 0),
                    stats=stats,
                )

        except Exception as e:
            logger.warning(
                "Failed to process game stats", game_id=game_id, error=str(e)
            )

    async def _sync_recent_completed(self, grid: GridAPIService) -> None:
        """Sync recently completed matches to get final stats."""
        try:
            # Get completed matches from last 24 hours
            recent = await grid.get_matches(status="completed", limit=20)

            for match in recent.get("data", []):
                # Only process if we already have this match
                existing = await self.db.get_pro_match_by_external_id(match.get("id"))
                if existing and existing["status"] != "completed":
                    await self._process_match(grid, match)

        except GridAPIError as e:
            logger.warning("Failed to sync recent completed", error=str(e))

    async def _find_or_skip_team(self, team_data: dict) -> int | None:
        """Find team ID from GRID data, or return None."""
        if not team_data:
            return None

        name = team_data.get("name") or team_data.get("shortName")
        if not name:
            return None

        team = await self.db.find_team_by_name(name)
        return team["team_id"] if team else None

    async def _find_or_skip_player(self, player_data: dict) -> int | None:
        """Find player ID from GRID data, or return None."""
        if not player_data:
            return None

        name = player_data.get("name") or player_data.get("nickname")
        if not name:
            return None

        player = await self.db.find_player_by_name(name)
        return player["player_id"] if player else None

    def _parse_datetime(self, value: str | None) -> datetime | None:
        """Parse ISO datetime string."""
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return None

    def get_metrics(self) -> dict:
        """Get job metrics for monitoring."""
        return {
            "cycle_count": self._cycle_count,
            "matches_processed": self._matches_processed,
            "games_processed": self._games_processed,
            "errors": self._errors,
        }
