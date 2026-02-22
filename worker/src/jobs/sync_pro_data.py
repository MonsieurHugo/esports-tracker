"""
Pro Data Sync Job

Synchronizes esports data from GRID API to the database.
Series-first (bottom-up) architecture: discovers recent series via get_all_series,
then lazily resolves tournaments on demand.
"""

import traceback
from datetime import date, datetime, timedelta, timezone
from typing import Any

import structlog

from src.config import settings
from src.exceptions import DataIntegrityError
from src.parsers.events_parser import EventsParser, ParsedGameData
from src.services.database import DatabaseService
from src.services.grid_client import GridClient, GridClientError
from src.services.grid_files import GridFiles
from src.services.grid_graphql import GameState, GameTeamInfo, GridGraphQL, Series, SeriesState, SeriesTeamState, Tournament

logger = structlog.get_logger(__name__)

# Map GRID format names to short DB format
_FORMAT_MAP = {
    "best-of-1": "bo1",
    "best-of-2": "bo2",
    "best-of-3": "bo3",
    "best-of-5": "bo5",
}


def _normalize_format(raw: str | None) -> str:
    """Normalize GRID format (e.g. 'best-of-3') to DB format ('bo3').

    Raises DataIntegrityError if the raw format is None or unknown.
    """
    if not raw:
        raise DataIntegrityError("Match format missing from GRID", {"raw": raw})

    normalized = _FORMAT_MAP.get(raw.lower(), raw.lower())
    if normalized not in ("bo1", "bo2", "bo3", "bo5"):
        raise DataIntegrityError(
            f"Unknown match format from GRID: {raw!r}",
            {"raw": raw, "normalized": normalized},
        )
    return normalized


