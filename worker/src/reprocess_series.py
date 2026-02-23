"""
Reprocess a problematic GRID series manually.

Resets the match in DB, fetches fresh data from GRID API, and processes only
the specified games (by sequence number). Useful for series with remakes or
corrupted game data that caused processing_failed flags.

Usage:
    cd worker && python -m src.reprocess_series <series_id> --games 1,3 [--dry-run]

Example:
    cd worker && python -m src.reprocess_series 2901030 --games 1,3
"""

import argparse
import asyncio
import logging

import structlog

from src.config import settings
from src.jobs.aggregate_champion_stats import AggregateChampionStatsJob
from src.jobs.sync_pro_data import SyncProDataJob
from src.services.database import DatabaseService
from src.services.grid_client import GridClient
from src.services.grid_graphql import GameState

logging.basicConfig(level=logging.INFO)
logger = structlog.get_logger(__name__)


async def reprocess(series_id: str, game_numbers: list[int], dry_run: bool = False) -> None:
    db = DatabaseService(settings.database_url)
    grid_client = GridClient()

    try:
        await db.connect_with_retry()
        await grid_client.connect()

        sync_job = SyncProDataJob(db, grid_client)

        # 1. Fetch series state from GRID
        state = await sync_job.graphql.get_series_state(series_id)
        if not state:
            print(f"ERROR: Could not fetch series state for {series_id}")
            return

        # Display all games from GRID for confirmation
        print(f"\n=== Series {series_id} ===")
        print(f"Teams: {state.teams[0].name} vs {state.teams[1].name}")
        print(f"Format: {state.format}")
        print(f"Finished: {state.finished}")
        print(f"\nAll games from GRID:")
        for g in sorted(state.games, key=lambda x: x.sequence_number):
            winner = "no winner" if not g.finished else "finished"
            print(f"  Game {g.sequence_number}: id={g.id}, finished={g.finished}, started={g.started} ({winner})")

        print(f"\nGames requested for reprocessing: {game_numbers}")

        # Build games to process: use state when available, create synthetic GameState otherwise
        # (needed when GRID state doesn't list a sequence but files exist, e.g. remakes)
        state_by_seq = {g.sequence_number: g for g in state.games}
        games_to_process = []
        for seq in game_numbers:
            if seq in state_by_seq and state_by_seq[seq].finished:
                games_to_process.append(state_by_seq[seq])
            else:
                if seq in state_by_seq:
                    print(f"  WARNING: Game {seq} exists in state but not finished — creating synthetic entry")
                else:
                    print(f"  WARNING: Game {seq} not in series state — creating synthetic entry (files may still exist)")
                games_to_process.append(GameState(
                    id=f"synthetic-{series_id}-{seq}",
                    sequence_number=seq,
                    finished=True,
                    started=True,
                    teams=[],
                ))

        if not games_to_process:
            print("ERROR: No games to process.")
            return

        print(f"Games that will be processed: {[g.sequence_number for g in games_to_process]}")

        if dry_run:
            print("\n[DRY RUN] Would process these games. Exiting.")
            return

        # 2. Look up the match in DB
        match = await db.fetchrow(
            "SELECT match_id, status, tournament_id FROM pro_matches WHERE external_id = $1",
            series_id,
        )
        if not match:
            print(f"ERROR: Match with external_id={series_id} not found in DB.")
            return

        match_id = match["match_id"]
        tournament_db_id = match["tournament_id"]
        print(f"\nMatch found: match_id={match_id}, status={match['status']}, tournament_id={tournament_db_id}")

        # 3. Delete existing games for this match
        deleted = await db.execute(
            "DELETE FROM pro_games WHERE match_id = $1",
            match_id,
        )
        print(f"Deleted existing games: {deleted}")

        # 4. Reset match status to allow reprocessing
        await db.execute(
            "UPDATE pro_matches SET status = 'live', failure_reason = NULL, failed_at = NULL WHERE match_id = $1",
            match_id,
        )
        print("Match status reset to 'live'")

        # 5. Resolve team DB IDs (via upsert_pro_team which handles mapping table + name match)
        if len(state.teams) < 2:
            print(f"ERROR: Series has {len(state.teams)} teams, expected 2")
            return

        team1_state = state.teams[0]
        team2_state = state.teams[1]

        team1_db_id = await db.upsert_pro_team(external_id=team1_state.id, name=team1_state.name)
        team2_db_id = await db.upsert_pro_team(external_id=team2_state.id, name=team2_state.name)
        print(f"Team 1: {team1_state.name} (db_id={team1_db_id})")
        print(f"Team 2: {team2_state.name} (db_id={team2_db_id})")

        # 6. Process each requested game
        print(f"\nProcessing {len(games_to_process)} games...")
        for game_state in sorted(games_to_process, key=lambda g: g.sequence_number):
            print(f"\n  Processing game {game_state.sequence_number} (id={game_state.id})...")
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
            print(f"  Game {game_state.sequence_number} processed OK")

        # 7. Recalculate match scores from inserted games
        scores = await db.fetchrow(
            """
            SELECT
                COUNT(*) FILTER (WHERE winner_team_id = $2) as t1_score,
                COUNT(*) FILTER (WHERE winner_team_id = $3) as t2_score
            FROM pro_games
            WHERE match_id = $1 AND status IN ('completed', 'processed')
            """,
            match_id, team1_db_id, team2_db_id,
        )
        t1_score = scores["t1_score"]
        t2_score = scores["t2_score"]
        print(f"\nScores: {team1_state.name} {t1_score} - {t2_score} {team2_state.name}")

        await db.execute(
            "UPDATE pro_matches SET team1_score = $1, team2_score = $2, status = 'completed' WHERE match_id = $3",
            t1_score, t2_score, match_id,
        )

        # 8. Mark as processed
        await db.mark_pro_match_processed(match_id)
        print("Match marked as processed")

        # 9. Resolve the processing_failed flag
        resolved = await db.execute(
            """
            UPDATE data_quality_flags
            SET resolved = true, resolved_at = NOW()
            WHERE entity_type = 'match'
              AND external_id = $1
              AND flag_type = 'processing_failed'
              AND NOT resolved
            """,
            series_id,
        )
        print(f"Resolved processing_failed flags: {resolved}")

        # 10. Run champion stats aggregation
        print("\nRunning champion stats aggregation (last 7 days)...")
        agg_job = AggregateChampionStatsJob(db)
        agg_stats = await agg_job.run(days_back=7)
        print(f"Aggregation done: {agg_stats}")

        print(f"\n=== Reprocessing complete for series {series_id} ===")

    finally:
        await grid_client.close()
        await db.disconnect()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reprocess a problematic GRID series manually",
    )
    parser.add_argument(
        "series_id",
        help="GRID series ID to reprocess (e.g. 2901030)",
    )
    parser.add_argument(
        "--games",
        required=True,
        help="Comma-separated list of game sequence numbers to process (e.g. 1,3)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only fetch and display data, don't modify DB",
    )
    args = parser.parse_args()

    game_numbers = [int(g.strip()) for g in args.games.split(",")]

    asyncio.run(reprocess(
        series_id=args.series_id,
        game_numbers=game_numbers,
        dry_run=args.dry_run,
    ))


if __name__ == "__main__":
    main()
