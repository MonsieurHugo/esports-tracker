"""
Riot Games API Service with Rate Limiting
"""

import asyncio
import time
from collections import deque
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


class RateLimiter:
    """Rate limiter for Riot API requests.

    Implements a sliding window rate limiter that respects both:
    - Short-term limit (requests per second)
    - Long-term limit (requests per 2 minutes)
    """

    def __init__(self, requests_per_second: int = 20, requests_per_2min: int = 100):
        self.short_limit = requests_per_second
        self.long_limit = requests_per_2min
        self.short_window: deque[float] = deque()
        self.long_window: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Wait if necessary before making a request."""
        async with self._lock:
            now = time.time()

            # Clean up old entries
            while self.short_window and self.short_window[0] < now - 1:
                self.short_window.popleft()
            while self.long_window and self.long_window[0] < now - 120:
                self.long_window.popleft()

            # Wait if short-term limit reached
            if len(self.short_window) >= self.short_limit:
                wait_time = 1 - (now - self.short_window[0])
                if wait_time > 0:
                    logger.debug("Rate limit: waiting for short-term limit", wait=wait_time)
                    await asyncio.sleep(wait_time)
                    now = time.time()

            # Wait if long-term limit reached
            if len(self.long_window) >= self.long_limit:
                wait_time = 120 - (now - self.long_window[0])
                if wait_time > 0:
                    logger.debug("Rate limit: waiting for long-term limit", wait=wait_time)
                    await asyncio.sleep(wait_time)
                    now = time.time()

            # Record this request
            self.short_window.append(now)
            self.long_window.append(now)


class RiotAPIService:
    """Service for interacting with Riot Games API."""

    REGIONS = {
        "EUW": "https://euw1.api.riotgames.com",
        "EUW1": "https://euw1.api.riotgames.com",
        "NA": "https://na1.api.riotgames.com",
        "NA1": "https://na1.api.riotgames.com",
        "KR": "https://kr.api.riotgames.com",
        "BR": "https://br1.api.riotgames.com",
        "BR1": "https://br1.api.riotgames.com",
    }

    ROUTING_REGIONS = {
        "EUW": "europe",
        "EUW1": "europe",
        "NA": "americas",
        "NA1": "americas",
        "KR": "asia",
        "BR": "americas",
        "BR1": "americas",
    }

    def __init__(
        self,
        api_key: str,
        region: str = "EUW",
        rate_limiter: RateLimiter | None = None,
    ):
        self.api_key = api_key
        self.region = region
        self.base_url = self.REGIONS.get(region, self.REGIONS["EUW"])
        self.routing_region = self.ROUTING_REGIONS.get(region, "europe")
        self._client: httpx.AsyncClient | None = None
        self._rate_limiter = rate_limiter or RateLimiter()

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers={"X-Riot-Token": self.api_key},
                timeout=30.0,
            )
        return self._client

    async def _request(
        self,
        url: str,
        params: dict | None = None,
        _retry_count: int = 0,
    ) -> dict[str, Any] | list[Any]:
        """Make a request to the Riot API with rate limiting."""
        MAX_RETRIES = 3

        # Wait for rate limiter
        await self._rate_limiter.acquire()

        client = await self._get_client()

        try:
            response = await client.get(url, params=params)

            if response.status_code == 429:
                # Rate limited by API - wait and retry
                if _retry_count >= MAX_RETRIES:
                    raise RiotAPIError(429, f"Rate limited after {MAX_RETRIES} retries")
                retry_after = int(response.headers.get("Retry-After", 60))
                logger.warning("Rate limited by API", retry_after=retry_after, retry=_retry_count + 1)
                await asyncio.sleep(retry_after)
                return await self._request(url, params, _retry_count + 1)

            if response.status_code == 404:
                raise RiotAPIError(404, "Resource not found")

            response.raise_for_status()

            try:
                return response.json()
            except ValueError as e:
                raise RiotAPIError(500, f"Invalid JSON response: {e}")

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
        """Get ranked stats for a summoner (deprecated - use get_league_entries_by_puuid)."""
        url = f"{self.base_url}/lol/league/v4/entries/by-summoner/{summoner_id}"
        return await self._request(url)

    async def get_league_entries_by_puuid(self, puuid: str) -> list[dict[str, Any]]:
        """Get ranked stats by PUUID (no summoner_id needed)."""
        url = f"{self.base_url}/lol/league/v4/entries/by-puuid/{puuid}"
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
        start_time: int | None = None,
        end_time: int | None = None,
    ) -> list[str]:
        """Get match IDs for a player.

        Args:
            puuid: Player's PUUID
            start: Index to start from (pagination)
            count: Number of matches to return (max 100)
            queue: Queue ID filter (420=Solo/Duo, 440=Flex)
            start_time: Epoch timestamp in seconds - only matches after this time
            end_time: Epoch timestamp in seconds - only matches before this time
        """
        url = f"https://{self.routing_region}.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids"
        params = {"start": start, "count": count}
        if queue is not None:
            params["queue"] = queue
        if start_time is not None:
            params["startTime"] = start_time
        if end_time is not None:
            params["endTime"] = end_time
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
