"""
GRID Esports API Service
API for fetching professional League of Legends match data
"""

import asyncio
import time
from collections import deque
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)


class GridAPIError(Exception):
    """Custom exception for GRID API errors."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"GRID API Error ({status_code}): {message}")


class GridRateLimiter:
    """Rate limiter for GRID API requests.

    Implements a sliding window rate limiter.
    Default: 10 requests per second.
    """

    def __init__(self, requests_per_second: int = 10):
        self.limit = requests_per_second
        self.window: deque[float] = deque(maxlen=self.limit * 2)
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Wait if necessary before making a request."""
        async with self._lock:
            now = time.time()

            # Clean up old entries (older than 1 second)
            while self.window and self.window[0] < now - 1:
                self.window.popleft()

            # Wait if limit reached
            if len(self.window) >= self.limit:
                wait_time = 1 - (now - self.window[0])
                if wait_time > 0:
                    logger.debug("GRID rate limit: waiting", wait=wait_time)
                    await asyncio.sleep(wait_time)
                    now = time.time()

            # Record this request
            self.window.append(now)


class GridAPIService:
    """Service for interacting with GRID Esports API.

    GRID API provides professional esports match data including:
    - Tournament information
    - Match schedules and results
    - Game details (drafts, objectives)
    - Player performance stats

    SECURITY NOTE: Never log self.api_key or full request/response
    objects as they may contain the API key.
    """

    BASE_URL = "https://api.grid.gg"

    def __init__(
        self,
        api_key: str,
        rate_limiter: GridRateLimiter | None = None,
    ):
        self.api_key = api_key
        self._client: httpx.AsyncClient | None = None
        self._rate_limiter = rate_limiter or GridRateLimiter()

    def __repr__(self) -> str:
        """Return a safe string representation that does not expose the API key."""
        return f"GridAPIService(base_url={self.BASE_URL!r})"

    def __str__(self) -> str:
        """Return a safe string representation that does not expose the API key."""
        return self.__repr__()

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=httpx.Timeout(30.0, connect=10.0, pool=5.0),
                limits=httpx.Limits(max_connections=50, max_keepalive_connections=10),
            )
        return self._client

    async def _request(
        self,
        method: str,
        endpoint: str,
        params: dict | None = None,
        json_data: dict | None = None,
    ) -> dict[str, Any] | list[Any]:
        """Make a request to the GRID API with rate limiting.

        SECURITY NOTE: This method must never log full request/response objects.
        """
        # Wait for rate limiter
        await self._rate_limiter.acquire()

        client = await self._get_client()
        url = f"{self.BASE_URL}{endpoint}"

        try:
            if method == "GET":
                response = await client.get(url, params=params)
            elif method == "POST":
                response = await client.post(url, params=params, json=json_data)
            else:
                raise ValueError(f"Unsupported method: {method}")

            if response.status_code == 401:
                raise GridAPIError(401, "Unauthorized - check API key")

            if response.status_code == 403:
                raise GridAPIError(403, "Forbidden - insufficient permissions")

            if response.status_code == 404:
                raise GridAPIError(404, "Resource not found")

            if response.status_code == 429:
                # Rate limited - wait and retry
                retry_after = int(response.headers.get("Retry-After", 60))
                logger.warning("GRID API rate limited", retry_after=retry_after)
                await asyncio.sleep(min(retry_after, 60))
                return await self._request(method, endpoint, params, json_data)

            response.raise_for_status()

            try:
                return response.json()
            except ValueError as e:
                raise GridAPIError(500, f"Invalid JSON response: {e}")

        except httpx.HTTPStatusError as e:
            raise GridAPIError(e.response.status_code, str(e))
        except httpx.RequestError as e:
            raise GridAPIError(0, f"Request failed: {e}")

    # ==========================================
    # Tournament API
    # ==========================================

    async def get_tournaments(
        self,
        game: str = "lol",
        status: str | None = None,
        region: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Get list of tournaments.

        Args:
            game: Game identifier (default: "lol")
            status: Filter by status (upcoming, ongoing, completed)
            region: Filter by region (e.g., "EMEA", "Korea")
            limit: Number of results per page
            offset: Offset for pagination

        Returns:
            Dictionary with tournaments list and pagination info
        """
        params = {
            "game": game,
            "limit": limit,
            "offset": offset,
        }
        if status:
            params["status"] = status
        if region:
            params["region"] = region

        return await self._request("GET", "/central-data/tournaments", params)

    async def get_tournament(self, tournament_id: str) -> dict[str, Any]:
        """Get tournament details by ID.

        Args:
            tournament_id: GRID tournament ID

        Returns:
            Tournament details including stages and standings
        """
        return await self._request("GET", f"/central-data/tournaments/{tournament_id}")

    async def get_tournament_standings(self, tournament_id: str) -> dict[str, Any]:
        """Get current standings for a tournament.

        Args:
            tournament_id: GRID tournament ID

        Returns:
            Current standings by stage
        """
        return await self._request(
            "GET", f"/central-data/tournaments/{tournament_id}/standings"
        )

    # ==========================================
    # Match API
    # ==========================================

    async def get_matches(
        self,
        tournament_id: str | None = None,
        team_id: str | None = None,
        status: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Get list of matches.

        Args:
            tournament_id: Filter by tournament
            team_id: Filter by team participation
            status: Filter by status (upcoming, live, completed)
            start_date: Filter by start date (ISO format)
            end_date: Filter by end date (ISO format)
            limit: Number of results per page
            offset: Offset for pagination

        Returns:
            Dictionary with matches list and pagination info
        """
        params = {
            "game": "lol",
            "limit": limit,
            "offset": offset,
        }
        if tournament_id:
            params["tournamentId"] = tournament_id
        if team_id:
            params["teamId"] = team_id
        if status:
            params["status"] = status
        if start_date:
            params["startDate"] = start_date
        if end_date:
            params["endDate"] = end_date

        return await self._request("GET", "/central-data/matches", params)

    async def get_match(self, match_id: str) -> dict[str, Any]:
        """Get match details by ID.

        Args:
            match_id: GRID match ID

        Returns:
            Match details including scores and schedule
        """
        return await self._request("GET", f"/central-data/matches/{match_id}")

    async def get_live_matches(self) -> dict[str, Any]:
        """Get currently live matches.

        Returns:
            List of matches with status 'live'
        """
        return await self.get_matches(status="live")

    async def get_upcoming_matches(
        self,
        hours_ahead: int = 24,
        limit: int = 20,
    ) -> dict[str, Any]:
        """Get upcoming matches within a time window.

        Args:
            hours_ahead: How many hours ahead to look
            limit: Number of results

        Returns:
            List of upcoming matches sorted by schedule
        """
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        end = now + timedelta(hours=hours_ahead)

        return await self.get_matches(
            status="upcoming",
            start_date=now.isoformat(),
            end_date=end.isoformat(),
            limit=limit,
        )

    # ==========================================
    # Game API
    # ==========================================

    async def get_match_games(self, match_id: str) -> dict[str, Any]:
        """Get games for a specific match.

        Args:
            match_id: GRID match ID

        Returns:
            List of games in the match with basic info
        """
        return await self._request("GET", f"/central-data/matches/{match_id}/games")

    async def get_game(self, game_id: str) -> dict[str, Any]:
        """Get detailed game data.

        Args:
            game_id: GRID game ID

        Returns:
            Game details including draft, objectives, timeline
        """
        return await self._request("GET", f"/central-data/games/{game_id}")

    async def get_game_draft(self, game_id: str) -> dict[str, Any]:
        """Get draft/pick-ban data for a game.

        Args:
            game_id: GRID game ID

        Returns:
            Draft information with picks and bans in order
        """
        return await self._request("GET", f"/central-data/games/{game_id}/draft")

    async def get_game_stats(self, game_id: str) -> dict[str, Any]:
        """Get player statistics for a game.

        Args:
            game_id: GRID game ID

        Returns:
            Player stats including KDA, CS, gold, damage, etc.
        """
        return await self._request("GET", f"/central-data/games/{game_id}/stats")

    async def get_game_timeline(self, game_id: str) -> dict[str, Any]:
        """Get timeline events for a game.

        Args:
            game_id: GRID game ID

        Returns:
            Timeline with kills, objectives, and other events
        """
        return await self._request("GET", f"/central-data/games/{game_id}/timeline")

    # ==========================================
    # Team API
    # ==========================================

    async def get_team(self, team_id: str) -> dict[str, Any]:
        """Get team information.

        Args:
            team_id: GRID team ID

        Returns:
            Team details including roster
        """
        return await self._request("GET", f"/central-data/teams/{team_id}")

    async def get_team_matches(
        self,
        team_id: str,
        status: str | None = None,
        limit: int = 20,
    ) -> dict[str, Any]:
        """Get matches for a specific team.

        Args:
            team_id: GRID team ID
            status: Filter by status
            limit: Number of results

        Returns:
            List of team's matches
        """
        return await self.get_matches(team_id=team_id, status=status, limit=limit)

    # ==========================================
    # Player API
    # ==========================================

    async def get_player(self, player_id: str) -> dict[str, Any]:
        """Get player information.

        Args:
            player_id: GRID player ID

        Returns:
            Player details
        """
        return await self._request("GET", f"/central-data/players/{player_id}")

    async def get_player_stats(
        self,
        player_id: str,
        tournament_id: str | None = None,
    ) -> dict[str, Any]:
        """Get aggregated stats for a player.

        Args:
            player_id: GRID player ID
            tournament_id: Optional tournament filter

        Returns:
            Aggregated player statistics
        """
        params = {}
        if tournament_id:
            params["tournamentId"] = tournament_id

        return await self._request(
            "GET", f"/central-data/players/{player_id}/stats", params
        )

    # ==========================================
    # Series API (Head-to-Head)
    # ==========================================

    async def get_head_to_head(
        self,
        team1_id: str,
        team2_id: str,
        limit: int = 10,
    ) -> dict[str, Any]:
        """Get head-to-head history between two teams.

        Args:
            team1_id: First team ID
            team2_id: Second team ID
            limit: Number of past matches

        Returns:
            Head-to-head stats and recent matches
        """
        params = {
            "team1Id": team1_id,
            "team2Id": team2_id,
            "limit": limit,
        }
        return await self._request("GET", "/central-data/head-to-head", params)

    # ==========================================
    # Cleanup
    # ==========================================

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
