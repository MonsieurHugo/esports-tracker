"""
Fetch Players Job
Periodically fetches and updates player ranks from Riot API
"""

import asyncio
from collections import defaultdict

import structlog

from src.services.database import DatabaseService
from src.services.riot_api import RiotAPIService, RiotAPIError, RateLimiter

logger = structlog.get_logger(__name__)


class FetchPlayersJob:
    """Job to fetch and update player ranks."""

    def __init__(self, db: DatabaseService, riot_api: RiotAPIService):
        self.db = db
        self.riot_api = riot_api
        self._region_clients: dict[str, RiotAPIService] = {}

    def _get_region_client(self, region: str) -> RiotAPIService:
        """Get or create a Riot API client for a specific region."""
        if region not in self._region_clients:
            rate_limiter = RateLimiter()
            self._region_clients[region] = RiotAPIService(
                api_key=self.riot_api.api_key,
                region=region,
                rate_limiter=rate_limiter,
            )
        return self._region_clients[region]

    async def run(self):
        """Execute the job."""
        logger.info("Starting fetch players rank job")

        try:
            # Get all active accounts
            accounts = await self.db.get_accounts_for_rank_update()
            logger.info("Fetching ranks for accounts", count=len(accounts))

            # Group by region for parallel processing
            accounts_by_region: dict[str, list] = defaultdict(list)
            for account in accounts:
                region = account["region"] or "EUW"
                accounts_by_region[region].append(account)

            # Process each region in parallel
            tasks = [
                self._process_region(region, region_accounts)
                for region, region_accounts in accounts_by_region.items()
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Count results
            total_updated = 0
            for region, result in zip(accounts_by_region.keys(), results):
                if isinstance(result, Exception):
                    logger.error("Region rank update failed", region=region, error=str(result))
                else:
                    total_updated += result

            logger.info("Fetch players rank job completed", updated=total_updated)

        except Exception as e:
            logger.exception("Fetch players rank job failed", error=str(e))
        finally:
            # Cleanup region clients
            for client in self._region_clients.values():
                await client.close()
            self._region_clients.clear()

    async def _process_region(self, region: str, accounts: list) -> int:
        """Process all accounts for a region."""
        riot_api = self._get_region_client(region)
        updated = 0

        for account in accounts:
            try:
                success = await self._update_account_rank(riot_api, account)
                if success:
                    updated += 1
            except Exception as e:
                logger.error(
                    "Failed to update rank for account",
                    puuid=account["puuid"],
                    game_name=account["game_name"],
                    error=str(e),
                )

        return updated

    async def _update_account_rank(self, riot_api: RiotAPIService, account) -> bool:
        """Update rank for a single account."""
        puuid = account["puuid"]
        game_name = f"{account['game_name']}#{account['tag_line']}"

        try:
            # Get summoner info to get summoner_id
            summoner = await riot_api.get_summoner_by_puuid(puuid)
            summoner_id = summoner.get("id")

            if not summoner_id:
                logger.warning("No summoner_id found", game_name=game_name)
                return False

            # Get league entries (ranked stats)
            league_entries = await riot_api.get_league_entries(summoner_id)

            if not league_entries:
                logger.debug("No ranked data", game_name=game_name)
                return False

            # Update each queue type
            for entry in league_entries:
                await self.db.upsert_current_rank(
                    puuid=puuid,
                    queue_type=entry["queueType"],
                    tier=entry.get("tier"),
                    rank=entry.get("rank"),
                    league_points=entry.get("leaguePoints", 0),
                    wins=entry.get("wins", 0),
                    losses=entry.get("losses", 0),
                )

            logger.debug(
                "Updated rank",
                game_name=game_name,
                entries=len(league_entries),
            )
            return True

        except RiotAPIError as e:
            if e.status_code == 404:
                logger.debug("Account not found", game_name=game_name)
            else:
                logger.warning("API error updating rank", game_name=game_name, error=str(e))
            return False
