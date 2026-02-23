"""Find players with inconsistent roles. Usage: python -m src._check_roles"""
import asyncio
from src.config import settings
from src.services.database import DatabaseService

QUERY = """
WITH player_roles AS (
    SELECT
        ps.player_id,
        p.current_pseudo,
        ps.role,
        COUNT(*) as games
    FROM pro_player_stats ps
    JOIN players p ON p.player_id = ps.player_id
    JOIN pro_games g ON g.game_id = ps.game_id
    WHERE g.status IN ('completed', 'processed')
      AND ps.role IS NOT NULL
    GROUP BY ps.player_id, p.current_pseudo, ps.role
),
player_summary AS (
    SELECT
        player_id,
        current_pseudo,
        COUNT(DISTINCT role) as distinct_roles,
        SUM(games) as total_games,
        STRING_AGG(role || ':' || games, ', ' ORDER BY games DESC) as role_breakdown
    FROM player_roles
    GROUP BY player_id, current_pseudo
    HAVING COUNT(DISTINCT role) > 1
)
SELECT * FROM player_summary
ORDER BY total_games DESC, current_pseudo
"""

async def check():
    db = DatabaseService(settings.database_url)
    await db.connect_with_retry()

    rows = await db.fetch(QUERY)
    print(f"Players with multiple roles: {len(rows)}\n")
    print(f"{'Player':<25} {'Games':>6}  {'Roles':>6}  Breakdown")
    print("-" * 80)
    for r in rows:
        print(f"{r['current_pseudo']:<25} {r['total_games']:>6}  {r['distinct_roles']:>6}  {r['role_breakdown']}")

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(check())
