"""
Sync Pro Data Job
Synchronizes historical esports data from Leaguepedia
"""

import asyncio
from datetime import datetime, timezone

import structlog

from src.services.database import DatabaseService
from src.services.leaguepedia_service import LeaguepediaError, LeaguepediaService

logger = structlog.get_logger(__name__)


class SyncProDataJob:
    """Job to synchronize historical pro data from Leaguepedia.

    This job handles:
    - Daily tournament and match data sync
    - Historical backfill for new tournaments
    - Roster reconciliation
    - Data quality checks

    Runs less frequently than the GRID fetch job (every 6-24 hours).
    """

    def __init__(
        self,
        db: DatabaseService,
        sync_interval: int = 21600,  # 6 hours default
    ):
        self.db = db
        self._leaguepedia: LeaguepediaService | None = None
        self._sync_interval = sync_interval
        self._running = False

        # Metrics
        self._sync_count = 0
        self._tournaments_synced = 0
        self._matches_synced = 0
        self._errors = 0

    def _get_leaguepedia_client(self) -> LeaguepediaService:
        """Get or create Leaguepedia client."""
        if self._leaguepedia is None:
            self._leaguepedia = LeaguepediaService()
        return self._leaguepedia

    async def run(self) -> None:
        """Execute the job continuously."""
        self._running = True
        logger.info("Starting pro data sync job")

        try:
            while self._running:
                await self._run_sync()

                logger.info(
                    "Pro data sync complete",
                    next_sync_in=self._sync_interval,
                )

                await asyncio.sleep(self._sync_interval)

        except asyncio.CancelledError:
            logger.info("Pro data sync job cancelled")
        except Exception as e:
            logger.exception("Pro data sync job failed", error=str(e))
        finally:
            await self._cleanup()

    async def stop(self) -> None:
        """Stop the job gracefully."""
        self._running = False

    async def _cleanup(self) -> None:
        """Clean up resources."""
        if self._leaguepedia:
            await self._leaguepedia.close()
            self._leaguepedia = None

    async def run_once(self) -> None:
        """Run a single sync cycle (for manual/scheduled execution)."""
        try:
            await self._run_sync()
        finally:
            await self._cleanup()

    async def _run_sync(self) -> None:
        """Run one sync cycle."""
        self._sync_count += 1

        try:
            leaguepedia = self._get_leaguepedia_client()

            # 1. Sync current year tournaments
            current_year = datetime.now(timezone.utc).year
            await self._sync_tournaments(leaguepedia, year=current_year)

            # 2. Sync recent matches for active tournaments
            await self._sync_recent_matches(leaguepedia)

            # 3. Backfill any missing game details
            await self._backfill_game_details(leaguepedia)

            logger.info(
                "Pro data sync completed",
                sync_count=self._sync_count,
                tournaments_synced=self._tournaments_synced,
                matches_synced=self._matches_synced,
            )

        except LeaguepediaError as e:
            self._errors += 1
            logger.error("Leaguepedia error during sync", error=str(e))
        except Exception as e:
            self._errors += 1
            logger.exception("Error during pro data sync", error=str(e))

    async def _sync_tournaments(
        self, leaguepedia: LeaguepediaService, year: int
    ) -> None:
        """Sync tournaments from Leaguepedia."""
        try:
            # Major leagues to track
            leagues = ["LEC", "LCK", "LPL", "LCS", "LFL", "PCS", "VCS", "CBLOL"]

            for league in leagues:
                tournaments = await leaguepedia.get_tournaments(
                    year=year,
                    league=league,
                    limit=20,
                )

                for tournament in tournaments:
                    await self._process_leaguepedia_tournament(tournament)
                    self._tournaments_synced += 1

                # Respect rate limit
                await asyncio.sleep(1)

        except LeaguepediaError as e:
            logger.warning("Failed to sync tournaments", error=str(e))

    async def _process_leaguepedia_tournament(self, data: dict) -> None:
        """Process tournament data from Leaguepedia."""
        try:
            name = data.get("Name")
            if not name:
                return

            # Parse dates
            start_date = None
            if data.get("DateStart"):
                try:
                    start_date = datetime.strptime(
                        data["DateStart"], "%Y-%m-%d"
                    ).replace(tzinfo=timezone.utc)
                except ValueError:
                    pass

            # Create slug from name
            slug = (
                name.lower()
                .replace(" ", "-")
                .replace("/", "-")
                .replace(":", "")
            )

            # Determine region from league
            region_map = {
                "LEC": "EMEA",
                "LCK": "Korea",
                "LPL": "China",
                "LCS": "North America",
                "LFL": "France",
                "PCS": "Pacific",
                "VCS": "Vietnam",
                "CBLOL": "Brazil",
            }
            league = data.get("League", "")
            region = region_map.get(league, data.get("Region"))

            await self.db.upsert_pro_tournament(
                external_id=f"leaguepedia:{data.get('OverviewPage', name)}",
                name=name,
                slug=slug,
                region=region,
                season=str(data.get("Year", "")),
                split=data.get("Split"),
                tier=2 if data.get("IsQualifier") else 1,
                status="completed" if data.get("Date") else "ongoing",
                start_date=start_date,
                metadata={
                    "source": "leaguepedia",
                    "overview_page": data.get("OverviewPage"),
                    "prizepool": data.get("Prizepool"),
                },
            )

        except Exception as e:
            logger.warning(
                "Failed to process Leaguepedia tournament",
                name=data.get("Name"),
                error=str(e),
            )

    async def _sync_recent_matches(self, leaguepedia: LeaguepediaService) -> None:
        """Sync recent matches for active tournaments."""
        try:
            # Get active tournaments
            tournaments = await self.db.get_active_pro_tournaments()

            for tournament in tournaments:
                overview_page = None
                metadata = tournament.get("metadata")
                if metadata and isinstance(metadata, dict):
                    overview_page = metadata.get("overview_page")

                if not overview_page:
                    continue

                # Get matches for this tournament
                matches = await leaguepedia.get_matches(
                    tournament_name=overview_page,
                    limit=50,
                )

                for match in matches:
                    await self._process_leaguepedia_match(
                        tournament["tournament_id"], match
                    )
                    self._matches_synced += 1

                # Respect rate limit
                await asyncio.sleep(1)

        except LeaguepediaError as e:
            logger.warning("Failed to sync recent matches", error=str(e))

    async def _process_leaguepedia_match(
        self, tournament_id: int, data: dict
    ) -> None:
        """Process match data from Leaguepedia."""
        try:
            match_id = data.get("MatchId")
            if not match_id:
                return

            # Find teams
            team1 = await self.db.find_team_by_name(data.get("Team1", ""))
            team2 = await self.db.find_team_by_name(data.get("Team2", ""))

            # Parse datetime
            scheduled_at = None
            if data.get("DateTime_UTC"):
                try:
                    scheduled_at = datetime.strptime(
                        data["DateTime_UTC"], "%Y-%m-%d %H:%M:%S"
                    ).replace(tzinfo=timezone.utc)
                except ValueError:
                    pass

            # Determine status
            status = "upcoming"
            if data.get("Winner"):
                status = "completed"
            elif scheduled_at and scheduled_at < datetime.now(timezone.utc):
                status = "completed"

            # Find winner
            winner_id = None
            if data.get("Winner") == "1" and team1:
                winner_id = team1["team_id"]
            elif data.get("Winner") == "2" and team2:
                winner_id = team2["team_id"]

            await self.db.upsert_pro_match(
                external_id=f"leaguepedia:{match_id}",
                tournament_id=tournament_id,
                team1_id=team1["team_id"] if team1 else None,
                team2_id=team2["team_id"] if team2 else None,
                team1_score=int(data.get("Team1Score", 0) or 0),
                team2_score=int(data.get("Team2Score", 0) or 0),
                winner_team_id=winner_id,
                format=f"bo{data.get('BestOf', 3)}",
                status=status,
                scheduled_at=scheduled_at,
                stream_url=data.get("Stream"),
                metadata={
                    "source": "leaguepedia",
                    "round": data.get("Round"),
                    "phase": data.get("Phase"),
                    "vod": data.get("VOD"),
                },
            )

        except Exception as e:
            logger.warning(
                "Failed to process Leaguepedia match",
                match_id=data.get("MatchId"),
                error=str(e),
            )

    async def _backfill_game_details(self, leaguepedia: LeaguepediaService) -> None:
        """Backfill game details for matches missing them."""
        try:
            # Get recent completed matches that might be missing game details
            recent_matches = await self.db.get_recent_pro_matches(limit=50)

            for match in recent_matches:
                metadata = match.get("metadata")
                if not metadata or not isinstance(metadata, dict):
                    continue

                if metadata.get("source") != "leaguepedia":
                    continue

                # Check if we have games for this match
                # (simplified - in production you'd query pro_games)
                external_id = match.get("external_id", "")
                if not external_id.startswith("leaguepedia:"):
                    continue

                match_id = external_id.replace("leaguepedia:", "")

                # Get games
                games = await leaguepedia.get_match_games(match_id)

                for game in games:
                    await self._process_leaguepedia_game(match["match_id"], game)

                # Respect rate limit
                await asyncio.sleep(1)

        except LeaguepediaError as e:
            logger.warning("Failed to backfill game details", error=str(e))

    async def _process_leaguepedia_game(
        self, match_id: int, data: dict
    ) -> None:
        """Process game data from Leaguepedia."""
        try:
            game_number = int(data.get("N_GameInMatch", 1) or 1)
            external_id = f"leaguepedia:{data.get('MatchId', '')}_{game_number}"

            # Find teams
            blue_team = await self.db.find_team_by_name(data.get("Blue", ""))
            red_team = await self.db.find_team_by_name(data.get("Red", ""))

            # Determine winner
            winner_id = None
            if data.get("Winner") == "1" and blue_team:
                winner_id = blue_team["team_id"]
            elif data.get("Winner") == "2" and red_team:
                winner_id = red_team["team_id"]

            # Parse duration
            duration = None
            if data.get("Duration"):
                try:
                    parts = data["Duration"].split(":")
                    if len(parts) == 2:
                        duration = int(parts[0]) * 60 + int(parts[1])
                except (ValueError, AttributeError):
                    pass

            await self.db.upsert_pro_game(
                external_id=external_id,
                match_id=match_id,
                game_number=game_number,
                blue_team_id=blue_team["team_id"] if blue_team else None,
                red_team_id=red_team["team_id"] if red_team else None,
                winner_team_id=winner_id,
                duration=duration,
                status="completed",
                metadata={
                    "source": "leaguepedia",
                    "vod": data.get("VOD"),
                    "match_history": data.get("MatchHistory"),
                },
            )

        except Exception as e:
            logger.warning(
                "Failed to process Leaguepedia game",
                game_id=data.get("MatchId"),
                error=str(e),
            )

    def get_metrics(self) -> dict:
        """Get job metrics for monitoring."""
        return {
            "sync_count": self._sync_count,
            "tournaments_synced": self._tournaments_synced,
            "matches_synced": self._matches_synced,
            "errors": self._errors,
        }
