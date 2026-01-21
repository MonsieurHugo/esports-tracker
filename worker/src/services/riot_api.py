"""
Riot Games API Service with Rate Limiting
"""

import asyncio
import random
import time
from collections import deque
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)


# Exponential backoff configuration
BACKOFF_BASE_DELAY = 1.0  # Base delay in seconds
BACKOFF_MULTIPLIER = 2.0  # Multiply delay by this on each retry
BACKOFF_MAX_DELAY = 60.0  # Maximum delay in seconds
BACKOFF_JITTER = 0.2  # ±20% jitter
BACKOFF_MAX_RETRIES = 5  # Maximum number of retries


def calculate_backoff_delay(retry_count: int, retry_after: int | None = None) -> float:
    """Calculate exponential backoff delay with jitter.

    Args:
        retry_count: Current retry attempt (0-indexed)
        retry_after: Optional Retry-After header value from API (capped at max delay)

    Returns:
        Delay in seconds with jitter applied
    """
    if retry_after is not None:
        # Respect Retry-After but cap at max delay
        base_delay = min(retry_after, BACKOFF_MAX_DELAY)
    else:
        # Exponential backoff: base * (multiplier ^ retry_count)
        base_delay = BACKOFF_BASE_DELAY * (BACKOFF_MULTIPLIER ** retry_count)
        base_delay = min(base_delay, BACKOFF_MAX_DELAY)

    # Apply ±20% jitter to avoid thundering herd
    jitter_factor = 1.0 - BACKOFF_JITTER + (random.random() * 2 * BACKOFF_JITTER)
    return base_delay * jitter_factor


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
        self.short_window: deque[float] = deque(maxlen=self.short_limit * 2)
        self.long_window: deque[float] = deque(maxlen=self.long_limit * 2)
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
    """Service for interacting with Riot Games API.

    SECURITY NOTE: Never log self.api_key, self._client.headers, or full request/response
    objects as they may contain the API key. Only log sanitized information like URL paths,
    status codes, and timing data.
    """

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

    def __repr__(self) -> str:
        """Return a safe string representation that does not expose the API key."""
        return f"RiotAPIService(region={self.region!r}, base_url={self.base_url!r})"

    def __str__(self) -> str:
        """Return a safe string representation that does not expose the API key."""
        return self.__repr__()

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers={"X-Riot-Token": self.api_key},
                timeout=httpx.Timeout(10.0, connect=5.0, pool=5.0),
                limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            )
        return self._client

    async def _request(
        self,
        url: str,
        params: dict | None = None,
        _retry_count: int = 0,
    ) -> dict[str, Any] | list[Any]:
        """Make a request to the Riot API with rate limiting and exponential backoff.

        Implements exponential backoff with jitter for retries:
        - Base delay: 1s, multiplied by 2x on each retry
        - Max delay: 60s (caps both calculated backoff and Retry-After header)
        - Jitter: ±20% to avoid thundering herd
        - Max retries: 5

        SECURITY NOTE: This method must never log full request/response objects, headers,
        or the URL with query parameters as they may contain sensitive information.
        Only log status codes, timing data, and sanitized URL paths.
        """
        # Wait for rate limiter
        await self._rate_limiter.acquire()

        client = await self._get_client()

        try:
            response = await client.get(url, params=params)

            if response.status_code == 429:
                # Rate limited by API - use exponential backoff
                if _retry_count >= BACKOFF_MAX_RETRIES:
                    raise RiotAPIError(429, f"Rate limited after {BACKOFF_MAX_RETRIES} retries")

                # Get Retry-After header if present (may be very long like 1800s)
                retry_after_header = response.headers.get("Retry-After")
                retry_after = int(retry_after_header) if retry_after_header else None

                # Calculate backoff delay (caps Retry-After at 60s)
                delay = calculate_backoff_delay(_retry_count, retry_after)

                logger.warning(
                    "Rate limited by API, using exponential backoff",
                    retry_after_header=retry_after,
                    actual_delay=round(delay, 2),
                    retry=_retry_count + 1,
                    max_retries=BACKOFF_MAX_RETRIES,
                )
                await asyncio.sleep(delay)
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
