"""
Riot Games API Service
"""

import asyncio
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)


class RiotAPIError(Exception):
    """Custom exception for Riot API errors."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"Riot API Error ({status_code}): {message}")


class RiotAPIService:
    """Service for interacting with Riot Games API."""

    REGIONS = {
        "EUW1": "https://euw1.api.riotgames.com",
        "NA1": "https://na1.api.riotgames.com",
        "KR": "https://kr.api.riotgames.com",
        "BR1": "https://br1.api.riotgames.com",
    }

    ROUTING_REGIONS = {
        "EUW1": "europe",
        "NA1": "americas",
        "KR": "asia",
        "BR1": "americas",
    }

    def __init__(self, api_key: str, region: str = "EUW1"):
        self.api_key = api_key
        self.region = region
        self.base_url = self.REGIONS.get(region, self.REGIONS["EUW1"])
        self.routing_region = self.ROUTING_REGIONS.get(region, "europe")
        self._client: httpx.AsyncClient | None = None
        self._rate_limit_remaining = 100
        self._rate_limit_reset = 0

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers={"X-Riot-Token": self.api_key},
                timeout=30.0,
            )
        return self._client

    async def _request(self, url: str, params: dict | None = None) -> dict[str, Any]:
        """Make a request to the Riot API with rate limiting."""
        client = await self._get_client()

        try:
            response = await client.get(url, params=params)

            # Update rate limit info
            if "X-App-Rate-Limit-Count" in response.headers:
                current, limit = response.headers["X-App-Rate-Limit-Count"].split(",")[0].split(":")
                self._rate_limit_remaining = int(limit) - int(current)

            if response.status_code == 429:
                # Rate limited - wait and retry
                retry_after = int(response.headers.get("Retry-After", 60))
                logger.warning("Rate limited", retry_after=retry_after)
                await asyncio.sleep(retry_after)
                return await self._request(url, params)

            if response.status_code == 404:
                raise RiotAPIError(404, "Resource not found")

            response.raise_for_status()
            return response.json()

        except httpx.HTTPStatusError as e:
            raise RiotAPIError(e.response.status_code, str(e))

    # ==========================================
    # Summoner API
    # ==========================================

    async def get_summoner_by_name(self, summoner_name: str, tag_line: str = "EUW") -> dict[str, Any]:
        """Get summoner by Riot ID (name#tag)."""
        url = f"https://{self.routing_region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{summoner_name}/{tag_line}"
        return await self._request(url)

    async def get_summoner_by_puuid(self, puuid: str) -> dict[str, Any]:
        """Get summoner by PUUID."""
        url = f"{self.base_url}/lol/summoner/v4/summoners/by-puuid/{puuid}"
        return await self._request(url)

    # ==========================================
    # League API
    # ==========================================

    async def get_league_entries(self, summoner_id: str) -> list[dict[str, Any]]:
        """Get ranked stats for a summoner."""
        url = f"{self.base_url}/lol/league/v4/entries/by-summoner/{summoner_id}"
        return await self._request(url)

    # ==========================================
    # Match API
    # ==========================================

    async def get_match_ids(
        self,
        puuid: str,
        start: int = 0,
        count: int = 20,
        queue: int | None = None,
    ) -> list[str]:
        """Get match IDs for a player."""
        url = f"https://{self.routing_region}.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids"
        params = {"start": start, "count": count}
        if queue:
            params["queue"] = queue
        return await self._request(url, params)

    async def get_match(self, match_id: str) -> dict[str, Any]:
        """Get match details."""
        url = f"https://{self.routing_region}.api.riotgames.com/lol/match/v5/matches/{match_id}"
        return await self._request(url)

    # ==========================================
    # Cleanup
    # ==========================================

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
