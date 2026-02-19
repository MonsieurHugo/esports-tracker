"""
GRID GraphQL Service

Provides GraphQL queries for GRID Central Data and Live Data Feed APIs.
Based on GRID API documentation.
"""

import re
from dataclasses import dataclass, field
from datetime import datetime, date, timezone
from typing import Any

import structlog

from src.services.grid_client import GridClient, GridClientError

logger = structlog.get_logger(__name__)

# League of Legends title ID in GRID
LOL_TITLE_ID = "3"


@dataclass
class Tournament:
    """Tournament information from GRID."""

    id: str
    name: str
    name_short: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    parent_id: str | None = None
    parent_name: str | None = None
    titles: list[str] = field(default_factory=list)  # Title IDs
    # Optional league info (may not always be available)
    league_id: str | None = None
    league_name: str | None = None
    region: str | None = None
    tier: int | None = None
    # Annotated by SyncProDataJob._annotate_phase_and_split after fetching
    phase: str | None = None
    split_name: str | None = None


@dataclass
class Series:
    """Series (match) information from GRID."""

    id: str
    tournament_id: str
    tournament_name: str | None = None
    start_time: datetime | None = None
    format: str | None = None  # "Bo1", "Bo3", "Bo5"
    type: str | None = None  # "ESPORTS", "SCRIM", etc.
    team1_id: str | None = None
    team1_name: str | None = None
    team2_id: str | None = None
    team2_name: str | None = None
    team1_score: int = 0
    team2_score: int = 0
    winner_id: str | None = None
    started_at: datetime | None = None


@dataclass
class GameState:
    """Game state information from GRID Live Data Feed."""

    id: str
    sequence_number: int
    finished: bool = False
    started: bool = False


@dataclass
class SeriesTeamState:
    """Team state information from GRID Live Data Feed."""

    id: str
    name: str
    score: int = 0
    won: bool = False
    players: list[dict] = field(default_factory=list)  # [{"id": "...", "name": "..."}]


@dataclass
class SeriesState:
    """Series state with game list from GRID Live Data Feed."""

    id: str
    format: str | None = None
    started: bool = False
    finished: bool = False
    forfeited: bool = False
    valid: bool = True
    started_at: datetime | None = None
    duration: int | None = None  # In seconds
    updated_at: datetime | None = None
    teams: list[SeriesTeamState] = field(default_factory=list)
    games: list[GameState] = field(default_factory=list)


