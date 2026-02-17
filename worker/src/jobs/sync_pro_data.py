"""
Pro Data Sync Job

Synchronizes esports data from GRID API to the database.
"""

import asyncio
from datetime import date, datetime
from typing import Any

import structlog

from src.config import settings
from src.parsers.events_parser import EventsParser, ParsedGameData
from src.services.database import DatabaseService
from src.services.grid_client import GridClient, GridClientError
from src.services.grid_files import GridFiles
from src.services.grid_graphql import GridGraphQL, Series, SeriesState, SeriesTeamState, Tournament

logger = structlog.get_logger(__name__)


class SyncProDataJob:
    """Job for synchronizing pro esports data from GRID."""

    def __init__(self, db: DatabaseService, grid_client: GridClient):
        self.db = db
        self.client = grid_client
        self.graphql = GridGraphQL(grid_client)
        self.files = GridFiles(grid_client)
        self.max_concurrent_games = settings.pro_max_concurrent_games

        # Stats tracking
        self._tournaments_processed = 0
        self._series_processed = 0
        self._series_skipped = 0
        self._games_processed = 0
        self._games_skipped = 0
        self._errors = 0

    @staticmethod
    def _sort_parents_first(tournaments: list[Tournament]) -> list[Tournament]:
        """Sort tournaments so parents come before children.

        Uses the parent_id field from GRID to build a dependency order.
        Tournaments without parent_id come first, then children after their parents.
        """
        by_id = {t.id: t for t in tournaments}
        result: list[Tournament] = []
        visited: set[str] = set()

        def visit(t: Tournament) -> None:
            if t.id in visited:
                return
            visited.add(t.id)
            # Process parent first if it's in this batch
            if t.parent_id and t.parent_id in by_id:
                visit(by_id[t.parent_id])
            result.append(t)

        for t in tournaments:
            visit(t)

        return result

    @staticmethod
    def _calculate_match_status(state: SeriesState) -> str:
        """
        Calculate match status from SeriesState.

        Returns:
            One of: 'scheduled', 'live', 'completed', 'forfeited', 'cancelled'
        """
        if not state.valid:
            return "cancelled"
        if state.forfeited:
            return "forfeited"
        if state.finished:
            return "completed"
        if state.started:
            return "live"
        return "scheduled"

    @staticmethod
    def _calculate_game_status(game_state) -> str:
        """
        Calculate game status from GameState.

        Returns:
            One of: 'scheduled', 'live', 'completed'
        """
        if game_state.finished:
            return "completed"
        if game_state.started:
            return "live"
        return "scheduled"

    async def run(
        self,
        year: int | None = None,
        tournament_ids: list[str] | None = None,
    ) -> dict[str, int]:
        """
        Run full sync for a year or specific tournaments.

        Args:
            year: Year to sync (defaults to settings.pro_tournament_year)
            tournament_ids: If provided, only sync these specific tournament IDs (GRID external IDs)

        Returns:
            Stats dictionary with counts
        """
        year = year or settings.pro_tournament_year

        logger.info("Starting pro data sync", year=year, tournament_ids=tournament_ids)

        # Reset stats
        self._tournaments_processed = 0
        self._series_processed = 0
        self._series_skipped = 0
        self._games_processed = 0
        self._games_skipped = 0
        self._errors = 0

        try:
            if tournament_ids:
                # Fetch specific tournaments by ID
                tournaments: list[Tournament] = []
                for tid in tournament_ids:
                    t = await self.graphql.get_tournament_by_id(tid)
                    if t:
                        tournaments.append(t)
                    else:
                        logger.warning("Tournament not found", tournament_id=tid)
                logger.info("Fetched specific tournaments", count=len(tournaments), requested=len(tournament_ids))
            else:
                # Discover all tournaments for the year
                tournaments = await self.graphql.get_tournaments(
                    start_date=date(year, 1, 1),
                    end_date=date(year, 12, 31),
                )
                logger.info("Found tournaments", count=len(tournaments), year=year)

            # Sort so parents are processed before children
            tournaments = self._sort_parents_first(tournaments)

            # 2. Process each tournament
            for tournament in tournaments:
                await self._process_tournament(tournament)

            logger.info(
                "Pro data sync completed",
                tournaments=self._tournaments_processed,
                series=self._series_processed,
                series_skipped=self._series_skipped,
                games=self._games_processed,
                games_skipped=self._games_skipped,
                errors=self._errors,
            )

        except Exception as e:
            logger.error("Pro data sync failed", error=str(e))
            self._errors += 1
            raise

        return {
            "tournaments_processed": self._tournaments_processed,
            "series_processed": self._series_processed,
            "series_skipped": self._series_skipped,
            "games_processed": self._games_processed,
            "games_skipped": self._games_skipped,
            "errors": self._errors,
        }

    async def _get_tournament_dates(self, tournament: Tournament) -> tuple[date | None, date | None]:
        """
        Get dates for a tournament, traversing up to parent if needed.

        Child tournaments often don't have dates directly - they inherit from parent.
        """
        # If tournament has dates, use them
        if tournament.start_date and tournament.end_date:
            return tournament.start_date, tournament.end_date

        # Otherwise traverse up to find dates
        current = tournament
        max_depth = 5  # Prevent infinite loops

        for _ in range(max_depth):
            if not current.parent_id:
                break

            parent = await self.graphql.get_tournament_by_id(current.parent_id)
            if not parent:
                break

            if parent.start_date and parent.end_date:
                logger.debug(
                    "Inherited dates from parent",
                    tournament_id=tournament.id,
                    parent_id=parent.id,
                    start_date=parent.start_date,
                    end_date=parent.end_date,
                )
                return parent.start_date, parent.end_date

            current = parent

        return tournament.start_date, tournament.end_date

    async def _process_tournament(self, tournament: Tournament) -> None:
        """Process a single tournament."""
        logger.info(
            "Processing tournament",
            tournament_id=tournament.id,
            name=tournament.name,
        )

        try:
            # Get dates (may inherit from parent)
            start_date, end_date = await self._get_tournament_dates(tournament)

            # Upsert league if available
            pro_league_id = None
            league_name = getattr(tournament, 'league_name', None)
            if league_name:
                pro_league_id = await self.db.upsert_pro_league(
                    name=league_name,
                    external_id=getattr(tournament, 'league_id', None),
                    region=getattr(tournament, 'region', None),
                )

            # Upsert tournament
            tournament_id = await self.db.upsert_pro_tournament(
                external_id=tournament.id,
                name=tournament.name,
                pro_league_id=pro_league_id,
                region=getattr(tournament, 'region', None),
                start_date=start_date,
                end_date=end_date,
                tier=getattr(tournament, 'tier', None),
                year=start_date.year if start_date else None,
            )

            # Link to parent tournament if GRID provides a parent_id
            if tournament.parent_id:
                parent_db_id = await self.db.resolve_tournament_id(tournament.parent_id)
                if parent_db_id:
                    await self.db.set_tournament_parent(tournament_id, parent_db_id)
                else:
                    logger.debug(
                        "Parent tournament not found (may not be synced yet)",
                        tournament_id=tournament.id,
                        parent_id=tournament.parent_id,
                    )

            # Get series for tournament
            series_list = await self.graphql.get_series_for_tournament(tournament.id)
            logger.info(
                "Found series for tournament",
                tournament_id=tournament.id,
                count=len(series_list),
            )

            # Process each series
            for series in series_list:
                series.tournament_id = tournament.id
                await self._process_series(series, tournament_id)

            self._tournaments_processed += 1

        except GridClientError as e:
            logger.error(
                "Failed to process tournament",
                tournament_id=tournament.id,
                error=str(e),
            )
            self._errors += 1

    async def _process_series(
        self,
        series: Series,
        tournament_db_id: int | None = None,
    ) -> None:
        """Process a single series (match)."""
        logger.debug(
            "Processing series",
            series_id=series.id,
            teams=f"{series.team1_name} vs {series.team2_name}",
        )

        try:
            # Check if already processed (skip early)
            if await self.db.is_pro_match_processed(series.id):
                logger.debug("Series already processed, skipping", series_id=series.id)
                self._series_skipped += 1
                return

            # Get series state FIRST (for status, teams, and games)
            state = await self.graphql.get_series_state(series.id)
            if not state:
                logger.warning("Could not get series state", series_id=series.id)
                return

            # Note: We process invalid/cancelled matches too (status will be "cancelled")
            # This allows tracking remakes and technical issues

            # Get or create tournament ID if not provided
            if tournament_db_id is None and series.tournament_id:
                tournament = await self.db.get_pro_tournament_by_external_id(series.tournament_id)
                if tournament:
                    tournament_db_id = tournament["tournament_id"]

            # Tournament is optional - log but don't skip
            if tournament_db_id is None:
                logger.info(
                    "No tournament found for series (continuing without)",
                    series_id=series.id,
                    tournament_id=series.tournament_id,
                )

            # Upsert teams from SeriesState (more reliable)
            team1_db_id = None
            team2_db_id = None
            team1_external_id = None
            team2_external_id = None

            if len(state.teams) >= 1:
                team1 = state.teams[0]
                team1_external_id = team1.id
                team1_db_id = await self.db.upsert_pro_team(
                    external_id=team1.id,
                    name=team1.name or "Unknown",
                )

            if len(state.teams) >= 2:
                team2 = state.teams[1]
                team2_external_id = team2.id
                team2_db_id = await self.db.upsert_pro_team(
                    external_id=team2.id,
                    name=team2.name or "Unknown",
                )

            # Get scores and winner from SeriesState
            team1_score = state.teams[0].score if len(state.teams) >= 1 else 0
            team2_score = state.teams[1].score if len(state.teams) >= 2 else 0

            # Calculate status from SeriesState
            status = self._calculate_match_status(state)

            # Upsert match (series)
            match_id = await self.db.upsert_pro_match(
                external_id=series.id,
                tournament_id=tournament_db_id,
                team1_external_id=team1_external_id,
                team2_external_id=team2_external_id,
                team1_score=team1_score,
                team2_score=team2_score,
                format=state.format or series.format or "bo3",
                status=status,
                started_at=state.started_at or series.start_time,
            )

            # Process finished games (even if series is still live)
            finished_games = [g for g in state.games if g.finished]
            all_games_successful = True

            # Debug: log all games from API
            logger.info(
                "Series games from API",
                series_id=series.id,
                total_games=len(state.games),
                finished_games=len(finished_games),
                games=[
                    {"id": g.id, "seq": g.sequence_number, "finished": g.finished}
                    for g in state.games
                ],
            )

            if finished_games:
                # Create semaphore to limit concurrent game processing
                semaphore = asyncio.Semaphore(self.max_concurrent_games)

                # Get team states for roster matching
                team1_state = state.teams[0] if len(state.teams) >= 1 else None
                team2_state = state.teams[1] if len(state.teams) >= 2 else None

                async def process_with_semaphore(game_state):
                    async with semaphore:
                        return await self._process_game(
                            series_id=series.id,
                            game_state=game_state,
                            match_id=match_id,
                            tournament_db_id=tournament_db_id,
                            team1_db_id=team1_db_id,
                            team2_db_id=team2_db_id,
                            team1_state=team1_state,
                            team2_state=team2_state,
                        )

                results = await asyncio.gather(
                    *[process_with_semaphore(g) for g in finished_games],
                    return_exceptions=True,
                )

                # Count errors from results
                for result in results:
                    if isinstance(result, Exception):
                        logger.error("Game processing failed", error=str(result))
                        self._errors += 1
                        all_games_successful = False

            # Mark series as processed ONLY if:
            # - Series is finished (all games played)
            # - All games were processed successfully
            # - OR match was forfeited (no games to process)
            if state.finished and all_games_successful and (finished_games or state.forfeited):
                await self.db.mark_pro_match_processed(match_id)
                logger.info(
                    "Series fully processed",
                    series_id=series.id,
                    games=len(finished_games),
                    forfeited=state.forfeited,
                )
            elif not state.finished:
                logger.debug(
                    "Series still in progress",
                    series_id=series.id,
                    status=status,
                    games_finished=len(finished_games),
                    games_total=len(state.games),
                )

            self._series_processed += 1

        except GridClientError as e:
            logger.error(
                "Failed to process series",
                series_id=series.id,
                error=str(e),
            )
            self._errors += 1

    async def _process_game(
        self,
        series_id: str,
        game_state: Any,  # GameState
        match_id: int,
        tournament_db_id: int | None,
        team1_db_id: int | None,
        team2_db_id: int | None,
        team1_state: SeriesTeamState | None = None,
        team2_state: SeriesTeamState | None = None,
    ) -> None:
        """Process a single game."""
        game_external_id = game_state.id
        game_number = game_state.sequence_number

        # Check if already processed
        if await self.db.is_pro_game_processed(game_external_id):
            logger.debug(
                "Game already processed, skipping",
                game_id=game_external_id,
            )
            self._games_skipped += 1
            return

        logger.info(
            "Processing game",
            series_id=series_id,
            game_number=game_number,
            game_id=game_external_id,
        )

        try:
            # Download events file
            events = await self.files.get_events(series_id, game_number)

            if not events:
                logger.error(
                    "No events found for game - SKIPPING",
                    series_id=series_id,
                    game_number=game_number,
                    game_id=game_external_id,
                )
                # Raise exception so it's counted as error
                raise GridClientError(f"No events for game {game_number}")

            # Also get summary and details for more complete data
            summary = await self.files.get_summary(series_id, game_number)
            details = await self.files.get_details(series_id, game_number)

            # Parse events
            parser = EventsParser(events, summary, details)
            parsed = parser.parse()

            # Insert data in a transaction
            async with self.db.transaction() as conn:
                game_id = await self._insert_parsed_game(
                    conn=conn,
                    parsed=parsed,
                    game_external_id=game_external_id,
                    match_id=match_id,
                    tournament_db_id=tournament_db_id,
                    game_number=game_number,
                    team1_db_id=team1_db_id,
                    team2_db_id=team2_db_id,
                    team1_state=team1_state,
                    team2_state=team2_state,
                )

            # Mark game as processed
            await self.db.mark_pro_game_processed(game_id)

            self._games_processed += 1
            logger.info(
                "Game processed successfully",
                game_id=game_external_id,
                players=len(parsed.player_stats),
                events=len(parsed.game_events),
                draft_actions=len(parsed.draft_actions),
            )

        except GridClientError as e:
            logger.error(
                "Failed to download game data",
                series_id=series_id,
                game_number=game_number,
                error=str(e),
            )
            self._errors += 1
            raise

    @staticmethod
    def _match_grid_player_to_side(
        grid_team: SeriesTeamState,
        participant_names: list[str],
    ) -> str | None:
        """Check if any player from a GRID team matches the participant names.

        Uses token-based matching to avoid false positives (e.g., "Lee" in "Sleeper").
        Participant raw names like "LR Nemesis" are split into tokens ["lr", "nemesis"].

        Returns:
            The matched GRID player name, or None if no match.
        """
        participant_token_sets = [set(n.lower().split()) for n in participant_names]

        for grid_player in grid_team.players:
            grid_name = grid_player.get("name", "").strip().lower()
            if not grid_name:
                continue
            grid_tokens = set(grid_name.split())
            # Match if any GRID player token appears as a full token in a participant name
            for p_tokens in participant_token_sets:
                if grid_tokens & p_tokens:
                    return grid_name

        return None

    @staticmethod
    def _resolve_team_sides(
        team1_db_id: int | None,
        team2_db_id: int | None,
        team1_state: SeriesTeamState | None,
        team2_state: SeriesTeamState | None,
        participant_names_by_side: dict[str, list[str]],
    ) -> tuple[int | None, int | None]:
        """Resolve which GRID team is blue and which is red.

        Matches GRID team player names against game participant names (raw, with team tags)
        to determine the correct side mapping. Tries blue side first, then red as fallback.

        Returns:
            (blue_team_db_id, red_team_db_id)
        """
        if not team1_state or not team2_state:
            return (None, None)

        if not team1_state.players and not team2_state.players:
            return (None, None)

        # Try matching against blue side participants
        blue_names = participant_names_by_side.get("blue", [])
        if blue_names:
            for grid_team, db_id in [(team1_state, team1_db_id), (team2_state, team2_db_id)]:
                matched = SyncProDataJob._match_grid_player_to_side(grid_team, blue_names)
                if matched:
                    other_db_id = team2_db_id if db_id == team1_db_id else team1_db_id
                    logger.info(
                        "Roster matching resolved team sides (blue)",
                        grid_team=grid_team.name,
                        matched_player=matched,
                        side="blue",
                    )
                    return (db_id, other_db_id)

        # Fallback: try matching against red side participants
        red_names = participant_names_by_side.get("red", [])
        if red_names:
            for grid_team, db_id in [(team1_state, team1_db_id), (team2_state, team2_db_id)]:
                matched = SyncProDataJob._match_grid_player_to_side(grid_team, red_names)
                if matched:
                    other_db_id = team2_db_id if db_id == team1_db_id else team1_db_id
                    logger.info(
                        "Roster matching resolved team sides (red)",
                        grid_team=grid_team.name,
                        matched_player=matched,
                        side="red",
                    )
                    # This GRID team is on red side, so blue is the other
                    return (other_db_id, db_id)

        # No match found
        return (None, None)

    async def _insert_parsed_game(
        self,
        conn,
        parsed: ParsedGameData,
        game_external_id: str,
        match_id: int,
        tournament_db_id: int | None,
        game_number: int,
        team1_db_id: int | None,
        team2_db_id: int | None,
        team1_state: SeriesTeamState | None = None,
        team2_state: SeriesTeamState | None = None,
    ) -> int:
        """Insert parsed game data into database. Returns game_id."""
        game = parsed.game

        # Resolve team sides using GRID roster matching
        blue_team_db_id, red_team_db_id = self._resolve_team_sides(
            team1_db_id, team2_db_id,
            team1_state, team2_state,
            parsed.participant_names_by_side,
        )

        # Fallback to existing team1_side if roster matching failed
        if blue_team_db_id is None:
            if team1_state and team2_state:
                logger.warning(
                    "Roster matching failed, falling back to team1_side",
                    game_external_id=game_external_id,
                    team1_side=game.team1_side,
                    team1_players=[p.get("name") for p in team1_state.players],
                    blue_participants=parsed.participant_names_by_side.get("blue", []),
                )
            if game.team1_side == "blue":
                blue_team_db_id = team1_db_id
                red_team_db_id = team2_db_id
            elif game.team1_side == "red":
                blue_team_db_id = team2_db_id
                red_team_db_id = team1_db_id
            else:
                logger.error(
                    "Cannot determine team sides, defaulting team1=blue",
                    game_external_id=game_external_id,
                )
                blue_team_db_id = team1_db_id
                red_team_db_id = team2_db_id

        # Determine winner team ID based on winner_team_side
        winner_team_db_id = None
        if game.winner_team_side == "blue":
            winner_team_db_id = blue_team_db_id
        elif game.winner_team_side == "red":
            winner_team_db_id = red_team_db_id

        # Upsert game
        game_id = await self.db.upsert_pro_game(
            external_id=game_external_id,
            match_id=match_id,
            game_number=game_number,
            blue_team_id=blue_team_db_id,
            red_team_id=red_team_db_id,
            winner_team_id=winner_team_db_id,
            duration=game.duration,
            status="completed",
            patch=game.patch,
            blue_towers=game.blue_towers,
            red_towers=game.red_towers,
            blue_dragons=game.blue_dragons,
            red_dragons=game.red_dragons,
            blue_barons=game.blue_barons,
            red_barons=game.red_barons,
            blue_heralds=game.blue_heralds,
            red_heralds=game.red_heralds,
            blue_grubs=game.blue_grubs,
            red_grubs=game.red_grubs,
            first_blood_team=game.first_blood_team,
            first_tower_team=game.first_tower_team,
            first_dragon_team=game.first_dragon_team,
            first_baron_team=game.first_baron_team,
            first_herald_team=game.first_herald_team,
            blue_gold_at_15=game.blue_gold_at_15,
            red_gold_at_15=game.red_gold_at_15,
            blue_kills_at_15=game.blue_kills_at_15,
            red_kills_at_15=game.red_kills_at_15,
            blue_kills=game.blue_kills,
            red_kills=game.red_kills,
            blue_plates=game.blue_plates,
            red_plates=game.red_plates,
            plates_detail=game.plates_detail or None,
            objectives_timeline=game.objectives_timeline or None,
            started_at=datetime.fromisoformat(game.started_at) if game.started_at else None,
            ended_at=datetime.fromisoformat(game.ended_at) if game.ended_at else None,
        )

        # Aggregate gold and vision per team from player stats
        blue_total_gold = red_total_gold = 0
        blue_vision = {"score": 0, "wards_placed": 0, "wards_destroyed": 0, "control_wards": 0}
        red_vision = {"score": 0, "wards_placed": 0, "wards_destroyed": 0, "control_wards": 0}

        for ps in parsed.player_stats:
            vision = blue_vision if ps.team_side == "blue" else red_vision
            if ps.team_side == "blue":
                blue_total_gold += ps.gold_earned or 0
            else:
                red_total_gold += ps.gold_earned or 0
            vision["score"] += ps.vision.get("score", 0)
            vision["wards_placed"] += ps.vision.get("wards_placed", 0)
            vision["wards_destroyed"] += ps.vision.get("wards_destroyed", 0)
            vision["control_wards"] += ps.vision.get("control_wards", 0)

        # Insert team game stats (2 rows per game)
        if tournament_db_id:
            await self.db.upsert_pro_team_game_stats(
                game_id=game_id,
                match_id=match_id,
                tournament_id=tournament_db_id,
                blue_team_id=blue_team_db_id,
                red_team_id=red_team_db_id,
                winner_team_id=winner_team_db_id,
                duration=game.duration,
                blue_towers=game.blue_towers,
                red_towers=game.red_towers,
                blue_dragons=game.blue_dragons,
                red_dragons=game.red_dragons,
                blue_barons=game.blue_barons,
                red_barons=game.red_barons,
                blue_heralds=game.blue_heralds,
                red_heralds=game.red_heralds,
                blue_grubs=game.blue_grubs,
                red_grubs=game.red_grubs,
                blue_plates=game.blue_plates,
                red_plates=game.red_plates,
                blue_kills=game.blue_kills,
                red_kills=game.red_kills,
                blue_gold_at_15=game.blue_gold_at_15,
                red_gold_at_15=game.red_gold_at_15,
                blue_kills_at_15=game.blue_kills_at_15,
                red_kills_at_15=game.red_kills_at_15,
                first_blood_team=game.first_blood_team,
                first_blood_time=game.first_blood_time,
                first_tower_team=game.first_tower_team,
                first_dragon_team=game.first_dragon_team,
                first_baron_team=game.first_baron_team,
                first_herald_team=game.first_herald_team,
                first_grubs_team=game.first_grubs_team,
                blue_total_gold=blue_total_gold,
                red_total_gold=red_total_gold,
                blue_vision_score=blue_vision["score"],
                red_vision_score=red_vision["score"],
                blue_wards_placed=blue_vision["wards_placed"],
                red_wards_placed=red_vision["wards_placed"],
                blue_wards_destroyed=blue_vision["wards_destroyed"],
                red_wards_destroyed=red_vision["wards_destroyed"],
                blue_control_wards=blue_vision["control_wards"],
                red_control_wards=red_vision["control_wards"],
                objectives_timeline=game.objectives_timeline or None,
                connection=conn,
            )

        # Insert player stats (resolve player_id from GRID data)
        stats_dicts = []
        for ps in parsed.player_stats:
            # Determine team DB ID for player based on team_side
            team_db_id = None
            if ps.team_side == "blue":
                team_db_id = blue_team_db_id
            elif ps.team_side == "red":
                team_db_id = red_team_db_id

            # Resolve player_id from display name
            player_id = await self.db.resolve_player_id(
                player_name=ps.player_name,
            )

            stats_dicts.append({
                "player_id": player_id,
                "team_id": team_db_id,
                "team_side": ps.team_side,
                "role": ps.role,
                "champion_id": ps.champion_id,
                "kills": ps.kills,
                "deaths": ps.deaths,
                "assists": ps.assists,
                "cs": ps.cs,
                "gold_earned": ps.gold_earned,
                "damage_dealt": ps.damage_dealt,
                "damage_taken": ps.damage_taken,
                "first_blood": ps.first_blood,
                "vision": ps.vision,
                "max_diffs": ps.max_diffs,
                "multi_kills": ps.multi_kills,
                "solo_stats": ps.solo_stats,
                "items": ps.items,
                "runes": ps.runes,
                "timing_data": ps.timing_data,
                "proximity": ps.proximity,
                "isolation": ps.isolation,
                "quest_completed_at": ps.quest_completed_at,
                "plates": ps.plates,
            })

        if stats_dicts:
            await self.db.insert_pro_player_stats_batch(game_id, stats_dicts, connection=conn)

        # Insert draft actions
        draft_dicts = []
        for da in parsed.draft_actions:
            draft_dicts.append({
                "action_order": da.action_order,
                "action_type": da.action_type,
                "team_side": da.team_side,  # Will be converted to 'team1'/'team2' by DB service
                "champion_id": da.champion_id,
                "role": da.role,
            })

        if draft_dicts:
            await self.db.insert_pro_draft_actions_batch(game_id, draft_dicts, connection=conn)

        # Insert game events
        event_dicts = []
        for ge in parsed.game_events:
            event_dicts.append({
                "event_type": ge.event_type,
                "game_time": ge.game_time,
                "actor_player_name": ge.actor_player_name,
                "target_player_name": ge.target_player_name,
                "position_x": ge.position_x,
                "position_y": ge.position_y,
                "event_data": ge.event_data,
            })

        if event_dicts:
            await self.db.insert_pro_game_events_batch(game_id, event_dicts, connection=conn)

        return game_id
