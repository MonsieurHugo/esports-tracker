"""
Fetch Players Job
Periodically fetches and updates player stats from Riot API
"""

import structlog

from src.services.database import DatabaseService
from src.services.riot_api import RiotAPIService, RiotAPIError

logger = structlog.get_logger(__name__)


class FetchPlayersJob:
    """Job to fetch and update player statistics."""

    def __init__(self, db: DatabaseService, riot_api: RiotAPIService):
        self.db = db
        self.riot_api = riot_api

    async def run(self):
        """Execute the job."""
        logger.info("Starting fetch players job")

        try:
            # Get all active players
            players = await self.db.get_all_players()
            logger.info("Fetching stats for players", count=len(players))

            for player in players:
                await self._update_player(player)

            logger.info("Fetch players job completed", updated=len(players))

        except Exception as e:
            logger.exception("Fetch players job failed", error=str(e))

    async def _update_player(self, player):
        """Update a single player's stats."""
        try:
            # Get summoner info
            summoner = await self.riot_api.get_summoner_by_puuid(player["riot_puuid"])

            # Update summoner info
            await self.db.upsert_player(
                riot_puuid=player["riot_puuid"],
                summoner_name=summoner.get("name", player["summoner_name"]),
                summoner_id=summoner.get("id"),
                region=player["region"],
            )

            # Get league entries (ranked stats)
            league_entries = await self.riot_api.get_league_entries(summoner["id"])

            for entry in league_entries:
                await self.db.upsert_player_stats(
                    player_id=str(player["id"]),
                    queue_type=entry["queueType"],
                    tier=entry["tier"],
                    rank=entry["rank"],
                    lp=entry["leaguePoints"],
                    wins=entry["wins"],
                    losses=entry["losses"],
                )

            logger.debug(
                "Updated player stats",
                player=player["summoner_name"],
                entries=len(league_entries),
            )

        except RiotAPIError as e:
            if e.status_code == 404:
                logger.warning(
                    "Player not found",
                    player=player["summoner_name"],
                    puuid=player["riot_puuid"],
                )
            else:
                logger.error(
                    "Failed to update player",
                    player=player["summoner_name"],
                    error=str(e),
                )
