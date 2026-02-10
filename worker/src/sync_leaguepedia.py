"""
Leaguepedia Historical Data Sync

Backfills pro_* tables with historical data from Leaguepedia.
Run standalone: python -m src.sync_leaguepedia

Data flow:
  Leaguepedia → pro_leagues, pro_tournaments, pro_teams, players,
                pro_matches, pro_games, pro_player_stats,
                pro_drafts, pro_draft_actions,
                pro_player_aggregated_stats, pro_team_stats, pro_champion_stats
"""

import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime

import httpx
import psycopg2
import psycopg2.extras
import structlog
from dotenv import load_dotenv

load_dotenv()

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.services.leaguepedia_client import LeaguepediaClient

logger = structlog.get_logger(__name__)

# ==========================================
# Configuration
# ==========================================

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/esports_tracker")
LEAGUEPEDIA_MAX_YEAR = int(os.getenv("LEAGUEPEDIA_MAX_YEAR", "2025"))

LEAGUES = [
    "LoL EMEA Championship",         # LEC (2019+)
    "EU League Championship Series",  # EU LCS (2013-2018)
    "La Ligue Française",             # LFL
    "LoL Champions Korea",            # LCK
    "LoL Pro League",                 # LPL
    "League Championship Series",     # LCS NA
]

# League short names and regions for pro_leagues
LEAGUE_META = {
    "LoL EMEA Championship": {"short": "LEC", "region": "EMEA", "tier": 1},
    "EU League Championship Series": {"short": "EU LCS", "region": "EMEA", "tier": 1},
    "La Ligue Française": {"short": "LFL", "region": "EMEA", "tier": 2},
    "LoL Champions Korea": {"short": "LCK", "region": "Korea", "tier": 1},
    "LoL Pro League": {"short": "LPL", "region": "China", "tier": 1},
    "League Championship Series": {"short": "LCS", "region": "Americas", "tier": 1},
}

# Role normalization
ROLE_MAP = {
    "1": "Top",
    "2": "Jungle",
    "3": "Mid",
    "4": "ADC",
    "5": "Support",
    "top": "Top",
    "jungle": "Jungle",
    "jng": "Jungle",
    "mid": "Mid",
    "adc": "ADC",
    "bot": "ADC",
    "support": "Support",
    "sup": "Support",
}

# Draft action order (standard 20-action fearless format)
PICK_BAN_ORDER = [
    ("ban", "team1", 1), ("ban", "team2", 2), ("ban", "team1", 3),
    ("ban", "team2", 4), ("ban", "team1", 5), ("ban", "team2", 6),
    ("pick", "team1", 7), ("pick", "team2", 8), ("pick", "team2", 9),
    ("pick", "team1", 10), ("pick", "team1", 11), ("pick", "team2", 12),
    ("ban", "team2", 13), ("ban", "team1", 14), ("ban", "team2", 15),
    ("ban", "team1", 16),
    ("pick", "team2", 17), ("pick", "team1", 18),
    ("pick", "team1", 19), ("pick", "team2", 20),
]


# ==========================================
# Champion Name → ID Mapping (DDragon)
# ==========================================

_champion_name_to_id: dict[str, int] = {}


