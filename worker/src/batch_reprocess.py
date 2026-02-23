"""
Batch reprocess all series with role mismatches.

Discovers affected series automatically (same query as _find_role_mismatches),
reprocesses them one by one, then runs champion stats aggregation once at the end.

Usage:
    cd worker && python -m src.batch_reprocess [--dry-run]
"""

import argparse
import asyncio
import logging
import time

import structlog

from src.config import settings
from src.jobs.aggregate_champion_stats import AggregateChampionStatsJob
from src.jobs.sync_pro_data import SyncProDataJob
from src.services.database import DatabaseService
from src.services.grid_client import GridClient
from src.services.grid_graphql import GameState

logging.basicConfig(level=logging.INFO)
logger = structlog.get_logger(__name__)

FIND_MISMATCHES_QUERY = """
WITH player_main_role AS (
    SELECT DISTINCT ON (player_id)
        player_id, role as main_role, COUNT(*) as games
    FROM pro_player_stats
    WHERE role IS NOT NULL
    GROUP BY player_id, role
    ORDER BY player_id, COUNT(*) DESC
),
mismatched_games AS (
    SELECT DISTINCT
        g.game_id, g.game_number,
        m.external_id as series_id, m.match_id
    FROM pro_player_stats ps
    JOIN pro_games g ON g.game_id = ps.game_id
    JOIN pro_matches m ON m.match_id = g.match_id
    JOIN player_main_role pmr ON pmr.player_id = ps.player_id
    WHERE ps.role IS NOT NULL
      AND ps.role != pmr.main_role
      AND pmr.games >= 5
      AND g.status IN ('completed', 'processed')
)
SELECT
    series_id,
    match_id,
    ARRAY_AGG(DISTINCT game_number ORDER BY game_number) as game_numbers
FROM mismatched_games
GROUP BY series_id, match_id
ORDER BY series_id
"""


async def reprocess_one(
    db: DatabaseService,
    sync_job: SyncProDataJob,
    series_id: str,
    game_numbers: list[int],
) -> bool:
    """Reprocess a single series. Returns True on success."""

    # 1. Fetch series state from GRID
    state = await sync_job.graphql.get_series_state(series_id)
    if not state:
        print(f"  SKIP: Could not fetch series state")
        return False

    if len(state.teams) < 2:
        print(f"  SKIP: Series has {len(state.teams)} teams")
        return False

    # 2. Build games to process
    state_by_seq = {g.sequence_number: g for g in state.games}
    games_to_process = []
    for seq in game_numbers:
        if seq in state_by_seq and state_by_seq[seq].finished:
            games_to_process.append(state_by_seq[seq])
        else:
            games_to_process.append(GameState(
                id=f"synthetic-{series_id}-{seq}",
                sequence_number=seq,
                finished=True,
                started=True,
                teams=[],
            ))

    if not games_to_process:
        print(f"  SKIP: No games to process")
        return False

    # 3. Look up match in DB
    match = await db.fetchrow(
        "SELECT match_id, tournament_id FROM pro_matches WHERE external_id = $1",
        series_id,
    )
    if not match:
        print(f"  SKIP: Match not found in DB")
        return False

    match_id = match["match_id"]
    tournament_db_id = match["tournament_id"]

    # 4. Delete existing games
    await db.execute("DELETE FROM pro_games WHERE match_id = $1", match_id)

    # 5. Reset match status
    await db.execute(
        "UPDATE pro_matches SET status = 'live', failure_reason = NULL, failed_at = NULL WHERE match_id = $1",
        match_id,
    )

    # 6. Resolve teams
    team1_state = state.teams[0]
    team2_state = state.teams[1]
    team1_db_id = await db.upsert_pro_team(external_id=team1_state.id, name=team1_state.name)
    team2_db_id = await db.upsert_pro_team(external_id=team2_state.id, name=team2_state.name)

    # 7. Process each game
    for game_state in sorted(games_to_process, key=lambda g: g.sequence_number):
        await sync_job._process_game(
            series_id=series_id,
            game_state=game_state,
            match_id=match_id,
            tournament_db_id=tournament_db_id,
            team1_db_id=team1_db_id,
            team2_db_id=team2_db_id,
            team1_state=team1_state,
            team2_state=team2_state,
            all_series_games=state.games,
            game_teams=game_state.teams,
        )

    # 8. Recalculate scores
    scores = await db.fetchrow(
        "SELECT"
        " COUNT(*) FILTER (WHERE winner_team_id = $2) as t1_score,"
        " COUNT(*) FILTER (WHERE winner_team_id = $3) as t2_score"
        " FROM pro_games"
        " WHERE match_id = $1 AND status IN ('completed', 'processed')",
        match_id, team1_db_id, team2_db_id,
    )
    await db.execute(
        "UPDATE pro_matches SET team1_score = $1, team2_score = $2, status = 'completed' WHERE match_id = $3",
        scores["t1_score"], scores["t2_score"], match_id,
    )

    # 9. Mark as processed
    await db.mark_pro_match_processed(match_id)

    # 10. Resolve processing_failed flags
    await db.execute(
        "UPDATE data_quality_flags SET resolved = true, resolved_at = NOW()"
        " WHERE entity_type = 'match' AND external_id = $1"
        " AND flag_type = 'processing_failed' AND NOT resolved",
        series_id,
    )

    return True


