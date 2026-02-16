"""
GRID File Download Service

Handles downloading summary, details, and events files from GRID API.
"""

import gzip
import json
from typing import Any

import structlog

from src.services.grid_client import GridClient, GridClientError

logger = structlog.get_logger(__name__)


class GridFiles:
    """Service for downloading GRID data files."""

    def __init__(self, client: GridClient):
        """
        Initialize file service.

        Args:
            client: GRID HTTP client
        """
        self.client = client
        self.base_url = client.FILE_DOWNLOAD_BASE

    async def get_summary(self, series_id: str, game_sequence: int) -> dict[str, Any]:
        """
        Download game summary file.

        Contains end-of-game summary statistics.

        Args:
            series_id: GRID series ID
            game_sequence: Game number within series (1-indexed)

        Returns:
            Summary data dictionary

        Raises:
            GridClientError: On download failure
        """
        url = f"{self.base_url}/end-state/riot/series/{series_id}/games/{game_sequence}/summary"
        logger.debug("Downloading summary", series_id=series_id, game_sequence=game_sequence)

        try:
            response = await self.client.get(url)
            return response.json()
        except GridClientError as e:
            if e.status_code == 404:
                logger.warning(
                    "Summary not found",
                    series_id=series_id,
                    game_sequence=game_sequence,
                )
                return {}
            raise

    async def get_details(self, series_id: str, game_sequence: int) -> dict[str, Any]:
        """
        Download game details file.

        Contains detailed statistics including runes, items, etc.

        Args:
            series_id: GRID series ID
            game_sequence: Game number within series (1-indexed)

        Returns:
            Details data dictionary

        Raises:
            GridClientError: On download failure
        """
        url = f"{self.base_url}/end-state/riot/series/{series_id}/games/{game_sequence}/details"
        logger.debug("Downloading details", series_id=series_id, game_sequence=game_sequence)

        try:
            response = await self.client.get(url)
            return response.json()
        except GridClientError as e:
            if e.status_code == 404:
                logger.warning(
                    "Details not found",
                    series_id=series_id,
                    game_sequence=game_sequence,
                )
                return {}
            raise

    async def get_events_raw(self, series_id: str, game_sequence: int) -> bytes:
        """
        Download raw events file (JSONL, potentially gzipped).

        Args:
            series_id: GRID series ID
            game_sequence: Game number within series (1-indexed)

        Returns:
            Raw file bytes

        Raises:
            GridClientError: On download failure
        """
        url = f"{self.base_url}/events/riot/series/{series_id}/games/{game_sequence}"
        logger.debug("Downloading events", series_id=series_id, game_sequence=game_sequence)

        response = await self.client.get(url)
        return response.content

    async def get_events(self, series_id: str, game_sequence: int) -> list[dict[str, Any]]:
        """
        Download and parse events file (JSONL format).

        The events file contains all game events in JSONL format.
        Each line is a JSON object representing one event.

        Args:
            series_id: GRID series ID
            game_sequence: Game number within series (1-indexed)

        Returns:
            List of event dictionaries

        Raises:
            GridClientError: On download failure
        """
        try:
            raw_content = await self.get_events_raw(series_id, game_sequence)
        except GridClientError as e:
            if e.status_code == 404:
                logger.warning(
                    "Events not found",
                    series_id=series_id,
                    game_sequence=game_sequence,
                )
                return []
            raise

        # Try to decompress if gzipped
        try:
            content = gzip.decompress(raw_content)
        except gzip.BadGzipFile:
            content = raw_content

        # Parse JSONL (one JSON object per line)
        events = []
        lines = content.decode("utf-8").strip().split("\n")

        for line_num, line in enumerate(lines, 1):
            if not line.strip():
                continue
            try:
                event = json.loads(line)
                events.append(event)
            except json.JSONDecodeError as e:
                logger.warning(
                    "Failed to parse event line",
                    series_id=series_id,
                    game_sequence=game_sequence,
                    line_num=line_num,
                    error=str(e),
                )

        logger.info(
            "Downloaded events",
            series_id=series_id,
            game_sequence=game_sequence,
            event_count=len(events),
        )
        return events

    async def get_all_game_data(
        self,
        series_id: str,
        game_sequence: int,
    ) -> dict[str, Any]:
        """
        Download all data files for a game.

        Args:
            series_id: GRID series ID
            game_sequence: Game number within series (1-indexed)

        Returns:
            Dictionary with 'summary', 'details', and 'events' keys
        """
        summary = await self.get_summary(series_id, game_sequence)
        details = await self.get_details(series_id, game_sequence)
        events = await self.get_events(series_id, game_sequence)

        return {
            "summary": summary,
            "details": details,
            "events": events,
        }
