"""
Leaguepedia (Liquipedia) Service
For fetching historical esports data via Cargo queries
"""

import asyncio
from typing import Any
from urllib.parse import quote

import httpx
import structlog

logger = structlog.get_logger(__name__)


class LeaguepediaError(Exception):
    """Custom exception for Leaguepedia API errors."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(f"Leaguepedia Error: {message}")


class LeaguepediaService:
    """Service for querying Leaguepedia via Cargo API.

    Leaguepedia uses MediaWiki with Cargo extension for structured data.
    This service provides methods to query:
    - Tournament information
    - Match results
    - Player rosters
    - Team information
    - Pick/ban data

    Note: Rate limit is approximately 1 request per second.
    """

    BASE_URL = "https://lol.fandom.com/api.php"

    # Common Cargo tables
    TABLES = {
        "tournaments": "Tournaments",
        "matches": "MatchSchedule",
        "games": "MatchScheduleGame",
        "scoreboard_players": "ScoreboardPlayers",
        "scoreboard_games": "ScoreboardGames",
        "picks_bans": "PicksAndBansS7",
        "team_rosters": "TournamentRosters",
        "teams": "Teams",
        "players": "Players",
    }

    def __init__(self):
        self._client: httpx.AsyncClient | None = None
        self._lock = asyncio.Lock()
        self._last_request_time: float = 0

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers={
                    "User-Agent": "EsportsTracker/1.0 (https://github.com/esports-tracker)",
                    "Accept": "application/json",
                },
                timeout=httpx.Timeout(60.0, connect=10.0),
            )
        return self._client

    async def _rate_limit(self) -> None:
        """Enforce rate limiting (1 request per second)."""
        import time

        async with self._lock:
            now = time.time()
            elapsed = now - self._last_request_time

            if elapsed < 1.0:
                await asyncio.sleep(1.0 - elapsed)

            self._last_request_time = time.time()

    async def _cargo_query(
        self,
        tables: str,
        fields: str,
        where: str | None = None,
        join_on: str | None = None,
        group_by: str | None = None,
        order_by: str | None = None,
        limit: int = 500,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """Execute a Cargo query.

        Args:
            tables: Cargo table(s) to query
            fields: Fields to retrieve
            where: WHERE clause conditions
            join_on: JOIN conditions for multiple tables
            group_by: GROUP BY clause
            order_by: ORDER BY clause
            limit: Maximum results (max 500)
            offset: Offset for pagination

        Returns:
            List of result dictionaries
        """
        await self._rate_limit()
        client = await self._get_client()

        params = {
            "action": "cargoquery",
            "format": "json",
            "tables": tables,
            "fields": fields,
            "limit": min(limit, 500),
            "offset": offset,
        }

        if where:
            params["where"] = where
        if join_on:
            params["join_on"] = join_on
        if group_by:
            params["group_by"] = group_by
        if order_by:
            params["order_by"] = order_by

        try:
            response = await client.get(self.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

            if "error" in data:
                raise LeaguepediaError(data["error"].get("info", "Unknown error"))

            results = data.get("cargoquery", [])
            return [item.get("title", {}) for item in results]

        except httpx.HTTPStatusError as e:
            raise LeaguepediaError(f"HTTP error: {e.response.status_code}")
        except httpx.RequestError as e:
            raise LeaguepediaError(f"Request failed: {e}")
        except ValueError as e:
            raise LeaguepediaError(f"Invalid JSON response: {e}")

    # ==========================================
    # Tournament Queries
    # ==========================================

    async def get_tournaments(
        self,
        year: int | None = None,
        region: str | None = None,
        league: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Get tournament information.

        Args:
            year: Filter by year
            region: Filter by region (e.g., "Europe", "Korea")
            league: Filter by league (e.g., "LEC", "LCK")
            limit: Maximum results

        Returns:
            List of tournament data
        """
        fields = (
            "Name,OverviewPage,DateStart,Date,Region,League,Split,"
            "Rulebook,Prizepool,Organizers,IsQualifier,IsPlayoffs"
        )

        where_clauses = []
        if year:
            where_clauses.append(f"Year={year}")
        if region:
            where_clauses.append(f'Region="{region}"')
        if league:
            where_clauses.append(f'League="{league}"')

        where = " AND ".join(where_clauses) if where_clauses else None

        return await self._cargo_query(
            tables=self.TABLES["tournaments"],
            fields=fields,
            where=where,
            order_by="DateStart DESC",
            limit=limit,
        )

    async def get_tournament_rosters(
        self,
        tournament_name: str,
    ) -> list[dict[str, Any]]:
        """Get team rosters for a tournament.

        Args:
            tournament_name: Leaguepedia tournament name (OverviewPage)

        Returns:
            List of roster entries with player info
        """
        fields = (
            "Team,Player,Role,Flag,IsSubstitute,OverviewPage"
        )

        return await self._cargo_query(
            tables=self.TABLES["team_rosters"],
            fields=fields,
            where=f'OverviewPage="{tournament_name}"',
            order_by="Team,RoleNumber",
        )

    # ==========================================
    # Match Queries
    # ==========================================

    async def get_matches(
        self,
        tournament_name: str | None = None,
        team: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Get match schedule and results.

        Args:
            tournament_name: Filter by tournament
            team: Filter by team participation
            start_date: Filter by start date (YYYY-MM-DD)
            end_date: Filter by end date (YYYY-MM-DD)
            limit: Maximum results

        Returns:
            List of match data
        """
        fields = (
            "MatchId,OverviewPage,DateTime_UTC,Team1,Team2,"
            "Team1Score,Team2Score,Winner,BestOf,ShownName,"
            "Round,Phase,Stream,VOD"
        )

        where_clauses = []
        if tournament_name:
            where_clauses.append(f'OverviewPage="{tournament_name}"')
        if team:
            where_clauses.append(f'(Team1="{team}" OR Team2="{team}")')
        if start_date:
            where_clauses.append(f'DateTime_UTC>="{start_date}"')
        if end_date:
            where_clauses.append(f'DateTime_UTC<="{end_date}"')

        where = " AND ".join(where_clauses) if where_clauses else None

        return await self._cargo_query(
            tables=self.TABLES["matches"],
            fields=fields,
            where=where,
            order_by="DateTime_UTC DESC",
            limit=limit,
        )

    async def get_match_games(
        self,
        match_id: str,
    ) -> list[dict[str, Any]]:
        """Get individual games in a match.

        Args:
            match_id: Leaguepedia match ID

        Returns:
            List of game data
        """
        fields = (
            "MatchId,N_GameInMatch,Blue,Red,Winner,Duration,"
            "DateTime_UTC,MatchHistory,VOD"
        )

        return await self._cargo_query(
            tables=self.TABLES["games"],
            fields=fields,
            where=f'MatchId="{match_id}"',
            order_by="N_GameInMatch",
        )

    # ==========================================
    # Game Detail Queries
    # ==========================================

    async def get_game_scoreboard(
        self,
        game_id: str,
    ) -> list[dict[str, Any]]:
        """Get player stats from a game scoreboard.

        Args:
            game_id: Leaguepedia game ID (MatchId + GameNumber)

        Returns:
            List of player stats
        """
        fields = (
            "GameId,Team,Player,Champion,Role,Side,"
            "Kills,Deaths,Assists,CS,Gold,Items,SummonerSpells,"
            "KeystoneMastery,KeystoneRune,DamageToChampions"
        )

        return await self._cargo_query(
            tables=self.TABLES["scoreboard_players"],
            fields=fields,
            where=f'GameId="{game_id}"',
            order_by="Side,RoleNumber",
        )

    async def get_game_picks_bans(
        self,
        game_id: str,
    ) -> list[dict[str, Any]]:
        """Get picks and bans for a game.

        Args:
            game_id: Leaguepedia game ID

        Returns:
            Draft data with picks and bans
        """
        fields = (
            "GameId,Team1,Team2,"
            "Team1Pick1,Team1Pick2,Team1Pick3,Team1Pick4,Team1Pick5,"
            "Team2Pick1,Team2Pick2,Team2Pick3,Team2Pick4,Team2Pick5,"
            "Team1Ban1,Team1Ban2,Team1Ban3,Team1Ban4,Team1Ban5,"
            "Team2Ban1,Team2Ban2,Team2Ban3,Team2Ban4,Team2Ban5,"
            "Team1Role1,Team1Role2,Team1Role3,Team1Role4,Team1Role5,"
            "Team2Role1,Team2Role2,Team2Role3,Team2Role4,Team2Role5"
        )

        results = await self._cargo_query(
            tables=self.TABLES["picks_bans"],
            fields=fields,
            where=f'GameId="{game_id}"',
            limit=1,
        )

        return results[0] if results else {}

    async def get_game_team_stats(
        self,
        game_id: str,
    ) -> list[dict[str, Any]]:
        """Get team-level stats for a game.

        Args:
            game_id: Leaguepedia game ID

        Returns:
            Team stats including objectives
        """
        fields = (
            "GameId,Team,Side,Kills,Deaths,Assists,Gold,"
            "Dragons,Barons,Towers,Inhibitors,RiftHeralds"
        )

        return await self._cargo_query(
            tables=self.TABLES["scoreboard_games"],
            fields=fields,
            where=f'GameId="{game_id}"',
        )

    # ==========================================
    # Team Queries
    # ==========================================

    async def get_team(
        self,
        team_name: str,
    ) -> dict[str, Any] | None:
        """Get team information.

        Args:
            team_name: Team name or short name

        Returns:
            Team data or None if not found
        """
        fields = (
            "Name,Short,OverviewPage,Region,Location,"
            "TeamLocation,Image,IsDisbanded"
        )

        results = await self._cargo_query(
            tables=self.TABLES["teams"],
            fields=fields,
            where=f'Name="{team_name}" OR Short="{team_name}"',
            limit=1,
        )

        return results[0] if results else None

    async def get_team_history(
        self,
        team_name: str,
        year: int | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Get match history for a team.

        Args:
            team_name: Team name
            year: Filter by year
            limit: Maximum results

        Returns:
            List of match results
        """
        where_clauses = [f'(Team1="{team_name}" OR Team2="{team_name}")']
        if year:
            where_clauses.append(f"YEAR(DateTime_UTC)={year}")

        return await self._cargo_query(
            tables=self.TABLES["matches"],
            fields=(
                "MatchId,OverviewPage,DateTime_UTC,Team1,Team2,"
                "Team1Score,Team2Score,Winner,BestOf"
            ),
            where=" AND ".join(where_clauses),
            order_by="DateTime_UTC DESC",
            limit=limit,
        )

    # ==========================================
    # Player Queries
    # ==========================================

    async def get_player(
        self,
        player_name: str,
    ) -> dict[str, Any] | None:
        """Get player information.

        Args:
            player_name: Player IGN

        Returns:
            Player data or None if not found
        """
        fields = (
            "ID,OverviewPage,Name,NativeName,Country,Birthdate,"
            "Residency,Role,Team,CurrentTeams,Status,SoloqueueIds"
        )

        results = await self._cargo_query(
            tables=self.TABLES["players"],
            fields=fields,
            where=f'ID="{player_name}"',
            limit=1,
        )

        return results[0] if results else None

    async def get_player_tournament_stats(
        self,
        player_name: str,
        tournament_name: str,
    ) -> list[dict[str, Any]]:
        """Get player stats for a specific tournament.

        Args:
            player_name: Player IGN
            tournament_name: Tournament name

        Returns:
            List of game-by-game stats
        """
        fields = (
            "GameId,Team,Champion,Role,Kills,Deaths,Assists,"
            "CS,Gold,DamageToChampions"
        )

        return await self._cargo_query(
            tables=self.TABLES["scoreboard_players"],
            fields=fields,
            where=f'Player="{player_name}" AND OverviewPage="{tournament_name}"',
            order_by="DateTime_UTC",
        )

    # ==========================================
    # Champion Stats Queries
    # ==========================================

    async def get_champion_stats(
        self,
        tournament_name: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        """Get champion pick/ban stats.

        Args:
            tournament_name: Filter by tournament
            limit: Maximum results

        Returns:
            Champion stats with picks, bans, wins
        """
        # This requires aggregation which Cargo handles via GROUP BY
        fields = (
            "Champion,COUNT(*)=Games,SUM(Winner)=Wins"
        )

        where = f'OverviewPage="{tournament_name}"' if tournament_name else None

        return await self._cargo_query(
            tables=self.TABLES["scoreboard_players"],
            fields=fields,
            where=where,
            group_by="Champion",
            order_by="Games DESC",
            limit=limit,
        )

    # ==========================================
    # Utility Methods
    # ==========================================

    async def search_tournaments(
        self,
        query: str,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Search for tournaments by name.

        Args:
            query: Search query
            limit: Maximum results

        Returns:
            Matching tournaments
        """
        return await self._cargo_query(
            tables=self.TABLES["tournaments"],
            fields="Name,OverviewPage,DateStart,Region,League",
            where=f'Name LIKE "%{query}%"',
            order_by="DateStart DESC",
            limit=limit,
        )

    async def paginate_all(
        self,
        query_func,
        *args,
        page_size: int = 500,
        **kwargs,
    ) -> list[dict[str, Any]]:
        """Paginate through all results of a query.

        Args:
            query_func: Query function to call
            *args: Positional arguments for query function
            page_size: Results per page
            **kwargs: Keyword arguments for query function

        Returns:
            All results combined
        """
        all_results = []
        offset = 0

        while True:
            kwargs["limit"] = page_size
            kwargs["offset"] = offset

            results = await query_func(*args, **kwargs)

            if not results:
                break

            all_results.extend(results)

            if len(results) < page_size:
                break

            offset += page_size

        return all_results

    # ==========================================
    # Cleanup
    # ==========================================

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