def load_champion_mapping() -> None:
    """Load champion name→id mapping from DDragon."""
    global _champion_name_to_id

    # Try local file first
    local_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "frontend", "src", "lib", "champions.json",
    )

    data = None
    if os.path.exists(local_path):
        with open(local_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        logger.info("Loaded champion mapping from local file", count=len(data.get("champions", {})))
    else:
        # Fetch from DDragon
        try:
            resp = httpx.get(
                "https://ddragon.leagueoflegends.com/cdn/16.1.1/data/en_US/champion.json",
                timeout=30,
            )
            resp.raise_for_status()
            ddragon = resp.json()
            # Build same format as local file
            data = {"champions": {}}
            for champ_data in ddragon.get("data", {}).values():
                cid = int(champ_data["key"])
                data["champions"][str(cid)] = {
                    "id": cid,
                    "name": champ_data["name"],
                    "key": champ_data["id"],
                }
            logger.info("Loaded champion mapping from DDragon", count=len(data["champions"]))
        except Exception as e:
            logger.warning("Failed to load DDragon data, champion_id will be NULL", error=str(e))
            return

    if data:
        for cid_str, champ in data.get("champions", {}).items():
            name = champ["name"]
            _champion_name_to_id[name.lower()] = int(cid_str)
            # Also index by DDragon key (e.g. "MonkeyKing" for "Wukong")
            if "key" in champ and champ["key"].lower() != name.lower():
                _champion_name_to_id[champ["key"].lower()] = int(cid_str)

    # Common Leaguepedia name variants
    aliases = {
        "wukong": "monkeyking",
        "renata glasc": "renata",
        "nunu & willump": "nunu",
        "cho'gath": "cho'gath",
        "kha'zix": "kha'zix",
        "kai'sa": "kai'sa",
        "rek'sai": "rek'sai",
        "vel'koz": "vel'koz",
        "kog'maw": "kog'maw",
        "bel'veth": "bel'veth",
    }
    for alias, canonical in aliases.items():
        if canonical.lower() in _champion_name_to_id and alias.lower() not in _champion_name_to_id:
            _champion_name_to_id[alias.lower()] = _champion_name_to_id[canonical.lower()]


def get_champion_id(name: str | None) -> int | None:
    """Get champion ID from name, returns None if not found."""
    if not name:
        return None
    return _champion_name_to_id.get(name.lower())


# ==========================================
# Helper functions
# ==========================================

def to_int(value, default=0) -> int:
    """Convert value to int safely."""
    if value is None or value == "":
        return default
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return default


def to_float(value, default=0.0) -> float:
    """Convert value to float safely."""
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def normalize_role(role: str | None) -> str | None:
    """Normalize role string to standard format."""
    if not role:
        return None
    return ROLE_MAP.get(role.lower().strip(), role.strip())


def make_slug(text: str) -> str:
    """Create a URL-friendly slug from text."""
    return text.lower().replace("/", "-").replace(" ", "-").replace("'", "")


def parse_datetime(dt_str: str | None) -> datetime | None:
    """Parse Leaguepedia datetime string."""
    if not dt_str:
        return None
    try:
        # Leaguepedia format: "2024-01-15 18:00:00"
        return datetime.strptime(dt_str.strip(), "%Y-%m-%d %H:%M:%S")
    except ValueError:
        try:
            return datetime.strptime(dt_str.strip(), "%Y-%m-%d")
        except ValueError:
            return None


def extract_year(overview_page: str, date_start: str | None) -> int | None:
    """Extract year from tournament data."""
    if date_start:
        dt = parse_datetime(date_start)
        if dt:
            return dt.year
    # Try from overview page (e.g. "LFL/2024 Season/Spring Season")
    for part in overview_page.split("/"):
        part = part.strip()
        if part.isdigit() and 2010 <= int(part) <= 2030:
            return int(part)
        for word in part.split():
            if word.isdigit() and 2010 <= int(word) <= 2030:
                return int(word)
    return None


# ==========================================
# Database Operations
# ==========================================

class DB:
    """Synchronous PostgreSQL operations for Leaguepedia sync."""

    def __init__(self, dsn: str):
        self.conn = psycopg2.connect(dsn)
        self.conn.autocommit = False
        logger.info("Database connected")

    def close(self):
        self.conn.close()

    def commit(self):
        self.conn.commit()

    # --- Pro Leagues ---

    def upsert_pro_league(
        self, name: str, external_id: str, short_name: str | None = None,
        region: str | None = None, tier: int = 1,
    ) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pro_leagues (name, external_id, short_name, region, tier, updated_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                ON CONFLICT (name) DO UPDATE SET
                    external_id = COALESCE(EXCLUDED.external_id, pro_leagues.external_id),
                    short_name = COALESCE(EXCLUDED.short_name, pro_leagues.short_name),
                    region = COALESCE(EXCLUDED.region, pro_leagues.region),
                    tier = EXCLUDED.tier,
                    updated_at = NOW()
                RETURNING league_id
                """,
                (name, external_id, short_name, region, tier),
            )
            return cur.fetchone()[0]

    # --- Pro Teams ---

    def upsert_pro_team(self, external_id: str, name: str) -> int:
        """Upsert a pro team, matching by name first to avoid duplicates across sources."""
        with self.conn.cursor() as cur:
            # First, try to find an existing team by name (case-insensitive)
            cur.execute(
                "SELECT team_id FROM pro_teams WHERE LOWER(TRIM(name)) = LOWER(TRIM(%s)) LIMIT 1",
                (name,),
            )
            row = cur.fetchone()
            if row:
                return row[0]

            # No match by name - insert with lp: external_id
            cur.execute(
                """
                INSERT INTO pro_teams (external_id, name, updated_at)
                VALUES (%s, %s, NOW())
                ON CONFLICT (external_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    updated_at = NOW()
                RETURNING team_id
                """,
                (external_id, name),
            )
            return cur.fetchone()[0]

    def dedup_teams(self) -> int:
        """Merge duplicate pro_teams entries (lp: vs GRID) by name.

        For each lp: team that has a GRID counterpart with the same name,
        re-point all FK references to the GRID team_id and delete the lp: row.

        Returns:
            Number of teams merged.
        """
        with self.conn.cursor() as cur:
            # Find lp: teams that have a GRID counterpart with the same name
            cur.execute("""
                SELECT lp.team_id  AS lp_id,
                       grid.team_id AS grid_id,
                       lp.name,
                       lp.external_id AS lp_ext,
                       grid.external_id AS grid_ext
                FROM pro_teams lp
                JOIN pro_teams grid
                  ON LOWER(TRIM(lp.name)) = LOWER(TRIM(grid.name))
                 AND grid.team_id != lp.team_id
                WHERE lp.external_id LIKE 'lp:%'
                  AND grid.external_id NOT LIKE 'lp:%'
            """)
            duplicates = cur.fetchall()

            if not duplicates:
                logger.info("No duplicate teams to merge")
                return 0

            logger.info(f"Found {len(duplicates)} duplicate teams to merge")

            merged = 0
            for lp_id, grid_id, name, lp_ext, grid_ext in duplicates:
                logger.info(
                    "Merging team",
                    name=name,
                    lp_id=lp_id,
                    grid_id=grid_id,
                    lp_ext=lp_ext,
                    grid_ext=grid_ext,
                )

                # Update all FK references from lp_id → grid_id
                cur.execute(
                    "UPDATE pro_games SET blue_team_id = %s WHERE blue_team_id = %s",
                    (grid_id, lp_id),
                )
                cur.execute(
                    "UPDATE pro_games SET red_team_id = %s WHERE red_team_id = %s",
                    (grid_id, lp_id),
                )
                cur.execute(
                    "UPDATE pro_games SET winner_team_id = %s WHERE winner_team_id = %s",
                    (grid_id, lp_id),
                )
                cur.execute(
                    "UPDATE pro_player_stats SET team_id = %s WHERE team_id = %s",
                    (grid_id, lp_id),
                )
                cur.execute(
                    "UPDATE pro_team_stats SET team_id = %s WHERE team_id = %s",
                    (grid_id, lp_id),
                )
                cur.execute(
                    "UPDATE pro_player_aggregated_stats SET team_id = %s WHERE team_id = %s",
                    (grid_id, lp_id),
                )

                # Delete the duplicate lp: team
                cur.execute(
                    "DELETE FROM pro_teams WHERE team_id = %s",
                    (lp_id,),
                )

                merged += 1

            self.conn.commit()
            logger.info(f"Merged {merged} duplicate teams")
            return merged

    # --- Players ---

    def upsert_player(self, slug: str, current_pseudo: str) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO players (slug, current_pseudo)
                VALUES (%s, %s)
                ON CONFLICT (slug) DO UPDATE SET
                    current_pseudo = EXCLUDED.current_pseudo
                RETURNING player_id
                """,
                (slug, current_pseudo),
            )
            return cur.fetchone()[0]

    def upsert_player_alias(self, player_id: int, alias: str, source: str = "leaguepedia") -> None:
        """Insert a player alias if it doesn't already exist."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO player_aliases (player_id, alias, source)
                VALUES (%s, %s, %s)
                ON CONFLICT (player_id, alias) DO NOTHING
                """,
                (player_id, alias, source),
            )

    def backfill_aliases(self) -> int:
        """Backfill player_aliases from existing pro_player_stats data.

        Returns:
            Number of aliases inserted.
        """
        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO player_aliases (player_id, alias, source)
                SELECT DISTINCT ps.player_id, ps.player_name, 'leaguepedia'
                FROM pro_player_stats ps
                WHERE ps.player_id IS NOT NULL
                  AND ps.player_name IS NOT NULL
                  AND ps.player_name != ''
                ON CONFLICT (player_id, alias) DO NOTHING
            """)
            count = cur.rowcount
            self.conn.commit()
            return count

    # --- Pro Tournaments ---

    def upsert_pro_tournament(
        self, external_id: str, name: str, slug: str,
        pro_league_id: int, start_date: datetime | None,
        year: int | None,
    ) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pro_tournaments (
                    external_id, name, slug, pro_league_id, start_date, year, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (external_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    slug = EXCLUDED.slug,
                    pro_league_id = COALESCE(EXCLUDED.pro_league_id, pro_tournaments.pro_league_id),
                    start_date = COALESCE(EXCLUDED.start_date, pro_tournaments.start_date),
                    year = COALESCE(EXCLUDED.year, pro_tournaments.year),
                    updated_at = NOW()
                RETURNING tournament_id
                """,
                (external_id, name, slug, pro_league_id, start_date, year),
            )
            return cur.fetchone()[0]

    def is_tournament_complete(self, external_id: str) -> bool | None:
        """Check if tournament is marked complete. Returns None if not found."""
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT is_complete FROM pro_tournaments WHERE external_id = %s",
                (external_id,),
            )
            row = cur.fetchone()
            return row[0] if row else None

    def mark_tournament_complete(self, tournament_id: int) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE pro_tournaments SET is_complete = TRUE, updated_at = NOW() WHERE tournament_id = %s",
                (tournament_id,),
            )

    # --- Pro Matches ---

    def upsert_pro_match(
        self, external_id: str, tournament_id: int,
        team1_external_id: str, team2_external_id: str,
        team1_score: int = 0, team2_score: int = 0,
        format_str: str = "bo3", status: str = "completed",
        started_at: datetime | None = None,
    ) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pro_matches (
                    external_id, tournament_id,
                    team1_external_id, team2_external_id,
                    team1_score, team2_score, format, status,
                    started_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (external_id) DO UPDATE SET
                    tournament_id = COALESCE(EXCLUDED.tournament_id, pro_matches.tournament_id),
                    team1_external_id = COALESCE(EXCLUDED.team1_external_id, pro_matches.team1_external_id),
                    team2_external_id = COALESCE(EXCLUDED.team2_external_id, pro_matches.team2_external_id),
                    team1_score = EXCLUDED.team1_score,
                    team2_score = EXCLUDED.team2_score,
                    format = EXCLUDED.format,
                    status = CASE
                        WHEN pro_matches.status = 'processed' THEN 'processed'
                        ELSE EXCLUDED.status
                    END,
                    started_at = COALESCE(EXCLUDED.started_at, pro_matches.started_at),
                    updated_at = NOW()
                RETURNING match_id
                """,
                (
                    external_id, tournament_id,
                    team1_external_id, team2_external_id,
                    team1_score, team2_score, format_str, status,
                    started_at,
                ),
            )
            return cur.fetchone()[0]

    # --- Pro Games ---

    def upsert_pro_game(
        self, external_id: str, match_id: int, game_number: int,
        blue_team_id: int | None, red_team_id: int | None,
        winner_team_id: int | None, duration: int | None,
        patch: str | None, started_at: datetime | None,
    ) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pro_games (
                    external_id, match_id, game_number,
                    blue_team_id, red_team_id, winner_team_id,
                    duration, status, patch, started_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'completed', %s, %s, NOW())
                ON CONFLICT (external_id) DO UPDATE SET
                    match_id = EXCLUDED.match_id,
                    game_number = EXCLUDED.game_number,
                    blue_team_id = COALESCE(EXCLUDED.blue_team_id, pro_games.blue_team_id),
                    red_team_id = COALESCE(EXCLUDED.red_team_id, pro_games.red_team_id),
                    winner_team_id = EXCLUDED.winner_team_id,
                    duration = COALESCE(EXCLUDED.duration, pro_games.duration),
                    status = CASE
                        WHEN pro_games.status = 'processed' THEN 'processed'
                        ELSE 'completed'
                    END,
                    patch = COALESCE(EXCLUDED.patch, pro_games.patch),
                    started_at = COALESCE(EXCLUDED.started_at, pro_games.started_at),
                    updated_at = NOW()
                RETURNING game_id
                """,
                (
                    external_id, match_id, game_number,
                    blue_team_id, red_team_id, winner_team_id,
                    duration, patch, started_at,
                ),
            )
            return cur.fetchone()[0]

    # --- Pro Player Stats ---

    def insert_player_stats_batch(self, game_id: int, stats: list[dict]) -> None:
        """Insert player stats for a game (DELETE + INSERT for idempotency)."""
        if not stats:
            return

        with self.conn.cursor() as cur:
            cur.execute("DELETE FROM pro_player_stats WHERE game_id = %s", (game_id,))

            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO pro_player_stats (
                    game_id, player_external_id, player_name, team_id, team_side, role,
                    champion_id, champion_name,
                    kills, deaths, assists, cs, gold_earned, damage_dealt, damage_taken,
                    first_blood_participant, first_blood_victim,
                    vision, stats_at_15, max_diffs, multi_kills, solo_stats,
                    items, runes, timing_data, proximity
                )
                VALUES %s
                """,
                [
                    (
                        game_id,
                        s.get("player_external_id"),
                        s.get("player_name", ""),
                        s.get("team_id"),
                        s.get("team_side"),
                        s.get("role"),
                        s.get("champion_id"),
                        s.get("champion_name"),
                        s.get("kills", 0),
                        s.get("deaths", 0),
                        s.get("assists", 0),
                        s.get("cs", 0),
                        s.get("gold_earned", 0),
                        s.get("damage_dealt", 0),
                        s.get("damage_taken", 0),
                        False,  # first_blood_participant
                        False,  # first_blood_victim
                        json.dumps(s.get("vision", {})),
                        json.dumps({}),  # stats_at_15
                        json.dumps({}),  # max_diffs
                        json.dumps({}),  # multi_kills
                        json.dumps({}),  # solo_stats
                        json.dumps([]),  # items
                        json.dumps({}),  # runes
                        json.dumps({}),  # timing_data
                        json.dumps({}),  # proximity
                    )
                    for s in stats
                ],
            )

    # --- Pro Draft Actions ---

    def insert_draft_actions_batch(self, game_id: int, actions: list[dict]) -> None:
        """Insert draft actions for a game (DELETE + INSERT for idempotency)."""
        if not actions:
            return

        with self.conn.cursor() as cur:
            cur.execute("DELETE FROM pro_draft_actions WHERE game_id = %s", (game_id,))

            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO pro_draft_actions (
                    game_id, action_order, action_type, team_side, champion_id, role
                )
                VALUES %s
                """,
                [
                    (
                        game_id,
                        a["action_order"],
                        a["action_type"],
                        a["team_side"],
                        a.get("champion_id", 0),
                        a.get("role"),
                    )
                    for a in actions
                ],
            )

    # --- Aggregated Stats ---

    def upsert_player_aggregated_stats(
        self, player_id: int, tournament_id: int, team_id: int | None,
        role: str | None, stats: dict,
    ) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pro_player_aggregated_stats (
                    player_id, tournament_id, team_id, role,
                    games_played, games_won, win_rate,
                    total_kills, total_deaths, total_assists, total_cs, total_gold, total_damage,
                    total_vision_score,
                    avg_kills, avg_deaths, avg_assists, avg_kda,
                    avg_cs_per_min, avg_gold_per_min, avg_damage_per_min, avg_vision_score,
                    avg_kill_participation,
                    unique_champions_played,
                    created_at, updated_at
                )
                VALUES (
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s,
                    NOW(), NOW()
                )
                ON CONFLICT (player_id, tournament_id) DO UPDATE SET
                    team_id = EXCLUDED.team_id,
                    role = EXCLUDED.role,
                    games_played = EXCLUDED.games_played,
                    games_won = EXCLUDED.games_won,
                    win_rate = EXCLUDED.win_rate,
                    total_kills = EXCLUDED.total_kills,
                    total_deaths = EXCLUDED.total_deaths,
                    total_assists = EXCLUDED.total_assists,
                    total_cs = EXCLUDED.total_cs,
                    total_gold = EXCLUDED.total_gold,
                    total_damage = EXCLUDED.total_damage,
                    total_vision_score = EXCLUDED.total_vision_score,
                    avg_kills = EXCLUDED.avg_kills,
                    avg_deaths = EXCLUDED.avg_deaths,
                    avg_assists = EXCLUDED.avg_assists,
                    avg_kda = EXCLUDED.avg_kda,
                    avg_cs_per_min = EXCLUDED.avg_cs_per_min,
                    avg_gold_per_min = EXCLUDED.avg_gold_per_min,
                    avg_damage_per_min = EXCLUDED.avg_damage_per_min,
                    avg_vision_score = EXCLUDED.avg_vision_score,
                    avg_kill_participation = EXCLUDED.avg_kill_participation,
                    unique_champions_played = EXCLUDED.unique_champions_played,
                    updated_at = NOW()
                """,
                (
                    player_id, tournament_id, team_id, role,
                    stats["games_played"], stats["games_won"], stats["win_rate"],
                    stats["total_kills"], stats["total_deaths"], stats["total_assists"],
                    stats["total_cs"], stats["total_gold"], stats["total_damage"],
                    stats["total_vision_score"],
                    stats["avg_kills"], stats["avg_deaths"], stats["avg_assists"],
                    stats["avg_kda"],
                    stats["avg_cs_per_min"], stats["avg_gold_per_min"],
                    stats["avg_damage_per_min"], stats["avg_vision_score"],
                    stats["avg_kill_participation"],
                    stats["unique_champions"],
                ),
            )

    def upsert_team_stats(
        self, team_id: int, tournament_id: int, stats: dict,
    ) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pro_team_stats (
                    team_id, tournament_id,
                    matches_played, matches_won, games_played, games_won,
                    match_win_rate, game_win_rate,
                    avg_game_duration, avg_kills,
                    blue_side_games, blue_side_wins, red_side_games, red_side_wins,
                    created_at, updated_at
                )
                VALUES (
                    %s, %s,
                    %s, %s, %s, %s,
                    %s, %s,
                    %s, %s,
                    %s, %s, %s, %s,
                    NOW(), NOW()
                )
                ON CONFLICT (team_id, tournament_id) DO UPDATE SET
                    matches_played = EXCLUDED.matches_played,
                    matches_won = EXCLUDED.matches_won,
                    games_played = EXCLUDED.games_played,
                    games_won = EXCLUDED.games_won,
                    match_win_rate = EXCLUDED.match_win_rate,
                    game_win_rate = EXCLUDED.game_win_rate,
                    avg_game_duration = EXCLUDED.avg_game_duration,
                    avg_kills = EXCLUDED.avg_kills,
                    blue_side_games = EXCLUDED.blue_side_games,
                    blue_side_wins = EXCLUDED.blue_side_wins,
                    red_side_games = EXCLUDED.red_side_games,
                    red_side_wins = EXCLUDED.red_side_wins,
                    updated_at = NOW()
                """,
                (
                    team_id, tournament_id,
                    stats["matches_played"], stats["matches_won"],
                    stats["games_played"], stats["games_won"],
                    stats["match_win_rate"], stats["game_win_rate"],
                    stats["avg_game_duration"], stats["avg_kills"],
                    stats["blue_side_games"], stats["blue_side_wins"],
                    stats["red_side_games"], stats["red_side_wins"],
                ),
            )

    def upsert_champion_stats(
        self, champion_id: int, tournament_id: int, stats: dict,
    ) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pro_champion_stats (
                    champion_id, tournament_id,
                    picks, bans, wins, losses,
                    presence_rate, pick_rate, ban_rate, win_rate,
                    avg_kills, avg_deaths, avg_assists, avg_kda,
                    avg_cs_per_min, avg_gold_per_min,
                    blue_side_picks, blue_side_wins, red_side_picks, red_side_wins,
                    top_picks, jungle_picks, mid_picks, adc_picks, support_picks,
                    created_at, updated_at
                )
                VALUES (
                    %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s, %s, %s,
                    NOW(), NOW()
                )
                ON CONFLICT (champion_id, tournament_id) DO UPDATE SET
                    picks = EXCLUDED.picks,
                    bans = EXCLUDED.bans,
                    wins = EXCLUDED.wins,
                    losses = EXCLUDED.losses,
                    presence_rate = EXCLUDED.presence_rate,
                    pick_rate = EXCLUDED.pick_rate,
                    ban_rate = EXCLUDED.ban_rate,
                    win_rate = EXCLUDED.win_rate,
                    avg_kills = EXCLUDED.avg_kills,
                    avg_deaths = EXCLUDED.avg_deaths,
                    avg_assists = EXCLUDED.avg_assists,
                    avg_kda = EXCLUDED.avg_kda,
                    avg_cs_per_min = EXCLUDED.avg_cs_per_min,
                    avg_gold_per_min = EXCLUDED.avg_gold_per_min,
                    blue_side_picks = EXCLUDED.blue_side_picks,
                    blue_side_wins = EXCLUDED.blue_side_wins,
                    red_side_picks = EXCLUDED.red_side_picks,
                    red_side_wins = EXCLUDED.red_side_wins,
                    top_picks = EXCLUDED.top_picks,
                    jungle_picks = EXCLUDED.jungle_picks,
                    mid_picks = EXCLUDED.mid_picks,
                    adc_picks = EXCLUDED.adc_picks,
                    support_picks = EXCLUDED.support_picks,
                    updated_at = NOW()
                """,
                (
                    champion_id, tournament_id,
                    stats["picks"], stats["bans"], stats["wins"], stats["losses"],
                    stats["presence_rate"], stats["pick_rate"],
                    stats["ban_rate"], stats["win_rate"],
                    stats["avg_kills"], stats["avg_deaths"],
                    stats["avg_assists"], stats["avg_kda"],
                    stats["avg_cs_per_min"], stats["avg_gold_per_min"],
                    stats["blue_side_picks"], stats["blue_side_wins"],
                    stats["red_side_picks"], stats["red_side_wins"],
                    stats["top_picks"], stats["jungle_picks"],
                    stats["mid_picks"], stats["adc_picks"], stats["support_picks"],
                ),
            )


# ==========================================
# Sync Logic
# ==========================================

def process_tournament(
    lp: LeaguepediaClient, db: DB, overview_page: str,
    tournament_name: str, tournament_id: int,
    team_cache: dict[str, int], player_cache: dict[str, int],
) -> dict:
    """Process a single tournament: fetch games and stats, insert into DB.

    Returns:
        Stats dict with counts
    """
    stats = {"games": 0, "players": 0, "drafts": 0}

    # 1. Fetch scoreboard data (players + games join)
    logger.info("Fetching scoreboard data", tournament=tournament_name)
    scoreboard_rows = lp.get_scoreboard_data(overview_page)
    if not scoreboard_rows:
        logger.warning("No scoreboard data found", tournament=tournament_name)
        return stats

    logger.info("Scoreboard rows fetched", count=len(scoreboard_rows), tournament=tournament_name)

    # 2. Group rows by GameId
    games_data: dict[str, list[dict]] = defaultdict(list)
    for row in scoreboard_rows:
        game_id = row.get("GameId")
        if game_id:
            games_data[game_id].append(row)

    # 3. Fetch match schedule for match metadata
    match_rows = lp.get_match_schedule(overview_page)
    match_map: dict[str, dict] = {}
    for mr in match_rows:
        mid = mr.get("MatchId")
        if mid:
            match_map[mid] = mr

    # 4. Process each game
    for game_id, players in games_data.items():
        if len(players) != 10:
            logger.warning(
                "Unexpected player count in game, skipping",
                game_id=game_id,
                count=len(players),
            )
            continue

        first_row = players[0]
        match_id_str = first_row.get("MatchId", "")
        game_number = to_int(first_row.get("N GameInMatch"), 1)
        game_datetime = parse_datetime(first_row.get("DateTime UTC"))
        duration_minutes = to_float(first_row.get("Gamelength Number"))
        duration_seconds = int(duration_minutes * 60) if duration_minutes > 0 else None
        patch = first_row.get("Patch")
        if patch:
            # Keep only major.minor
            parts = patch.split(".")
            patch = ".".join(parts[:2]) if len(parts) >= 2 else patch

        team1_name = first_row.get("Team1", "")
        team2_name = first_row.get("Team2", "")

        # Upsert teams
        if team1_name and team1_name not in team_cache:
            ext_id = f"lp:{team1_name}"
            team_cache[team1_name] = db.upsert_pro_team(ext_id, team1_name)

        if team2_name and team2_name not in team_cache:
            ext_id = f"lp:{team2_name}"
            team_cache[team2_name] = db.upsert_pro_team(ext_id, team2_name)

        blue_team_id = team_cache.get(team1_name)
        red_team_id = team_cache.get(team2_name)

        # Determine winner from player data
        winner_team_id = None
        for p in players:
            if p.get("PlayerWin") == "Yes":
                winner_team_name = p.get("Team", "")
                if winner_team_name in team_cache:
                    winner_team_id = team_cache[winner_team_name]
                break

        # Figure out which side team1/team2 are on
        # Team1 in ScoreboardGames is typically Blue, Team2 is Red
        # But we confirm via player Side field
        side_teams: dict[str, str] = {}  # side → team_name
        for p in players:
            side = (p.get("Side") or "").strip()
            team = p.get("Team", "").strip()
            if side and team:
                side_teams[side.lower()] = team

        blue_team_name = side_teams.get("1", side_teams.get("blue", team1_name))
        red_team_name = side_teams.get("2", side_teams.get("red", team2_name))

        # Reassign team IDs based on actual sides
        if blue_team_name in team_cache:
            blue_team_id = team_cache[blue_team_name]
        if red_team_name in team_cache:
            red_team_id = team_cache[red_team_name]

        # Upsert match
        match_meta = match_map.get(match_id_str, {})
        best_of = to_int(match_meta.get("BestOf"), 1)
        format_str = f"bo{best_of}" if best_of > 0 else "bo1"

        # Calculate match scores from match_meta
        match_winner = match_meta.get("Winner", "")
        t1_ext = f"lp:{team1_name}" if team1_name else None
        t2_ext = f"lp:{team2_name}" if team2_name else None

        # We use the Leaguepedia match ID or generate one
        lp_match_ext = f"lp:{match_id_str}" if match_id_str else f"lp:{game_id}_match"
        match_db_id = db.upsert_pro_match(
            external_id=lp_match_ext,
            tournament_id=tournament_id,
            team1_external_id=t1_ext,
            team2_external_id=t2_ext,
            format_str=format_str,
            status="completed",
            started_at=game_datetime,
        )

        # Upsert game
        lp_game_ext = f"lp:{game_id}"
        game_db_id = db.upsert_pro_game(
            external_id=lp_game_ext,
            match_id=match_db_id,
            game_number=game_number,
            blue_team_id=blue_team_id,
            red_team_id=red_team_id,
            winner_team_id=winner_team_id,
            duration=duration_seconds,
            patch=patch,
            started_at=game_datetime,
        )

        # Insert player stats
        player_stats = []
        for p in players:
            link = (p.get("Link") or p.get("Name") or "").strip()
            name = (p.get("Name") or link).strip()
            if not link:
                continue

            # Upsert player (use name as display pseudo, not link)
            slug = link.lower().replace(" ", "-")
            if slug not in player_cache:
                player_cache[slug] = db.upsert_player(slug, name)

            player_id = player_cache[slug]

            # Record aliases for search
            db.upsert_player_alias(player_id, name)
            if link.lower() != name.lower():
                db.upsert_player_alias(player_id, link)

            team_name = (p.get("Team") or "").strip()
            p_team_id = team_cache.get(team_name)

            side = (p.get("Side") or "").strip()
            team_side = "blue" if side in ("1", "Blue") else "red" if side in ("2", "Red") else None

            role = normalize_role(p.get("Role"))
            champion_name = (p.get("Champion") or "").strip()
            champion_id = get_champion_id(champion_name)

            vision_score = to_int(p.get("VisionScore"))
            vision_data = {"score": vision_score} if vision_score else {}

            player_stats.append({
                "player_external_id": link,
                "player_name": name,
                "team_id": p_team_id,
                "team_side": team_side,
                "role": role,
                "champion_id": champion_id,
                "champion_name": champion_name or None,
                "kills": to_int(p.get("Kills")),
                "deaths": to_int(p.get("Deaths")),
                "assists": to_int(p.get("Assists")),
                "cs": to_int(p.get("CS")),
                "gold_earned": to_int(p.get("Gold")),
                "damage_dealt": to_int(p.get("DamageToChampions")),
                "damage_taken": 0,
                "vision": vision_data,
            })

        db.insert_player_stats_batch(game_db_id, player_stats)
        stats["games"] += 1

    db.commit()

    # 5. Fetch and process picks/bans
    logger.info("Fetching picks/bans", tournament=tournament_name)
    picks_bans_rows = lp.get_picks_bans(overview_page)

    for pb_row in picks_bans_rows:
        pb_game_id = pb_row.get("GameId")
        if not pb_game_id:
            continue

        # Check if this game exists in our DB
        lp_game_ext = f"lp:{pb_game_id}"
        with db.conn.cursor() as cur:
            cur.execute(
                "SELECT game_id FROM pro_games WHERE external_id = %s",
                (lp_game_ext,),
            )
            row = cur.fetchone()
            if not row:
                continue
            game_db_id = row[0]

        actions = []
        action_order = 0

        # Process bans and picks in standard order
        for idx, (action_type, team_side, _global_order) in enumerate(PICK_BAN_ORDER):
            team_num = "1" if team_side == "team1" else "2"
            # Count how many of this action type this team has done up to (including) this position
            action_num = sum(
                1 for i in range(idx + 1)
                if PICK_BAN_ORDER[i][0] == action_type
                and PICK_BAN_ORDER[i][1] == team_side
            )

            if action_type == "ban":
                champ_key = f"Team{team_num}Ban{action_num}"
            else:
                champ_key = f"Team{team_num}Pick{action_num}"

            champ_name = (pb_row.get(champ_key) or "").strip()
            if not champ_name:
                continue

            champion_id = get_champion_id(champ_name) or 0

            role = None
            if action_type == "pick":
                role_key = f"Team{team_num}Role{action_num}"
                role = normalize_role(pb_row.get(role_key))

            action_order += 1
            actions.append({
                "action_order": action_order,
                "action_type": action_type,
                "team_side": team_side,
                "champion_id": champion_id,
                "role": role,
            })

        if actions:
            db.insert_draft_actions_batch(game_db_id, actions)
            stats["drafts"] += 1

    db.commit()

    # 6. Compute aggregated stats
    logger.info("Computing aggregated stats", tournament=tournament_name)
    compute_aggregated_stats(db, tournament_id, team_cache, player_cache)
    db.commit()

    return stats


def _f(val, default=0):
    """Convert a psycopg2 Decimal/numeric value to float for safe arithmetic."""
    if val is None:
        return float(default)
    return float(val)


def compute_aggregated_stats(
    db: DB, tournament_id: int,
    team_cache: dict[str, int], player_cache: dict[str, int],
) -> None:
    """Compute and upsert aggregated stats tables for a tournament."""

    with db.conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        # --- Player Aggregated Stats ---
        cur.execute(
            """
            SELECT
                ps.player_external_id,
                ps.player_name,
                ps.team_id,
                ps.role,
                COUNT(*) as games_played,
                SUM(CASE WHEN g.winner_team_id = ps.team_id THEN 1 ELSE 0 END) as games_won,
                SUM(ps.kills) as total_kills,
                SUM(ps.deaths) as total_deaths,
                SUM(ps.assists) as total_assists,
                SUM(ps.cs) as total_cs,
                SUM(ps.gold_earned) as total_gold,
                SUM(ps.damage_dealt) as total_damage,
                SUM(COALESCE((ps.vision->>'score')::int, 0)) as total_vision_score,
                SUM(g.duration) as total_duration,
                COUNT(DISTINCT ps.champion_name) as unique_champions,
                -- Per-game kill participation averaged
                AVG(
                    CASE WHEN team_kills.total_team_kills > 0
                    THEN (ps.kills + ps.assists)::float / team_kills.total_team_kills * 100.0
                    ELSE 0 END
                ) as avg_kill_participation
            FROM pro_player_stats ps
            JOIN pro_games g ON ps.game_id = g.game_id
            JOIN pro_matches m ON g.match_id = m.match_id
            LEFT JOIN LATERAL (
                SELECT SUM(ps2.kills) as total_team_kills
                FROM pro_player_stats ps2
                WHERE ps2.game_id = ps.game_id AND ps2.team_id = ps.team_id
            ) team_kills ON true
            WHERE m.tournament_id = %s
              AND g.status IN ('completed', 'processed')
            GROUP BY ps.player_external_id, ps.player_name, ps.team_id, ps.role
            """,
            (tournament_id,),
        )

        for row in cur.fetchall():
            player_ext = row["player_external_id"]
            if not player_ext:
                continue

            slug = player_ext.lower().replace(" ", "-")
            player_id = player_cache.get(slug)
            if not player_id:
                continue

            gp = _f(row["games_played"], 1)
            total_dur = _f(row["total_duration"], 1)
            total_deaths = _f(row["total_deaths"])
            total_kills = _f(row["total_kills"])
            total_assists = _f(row["total_assists"])

            avg_kda = round(
                (total_kills + total_assists) / max(total_deaths, 1.0), 2
            )
            avg_kp = round(_f(row["avg_kill_participation"]), 1)

            stats = {
                "games_played": int(gp),
                "games_won": int(_f(row["games_won"])),
                "win_rate": round(_f(row["games_won"]) * 100.0 / max(gp, 1.0), 1),
                "total_kills": int(total_kills),
                "total_deaths": int(total_deaths),
                "total_assists": int(total_assists),
                "total_cs": int(_f(row["total_cs"])),
                "total_gold": int(_f(row["total_gold"])),
                "total_damage": int(_f(row["total_damage"])),
                "total_vision_score": int(_f(row["total_vision_score"])),
                "avg_kills": round(total_kills / max(gp, 1.0), 2),
                "avg_deaths": round(total_deaths / max(gp, 1.0), 2),
                "avg_assists": round(total_assists / max(gp, 1.0), 2),
                "avg_kda": avg_kda,
                "avg_cs_per_min": round(
                    _f(row["total_cs"]) * 60.0 / max(total_dur, 1.0), 2
                ),
                "avg_gold_per_min": round(
                    _f(row["total_gold"]) * 60.0 / max(total_dur, 1.0), 2
                ),
                "avg_damage_per_min": round(
                    _f(row["total_damage"]) * 60.0 / max(total_dur, 1.0), 2
                ),
                "avg_vision_score": round(
                    _f(row["total_vision_score"]) / max(gp, 1.0), 2
                ),
                "avg_kill_participation": avg_kp,
                "unique_champions": int(_f(row["unique_champions"])),
            }

            db.upsert_player_aggregated_stats(
                player_id=player_id,
                tournament_id=tournament_id,
                team_id=row["team_id"],
                role=row["role"],
                stats=stats,
            )

        # --- Team Stats ---
        cur.execute(
            """
            WITH game_teams AS (
                SELECT
                    g.game_id, g.duration, g.winner_team_id,
                    g.blue_team_id, g.red_team_id,
                    m.match_id, m.external_id as match_ext,
                    m.team1_external_id, m.team2_external_id,
                    -- Blue side kills
                    (SELECT COALESCE(SUM(ps.kills), 0)
                     FROM pro_player_stats ps
                     WHERE ps.game_id = g.game_id AND ps.team_id = g.blue_team_id) as blue_kills,
                    -- Red side kills
                    (SELECT COALESCE(SUM(ps.kills), 0)
                     FROM pro_player_stats ps
                     WHERE ps.game_id = g.game_id AND ps.team_id = g.red_team_id) as red_kills
                FROM pro_games g
                JOIN pro_matches m ON g.match_id = m.match_id
                WHERE m.tournament_id = %s
                  AND g.status IN ('completed', 'processed')
            ),
            team_games AS (
                SELECT
                    team_id,
                    COUNT(*) as games_played,
                    SUM(CASE WHEN is_winner THEN 1 ELSE 0 END) as games_won,
                    AVG(duration) as avg_duration,
                    AVG(team_kills) as avg_kills,
                    SUM(CASE WHEN side = 'blue' THEN 1 ELSE 0 END) as blue_games,
                    SUM(CASE WHEN side = 'blue' AND is_winner THEN 1 ELSE 0 END) as blue_wins,
                    SUM(CASE WHEN side = 'red' THEN 1 ELSE 0 END) as red_games,
                    SUM(CASE WHEN side = 'red' AND is_winner THEN 1 ELSE 0 END) as red_wins
                FROM (
                    SELECT blue_team_id as team_id, 'blue' as side,
                           winner_team_id = blue_team_id as is_winner,
                           duration, blue_kills as team_kills, match_ext
                    FROM game_teams
                    WHERE blue_team_id IS NOT NULL
                    UNION ALL
                    SELECT red_team_id as team_id, 'red' as side,
                           winner_team_id = red_team_id as is_winner,
                           duration, red_kills as team_kills, match_ext
                    FROM game_teams
                    WHERE red_team_id IS NOT NULL
                ) sub
                GROUP BY team_id
            ),
            match_results AS (
                SELECT
                    team_id,
                    COUNT(DISTINCT match_ext) as matches_played,
                    COUNT(DISTINCT match_ext) FILTER (WHERE is_match_winner) as matches_won
                FROM (
                    SELECT
                        blue_team_id as team_id, match_ext,
                        (SELECT COUNT(*) FROM game_teams g2
                         WHERE g2.match_ext = gt.match_ext AND g2.winner_team_id = gt.blue_team_id)
                        >
                        (SELECT COUNT(*) FROM game_teams g2
                         WHERE g2.match_ext = gt.match_ext AND g2.winner_team_id = gt.red_team_id) as is_match_winner
                    FROM game_teams gt WHERE blue_team_id IS NOT NULL
                    UNION ALL
                    SELECT
                        red_team_id as team_id, match_ext,
                        (SELECT COUNT(*) FROM game_teams g2
                         WHERE g2.match_ext = gt.match_ext AND g2.winner_team_id = gt.red_team_id)
                        >
                        (SELECT COUNT(*) FROM game_teams g2
                         WHERE g2.match_ext = gt.match_ext AND g2.winner_team_id = gt.blue_team_id) as is_match_winner
                    FROM game_teams gt WHERE red_team_id IS NOT NULL
                ) sub2
                GROUP BY team_id
            )
            SELECT
                tg.team_id,
                tg.games_played, tg.games_won,
                COALESCE(mr.matches_played, 0) as matches_played,
                COALESCE(mr.matches_won, 0) as matches_won,
                tg.avg_duration, tg.avg_kills,
                tg.blue_games, tg.blue_wins,
                tg.red_games, tg.red_wins
            FROM team_games tg
            LEFT JOIN match_results mr ON tg.team_id = mr.team_id
            """,
            (tournament_id,),
        )

        for row in cur.fetchall():
            gp = _f(row["games_played"], 1)
            mp = _f(row["matches_played"], 1)

            stats = {
                "matches_played": int(_f(row["matches_played"])),
                "matches_won": int(_f(row["matches_won"])),
                "games_played": int(_f(row["games_played"])),
                "games_won": int(_f(row["games_won"])),
                "match_win_rate": round(
                    _f(row["matches_won"]) * 100.0 / max(mp, 1.0), 1
                ),
                "game_win_rate": round(
                    _f(row["games_won"]) * 100.0 / max(gp, 1.0), 1
                ),
                "avg_game_duration": round(_f(row["avg_duration"]), 0),
                "avg_kills": round(_f(row["avg_kills"]), 1),
                "blue_side_games": int(_f(row["blue_games"])),
                "blue_side_wins": int(_f(row["blue_wins"])),
                "red_side_games": int(_f(row["red_games"])),
                "red_side_wins": int(_f(row["red_wins"])),
            }

            db.upsert_team_stats(
                team_id=row["team_id"],
                tournament_id=tournament_id,
                stats=stats,
            )

        # --- Champion Stats ---
        # Count total games in tournament for presence rate
        cur.execute(
            """
            SELECT COUNT(DISTINCT g.game_id) as total_games
            FROM pro_games g
            JOIN pro_matches m ON g.match_id = m.match_id
            WHERE m.tournament_id = %s AND g.status IN ('completed', 'processed')
            """,
            (tournament_id,),
        )
        total_games = cur.fetchone()["total_games"] or 1

        # Pick stats from pro_player_stats
        cur.execute(
            """
            SELECT
                ps.champion_name,
                ps.champion_id,
                COUNT(*) as picks,
                SUM(CASE WHEN g.winner_team_id = ps.team_id THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN g.winner_team_id != ps.team_id OR g.winner_team_id IS NULL THEN 1 ELSE 0 END) as losses,
                AVG(ps.kills) as avg_kills,
                AVG(ps.deaths) as avg_deaths,
                AVG(ps.assists) as avg_assists,
                SUM(g.duration) as total_duration,
                AVG(ps.cs) as avg_cs,
                AVG(ps.gold_earned) as avg_gold,
                SUM(CASE WHEN ps.team_side = 'blue' THEN 1 ELSE 0 END) as blue_picks,
                SUM(CASE WHEN ps.team_side = 'blue' AND g.winner_team_id = ps.team_id THEN 1 ELSE 0 END) as blue_wins,
                SUM(CASE WHEN ps.team_side = 'red' THEN 1 ELSE 0 END) as red_picks,
                SUM(CASE WHEN ps.team_side = 'red' AND g.winner_team_id = ps.team_id THEN 1 ELSE 0 END) as red_wins,
                SUM(CASE WHEN ps.role = 'Top' THEN 1 ELSE 0 END) as top_picks,
                SUM(CASE WHEN ps.role = 'Jungle' THEN 1 ELSE 0 END) as jungle_picks,
                SUM(CASE WHEN ps.role = 'Mid' THEN 1 ELSE 0 END) as mid_picks,
                SUM(CASE WHEN ps.role = 'ADC' THEN 1 ELSE 0 END) as adc_picks,
                SUM(CASE WHEN ps.role = 'Support' THEN 1 ELSE 0 END) as support_picks
            FROM pro_player_stats ps
            JOIN pro_games g ON ps.game_id = g.game_id
            JOIN pro_matches m ON g.match_id = m.match_id
            WHERE m.tournament_id = %s
              AND g.status IN ('completed', 'processed')
              AND ps.champion_name IS NOT NULL AND ps.champion_name != ''
            GROUP BY ps.champion_name, ps.champion_id
            """,
            (tournament_id,),
        )

        champ_pick_data = {}
        for row in cur.fetchall():
            champ_name = row["champion_name"]
            c_id = row["champion_id"] or get_champion_id(champ_name)
            if not c_id:
                continue

            picks = int(_f(row["picks"]))
            total_dur = _f(row["total_duration"], 1)
            avg_cs_raw = _f(row["avg_cs"])
            avg_gold_raw = _f(row["avg_gold"])
            avg_dur_per_game = total_dur / max(picks, 1)

            champ_pick_data[c_id] = {
                "picks": picks,
                "wins": int(_f(row["wins"])),
                "losses": int(_f(row["losses"])),
                "avg_kills": round(_f(row["avg_kills"]), 2),
                "avg_deaths": round(_f(row["avg_deaths"]), 2),
                "avg_assists": round(_f(row["avg_assists"]), 2),
                "avg_kda": round(
                    (_f(row["avg_kills"]) + _f(row["avg_assists"]))
                    / max(_f(row["avg_deaths"]), 1.0),
                    2,
                ),
                "avg_cs_per_min": round(avg_cs_raw * 60.0 / max(avg_dur_per_game, 1.0), 2),
                "avg_gold_per_min": round(avg_gold_raw * 60.0 / max(avg_dur_per_game, 1.0), 2),
                "blue_side_picks": int(_f(row["blue_picks"])),
                "blue_side_wins": int(_f(row["blue_wins"])),
                "red_side_picks": int(_f(row["red_picks"])),
                "red_side_wins": int(_f(row["red_wins"])),
                "top_picks": int(_f(row["top_picks"])),
                "jungle_picks": int(_f(row["jungle_picks"])),
                "mid_picks": int(_f(row["mid_picks"])),
                "adc_picks": int(_f(row["adc_picks"])),
                "support_picks": int(_f(row["support_picks"])),
            }

        # Ban stats from pro_draft_actions
        cur.execute(
            """
            SELECT
                da.champion_id,
                COUNT(*) as bans
            FROM pro_draft_actions da
            JOIN pro_games g ON da.game_id = g.game_id
            JOIN pro_matches m ON g.match_id = m.match_id
            WHERE m.tournament_id = %s
              AND da.action_type = 'ban'
              AND da.champion_id > 0
            GROUP BY da.champion_id
            """,
            (tournament_id,),
        )

        champ_ban_data: dict[int, int] = {}
        for row in cur.fetchall():
            champ_ban_data[row["champion_id"]] = row["bans"] or 0

        # Merge picks + bans and upsert
        all_champ_ids = set(champ_pick_data.keys()) | set(champ_ban_data.keys())
        for c_id in all_champ_ids:
            pick_stats = champ_pick_data.get(c_id, {})
            picks = pick_stats.get("picks", 0)
            bans = champ_ban_data.get(c_id, 0)

            presence = picks + bans
            tg = _f(total_games, 1)
            presence_rate = round(presence * 100.0 / max(tg, 1.0), 1)
            pick_rate = round(picks * 100.0 / max(tg, 1.0), 1)
            ban_rate = round(bans * 100.0 / max(tg, 1.0), 1)
            win_rate = round(
                pick_stats.get("wins", 0) * 100.0 / max(picks, 1.0), 1
            )

            final_stats = {
                "picks": picks,
                "bans": bans,
                "wins": pick_stats.get("wins", 0),
                "losses": pick_stats.get("losses", 0),
                "presence_rate": presence_rate,
                "pick_rate": pick_rate,
                "ban_rate": ban_rate,
                "win_rate": win_rate,
                "avg_kills": pick_stats.get("avg_kills", 0),
                "avg_deaths": pick_stats.get("avg_deaths", 0),
                "avg_assists": pick_stats.get("avg_assists", 0),
                "avg_kda": pick_stats.get("avg_kda", 0),
                "avg_cs_per_min": pick_stats.get("avg_cs_per_min", 0),
                "avg_gold_per_min": pick_stats.get("avg_gold_per_min", 0),
                "blue_side_picks": pick_stats.get("blue_side_picks", 0),
                "blue_side_wins": pick_stats.get("blue_side_wins", 0),
                "red_side_picks": pick_stats.get("red_side_picks", 0),
                "red_side_wins": pick_stats.get("red_side_wins", 0),
                "top_picks": pick_stats.get("top_picks", 0),
                "jungle_picks": pick_stats.get("jungle_picks", 0),
                "mid_picks": pick_stats.get("mid_picks", 0),
                "adc_picks": pick_stats.get("adc_picks", 0),
                "support_picks": pick_stats.get("support_picks", 0),
            }

            db.upsert_champion_stats(c_id, tournament_id, final_stats)


# ==========================================
# Main Sync Orchestration
# ==========================================

def sync_league(lp: LeaguepediaClient, db: DB, league_name: str) -> dict:
    """Sync a single league from Leaguepedia into pro_* tables.

    Returns:
        Stats dict
    """
    meta = LEAGUE_META.get(league_name, {})
    short_name = meta.get("short", league_name[:10])
    region = meta.get("region")
    tier = meta.get("tier", 1)

    # 1. Upsert league
    external_id = f"lp:{league_name}"
    league_id = db.upsert_pro_league(
        name=league_name,
        external_id=external_id,
        short_name=short_name,
        region=region,
        tier=tier,
    )
    db.commit()

    logger.info("League upserted", league=league_name, league_id=league_id)

    # 2. Fetch tournaments
    tournaments = lp.get_tournaments_by_league(league_name)
    logger.info("Tournaments found", league=league_name, count=len(tournaments))

    # Caches (shared across tournaments for same teams/players)
    team_cache: dict[str, int] = {}
    player_cache: dict[str, int] = {}

    total_stats = {"tournaments": 0, "games": 0, "drafts": 0}

    for t in tournaments:
        overview = t.get("OverviewPage", "")
        name = t.get("Name", overview)
        date_start = t.get("DateStart")

        if not overview:
            continue

        # Filter by max year
        year = extract_year(overview, date_start)
        if year and year > LEAGUEPEDIA_MAX_YEAR:
            logger.debug("Skipping future tournament", tournament=name, year=year)
            continue

        # Check if already complete
        t_ext = f"lp:{overview}"
        is_complete = db.is_tournament_complete(t_ext)
        if is_complete is True:
            logger.debug("Tournament already complete, skipping", tournament=name)
            continue

        logger.info("Syncing tournament", tournament=name, overview=overview)

        # Upsert tournament
        start_dt = parse_datetime(date_start)
        tournament_id = db.upsert_pro_tournament(
            external_id=t_ext,
            name=name,
            slug=make_slug(overview),
            pro_league_id=league_id,
            start_date=start_dt,
            year=year,
        )
        db.commit()

        # Process tournament data
        try:
            t_stats = process_tournament(
                lp, db, overview, name, tournament_id,
                team_cache, player_cache,
            )
            total_stats["tournaments"] += 1
            total_stats["games"] += t_stats["games"]
            total_stats["drafts"] += t_stats["drafts"]

            # Check if tournament is complete
            try:
                if lp.all_games_played(overview):
                    db.mark_tournament_complete(tournament_id)
                    db.commit()
                    logger.info("Tournament marked complete", tournament=name)
            except Exception:
                pass  # Non-critical

        except Exception as e:
            logger.error(
                "Error processing tournament",
                tournament=name,
                error=str(e),
            )
            db.conn.rollback()

        # Rate limit between tournaments
        logger.info("Pausing 5s before next tournament...")
        time.sleep(5)

    return total_stats


def main():
    """Main entry point for Leaguepedia sync."""
    import argparse

    parser = argparse.ArgumentParser(description="Sync Leaguepedia historical data")
    parser.add_argument(
        "--leagues",
        nargs="*",
        default=None,
        help="Specific leagues to sync (default: all configured)",
    )
    parser.add_argument(
        "--max-year",
        type=int,
        default=None,
        help="Maximum year to sync (overrides LEAGUEPEDIA_MAX_YEAR env var)",
    )
    parser.add_argument(
        "--dedup",
        action="store_true",
        help="Only run team deduplication (merge lp: teams into GRID teams by name)",
    )
    parser.add_argument(
        "--backfill-aliases",
        action="store_true",
        help="Backfill player_aliases from existing pro_player_stats data",
    )
    args = parser.parse_args()

    global LEAGUEPEDIA_MAX_YEAR
    if args.max_year:
        LEAGUEPEDIA_MAX_YEAR = args.max_year

    # Dedup-only mode
    if args.dedup:
        logger.info("Running team deduplication only")
        db = DB(DATABASE_URL)
        try:
            merged = db.dedup_teams()
            logger.info(f"Deduplication complete: {merged} teams merged")
        finally:
            db.close()
        return

    # Backfill aliases from existing data
    if args.backfill_aliases:
        logger.info("Backfilling player aliases from pro_player_stats")
        db = DB(DATABASE_URL)
        try:
            count = db.backfill_aliases()
            logger.info(f"Backfill complete: {count} aliases inserted")
        finally:
            db.close()
        return

    leagues_to_sync = args.leagues or LEAGUES

    logger.info(
        "Starting Leaguepedia sync",
        leagues=leagues_to_sync,
        max_year=LEAGUEPEDIA_MAX_YEAR,
    )

    # Load champion mapping
    load_champion_mapping()
    logger.info("Champion mapping loaded", count=len(_champion_name_to_id))

    # Initialize
    lp = LeaguepediaClient()
    db = DB(DATABASE_URL)

    try:
        for league_name in leagues_to_sync:
            logger.info("=" * 60)
            logger.info(f"Starting league: {league_name}")
            logger.info("=" * 60)

            try:
                stats = sync_league(lp, db, league_name)
                logger.info(
                    "League sync complete",
                    league=league_name,
                    **stats,
                )
            except Exception as e:
                logger.error(
                    "Error syncing league",
                    league=league_name,
                    error=str(e),
                )

        logger.info("Leaguepedia sync finished")

    finally:
        db.close()


if __name__ == "__main__":
    main()