class SyncProDataJob:
    """Job for synchronizing pro esports data from GRID."""

    def __init__(self, db: DatabaseService, grid_client: GridClient):
        self.db = db
        self.client = grid_client
        self.graphql = GridGraphQL(grid_client)
        self.files = GridFiles(grid_client)
        self.max_concurrent_games = settings.pro_max_concurrent_games

        # Chronobreak fragment tracking: game external IDs consumed as supplements
        self._consumed_fragment_ids: set[str] = set()

        # Tournament lazy resolution cache (cleared each cycle)
        self._tournament_cache: dict[str, int | None] = {}

        # Stats tracking
        self._tournaments_processed = 0
        self._series_processed = 0
        self._series_skipped = 0
        self._games_processed = 0
        self._games_skipped = 0
        self._errors = 0
        self._duplicates_replaced = 0

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

    def _reset_stats(self) -> None:
        """Reset all stats counters for a new cycle."""
        self._tournaments_processed = 0
        self._series_processed = 0
        self._series_skipped = 0
        self._games_processed = 0
        self._games_skipped = 0
        self._errors = 0
        self._duplicates_replaced = 0
        self._consumed_fragment_ids.clear()
        self._tournament_cache.clear()

    def _stats_dict(self) -> dict[str, int]:
        """Return current stats as a dictionary."""
        return {
            "tournaments_processed": self._tournaments_processed,
            "series_processed": self._series_processed,
            "series_skipped": self._series_skipped,
            "games_processed": self._games_processed,
            "games_skipped": self._games_skipped,
            "duplicates_replaced": self._duplicates_replaced,
            "errors": self._errors,
        }

    async def run_discovery(
        self,
        window_hours: int | None = None,
    ) -> dict[str, int]:
        """
        Series-first discovery sync.

        Queries recent series via get_all_series(start_time_gte=now-window),
        then lazily resolves tournaments on demand. Much faster than the old
        tournament-first approach (~50-200 API calls vs ~14,000+).

        Args:
            window_hours: How far back to look (defaults to settings.pro_discovery_window_hours)

        Returns:
            Stats dictionary with counts
        """
        window = window_hours or settings.pro_discovery_window_hours
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(hours=window)

        logger.info("Starting discovery sync", window_hours=window, cutoff=cutoff.isoformat())

        self._reset_stats()

        try:
            # Fetch recent series (paginated, ~100-300 typically)
            series_list = await self.graphql.get_all_series(
                start_time_gte=cutoff,
                types=["ESPORTS"],
            )
            logger.info("Discovery found series", count=len(series_list))

            for series in series_list:
                tournament_db_id = None
                try:
                    # Timezone-aware comparison
                    start = series.start_time
                    if start and start.tzinfo is None:
                        start = start.replace(tzinfo=timezone.utc)
                    if start and start > now:
                        # Store future series as "scheduled" (lightweight, no get_series_state call)
                        tournament_db_id = await self._resolve_tournament_lazy(series.tournament_id)

                        # Upsert teams if known from the Series dataclass
                        if series.team1_id and series.team1_name:
                            await self.db.upsert_pro_team(external_id=series.team1_id, name=series.team1_name)
                        if series.team2_id and series.team2_name:
                            await self.db.upsert_pro_team(external_id=series.team2_id, name=series.team2_name)

                        try:
                            format_str = _normalize_format(series.format) if series.format else None
                        except DataIntegrityError:
                            format_str = None  # Unknown format for scheduled match — will resolve at processing time

                        await self.db.upsert_pro_match(
                            external_id=series.id,
                            tournament_id=tournament_db_id,
                            team1_external_id=series.team1_id,
                            team2_external_id=series.team2_id,
                            team1_score=0,
                            team2_score=0,
                            format=format_str,
                            status="scheduled",
                            scheduled_at=start,
                            started_at=None,
                            ended_at=None,
                        )
                        self._series_skipped += 1
                        continue

                    # Skip already processed
                    if await self.db.is_pro_match_processed(series.id):
                        self._series_skipped += 1
                        continue

                    # Lazy-resolve tournament
                    tournament_db_id = await self._resolve_tournament_lazy(series.tournament_id)

                    await self._process_series(series, tournament_db_id=tournament_db_id)

                except DataIntegrityError as e:
                    logger.error(
                        "Data integrity failure in discovery",
                        series_id=series.id,
                        reason=e.reason,
                    )
                    # Ensure the match exists in DB before marking failed
                    await self.db.upsert_pro_match(
                        external_id=series.id,
                        tournament_id=tournament_db_id,
                        team1_external_id=series.team1_id,
                        team2_external_id=series.team2_id,
                        team1_score=0,
                        team2_score=0,
                        format=None,
                        status="live",
                        scheduled_at=series.start_time,
                        started_at=series.start_time,
                    )
                    await self.db.mark_pro_match_failed(series.id, e.reason, e.context)
                    self._errors += 1
                except GridClientError as e:
                    logger.error(
                        "GRID API error in discovery",
                        series_id=series.id,
                        error=str(e),
                    )
                    await self.db.upsert_pro_match(
                        external_id=series.id,
                        tournament_id=tournament_db_id,
                        team1_external_id=series.team1_id,
                        team2_external_id=series.team2_id,
                        team1_score=0,
                        team2_score=0,
                        format=None,
                        status="live",
                        scheduled_at=series.start_time,
                        started_at=series.start_time,
                    )
                    await self.db.mark_pro_match_failed(
                        series.id,
                        f"GRID API error: {e}",
                        {"series_id": series.id},
                    )
                    self._errors += 1
                except Exception as e:
                    logger.error(
                        "Unexpected error in discovery",
                        series_id=series.id,
                        error=str(e),
                    )
                    self._errors += 1

            logger.info("Discovery sync completed", **self._stats_dict())

        except Exception as e:
            logger.error("Discovery sync failed", error=str(e), traceback=traceback.format_exc())
            self._errors += 1
            raise

        return self._stats_dict()

    async def run(
        self,
        tournament_ids: list[str] | None = None,
    ) -> dict[str, int]:
        """
        One-shot sync for specific tournaments (used by --tournaments CLI flag).

        Args:
            tournament_ids: GRID external IDs to sync

        Returns:
            Stats dictionary with counts
        """
        if not tournament_ids:
            logger.warning("run() called without tournament_ids, use run_discovery() for scheduled sync")
            return await self.run_discovery()

        logger.info("Starting one-shot tournament sync", tournament_ids=tournament_ids)

        self._reset_stats()

        try:
            for tid in tournament_ids:
                tournament = await self.graphql.get_tournament_by_id(tid)
                if not tournament:
                    logger.warning("Tournament not found", tournament_id=tid)
                    continue

                # Upsert tournament
                tournament_db_id = await self._upsert_tournament_from_grid(tournament)

                # Fetch series for this tournament
                series_list = await self.graphql.get_series_for_tournament(tid)
                logger.info("Found series for tournament", tournament_id=tid, count=len(series_list))

                now = datetime.now(timezone.utc)
                for series in series_list:
                    start = series.start_time
                    if start and start.tzinfo is None:
                        start = start.replace(tzinfo=timezone.utc)
                    if start and start > now:
                        # Store future series as "scheduled"
                        if series.team1_id and series.team1_name:
                            await self.db.upsert_pro_team(external_id=series.team1_id, name=series.team1_name)
                        if series.team2_id and series.team2_name:
                            await self.db.upsert_pro_team(external_id=series.team2_id, name=series.team2_name)

                        try:
                            format_str = _normalize_format(series.format) if series.format else None
                        except DataIntegrityError:
                            format_str = None  # Unknown format for scheduled match — will resolve at processing time

                        await self.db.upsert_pro_match(
                            external_id=series.id,
                            tournament_id=tournament_db_id,
                            team1_external_id=series.team1_id,
                            team2_external_id=series.team2_id,
                            team1_score=0,
                            team2_score=0,
                            format=format_str,
                            status="scheduled",
                            scheduled_at=start,
                            started_at=None,
                            ended_at=None,
                        )
                        self._series_skipped += 1
                        continue
                    series.tournament_id = tid
                    await self._process_series(series, tournament_db_id)

                self._tournaments_processed += 1

            logger.info("One-shot sync completed", **self._stats_dict())

        except Exception as e:
            logger.error("One-shot sync failed", error=str(e), traceback=traceback.format_exc())
            self._errors += 1
            raise

        return self._stats_dict()

    async def _resolve_tournament_lazy(self, grid_tournament_id: str) -> int | None:
        """Resolve tournament DB ID, fetching from GRID if needed.

        Uses a 3-tier lookup:
          1. In-memory cache (per cycle)
          2. DB lookup
          3. Fetch from GRID API + upsert + walk parent chain
        """
        if not grid_tournament_id:
            return None

        # 1. Memory cache
        if grid_tournament_id in self._tournament_cache:
            return self._tournament_cache[grid_tournament_id]

        # 2. DB lookup
        existing = await self.db.get_pro_tournament_by_external_id(grid_tournament_id)
        if existing:
            db_id = existing["tournament_id"]
            self._tournament_cache[grid_tournament_id] = db_id
            return db_id

        # 3. Fetch from GRID + upsert
        tournament = await self.graphql.get_tournament_by_id(grid_tournament_id)
        if not tournament:
            logger.warning("Tournament not found on GRID", tournament_id=grid_tournament_id)
            self._tournament_cache[grid_tournament_id] = None
            return None

        db_id = await self._upsert_tournament_from_grid(tournament)
        self._tournament_cache[grid_tournament_id] = db_id
        self._tournaments_processed += 1

        logger.info(
            "Lazily resolved tournament",
            grid_id=grid_tournament_id,
            name=tournament.name,
            db_id=db_id,
        )
        return db_id

    async def _upsert_tournament_from_grid(self, tournament: Tournament) -> int:
        """Upsert a tournament fetched from GRID, resolving parent chain for dates/hierarchy."""
        start_date = tournament.start_date
        end_date = tournament.end_date
        split_name = tournament.split_name or tournament.name

        # Walk parent chain for dates and split_name if missing
        if (not start_date or not end_date) and tournament.parent_id:
            parent = await self.graphql.get_tournament_by_id(tournament.parent_id)
            if parent:
                if not start_date:
                    start_date = parent.start_date
                if not end_date:
                    end_date = parent.end_date
                split_name = parent.name  # Parent is likely the split

        # Upsert league if info available
        pro_league_id = None
        league_name = getattr(tournament, 'league_name', None)
        if league_name:
            pro_league_id = await self.db.upsert_pro_league(
                name=league_name,
                external_id=getattr(tournament, 'league_id', None),
                region=getattr(tournament, 'region', None),
            )

        tournament_db_id = await self.db.upsert_pro_tournament(
            external_id=tournament.id,
            name=tournament.name,
            pro_league_id=pro_league_id,
            start_date=start_date,
            end_date=end_date,
            year=start_date.year if start_date else None,
            split_name=split_name,
        )

        # Link to parent if it exists in DB
        if tournament.parent_id:
            parent_db_id = await self.db.resolve_tournament_id(tournament.parent_id)
            if parent_db_id:
                await self.db.set_tournament_parent(tournament_db_id, parent_db_id)

        return tournament_db_id

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

        match_id = None

        try:
            # Check if already processed or merged (skip early)
            if await self.db.is_pro_match_processed(series.id):
                logger.debug("Series already processed, skipping", series_id=series.id)
                self._series_skipped += 1
                return
            if await self.db.is_series_already_merged(series.id):
                logger.debug("Series already merged, skipping", series_id=series.id)
                self._series_skipped += 1
                return

            # Get series state FIRST (for status, teams, and games)
            state = await self.graphql.get_series_state(series.id)
            if not state:
                # No state available — skip silently, will retry next discovery cycle
                self._series_skipped += 1
                return

            if not state.finished:
                # Series not finished — skip, will be picked up in next cycle
                logger.debug("Series not finished, skipping", series_id=series.id)
                self._series_skipped += 1
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

            if len(state.teams) < 2:
                raise DataIntegrityError(
                    f"Series has {len(state.teams)} teams, expected 2",
                    {"series_id": series.id, "teams_count": len(state.teams)},
                )

            team1 = state.teams[0]
            team1_external_id = team1.id
            if not team1.name:
                raise DataIntegrityError(
                    "Team 1 name is empty",
                    {"series_id": series.id, "team_id": team1.id},
                )
            team1_db_id = await self.db.upsert_pro_team(
                external_id=team1.id,
                name=team1.name,
            )

            team2 = state.teams[1]
            team2_external_id = team2.id
            if not team2.name:
                raise DataIntegrityError(
                    "Team 2 name is empty",
                    {"series_id": series.id, "team_id": team2.id},
                )
            team2_db_id = await self.db.upsert_pro_team(
                external_id=team2.id,
                name=team2.name,
            )

            # Get scores from SeriesState (we already verified 2 teams above)
            team1_score = state.teams[0].score
            team2_score = state.teams[1].score

            # Calculate status from SeriesState
            status = self._calculate_match_status(state)

            # Duplicate detection: check if another series already covers this match
            series_started_at = state.started_at or series.start_time
            series_format = _normalize_format(state.format or series.format)
            duplicate = await self.db.find_duplicate_pro_match(
                external_id=series.id,
                tournament_id=tournament_db_id,
                team1_external_id=team1_external_id,
                team2_external_id=team2_external_id,
                started_at=series_started_at,
                format=series_format,
            )
            if duplicate:
                primary_match_id = duplicate["match_id"]
                primary_external_id = duplicate["external_id"]

                await self.db.create_data_quality_flag(
                    flag_type="duplicate_merged", severity="warning",
                    entity_type="match", entity_id=primary_match_id, external_id=series.id,
                    context={
                        "new_series_id": series.id,
                        "primary_external_id": primary_external_id,
                        "primary_match_id": primary_match_id,
                        "primary_status": duplicate["status"],
                        "time_window": "3h" if duplicate["status"] != "cancelled" else "1d",
                    },
                )

                logger.warning(
                    "Duplicate GRID series detected — merging directly into primary",
                    new_series_id=series.id,
                    existing_series_id=primary_external_id,
                    existing_match_id=primary_match_id,
                    existing_status=duplicate["status"],
                )

                # Find max game_number in primary match to offset new games
                max_game_num = await self.db.fetchval(
                    "SELECT COALESCE(MAX(game_number), 0) FROM pro_games WHERE match_id = $1",
                    primary_match_id,
                )

                # Process games directly into the primary match (no temporary match needed)
                # In merge path, accept started (not just finished) games — cancelled GRID
                # series mark games as not-finished even when data files exist.
                merge_games = [g for g in state.games if g.finished or g.started]
                games_added = 0
                if merge_games:
                    team1_state = state.teams[0]
                    team2_state = state.teams[1]

                    # Process sequentially for chronobreak fragment tracking
                    for game_state in sorted(merge_games, key=lambda g: g.sequence_number):
                        await self._process_game(
                            series_id=series.id,
                            game_state=game_state,
                            match_id=primary_match_id,
                            tournament_db_id=tournament_db_id,
                            team1_db_id=team1_db_id,
                            team2_db_id=team2_db_id,
                            team1_state=team1_state,
                            team2_state=team2_state,
                            game_number_offset=max_game_num,
                            all_series_games=state.games,
                            game_teams=game_state.teams,
                        )
                        games_added += 1

                # Re-number all games in the match by started_at so that
                # games merged from a cancelled series get the correct order.
                if games_added > 0:
                    await self.db.execute(
                        """UPDATE pro_games g
                           SET game_number = sub.rn
                           FROM (
                               SELECT game_id,
                                      ROW_NUMBER() OVER (ORDER BY started_at NULLS LAST, game_id) AS rn
                               FROM pro_games
                               WHERE match_id = $1
                           ) sub
                           WHERE g.game_id = sub.game_id AND g.game_number != sub.rn""",
                        primary_match_id,
                    )

                # Audit trail: record that this series was merged
                await self.db.execute(
                    """INSERT INTO pro_entity_mappings (entity_type, entity_id, source, source_id, created_at)
                       VALUES ('match', $1, 'grid_merged', $2, NOW())
                       ON CONFLICT (entity_type, source, source_id) DO NOTHING""",
                    primary_match_id, series.id,
                )

                # Update primary match scores and status after merge
                if state.valid and state.finished:
                    primary_team1 = duplicate["team1_external_id"]
                    if primary_team1 and primary_team1 == team2_external_id:
                        final_score_1, final_score_2 = team2_score, team1_score
                    else:
                        final_score_1, final_score_2 = team1_score, team2_score
                    await self.db.execute(
                        "UPDATE pro_matches SET team1_score = $1, team2_score = $2, status = 'processed', ended_at = COALESCE(ended_at, NOW()), updated_at = NOW() WHERE match_id = $3",
                        final_score_1, final_score_2, primary_match_id,
                    )
                else:
                    await self.db.execute(
                        "UPDATE pro_matches SET status = 'processed', ended_at = COALESCE(ended_at, NOW()), updated_at = NOW() WHERE match_id = $1",
                        primary_match_id,
                    )

                logger.info(
                    "Merged duplicate series",
                    primary_match_id=primary_match_id,
                    games_added=games_added,
                )
                self._duplicates_replaced += 1
                self._series_processed += 1
                return  # Skip normal processing below

            # Compute ended_at from started_at + duration when series is finished
            series_ended_at = None
            if state.finished and state.started_at and state.duration:
                series_ended_at = state.started_at + timedelta(seconds=state.duration)

            # Upsert match (series)
            match_id = await self.db.upsert_pro_match(
                external_id=series.id,
                tournament_id=tournament_db_id,
                team1_external_id=team1_external_id,
                team2_external_id=team2_external_id,
                team1_score=team1_score,
                team2_score=team2_score,
                format=series_format,
                status=status,
                started_at=state.started_at or series.start_time,
                ended_at=series_ended_at,
            )

            # Process finished games (even if series is still live)
            finished_games = [g for g in state.games if g.finished]

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
                # Get team states for roster matching
                team1_state = state.teams[0]
                team2_state = state.teams[1]

                # Process games sequentially (required for chronobreak fragment tracking:
                # seq 1 must mark seq 2 as consumed before seq 2 starts processing)
                for game_state in sorted(finished_games, key=lambda g: g.sequence_number):
                    await self._process_game(
                        series_id=series.id,
                        game_state=game_state,
                        match_id=match_id,
                        tournament_db_id=tournament_db_id,
                        team1_db_id=team1_db_id,
                        team2_db_id=team2_db_id,
                        team1_state=team1_state,
                        team2_state=team2_state,
                        all_series_games=state.games,
                        game_teams=game_state.teams,
                    )

            # Mark series as processed ONLY if:
            # - Series is finished (all games played)
            # - All games were processed successfully
            # - OR match was forfeited (no games to process)
            if state.finished and (finished_games or state.forfeited):
                await self.db.mark_pro_match_processed(match_id)
                logger.info(
                    "Series fully processed",
                    series_id=series.id,
                    games=len(finished_games),
                    forfeited=state.forfeited,
                )
            self._series_processed += 1

        except (DataIntegrityError, GridClientError) as e:
            reason = e.reason if isinstance(e, DataIntegrityError) else str(e)
            context = e.context if isinstance(e, DataIntegrityError) else {"series_id": series.id}

            logger.warning(
                "Data quality issue — flagging match, no data generated",
                series_id=series.id,
                reason=reason,
            )

            # Guarantee match row exists before flagging
            if match_id is None:
                match_id = await self.db.upsert_pro_match(
                    external_id=series.id,
                    tournament_id=tournament_db_id,
                    team1_external_id=series.team1_id,
                    team2_external_id=series.team2_id,
                    team1_score=0,
                    team2_score=0,
                    format=None,
                    status="live",
                    scheduled_at=series.start_time,
                    started_at=series.start_time,
                )

            # Clean up any games already inserted for this match in this cycle
            # (DELETE cascades to pro_player_stats, pro_draft_actions, pro_game_events, pro_team_stats)
            await self.db.execute(
                "DELETE FROM pro_games WHERE match_id = $1",
                match_id,
            )

            # Flag the match with the reason
            await self.db.create_data_quality_flag(
                flag_type="chronobreak_detected" if "Chronobreak" in reason else "processing_failed",
                severity="error",
                entity_type="match",
                entity_id=match_id,
                external_id=series.id,
                context=context,
            )

            # Mark as processed — no retry (data won't get better)
            await self.db.mark_pro_match_processed(match_id)
            self._series_processed += 1

    @staticmethod
    def _has_game_end(events: list[dict]) -> bool:
        """Check if events contain a game_end event (scans from end since it's always last)."""
        return any(e.get("rfc461Schema") == "game_end" for e in reversed(events))

    @staticmethod
    def _match_participants(events: list[dict], summary: dict) -> bool:
        """Check if events and summary have the same champion set."""
        event_champs: set[str] = set()
        for e in events:
            if e.get("rfc461Schema") == "game_info":
                for p in e.get("participants", []):
                    name = p.get("championName")
                    if name:
                        event_champs.add(name)
                break
        summary_champs = {
            p.get("championName")
            for p in summary.get("participants", [])
            if p.get("championName")
        }
        return bool(event_champs) and event_champs == summary_champs

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
        game_number_offset: int = 0,
        all_series_games: list | None = None,
        game_teams: list[GameTeamInfo] | None = None,
    ) -> None:
        """Process a single game."""
        game_external_id = game_state.id
        grid_game_number = game_state.sequence_number  # Original number for GRID API file paths
        game_number = grid_game_number + game_number_offset  # DB game_number (offset for merges)

        # Skip games consumed as chronobreak fragments
        if game_external_id in self._consumed_fragment_ids:
            logger.info(
                "Game already consumed as chronobreak fragment, skipping",
                game_id=game_external_id,
            )
            self._games_skipped += 1
            return

        # Check if already processed
        if await self.db.is_pro_game_processed(game_external_id):
            logger.debug(
                "Game already processed, skipping",
                game_id=game_external_id,
            )
            self._games_skipped += 1
            return

        # Check if game already exists for this (match_id, game_number) under a different external_id
        # (GRID sometimes creates duplicate series with different IDs for the same match)
        if await self.db.is_pro_game_exists(match_id, game_number):
            logger.debug(
                "Game already exists for match+game_number, skipping duplicate series",
                game_id=game_external_id,
                match_id=match_id,
                game_number=game_number,
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
            # Download events file (use grid_game_number for GRID API paths)
            events = await self.files.get_events(series_id, grid_game_number)

            # Download summary and details
            summary = await self.files.get_summary(series_id, grid_game_number)
            details = await self.files.get_details(series_id, grid_game_number)

            if not events and not (summary and summary.get("participants")):
                raise DataIntegrityError(
                    "No data sources for game",
                    {"series_id": series_id, "game_number": game_number, "game_id": game_external_id},
                )

            # Chronobreak detection: if events are truncated (no game_end),
            # scan subsequent game sequences for a summary with matching champions.
            # A chronobreak means the game data is unreliable — raise to flag the match.
            if events and not self._has_game_end(events) and all_series_games:
                logger.warning(
                    "Events truncated (no game_end), scanning for chronobreak fragment",
                    series_id=series_id,
                    game_number=grid_game_number,
                    game_id=game_external_id,
                )
                for candidate in sorted(all_series_games, key=lambda g: g.sequence_number):
                    if candidate.sequence_number <= grid_game_number:
                        continue
                    if not candidate.finished and not candidate.started:
                        continue
                    try:
                        candidate_summary = await self.files.get_summary(
                            series_id, candidate.sequence_number
                        )
                        if candidate_summary and self._match_participants(events, candidate_summary):
                            self._consumed_fragment_ids.add(candidate.id)
                            raise DataIntegrityError(
                                "Chronobreak detected",
                                {"series_id": series_id, "game_number": game_number,
                                 "fragment_seq": candidate.sequence_number, "fragment_id": candidate.id},
                            )
                    except GridClientError:
                        continue

            # Flag missing data files
            missing_sources = []
            if not events:
                missing_sources.append("events")
            if not summary or not summary.get("participants"):
                missing_sources.append("summary")
            if not details:
                missing_sources.append("details")
            if missing_sources:
                await self.db.create_data_quality_flag(
                    flag_type="file_not_found", severity="warning" if len(missing_sources) < 3 else "error",
                    entity_type="game", external_id=series_id,
                    context={"game_external_id": game_external_id, "game_number": game_number, "missing": missing_sources},
                )

            # Unified parser: handles all combinations of available sources
            parser = EventsParser(events or [], summary, details)
            parsed = parser.parse()

            # A finished game must have a winner — if not, it's a remake or corrupted data
            if not parsed.game.winner_team_side:
                raise DataIntegrityError(
                    "No winner determined for game (likely remake)",
                    {"series_id": series_id, "game_number": game_number,
                     "game_id": game_external_id, "duration": parsed.game.duration},
                )

            # Insert data in a transaction
            async with self.db.transaction() as conn:
                game_id = await self._insert_parsed_game(
                    conn=conn,
                    parsed=parsed,
                    game_external_id=game_external_id,
                    series_id=series_id,
                    match_id=match_id,
                    tournament_db_id=tournament_db_id,
                    game_number=game_number,
                    team1_db_id=team1_db_id,
                    team2_db_id=team2_db_id,
                    team1_state=team1_state,
                    team2_state=team2_state,
                    game_teams=game_teams,
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
        series_id: str,
        match_id: int,
        tournament_db_id: int | None,
        game_number: int,
        team1_db_id: int | None,
        team2_db_id: int | None,
        team1_state: SeriesTeamState | None = None,
        team2_state: SeriesTeamState | None = None,
        game_teams: list[GameTeamInfo] | None = None,
    ) -> int:
        """Insert parsed game data into database. Returns game_id."""
        game = parsed.game

        blue_team_db_id = None
        red_team_db_id = None

        # PRIORITY 1: GameTeamState.side (source of truth from GRID Live Data Feed)
        if game_teams:
            for gt in game_teams:
                # Resolve the DB ID for this GRID team
                db_id = None
                if team1_state and gt.id == team1_state.id:
                    db_id = team1_db_id
                elif team2_state and gt.id == team2_state.id:
                    db_id = team2_db_id
                else:
                    db_id = await self.db.find_by_source_id("team", gt.id)
                if db_id is None:
                    continue
                if gt.side.lower() == "blue":
                    blue_team_db_id = db_id
                elif gt.side.lower() == "red":
                    red_team_db_id = db_id

            if blue_team_db_id is not None and red_team_db_id is not None:
                logger.info(
                    "GameTeamState.side resolved team sides",
                    game_external_id=game_external_id,
                    blue_team_db_id=blue_team_db_id,
                    red_team_db_id=red_team_db_id,
                )
            elif blue_team_db_id is not None or red_team_db_id is not None:
                logger.warning(
                    "GameTeamState.side partially resolved (one side missing)",
                    game_external_id=game_external_id,
                    blue_team_db_id=blue_team_db_id,
                    red_team_db_id=red_team_db_id,
                )

        # PRIORITY 2: Roster matching (fallback when game_teams didn't fully resolve)
        if blue_team_db_id is None or red_team_db_id is None:
            resolved_blue, resolved_red = self._resolve_team_sides(
                team1_db_id, team2_db_id,
                team1_state, team2_state,
                parsed.participant_names_by_side,
            )
            if blue_team_db_id is None:
                blue_team_db_id = resolved_blue
            if red_team_db_id is None:
                red_team_db_id = resolved_red

        # Fallback to existing team1_side if roster matching failed
        if blue_team_db_id is None:
            if game.team1_side == "blue":
                blue_team_db_id = team1_db_id
                red_team_db_id = team2_db_id
                parsed.data_quality_flags.append({
                    "flag_type": "side_defaulted",
                    "severity": "warning",
                    "entity_type": "game",
                    "external_id": series_id,
                    "context": {
                        "game_external_id": game_external_id,
                        "source": "team1_side_fallback",
                        "resolution": "team1_side=blue",
                    },
                })
            elif game.team1_side == "red":
                blue_team_db_id = team2_db_id
                red_team_db_id = team1_db_id
                parsed.data_quality_flags.append({
                    "flag_type": "side_defaulted",
                    "severity": "warning",
                    "entity_type": "game",
                    "external_id": series_id,
                    "context": {
                        "game_external_id": game_external_id,
                        "source": "team1_side_fallback",
                        "resolution": "team1_side=red",
                    },
                })
            else:
                raise DataIntegrityError(
                    "Cannot determine team sides",
                    {
                        "game_external_id": game_external_id,
                        "team1_side": game.team1_side,
                        "blue_participants": parsed.participant_names_by_side.get("blue", []),
                        "red_participants": parsed.participant_names_by_side.get("red", []),
                    },
                )

        # Determine winner team ID based on winner_team_side
        winner_team_db_id = None
        if game.winner_team_side == "blue":
            winner_team_db_id = blue_team_db_id
        elif game.winner_team_side == "red":
            winner_team_db_id = red_team_db_id

        # Upsert game (inside transaction so it rolls back with player stats on failure)
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
            connection=conn,
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

        # Persist parser data quality flags
        if parsed.data_quality_flags:
            for f in parsed.data_quality_flags:
                f.setdefault("entity_type", "game")
                f.setdefault("entity_id", game_id)
                f.setdefault("external_id", series_id)
                f["context"] = {**f.get("context", {}), "game_external_id": game_external_id}
            await self.db.batch_create_data_quality_flags(parsed.data_quality_flags)

        return game_id
