"""
Backfill gank stats for existing pro games.

Re-parses events files from GRID API and updates the solo_stats JSONB
in pro_player_stats with the new gank-related keys.

Usage:
    cd worker && python -m src.backfill_ganks [--dry-run] [--limit N]
"""

import argparse
import asyncio
import json

import structlog

from src.config import settings
from src.parsers.events_parser import EventsParser
from src.services.database import DatabaseService
from src.services.grid_client import GridClient, GridClientError
from src.services.grid_files import GridFiles

logger = structlog.get_logger(__name__)

GANK_KEYS = {
    "jgl_ganks_top",
    "jgl_ganks_mid",
    "jgl_ganks_bot",
    "jgl_lane_deaths",
    "jgl_counter_ganks",
    "ganked_by_ally_jgl",
    "ganked_by_enemy_jgl",
}


async def backfill(dry_run: bool = False, limit: int | None = None) -> None:
    """Re-parse all pro games and backfill gank stats into solo_stats JSONB."""
    db = DatabaseService(settings.database_url)
    await db.connect_with_retry()

    grid_client = GridClient(api_key=settings.grid_api_key)
    files = GridFiles(grid_client)

    try:
        # Get all games that have player stats, ordered by game_id
        # Only GRID matches have event files (numeric external_id).
        # Leaguepedia matches (lp:...) don't have downloadable events.
        base_query = """
            SELECT DISTINCT g.game_id, g.external_id as game_external_id,
                   g.game_number, m.external_id as series_id
            FROM pro_games g
            JOIN pro_matches m ON g.match_id = m.match_id
            JOIN pro_player_stats ps ON ps.game_id = g.game_id
            WHERE g.status IN ('completed', 'processed')
              AND m.external_id IS NOT NULL
              AND m.external_id NOT LIKE 'lp:%'
            ORDER BY g.game_id
        """
        if limit:
            rows = await db.fetch(base_query + " LIMIT $1", limit)
        else:
            rows = await db.fetch(base_query)

        total = len(rows)
        logger.info("Found games to backfill", total=total, dry_run=dry_run)

        updated = 0
        skipped = 0
        errors = 0

        for i, row in enumerate(rows):
            game_id = row["game_id"]
            series_id = row["series_id"]
            game_number = row["game_number"]

            if (i + 1) % 50 == 0 or i == 0:
                logger.info(
                    "Progress",
                    current=i + 1,
                    total=total,
                    updated=updated,
                    skipped=skipped,
                    errors=errors,
                )

            try:
                # Download events (and summary/details for complete parse)
                events = await files.get_events(str(series_id), game_number)
                if not events:
                    logger.debug("No events for game", game_id=game_id, series_id=series_id)
                    skipped += 1
                    continue

                summary = await files.get_summary(str(series_id), game_number)
                details = await files.get_details(str(series_id), game_number)

                # Re-parse
                parser = EventsParser(events, summary, details)
                parsed = parser.parse()

                # Get existing player stats for this game
                existing_stats = await db.fetch(
                    """
                    SELECT stat_id, role, team_side
                    FROM pro_player_stats
                    WHERE game_id = $1
                    """,
                    game_id,
                )

                if not existing_stats:
                    skipped += 1
                    continue

                # Build lookup by (role, team_side) — unique per game
                parsed_by_role_side: dict[tuple[str, str], dict] = {}
                for ps in parsed.player_stats:
                    if ps.role and ps.team_side:
                        parsed_by_role_side[(ps.role, ps.team_side)] = ps.solo_stats

                game_had_updates = False

                # Update each player's solo_stats with new gank keys
                for stat_row in existing_stats:
                    stat_id = stat_row["stat_id"]
                    role = stat_row["role"]
                    team_side = stat_row["team_side"]

                    if not role or not team_side:
                        continue

                    # Find matching parsed stats by role + side
                    parsed_solo = parsed_by_role_side.get((role, team_side), {})

                    # Extract only the new gank keys from parsed data
                    new_keys = {}
                    for key in GANK_KEYS:
                        val = parsed_solo.get(key, 0)
                        if val > 0:
                            new_keys[key] = val

                    if not new_keys:
                        continue

                    game_had_updates = True

                    if dry_run:
                        logger.debug(
                            "Would update",
                            stat_id=stat_id,
                            role=role,
                            side=team_side,
                            new_keys=new_keys,
                        )
                        continue

                    # Merge new keys into existing solo_stats via JSONB ||
                    await db.execute(
                        """
                        UPDATE pro_player_stats
                        SET solo_stats = COALESCE(solo_stats, '{}'::jsonb) || $2::jsonb
                        WHERE stat_id = $1
                        """,
                        stat_id,
                        json.dumps(new_keys),
                    )

                if game_had_updates:
                    updated += 1
                else:
                    skipped += 1

            except GridClientError as e:
                if e.status_code == 404:
                    skipped += 1
                else:
                    errors += 1
                    logger.warning(
                        "GRID error for game",
                        game_id=game_id,
                        error=str(e),
                    )
            except Exception as e:
                errors += 1
                logger.error(
                    "Error processing game",
                    game_id=game_id,
                    error=str(e),
                )

            # Small delay to avoid GRID rate limiting
            if (i + 1) % 10 == 0:
                await asyncio.sleep(0.5)

        logger.info(
            "Backfill complete",
            total=total,
            updated=updated,
            skipped=skipped,
            errors=errors,
            dry_run=dry_run,
        )

    finally:
        await grid_client.close()
        await db.disconnect()


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill gank stats for pro games")
    parser.add_argument("--dry-run", action="store_true", help="Parse but don't write to DB")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of games to process")
    args = parser.parse_args()

    asyncio.run(backfill(dry_run=args.dry_run, limit=args.limit))


if __name__ == "__main__":
    main()
