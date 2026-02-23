"""Check player stats for a date. Usage: python -m src._check_player_date <player_id> <date>"""
import asyncio, sys
from datetime import date
from src.config import settings
from src.services.database import DatabaseService

QUERY = """
SELECT ps.game_id, g.game_number, m.external_id as series_id,
       ps.kills, ps.deaths, ps.assists, ps.team_id, ps.champion_id, ps.role,
       g.started_at as game_started, g.status as game_status
FROM pro_player_stats ps
JOIN pro_games g ON g.game_id = ps.game_id
JOIN pro_matches m ON m.match_id = g.match_id
WHERE ps.player_id = $1
  AND COALESCE(g.started_at, m.started_at)::date = $2
  AND g.status IN ('completed','processed')
ORDER BY g.started_at
"""

async def check(player_id: int, date_str: str):
    db = DatabaseService(settings.database_url)
    await db.connect_with_retry()

    rows = await db.fetch(QUERY, player_id, date.fromisoformat(date_str))
    print(f"Player stats on {date_str}: {len(rows)} rows")
    for r in rows:
        print(f"  series={r['series_id']} game#{r['game_number']}: "
              f"role={r['role']} champ={r['champion_id']} "
              f"{r['kills']}/{r['deaths']}/{r['assists']}")

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(check(int(sys.argv[1]), sys.argv[2]))