async def batch_reprocess(dry_run: bool = False) -> None:
    db = DatabaseService(settings.database_url)
    grid_client = GridClient()

    try:
        await db.connect_with_retry()
        await grid_client.connect()

        # 1. Find all series with role mismatches
        rows = await db.fetch(FIND_MISMATCHES_QUERY)
        total = len(rows)
        print(f"\nFound {total} series to reprocess\n")

        if dry_run:
            for r in rows:
                games = ",".join(str(g) for g in r["game_numbers"])
                print(f"  python -m src.reprocess_series {r['series_id']} --games {games}")
            print(f"\n[DRY RUN] Would reprocess {total} series. Exiting.")
            return

        sync_job = SyncProDataJob(db, grid_client)
        success = 0
        failed = 0
        skipped = 0
        start_time = time.time()

        for i, r in enumerate(rows, 1):
            series_id = r["series_id"]
            game_numbers = list(r["game_numbers"])
            games_str = ",".join(str(g) for g in game_numbers)

            print(f"[{i}/{total}] Series {series_id} games={games_str} ...", end=" ", flush=True)

            try:
                ok = await reprocess_one(db, sync_job, series_id, game_numbers)
                if ok:
                    success += 1
                    print("OK")
                else:
                    skipped += 1
            except Exception as e:
                failed += 1
                print(f"FAILED: {e}")
                # Reset match back to processed so it's not left in limbo
                try:
                    match = await db.fetchrow(
                        "SELECT match_id FROM pro_matches WHERE external_id = $1", series_id
                    )
                    if match:
                        await db.mark_pro_match_processed(match["match_id"])
                except Exception:
                    pass

        elapsed = time.time() - start_time

        print(f"\n{'='*60}")
        print(f"Batch complete in {elapsed:.0f}s")
        print(f"  Success: {success}")
        print(f"  Skipped: {skipped}")
        print(f"  Failed:  {failed}")

        # Run champion stats aggregation once at the end
        if success > 0:
            print("\nRunning champion stats aggregation (last 30 days)...")
            agg_job = AggregateChampionStatsJob(db)
            agg_stats = await agg_job.run(days_back=30)
            print(f"Aggregation done: {agg_stats}")

        print("\nDone.")

    finally:
        await grid_client.close()
        await db.disconnect()


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch reprocess series with role mismatches")
    parser.add_argument("--dry-run", action="store_true", help="Only list series, don't reprocess")
    args = parser.parse_args()

    asyncio.run(batch_reprocess(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
