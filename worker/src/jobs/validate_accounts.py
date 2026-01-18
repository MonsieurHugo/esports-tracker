"""
Validate Accounts Job
Validates accounts that were added without a PUUID by fetching from Riot API
"""

import asyncio

import structlog

from src.services.database import DatabaseService
from src.services.riot_api import RiotAPIService, RiotAPIError, RateLimiter

logger = structlog.get_logger(__name__)


class ValidateAccountsJob:
    """Job to validate accounts without PUUID by fetching from Riot API."""

    def __init__(self, db: DatabaseService, api_key: str):
        self.db = db
        self.api_key = api_key
        self._region_clients: dict[str, RiotAPIService] = {}

    def _get_region_client(self, region: str) -> RiotAPIService:
        """Get or create a Riot API client for a specific region."""
        if region not in self._region_clients:
            rate_limiter = RateLimiter()
            self._region_clients[region] = RiotAPIService(
                api_key=self.api_key,
                region=region,
                rate_limiter=rate_limiter,
            )
        return self._region_clients[region]

    async def run(self) -> int:
        """Execute the validation job.

        Returns:
            Number of accounts successfully validated.
        """
        try:
            accounts = await self.db.get_accounts_without_puuid()

            if not accounts:
                logger.debug("No accounts pending validation")
                return 0

            logger.info("Found accounts pending validation", count=len(accounts))

            validated_count = 0
            for account in accounts:
                try:
                    success = await self._validate_account(account)
                    if success:
                        validated_count += 1
                except Exception as e:
                    logger.error(
                        "Failed to validate account",
                        account_id=account["account_id"],
                        game_name=account["game_name"],
                        tag_line=account["tag_line"],
                        error=str(e),
                    )
                    await self.db.log_worker_activity(
                        log_type="error",
                        severity="error",
                        message=f"Failed to validate account: {e}",
                        account_name=f"{account['game_name']}#{account['tag_line']}",
                    )

            if validated_count > 0:
                logger.info("Accounts validated", count=validated_count)

            return validated_count

        except Exception as e:
            logger.exception("Validate accounts job failed", error=str(e))
            return 0
        finally:
            await self._cleanup()

    async def _validate_account(self, account) -> bool:
        """Validate a single account by fetching its PUUID from Riot API.

        Args:
            account: Account record with account_id, game_name, tag_line, region

        Returns:
            True if validation succeeded, False otherwise.
        """
        game_name = account["game_name"]
        tag_line = account["tag_line"]
        region = account["region"] or "EUW"
        account_id = account["account_id"]

        if not game_name or not tag_line:
            logger.warning(
                "Account missing game_name or tag_line",
                account_id=account_id,
            )
            return False

        riot_api = self._get_region_client(region)

        try:
            # Fetch account info from Riot API using Riot ID (gameName#tagLine)
            account_data = await riot_api.get_summoner_by_name(game_name, tag_line)

            if not account_data:
                logger.warning(
                    "No data returned for account",
                    game_name=game_name,
                    tag_line=tag_line,
                )
                return False

            puuid = account_data.get("puuid")
            if not puuid:
                logger.warning(
                    "No PUUID in response",
                    game_name=game_name,
                    tag_line=tag_line,
                )
                return False

            # Update the account with the PUUID
            await self.db.update_account_puuid(account_id, puuid)

            logger.info(
                "Account validated successfully",
                account_id=account_id,
                game_name=game_name,
                tag_line=tag_line,
                puuid=puuid[:8] + "...",  # Log partial PUUID for privacy
            )

            await self.db.log_worker_activity(
                log_type="info",
                severity="info",
                message=f"Account validated: {game_name}#{tag_line}",
                account_name=f"{game_name}#{tag_line}",
                account_puuid=puuid,
            )

            return True

        except RiotAPIError as e:
            if e.status_code == 404:
                logger.warning(
                    "Account not found on Riot API",
                    account_id=account_id,
                    game_name=game_name,
                    tag_line=tag_line,
                )
                await self.db.log_worker_activity(
                    log_type="warning",
                    severity="warning",
                    message=f"Account not found: {game_name}#{tag_line}",
                    account_name=f"{game_name}#{tag_line}",
                )
            elif e.status_code == 429:
                logger.warning(
                    "Rate limited while validating account",
                    account_id=account_id,
                    game_name=game_name,
                    tag_line=tag_line,
                )
            else:
                logger.error(
                    "Riot API error while validating account",
                    account_id=account_id,
                    game_name=game_name,
                    tag_line=tag_line,
                    status_code=e.status_code,
                    error=str(e),
                )
            return False

    async def _cleanup(self) -> None:
        """Clean up region clients."""
        for client in self._region_clients.values():
            await client.close()
        self._region_clients.clear()
