"""
Fetch Matches Job
Periodically fetches match history from Riot API
"""

import structlog

from src.services.database import DatabaseService
from src.services.riot_api import RiotAPIService, RiotAPIError

logger = structlog.get_logger(__name__)


class FetchMatchesJob:
    """Job to fetch and store match history."""

    def __init__(self, db: DatabaseService, riot_api: RiotAPIService):
        self.db = db
        self.riot_api = riot_api

    async def run(self):
        """Execute the job."""
        logger.info("Starting fetch matches job")

        try:
            # Get all active players
            players = await self.db.get_all_players()
            logger.info("Fetching matches for players", count=len(players))

            total_new_matches = 0

            for player in players:
                new_matches = await self._fetch_player_matches(player)
                total_new_matches += new_matches

            logger.info(
                "Fetch matches job completed",
                players=len(players),
                new_matches=total_new_matches,
            )

        except Exception as e:
            logger.exception("Fetch matches job failed", error=str(e))

    async def _fetch_player_matches(self, player) -> int:
        """Fetch matches for a single player."""
        new_matches = 0

        try:
            # Get recent match IDs (last 20 matches)
            match_ids = await self.riot_api.get_match_ids(
                puuid=player["riot_puuid"],
                count=20,
            )

            for match_id in match_ids:
                # Check if we already have this match
                existing = await self.db.get_match_by_riot_id(match_id)
                if existing:
                    continue

                # Fetch and store new match
                try:
                    match_data = await self.riot_api.get_match(match_id)
                    await self._store_match(match_data)
                    new_matches += 1
                except RiotAPIError as e:
                    logger.warning(
                        "Failed to fetch match",
                        match_id=match_id,
                        error=str(e),
                    )

            logger.debug(
                "Fetched player matches",
                player=player["summoner_name"],
                new_matches=new_matches,
            )

        except RiotAPIError as e:
            logger.error(
                "Failed to fetch match IDs",
                player=player["summoner_name"],
                error=str(e),
            )

        return new_matches

    async def _store_match(self, match_data: dict):
        """Store match data in database."""
        info = match_data.get("info", {})

        await self.db.insert_match(
            riot_match_id=match_data["metadata"]["matchId"],
            game_mode=info.get("gameMode", "UNKNOWN"),
            game_duration=info.get("gameDuration", 0),
            game_start_at=info.get("gameStartTimestamp", 0),
        )

        # TODO: Store participant data
        # for participant in info.get("participants", []):
        #     await self._store_participant(match_id, participant)
