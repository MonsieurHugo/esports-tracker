"""Detailed diagnostic for a series. Usage: python -m src._check_series_detail <series_id>"""
import asyncio, sys
from src.config import settings
from src.services.database import DatabaseService

async def check(sid: str):
    db = DatabaseService(settings.database_url)
    await db.connect_with_retry()

    match = await db.fetchrow(
        "SELECT match_id FROM pro_matches WHERE external_id = $1", sid)
    if not match:
        print("Match not found")
        await db.disconnect()
        return

    mid = match["match_id"]

    games = await db.fetch(
        "SELECT game_id, game_number, external_id, status, duration, winner_team_id,"
        " blue_team_id, red_team_id, patch"
        " FROM pro_games WHERE match_id = $1 ORDER BY game_number", mid)

    for g in games:
        gid = g["game_id"]
        print(f"\n=== Game #{g['game_number']} (game_id={gid}) ===")
        print(f"  ext={g['external_id']}, status={g['status']}, dur={g['duration']}s")
        print(f"  blue={g['blue_team_id']}, red={g['red_team_id']}, winner={g['winner_team_id']}, patch={g['patch']}")

        ps_count = await db.fetchval(
            "SELECT COUNT(*) FROM pro_player_stats WHERE game_id = $1", gid)
        print(f"  player_stats rows: {ps_count}")

        draft_count = await db.fetchval(
            "SELECT COUNT(*) FROM pro_draft_actions WHERE game_id = $1", gid)
        print(f"  draft_actions rows: {draft_count}")

        events_count = await db.fetchval(
            "SELECT COUNT(*) FROM pro_game_events WHERE game_id = $1", gid)
        print(f"  game_events rows: {events_count}")

        ts_count = await db.fetchval(
            "SELECT COUNT(*) FROM pro_team_stats WHERE game_id = $1", gid)
        print(f"  team_stats rows: {ts_count}")

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(check(sys.argv[1]))