class GridGraphQL:
    """GraphQL query service for GRID API."""

    # Max items per page (GRID limit is 50)
    MAX_PAGE_SIZE = 50

    # Max pagination iterations to prevent infinite loops
    # 1000 pages * 50 items = 50,000 items max
    MAX_PAGINATION_ITERATIONS = 1000

    def __init__(self, client: GridClient):
        """
        Initialize GraphQL service.

        Args:
            client: GRID HTTP client
        """
        self.client = client

    # ==========================================
    # Tournaments
    # ==========================================

    async def get_tournaments(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
        title_id: str = LOL_TITLE_ID,
        include_children: bool = True,
        parent_ids: list[str] | None = None,
    ) -> list[Tournament]:
        """
        Get tournaments with pagination.

        Args:
            start_date: Filter tournaments starting on or after this date
            end_date: Filter tournaments ending on or before this date
            title_id: Title ID to filter (default: LoL)
            include_children: Include child tournaments

        Returns:
            List of Tournament objects
        """
        query = """
        query GetTournaments($first: Int!, $after: String, $filter: TournamentFilter) {
            tournaments(first: $first, after: $after, filter: $filter) {
                totalCount
                pageInfo {
                    hasNextPage
                    endCursor
                }
                edges {
                    node {
                        id
                        name
                        nameShortened
                        startDate
                        endDate
                        parent {
                            id
                            name
                        }
                        titles {
                            id
                        }
                    }
                }
            }
        }
        """

        # Build filter
        filter_obj: dict[str, Any] = {}

        if title_id:
            filter_obj["title"] = {"id": {"in": [title_id]}}

        if start_date:
            filter_obj.setdefault("startDate", {})["gte"] = start_date.isoformat()

        if end_date:
            filter_obj.setdefault("endDate", {})["lte"] = end_date.isoformat()

        if not include_children:
            filter_obj["hasParent"] = {"equals": False}

        if parent_ids:
            filter_obj["parent"] = {"id": {"in": parent_ids}}

        tournaments: list[Tournament] = []
        cursor: str | None = None
        has_next = True
        iteration = 0

        while has_next:
            iteration += 1
            if iteration > self.MAX_PAGINATION_ITERATIONS:
                logger.warning(
                    "Pagination limit reached for tournaments",
                    max_iterations=self.MAX_PAGINATION_ITERATIONS,
                    items_fetched=len(tournaments),
                )
                break
            variables: dict[str, Any] = {
                "first": self.MAX_PAGE_SIZE,
                "filter": filter_obj if filter_obj else None,
            }
            if cursor:
                variables["after"] = cursor

            try:
                data = await self.client.graphql_central(query, variables)
                result = data.get("tournaments", {})

                for edge in result.get("edges", []):
                    node = edge.get("node", {})
                    parent = node.get("parent")
                    titles = node.get("titles", [])

                    tournaments.append(
                        Tournament(
                            id=node.get("id", ""),
                            name=node.get("name", ""),
                            name_short=node.get("nameShortened"),
                            start_date=self._parse_date(node.get("startDate")),
                            end_date=self._parse_date(node.get("endDate")),
                            parent_id=parent.get("id") if parent else None,
                            parent_name=parent.get("name") if parent else None,
                            titles=[t.get("id") for t in titles if t.get("id")],
                        )
                    )

                page_info = result.get("pageInfo", {})
                has_next = page_info.get("hasNextPage", False)
                cursor = page_info.get("endCursor")

            except GridClientError as e:
                logger.error("Failed to fetch tournaments", error=str(e))
                raise

        logger.info("Fetched tournaments", count=len(tournaments))
        return tournaments

    async def get_tournament_by_id(
        self,
        tournament_id: str,
        title_id: str = LOL_TITLE_ID,
    ) -> Tournament | None:
        """
        Get a single tournament by ID.

        Args:
            tournament_id: GRID tournament ID
            title_id: Title ID to verify (default: LoL)

        Returns:
            Tournament object or None if not found
        """
        query = """
        query GetTournament($id: ID!) {
            tournament(id: $id) {
                id
                name
                nameShortened
                startDate
                endDate
                parent {
                    id
                    name
                }
                titles {
                    id
                }
            }
        }
        """

        try:
            data = await self.client.graphql_central(query, {"id": tournament_id})
            node = data.get("tournament")

            if not node:
                return None

            parent = node.get("parent")
            titles = node.get("titles", [])

            return Tournament(
                id=node.get("id", ""),
                name=node.get("name", ""),
                name_short=node.get("nameShortened"),
                start_date=self._parse_date(node.get("startDate")),
                end_date=self._parse_date(node.get("endDate")),
                parent_id=parent.get("id") if parent else None,
                parent_name=parent.get("name") if parent else None,
                titles=[t.get("id") for t in titles if t.get("id")],
            )

        except GridClientError as e:
            logger.error("Failed to fetch tournament", tournament_id=tournament_id, error=str(e))
            return None

    # ==========================================
    # Series (allSeries)
    # ==========================================

    async def get_all_series(
        self,
        start_time_gte: datetime | None = None,
        start_time_lte: datetime | None = None,
        tournament_ids: list[str] | None = None,
        title_id: str = LOL_TITLE_ID,
        types: list[str] | None = None,
    ) -> list[Series]:
        """
        Get all series matching filters with pagination.

        Args:
            start_time_gte: Series scheduled on or after this time
            start_time_lte: Series scheduled on or before this time
            tournament_ids: Filter by specific tournament IDs
            title_id: Title ID to filter (default: LoL)
            types: Series types to include (e.g., ["ESPORTS"])

        Returns:
            List of Series objects
        """
        query = """
        query GetAllSeries($first: Int!, $after: String, $filter: SeriesFilter, $orderBy: SeriesOrderBy!, $orderDirection: OrderDirection!) {
            allSeries(first: $first, after: $after, filter: $filter, orderBy: $orderBy, orderDirection: $orderDirection) {
                totalCount
                pageInfo {
                    hasNextPage
                    endCursor
                }
                edges {
                    node {
                        id
                        startTimeScheduled
                        type
                        format {
                            name
                            nameShortened
                        }
                        tournament {
                            id
                            name
                        }
                        teams {
                            baseInfo {
                                id
                                name
                            }
                            scoreAdvantage
                        }
                    }
                }
            }
        }
        """

        # Build filter
        filter_obj: dict[str, Any] = {}

        if title_id:
            filter_obj["titleIds"] = {"in": [title_id]}

        if start_time_gte or start_time_lte:
            filter_obj["startTimeScheduled"] = {}
            if start_time_gte:
                filter_obj["startTimeScheduled"]["gte"] = self._format_datetime(start_time_gte)
            if start_time_lte:
                filter_obj["startTimeScheduled"]["lte"] = self._format_datetime(start_time_lte)

        if tournament_ids:
            filter_obj["tournament"] = {
                "id": {"in": tournament_ids},
                "includeChildren": {"equals": True},
            }

        if types:
            filter_obj["types"] = types

        series_list: list[Series] = []
        cursor: str | None = None
        has_next = True
        iteration = 0

        while has_next:
            iteration += 1
            if iteration > self.MAX_PAGINATION_ITERATIONS:
                logger.warning(
                    "Pagination limit reached for series",
                    max_iterations=self.MAX_PAGINATION_ITERATIONS,
                    items_fetched=len(series_list),
                )
                break
            variables: dict[str, Any] = {
                "first": self.MAX_PAGE_SIZE,
                "filter": filter_obj if filter_obj else None,
                "orderBy": "StartTimeScheduled",
                "orderDirection": "ASC",
            }
            if cursor:
                variables["after"] = cursor

            try:
                data = await self.client.graphql_central(query, variables)
                result = data.get("allSeries", {})

                for edge in result.get("edges", []):
                    node = edge.get("node", {})
                    tournament = node.get("tournament", {})
                    teams = node.get("teams", [])
                    format_info = node.get("format", {})

                    team1 = teams[0] if len(teams) > 0 else {}
                    team2 = teams[1] if len(teams) > 1 else {}
                    team1_base = team1.get("baseInfo", {})
                    team2_base = team2.get("baseInfo", {})

                    series_list.append(
                        Series(
                            id=node.get("id", ""),
                            tournament_id=tournament.get("id", ""),
                            tournament_name=tournament.get("name"),
                            start_time=self._parse_datetime(node.get("startTimeScheduled")),
                            format=format_info.get("nameShortened") if format_info else None,
                            type=node.get("type"),
                            team1_id=team1_base.get("id"),
                            team1_name=team1_base.get("name"),
                            team2_id=team2_base.get("id"),
                            team2_name=team2_base.get("name"),
                            team1_score=team1.get("scoreAdvantage", 0),
                            team2_score=team2.get("scoreAdvantage", 0),
                        )
                    )

                page_info = result.get("pageInfo", {})
                has_next = page_info.get("hasNextPage", False)
                cursor = page_info.get("endCursor")

                logger.debug(
                    "Fetched series page",
                    count=len(result.get("edges", [])),
                    total=result.get("totalCount"),
                    has_next=has_next,
                )

            except GridClientError as e:
                logger.error("Failed to fetch series", error=str(e))
                raise

        logger.info("Fetched all series", count=len(series_list))
        return series_list

    async def get_series_for_tournament(
        self,
        tournament_id: str,
        title_id: str = LOL_TITLE_ID,
    ) -> list[Series]:
        """
        Get all series for a specific tournament.

        Args:
            tournament_id: GRID tournament ID
            title_id: Title ID to filter (default: LoL)

        Returns:
            List of Series objects
        """
        return await self.get_all_series(
            tournament_ids=[tournament_id],
            title_id=title_id,
            types=["ESPORTS"],
        )

    # ==========================================
    # Live Data Feed API
    # ==========================================

    async def get_series_state(self, series_id: str) -> SeriesState | None:
        """
        Get series state including teams and games from Live Data Feed.

        Args:
            series_id: GRID series ID

        Returns:
            SeriesState object or None if not found
        """
        query = """
        query GetSeriesState($seriesId: ID!) {
            seriesState(id: $seriesId) {
                id
                format
                started
                finished
                forfeited
                valid
                startedAt
                duration
                updatedAt
                teams {
                    id
                    name
                    score
                    won
                    players {
                        id
                        name
                    }
                }
                games {
                    id
                    sequenceNumber
                    started
                    finished
                }
            }
        }
        """

        variables = {"seriesId": series_id}

        try:
            data = await self.client.graphql_live(query, variables)
            state_data = data.get("seriesState")

            if not state_data:
                return None

            # Parse teams
            teams = []
            for t in state_data.get("teams", []):
                teams.append(
                    SeriesTeamState(
                        id=t.get("id", ""),
                        name=t.get("name", ""),
                        score=t.get("score", 0),
                        won=t.get("won", False),
                        players=[
                            {"id": p.get("id", ""), "name": p.get("name", "")}
                            for p in t.get("players", [])
                        ],
                    )
                )

            # Parse games
            games = []
            for g in state_data.get("games", []):
                games.append(
                    GameState(
                        id=g.get("id", ""),
                        sequence_number=g.get("sequenceNumber", 0),
                        started=g.get("started", False),
                        finished=g.get("finished", False),
                    )
                )

            return SeriesState(
                id=state_data.get("id", ""),
                format=state_data.get("format"),
                started=state_data.get("started", False),
                finished=state_data.get("finished", False),
                forfeited=state_data.get("forfeited", False),
                valid=state_data.get("valid", True),
                started_at=self._parse_datetime(state_data.get("startedAt")),
                duration=self._parse_duration(state_data.get("duration")),
                updated_at=self._parse_datetime(state_data.get("updatedAt")),
                teams=teams,
                games=games,
            )

        except GridClientError as e:
            logger.error("Failed to fetch series state", series_id=series_id, error=str(e))
            raise

    # ==========================================
    # Helper Methods
    # ==========================================

    def _parse_datetime(self, value: str | None) -> datetime | None:
        """Parse ISO datetime string."""
        if not value:
            return None
        try:
            if "Z" in value:
                value = value.replace("Z", "+00:00")
            return datetime.fromisoformat(value)
        except ValueError:
            logger.warning("Failed to parse datetime", value=value)
            return None

    def _parse_date(self, value: str | None) -> date | None:
        """Parse ISO date string."""
        if not value:
            return None
        try:
            return date.fromisoformat(value)
        except ValueError:
            logger.warning("Failed to parse date", value=value)
            return None

    def _parse_duration(self, value: str | None) -> int | None:
        """Parse ISO 8601 duration string to seconds (e.g., PT2H15M30S -> 8130)."""
        if not value:
            return None
        try:
            # Match ISO 8601 duration: PT2H15M30S or PT30M or PT1H etc.
            match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value)
            if not match:
                return None

            hours = int(match.group(1) or 0)
            minutes = int(match.group(2) or 0)
            seconds = int(match.group(3) or 0)

            return hours * 3600 + minutes * 60 + seconds
        except (ValueError, AttributeError):
            logger.warning("Failed to parse duration", value=value)
            return None

    def _format_datetime(self, dt: datetime) -> str:
        """Format datetime for GraphQL API (must include timezone)."""
        # Ensure timezone-aware
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
