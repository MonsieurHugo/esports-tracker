"""Quick diagnostic for a series. Usage: python -m src._check_series <series_id>"""
import asyncio, sys
from src.config import settings
from src.services.database import DatabaseService

async def check(sid: str):
    db = DatabaseService(settings.database_url)
    await db.connect_with_retry()

    match = await db.fetchrow(
        "SELECT match_id, external_id, status, team1_score, team2_score,"
        " team1_external_id, team2_external_id, failure_reason, failed_at, format"
        " FROM pro_matches WHERE external_id = $1", sid)
    if not match:
        print("Match not found")
        await db.disconnect()
        return

    print("=== Match ===")
    for k in match.keys():
        print(f"  {k}: {match[k]}")

    games = await db.fetch(
        "SELECT game_id, external_id, game_number, status, duration, winner_team_id"
        " FROM pro_games WHERE match_id = $1 ORDER BY game_number", match["match_id"])
    print(f"\n=== Games ({len(games)}) ===")
    for g in games:
        print(f"  game #{g['game_number']}: ext={g['external_id']}, status={g['status']}, dur={g['duration']}s, winner={g['winner_team_id']}")

    flags = await db.fetch(
        "SELECT flag_id, flag_type, severity, entity_type, external_id, context, resolved, created_at"
        " FROM data_quality_flags WHERE external_id = $1 ORDER BY created_at", sid)
    print(f"\n=== Data Quality Flags ({len(flags)}) ===")
    for f in flags:
        print(f"  [{f['severity']}] {f['flag_type']} resolved={f['resolved']} | {f['context']}")

    await db.disconnect()

if __name__ == "__main__":
    asyncio.run(check(sys.argv[1]))
