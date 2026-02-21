"""
GRID API HTTP Client

Provides rate-limited HTTP client for GRID API endpoints.
"""

import asyncio
from typing import Any

import httpx
import structlog

from src.config import settings

logger = structlog.get_logger(__name__)


class RateLimiter:
    """Simple rate limiter using token bucket algorithm."""

    def __init__(self, rate: int = 10, per: float = 1.0):
        """
        Initialize rate limiter.

        Args:
            rate: Number of requests allowed per time period
            per: Time period in seconds
        """
        self.rate = rate
        self.per = per
        self.tokens = rate
        self.last_update = asyncio.get_event_loop().time()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Wait until a request can be made."""
        async with self._lock:
            while True:
                now = asyncio.get_event_loop().time()
                elapsed = now - self.last_update
                self.tokens = min(self.rate, self.tokens + elapsed * (self.rate / self.per))
                self.last_update = now

                if self.tokens >= 1:
                    self.tokens -= 1
                    return

                # Wait for next token
                wait_time = (1 - self.tokens) * (self.per / self.rate)
                await asyncio.sleep(wait_time)


class GridClientError(Exception):
    """Base exception for GRID client errors."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class GridRateLimitError(GridClientError):
    """Raised when rate limited by GRID API."""

    pass


class GridAuthError(GridClientError):
    """Raised when authentication fails."""

    pass


class GridClient:
    """HTTP client for GRID API with rate limiting and retry logic."""

    CENTRAL_GRAPHQL = settings.grid_central_graphql_url
    LIVE_DATA_GRAPHQL = settings.grid_live_data_graphql_url
    FILE_DOWNLOAD_BASE = settings.grid_file_download_url

    def __init__(self, api_key: str | None = None, rate_limit: int | None = None):
        """
        Initialize GRID client.

        Args:
            api_key: GRID API key (defaults to settings)
            rate_limit: Requests per second (defaults to settings)
        """
        self.api_key = api_key or settings.grid_api_key
        self.rate_limit = rate_limit or settings.grid_api_rate_limit
        self._rate_limiter = RateLimiter(rate=self.rate_limit)
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "GridClient":
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.close()

    async def connect(self) -> None:
        """Initialize HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(120.0, connect=10.0),
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
                follow_redirects=True,  # Follow 301/302 redirects
            )
            logger.info(
                "GRID client connected",
                rate_limit=self.rate_limit,
                api_key_configured=bool(self.api_key),
            )

    async def close(self) -> None:
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
            logger.info("GRID client closed")

    def _get_headers(self) -> dict[str, str]:
        """Get headers for API requests."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key:
            headers["x-api-key"] = self.api_key
        return headers

    async def _request(
        self,
        method: str,
        url: str,
        max_retries: int = 5,
        **kwargs,
    ) -> httpx.Response:
        """
        Make a rate-limited HTTP request with retry logic.

        Args:
            method: HTTP method
            url: Request URL
            max_retries: Maximum number of retries for transient errors
            **kwargs: Additional arguments for httpx

        Returns:
            HTTP response

        Raises:
            GridClientError: On request failure
            GridRateLimitError: On rate limit (429)
            GridAuthError: On authentication failure (401, 403)
        """
        if self._client is None:
            await self.connect()

        headers = kwargs.pop("headers", {})
        headers.update(self._get_headers())

        for attempt in range(max_retries):
            await self._rate_limiter.acquire()

            try:
                response = await self._client.request(method, url, headers=headers, **kwargs)

                if response.status_code == 200:
                    return response

                if response.status_code == 429:
                    # Rate limited - exponential backoff
                    wait_time = min(30, 2 ** (attempt + 1))
                    retry_after = response.headers.get("Retry-After")
                    if retry_after:
                        wait_time = int(retry_after)
                    logger.warning(
                        "Rate limited by GRID API",
                        wait_time=wait_time,
                        attempt=attempt + 1,
                    )
                    await asyncio.sleep(wait_time)
                    continue

                if response.status_code in (401, 403):
                    raise GridAuthError(
                        f"Authentication failed: {response.status_code}",
                        status_code=response.status_code,
                    )

                if response.status_code >= 500:
                    # Server error - retry with backoff
                    wait_time = min(30, 2 ** (attempt + 1))
                    logger.warning(
                        "GRID API server error",
                        status_code=response.status_code,
                        wait_time=wait_time,
                        attempt=attempt + 1,
                    )
                    await asyncio.sleep(wait_time)
                    continue

                # Client error (4xx except 429, 401, 403)
                raise GridClientError(
                    f"Request failed: {response.status_code} - {response.text[:200]}",
                    status_code=response.status_code,
                )

            except httpx.TimeoutException as e:
                if attempt < max_retries - 1:
                    wait_time = min(30, 2 ** (attempt + 1))
                    logger.warning(
                        "GRID API request timeout",
                        url=url,
                        wait_time=wait_time,
                        attempt=attempt + 1,
                    )
                    await asyncio.sleep(wait_time)
                    continue
                raise GridClientError(f"Request timeout: {url}") from e

            except httpx.RequestError as e:
                if attempt < max_retries - 1:
                    wait_time = min(30, 2 ** (attempt + 1))
                    logger.warning(
                        "GRID API request error",
                        url=url,
                        error=str(e),
                        wait_time=wait_time,
                        attempt=attempt + 1,
                    )
                    await asyncio.sleep(wait_time)
                    continue
                raise GridClientError(f"Request error: {e}") from e

        raise GridRateLimitError("Max retries exceeded due to rate limiting")

    async def get(self, url: str, **kwargs) -> httpx.Response:
        """Make a GET request."""
        return await self._request("GET", url, **kwargs)

    async def post(self, url: str, **kwargs) -> httpx.Response:
        """Make a POST request."""
        return await self._request("POST", url, **kwargs)

    async def graphql(
        self,
        endpoint: str,
        query: str,
        variables: dict[str, Any] | None = None,
        max_retries: int = 5,
    ) -> dict[str, Any]:
        """
        Execute a GraphQL query with rate limit retry.

        Args:
            endpoint: GraphQL endpoint URL
            query: GraphQL query string
            variables: Query variables
            max_retries: Max retries for rate limit errors

        Returns:
            GraphQL response data

        Raises:
            GridClientError: On query failure or GraphQL errors
        """
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        for attempt in range(max_retries):
            response = await self.post(endpoint, json=payload)
            data = response.json()

            if "errors" in data:
                errors = data["errors"]
                error_msgs = [e.get("message", str(e)) for e in errors]
                joined = "; ".join(error_msgs)

                # Retry on rate limit errors with exponential backoff
                if "rate limit" in joined.lower() and attempt < max_retries - 1:
                    wait_time = min(60, 2 ** (attempt + 1))
                    logger.warning(
                        "GraphQL rate limited, retrying",
                        wait_time=wait_time,
                        attempt=attempt + 1,
                    )
                    await asyncio.sleep(wait_time)
                    continue

                raise GridClientError(f"GraphQL errors: {joined}")

            return data.get("data", {})

        raise GridRateLimitError("Max retries exceeded for GraphQL rate limiting")

    async def graphql_central(
        self,
        query: str,
        variables: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute a GraphQL query on the Central Data endpoint."""
        return await self.graphql(self.CENTRAL_GRAPHQL, query, variables)

    async def graphql_live(
        self,
        query: str,
        variables: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute a GraphQL query on the Live Data Feed endpoint."""
        return await self.graphql(self.LIVE_DATA_GRAPHQL, query, variables)
