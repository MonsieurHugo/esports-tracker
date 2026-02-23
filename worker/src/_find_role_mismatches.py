"""Find series to reprocess due to role mismatches from missing events.
Usage: python -m src._find_role_mismatches
"""
import asyncio
from src.config import settings
from src.services.database import DatabaseService

# Find games where a player's role differs from their dominant role,
# grouped by series for reprocessing
QUERY = """
WITH player_main_role AS (
    -- Each player's dominant role (most played)
    SELECT DISTINCT ON (player_id)
        player_id,
        role as main_role,
        COUNT(*) as games
    FROM pro_player_stats
    WHERE role IS NOT NULL
    GROUP BY player_id, role
    ORDER BY player_id, COUNT(*) DESC
),
mismatched_games AS (
    -- Games where at least one player has a non-main role
    SELECT DISTINCT
        g.game_id,
        g.game_number,
        g.external_id as game_external_id,
        m.external_id as series_id,
        m.match_id,
        ps.player_id,
        p.current_pseudo,
        ps.role as assigned_role,
        pmr.main_role,
        pmr.games as main_role_games
    FROM pro_player_stats ps
    JOIN pro_games g ON g.game_id = ps.game_id
    JOIN pro_matches m ON m.match_id = g.match_id
    JOIN players p ON p.player_id = ps.player_id
    JOIN player_main_role pmr ON pmr.player_id = ps.player_id
    WHERE ps.role IS NOT NULL
      AND ps.role != pmr.main_role
      AND pmr.games >= 5
      AND g.status IN ('completed', 'processed')
)
SELECT
    series_id,
    match_id,
    ARRAY_AGG(DISTINCT game_number ORDER BY game_number) as game_numbers,
    ARRAY_AGG(DISTINCT current_pseudo || ' (' || assigned_role || ' instead of ' || main_role || ')') as mismatches
FROM mismatched_games
GROUP BY series_id, match_id
ORDER BY series_id
"""

async def main():
    db = DatabaseService(settings.database_url)
    await db.connect_with_retry()

    rows = await db.fetch(QUERY)
    print(f"Series with role mismatches: {len(rows)}\n")

    # Also collect for a reprocess command list
    reprocess_cmds = []

    for r in rows:
        series_id = r['series_id']
        game_nums = r['game_numbers']
        mismatches = r['mismatches']

        print(f"Series {series_id} (games {game_nums}):")
        for m in mismatches:
            print(f"  - {m}")

        games_str = ",".join(str(g) for g in game_nums)
        reprocess_cmds.append(f"python -m src.reprocess_series {series_id} --games {games_str}")

    print(f"\n{'='*60}")
    print(f"Reprocess commands ({len(reprocess_cmds)}):\n")
    for cmd in reprocess_cmds:
        print(cmd)

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
