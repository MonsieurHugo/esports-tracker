"""
Leaguepedia Historical Data Sync

Backfills pro_* tables with historical data from Leaguepedia.
Run standalone: python -m src.sync_leaguepedia

Data flow:
  Leaguepedia → pro_leagues, pro_tournaments, pro_teams, players,
                pro_matches, pro_games, pro_player_stats,
                pro_drafts, pro_draft_actions,
                pro_team_stats, pro_champion_stats
"""

import json
import os
import re
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

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")
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
        # Fetch from DDragon (get latest version first)
        try:
            versions_resp = httpx.get(
                "https://ddragon.leagueoflegends.com/api/versions.json",
                timeout=15,
            )
            versions_resp.raise_for_status()
            latest_version = versions_resp.json()[0]
            logger.info("Using DDragon version", version=latest_version)

            resp = httpx.get(
                f"https://ddragon.leagueoflegends.com/cdn/{latest_version}/data/en_US/champion.json",
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


def parse_player_name(raw_name: str) -> tuple[str, str, str | None, str | None]:
    """Parse Leaguepedia disambiguated player name.

    Leaguepedia uses 'Pseudo (First Last)' for players sharing the same pseudo.
    Returns (clean_pseudo, slug, first_name, last_name).
    The slug keeps the full disambiguated form to avoid collisions.
    """
    match = re.match(r'^(.+?)\s*\((.+)\)\s*$', raw_name.strip())
    if match:
        pseudo = match.group(1).strip()
        real_name = match.group(2).strip()
        # Keep disambiguated slug to avoid collisions (e.g. two "Knight" players)
        slug = raw_name.strip().lower().replace(" ", "-")
        parts = real_name.split(None, 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else None
        return (pseudo, slug, first_name, last_name)
    clean = raw_name.strip()
    return (clean, clean.lower().replace(" ", "-"), None, None)


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

    def __init__(self, dsn: str, max_retries: int = 3):
        for attempt in range(1, max_retries + 1):
            try:
                self.conn = psycopg2.connect(dsn)
                self.conn.autocommit = False
                logger.info("Database connected")
                return
            except psycopg2.OperationalError as e:
                if attempt == max_retries:
                    logger.error("Failed to connect to database after retries", attempts=max_retries, error=str(e))
                    raise
                wait = 2 ** attempt
                logger.warning("Database connection failed, retrying", attempt=attempt, wait=wait, error=str(e))
                import time
                time.sleep(wait)

    def close(self):
        self.conn.close()

    def commit(self):
        self.conn.commit()

    # --- Pro Leagues ---

    def upsert_pro_league(
        self, name: str, external_id: str, short_name: str | None = None,
        region: str | None = None, tier: int = 1,
    ) -> int:
        # 1. Check mapping table first
        mapped_id = self.find_by_source_id("league", external_id)
        if mapped_id is not None:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE pro_leagues SET
                        short_name = COALESCE(%s, short_name),
                        region = COALESCE(%s, region),
                        tier = %s,
                        updated_at = NOW()
                    WHERE league_id = %s
                    """,
                    (short_name, region, tier, mapped_id),
                )
            return mapped_id

        # 2. Match by short_name (handles GRID vs Leaguepedia name differences)
        if short_name:
            with self.conn.cursor() as cur:
                cur.execute(
                    "SELECT league_id FROM pro_leagues WHERE short_name = %s LIMIT 1",
                    (short_name,),
                )
                existing = cur.fetchone()
            if existing:
                league_id = existing[0]
                with self.conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE pro_leagues SET
                            external_id = COALESCE(external_id, %s),
                            region = COALESCE(%s, region),
                            tier = %s,
                            updated_at = NOW()
                        WHERE league_id = %s
                        """,
                        (external_id, region, tier, league_id),
                    )
                source = "leaguepedia" if external_id.startswith("lp:") else "grid"
                self.register_mapping("league", league_id, source, external_id)
                return league_id

        # 3. Standard upsert by name
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
            league_id = cur.fetchone()[0]

        # 4. Register mapping
        source = "leaguepedia" if external_id.startswith("lp:") else "grid"
        self.register_mapping("league", league_id, source, external_id)
        return league_id

    # --- Pro Teams ---

    def upsert_pro_team(self, external_id: str, name: str) -> int:
        """Upsert a pro team, using mapping table then name match to avoid duplicates."""
        # 1. Check mapping table first
        mapped_id = self.find_by_source_id("team", external_id)
        if mapped_id is not None:
            return mapped_id

        with self.conn.cursor() as cur:
            # 2. Try to find an existing team by name (case-insensitive)
            cur.execute(
                "SELECT team_id FROM pro_teams WHERE LOWER(TRIM(name)) = LOWER(TRIM(%s)) LIMIT 1",
                (name,),
            )
            row = cur.fetchone()
            if row:
                team_id = row[0]
                # Register mapping for future lookups
                source = "leaguepedia" if external_id.startswith("lp:") else "grid"
                self.register_mapping("team", team_id, source, external_id)
            else:
                # 3. No match — insert new team
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
                team_id = cur.fetchone()[0]
                source = "leaguepedia" if external_id.startswith("lp:") else "grid"
                self.register_mapping("team", team_id, source, external_id)

            # Auto-lookup short_name from soloq teams table if still NULL
            cur.execute(
                """
                UPDATE pro_teams
                SET short_name = t.short_name, updated_at = NOW()
                FROM teams t
                WHERE pro_teams.team_id = %s
                  AND pro_teams.short_name IS NULL
                  AND LOWER(TRIM(pro_teams.name)) = LOWER(TRIM(t.current_name))
                  AND t.game_id = 1
                """,
                (team_id,),
            )

            return team_id

    def dedup_teams(self) -> int:
        """Legacy dedup: create proposals + auto-approve + apply. Returns merged count."""
        proposed = self.create_dedup_proposals()
        if proposed == 0:
            return 0
        # Auto-approve all pending proposals
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE pro_mapping_proposals SET status = 'approved', reviewed_at = NOW() WHERE status = 'pending'"
            )
        self.conn.commit()
        return self.apply_approved_proposals()

    def create_dedup_proposals(self) -> int:
        """Create merge proposals for lp: teams that have a GRID counterpart.

        Returns:
            Number of proposals created.
        """
        with self.conn.cursor() as cur:
            # Exact name match: lp: team → GRID team
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
                WHERE lp.external_id LIKE 'lp:%%'
                  AND grid.external_id NOT LIKE 'lp:%%'
            """)
            exact_matches = cur.fetchall()

            # Short name match: lp: team → GRID team (lower confidence)
            cur.execute("""
                SELECT lp.team_id  AS lp_id,
                       grid.team_id AS grid_id,
                       lp.name AS lp_name,
                       grid.name AS grid_name,
                       grid.short_name
                FROM pro_teams lp
                JOIN pro_teams grid
                  ON grid.short_name IS NOT NULL
                 AND LOWER(TRIM(lp.name)) = LOWER(TRIM(grid.short_name))
                 AND grid.team_id != lp.team_id
                WHERE lp.external_id LIKE 'lp:%%'
                  AND grid.external_id NOT LIKE 'lp:%%'
                  AND NOT EXISTS (
                    SELECT 1 FROM pro_teams grid2
                    WHERE LOWER(TRIM(lp.name)) = LOWER(TRIM(grid2.name))
                      AND grid2.team_id != lp.team_id
                      AND grid2.external_id NOT LIKE 'lp:%%'
                  )
            """)
            short_name_matches = cur.fetchall()

        created = 0

        for lp_id, grid_id, name, lp_ext, grid_ext in exact_matches:
            proposal_id = self.create_proposal(
                entity_type="team",
                source_entity_id=lp_id,
                target_entity_id=grid_id,
                confidence=1.0,
                reason="exact_name",
                notes=f"'{name}' (lp:{lp_ext}) → (grid:{grid_ext})",
            )
            if proposal_id:
                created += 1
                logger.info("Proposal created (exact_name)", name=name, lp_id=lp_id, grid_id=grid_id)

        for lp_id, grid_id, lp_name, grid_name, short_name in short_name_matches:
            proposal_id = self.create_proposal(
                entity_type="team",
                source_entity_id=lp_id,
                target_entity_id=grid_id,
                confidence=0.8,
                reason="short_name",
                notes=f"'{lp_name}' matches short_name '{short_name}' of '{grid_name}'",
            )
            if proposal_id:
                created += 1
                logger.info("Proposal created (short_name)", lp_name=lp_name, grid_name=grid_name)

        self.conn.commit()
        logger.info(f"Created {created} dedup proposals")
        return created

    def apply_approved_proposals(self) -> int:
        """Apply approved mapping proposals: re-point FKs, register mappings, delete source entity.

        Returns:
            Number of proposals applied.
        """
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT id, entity_type, source_entity_id, target_entity_id
                FROM pro_mapping_proposals
                WHERE status = 'approved'
                ORDER BY id
            """)
            proposals = cur.fetchall()

        if not proposals:
            logger.info("No approved proposals to apply")
            return 0

        applied = 0
        for proposal_id, entity_type, source_id, target_id in proposals:
            try:
                if entity_type == "team":
                    self._apply_team_merge(source_id, target_id)
                elif entity_type == "tournament":
                    self._apply_tournament_merge(source_id, target_id)
                elif entity_type == "league":
                    self._apply_league_merge(source_id, target_id)

                # Mark proposal as applied
                with self.conn.cursor() as cur:
                    cur.execute(
                        "UPDATE pro_mapping_proposals SET status = 'applied', applied_at = NOW() WHERE id = %s",
                        (proposal_id,),
                    )
                self.conn.commit()
                applied += 1
                logger.info("Proposal applied", id=proposal_id, type=entity_type, source=source_id, target=target_id)
            except Exception as e:
                logger.error("Failed to apply proposal", id=proposal_id, error=str(e))
                self.conn.rollback()

        logger.info(f"Applied {applied}/{len(proposals)} proposals")
        return applied

    def _apply_team_merge(self, source_team_id: int, target_team_id: int) -> None:
        """Re-point all FK references from source to target team, then delete source."""
        with self.conn.cursor() as cur:
            # Preserve source mappings by re-pointing to target
            cur.execute(
                "UPDATE pro_entity_mappings SET entity_id = %s WHERE entity_type = 'team' AND entity_id = %s",
                (target_team_id, source_team_id),
            )
            # Re-point FK references
            cur.execute("UPDATE pro_games SET blue_team_id = %s WHERE blue_team_id = %s", (target_team_id, source_team_id))
            cur.execute("UPDATE pro_games SET red_team_id = %s WHERE red_team_id = %s", (target_team_id, source_team_id))
            cur.execute("UPDATE pro_games SET winner_team_id = %s WHERE winner_team_id = %s", (target_team_id, source_team_id))
            cur.execute("UPDATE pro_player_stats SET team_id = %s WHERE team_id = %s", (target_team_id, source_team_id))
            cur.execute("UPDATE pro_team_stats SET team_id = %s WHERE team_id = %s", (target_team_id, source_team_id))
            # Delete source team
            cur.execute("DELETE FROM pro_teams WHERE team_id = %s", (source_team_id,))

    def _apply_tournament_merge(self, source_id: int, target_id: int) -> None:
        """Re-point FK references from source to target tournament, then delete source."""
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE pro_entity_mappings SET entity_id = %s WHERE entity_type = 'tournament' AND entity_id = %s",
                (target_id, source_id),
            )
            cur.execute("UPDATE pro_matches SET tournament_id = %s WHERE tournament_id = %s", (target_id, source_id))
            cur.execute("UPDATE pro_team_stats SET tournament_id = %s WHERE tournament_id = %s", (target_id, source_id))
            cur.execute("UPDATE pro_champion_stats SET tournament_id = %s WHERE tournament_id = %s", (target_id, source_id))
            cur.execute("DELETE FROM pro_tournaments WHERE tournament_id = %s", (source_id,))

    def _apply_league_merge(self, source_id: int, target_id: int) -> None:
        """Re-point FK references from source to target league, then delete source."""
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE pro_entity_mappings SET entity_id = %s WHERE entity_type = 'league' AND entity_id = %s",
                (target_id, source_id),
            )
            cur.execute("UPDATE pro_tournaments SET pro_league_id = %s WHERE pro_league_id = %s", (target_id, source_id))
            cur.execute("DELETE FROM pro_leagues WHERE league_id = %s", (source_id,))

    def backfill_short_names(self) -> int:
        """Backfill pro_teams.short_name from the soloq teams table by matching names.

        Returns:
            Number of teams updated.
        """
        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE pro_teams pt
                SET short_name = t.short_name, updated_at = NOW()
                FROM teams t
                WHERE pt.short_name IS NULL
                  AND LOWER(TRIM(pt.name)) = LOWER(TRIM(t.current_name))
                  AND t.game_id = 1
            """)
            count = cur.rowcount
            self.conn.commit()
            return count

    # --- Entity Mappings ---

    def find_by_source_id(self, entity_type: str, source_id: str) -> int | None:
        """Lookup entity_id via pro_entity_mappings."""
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT entity_id FROM pro_entity_mappings WHERE entity_type = %s AND source_id = %s LIMIT 1",
                (entity_type, source_id),
            )
            row = cur.fetchone()
            return row[0] if row else None

    def register_mapping(self, entity_type: str, entity_id: int, source: str, source_id: str) -> None:
        """Register an entity mapping (ON CONFLICT DO NOTHING)."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pro_entity_mappings (entity_type, entity_id, source, source_id, created_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (entity_type, source, source_id) DO NOTHING
                """,
                (entity_type, entity_id, source, source_id),
            )

    def create_proposal(
        self, entity_type: str, source_entity_id: int, target_entity_id: int,
        confidence: float, reason: str, notes: str | None = None,
    ) -> int | None:
        """Create a mapping proposal for admin review. Returns proposal id or None if already exists."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pro_mapping_proposals (
                    entity_type, source_entity_id, target_entity_id,
                    confidence, match_reason, notes, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (entity_type, source_entity_id, target_entity_id) DO NOTHING
                RETURNING id
                """,
                (entity_type, source_entity_id, target_entity_id, confidence, reason, notes),
            )
            row = cur.fetchone()
            return row[0] if row else None

    # --- Players ---

    def find_player_by_alias(self, alias: str) -> int | None:
        """Check if alias exists in player_aliases, return player_id or None."""
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT player_id FROM player_aliases WHERE LOWER(alias) = LOWER(%s) LIMIT 1",
                (alias,),
            )
            row = cur.fetchone()
            return row[0] if row else None

    def find_player_by_slug(self, slug: str) -> int | None:
        """Check if slug exists in players, return player_id or None."""
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT player_id FROM players WHERE slug = %s LIMIT 1",
                (slug,),
            )
            row = cur.fetchone()
            return row[0] if row else None

    def upsert_player(
        self, slug: str, current_pseudo: str,
        first_name: str | None = None, last_name: str | None = None,
    ) -> int:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO players (slug, current_pseudo, first_name, last_name)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (slug) DO UPDATE SET
                    current_pseudo = EXCLUDED.current_pseudo,
                    first_name = COALESCE(EXCLUDED.first_name, players.first_name),
                    last_name = COALESCE(EXCLUDED.last_name, players.last_name)
                RETURNING player_id
                """,
                (slug, current_pseudo, first_name, last_name),
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
        """Backfill player_aliases from players table.

        Returns:
            Number of aliases inserted.
        """
        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO player_aliases (player_id, alias, source)
                SELECT p.player_id, p.current_pseudo, 'leaguepedia'
                FROM players p
                WHERE p.current_pseudo IS NOT NULL
                  AND p.current_pseudo != ''
                ON CONFLICT (player_id, alias) DO NOTHING
            """)
            count = cur.rowcount

            self.conn.commit()
            return count

    def reset_aliases(self) -> dict[str, int]:
        """Full reset of player_aliases: truncate and re-backfill from all sources.

        Re-inserts:
        1. current_pseudo from players table
        2. slug as alias (for slug-based lookup)
        3. Existing Leaguepedia name variants (parenthesized forms)

        Returns:
            Dict with counts per step.
        """
        stats: dict[str, int] = {}

        with self.conn.cursor() as cur:
            # 1. Truncate
            cur.execute("TRUNCATE player_aliases RESTART IDENTITY")
            logger.info("Truncated player_aliases")

            # 2. Insert current_pseudo
            cur.execute("""
                INSERT INTO player_aliases (player_id, alias, source)
                SELECT p.player_id, p.current_pseudo, 'leaguepedia'
                FROM players p
                WHERE p.current_pseudo IS NOT NULL
                  AND p.current_pseudo != ''
                ON CONFLICT (player_id, alias) DO NOTHING
            """)
            stats["current_pseudo"] = cur.rowcount
            logger.info("Inserted current_pseudo aliases", count=cur.rowcount)

            # 3. Insert slug as alias (different from current_pseudo)
            cur.execute("""
                INSERT INTO player_aliases (player_id, alias, source)
                SELECT p.player_id, p.slug, 'leaguepedia'
                FROM players p
                WHERE p.slug IS NOT NULL
                  AND p.slug != ''
                  AND p.slug != LOWER(p.current_pseudo)
                ON CONFLICT (player_id, alias) DO NOTHING
            """)
            stats["slugs"] = cur.rowcount
            logger.info("Inserted slug aliases", count=cur.rowcount)

            # 4. Delete orphan players (no aliases, no contracts, no accounts)
            cur.execute("""
                DELETE FROM players
                WHERE player_id NOT IN (
                    SELECT DISTINCT player_id FROM player_aliases WHERE player_id IS NOT NULL
                    UNION
                    SELECT DISTINCT player_id FROM player_contracts WHERE player_id IS NOT NULL
                    UNION
                    SELECT DISTINCT player_id FROM lol_accounts WHERE player_id IS NOT NULL
                )
            """)
            stats["orphans_deleted"] = cur.rowcount
            if cur.rowcount:
                logger.info("Deleted orphan players", count=cur.rowcount)

        self.conn.commit()
        return stats

    # --- Pro Tournaments ---

    def upsert_pro_tournament(
        self, external_id: str, name: str, slug: str,
        pro_league_id: int, start_date: datetime | None,
        year: int | None,
        split: str | None = None,
        split_number: int | None = None,
        tournament_level: str | None = None,
        is_playoffs: bool = False,
        is_qualifier: bool = False,
        is_official: bool = True,
        region: str | None = None,
        end_date: datetime | None = None,
    ) -> int:
        # 1. Check mapping table first
        mapped_id = self.find_by_source_id("tournament", external_id)
        if mapped_id is not None:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE pro_tournaments SET
                        name = %s, slug = %s,
                        pro_league_id = COALESCE(%s, pro_league_id),
                        start_date = COALESCE(%s, start_date),
                        end_date = COALESCE(%s, end_date),
                        year = COALESCE(%s, year),
                        split = COALESCE(%s, split),
                        split_number = COALESCE(%s, split_number),
                        tournament_level = COALESCE(%s, tournament_level),
                        is_playoffs = %s, is_qualifier = %s, is_official = %s,
                        region = COALESCE(%s, region),
                        updated_at = NOW()
                    WHERE tournament_id = %s
                    """,
                    (
                        name, slug, pro_league_id, start_date, end_date, year,
                        split, split_number, tournament_level,
                        is_playoffs, is_qualifier, is_official, region,
                        mapped_id,
                    ),
                )
            return mapped_id

        # 2. Standard upsert by external_id
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pro_tournaments (
                    external_id, name, slug, pro_league_id, start_date, end_date, year,
                    split, split_number, tournament_level,
                    is_playoffs, is_qualifier, is_official, region,
                    updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (external_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    slug = EXCLUDED.slug,
                    pro_league_id = COALESCE(EXCLUDED.pro_league_id, pro_tournaments.pro_league_id),
                    start_date = COALESCE(EXCLUDED.start_date, pro_tournaments.start_date),
                    end_date = COALESCE(EXCLUDED.end_date, pro_tournaments.end_date),
                    year = COALESCE(EXCLUDED.year, pro_tournaments.year),
                    split = COALESCE(EXCLUDED.split, pro_tournaments.split),
                    split_number = COALESCE(EXCLUDED.split_number, pro_tournaments.split_number),
                    tournament_level = COALESCE(EXCLUDED.tournament_level, pro_tournaments.tournament_level),
                    is_playoffs = EXCLUDED.is_playoffs,
                    is_qualifier = EXCLUDED.is_qualifier,
                    is_official = EXCLUDED.is_official,
                    region = COALESCE(EXCLUDED.region, pro_tournaments.region),
                    updated_at = NOW()
                RETURNING tournament_id
                """,
                (
                    external_id, name, slug, pro_league_id, start_date, end_date, year,
                    split, split_number, tournament_level,
                    is_playoffs, is_qualifier, is_official, region,
                ),
            )
            tournament_id = cur.fetchone()[0]

        # 3. Register mapping
        source = "leaguepedia" if external_id.startswith("lp:") else "grid"
        self.register_mapping("tournament", tournament_id, source, external_id)
        return tournament_id

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

    def cleanup_synthetic_parents(self) -> dict:
        """Remove synthetic parent tournaments (lp:parent:*).

        1. Nullifies parent_tournament_id on children linked to synthetic parents
        2. Deletes entity mappings for synthetic parents
        3. Deletes the synthetic parent tournaments themselves

        Returns:
            Dict with counts of unlinked children, deleted mappings, deleted parents.
        """
        stats = {"unlinked": 0, "mappings_deleted": 0, "parents_deleted": 0}
        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE pro_tournaments SET parent_tournament_id = NULL
                WHERE parent_tournament_id IN (
                    SELECT tournament_id FROM pro_tournaments WHERE external_id LIKE 'lp:parent:%%'
                )
            """)
            stats["unlinked"] = cur.rowcount

            cur.execute("DELETE FROM pro_entity_mappings WHERE source_id LIKE 'lp:parent:%%'")
            stats["mappings_deleted"] = cur.rowcount

            cur.execute("DELETE FROM pro_tournaments WHERE external_id LIKE 'lp:parent:%%'")
            stats["parents_deleted"] = cur.rowcount

        self.conn.commit()
        return stats

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
                    game_id, player_id, team_id, team_side, role,
                    champion_id,
                    kills, deaths, assists, cs, gold_earned, damage_dealt, damage_taken,
                    first_blood_participant, first_blood_victim,
                    vision, max_diffs, multi_kills, solo_stats,
                    items, runes, timing_data, proximity, plates
                )
                VALUES %s
                """,
                [
                    (
                        game_id,
                        s.get("player_id"),
                        s.get("team_id"),
                        s.get("team_side"),
                        s.get("role"),
                        s.get("champion_id"),
                        s.get("kills", 0),
                        s.get("deaths", 0),
                        s.get("assists", 0),
                        s.get("cs", 0),
                        s.get("gold_earned", 0),
                        s.get("damage_dealt", 0),
                        s.get("damage_taken", 0),
                        s.get("first_blood_participant", False),
                        s.get("first_blood_victim", False),
                        json.dumps(s.get("vision", {})),
                        json.dumps({}),  # max_diffs
                        json.dumps(s.get("multi_kills", {})),
                        json.dumps(s.get("solo_stats", {})),
                        json.dumps(s.get("items", [])),
                        json.dumps(s.get("runes", {})),
                        json.dumps(s.get("timing_data", {})),
                        json.dumps({}),  # proximity
                        json.dumps(s.get("plates", {})),
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

    def upsert_team_game_stats(
        self,
        game_id: int,
        match_id: int,
        tournament_id: int,
        blue_team_id: int | None,
        red_team_id: int | None,
        winner_team_id: int | None,
        duration: int | None,
        blue_kills: int = 0,
        red_kills: int = 0,
        first_blood_team: str | None = None,
    ) -> None:
        """Insert 2 rows per game into pro_team_stats (one per team side).

        For Leaguepedia data, only kills (from player stats), duration, and
        first_blood are typically available. Objective columns default to 0.
        """
        rows = [
            ("blue", blue_team_id, blue_kills, red_kills),
            ("red", red_team_id, red_kills, blue_kills),
        ]

        for side, team_id, kills, deaths in rows:
            if not team_id:
                continue

            win = winner_team_id == team_id if winner_team_id else False
            fb = first_blood_team == side if first_blood_team else False

            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO pro_team_stats (
                        game_id, match_id, tournament_id, team_id,
                        side, win, duration,
                        kills, deaths,
                        first_blood,
                        created_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (game_id, team_id) DO UPDATE SET
                        match_id = EXCLUDED.match_id,
                        tournament_id = EXCLUDED.tournament_id,
                        side = EXCLUDED.side,
                        win = EXCLUDED.win,
                        duration = EXCLUDED.duration,
                        kills = EXCLUDED.kills,
                        deaths = EXCLUDED.deaths,
                        first_blood = EXCLUDED.first_blood
                    """,
                    (
                        game_id, match_id, tournament_id, team_id,
                        side, win, duration,
                        kills or 0, deaths or 0,
                        fb,
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

    # 3b. Pre-compute match scores by counting game wins per team
    # match_scores[match_id] = {team_name: wins_count, ...}
    match_scores: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for game_id, players in games_data.items():
        if len(players) != 10:
            continue
        mid = players[0].get("MatchId", "")
        if not mid:
            continue
        for p in players:
            if p.get("PlayerWin") == "Yes":
                winner_team = p.get("Team", "").strip()
                if winner_team:
                    match_scores[mid][winner_team] += 1
                break

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

        # --- Riot match data (v5/v4) via Leaguepedia ---
        rpgid = (first_row.get("RiotPlatformGameId") or "").strip()
        # Key by (champion_id, side) to avoid Riot/LP name mismatches (MonkeyKing vs Wukong)
        riot_player_map: dict[tuple[int, str], dict] = {}

        if rpgid:
            riot_stats, riot_timeline, riot_version = lp.get_riot_game_data(rpgid)
            if riot_stats:
                logger.info(
                    "Riot data loaded",
                    version=riot_version,
                    game_id=game_id,
                    rpgid=rpgid,
                )

                # Use Riot game duration if available (more precise, in seconds)
                riot_duration = riot_stats.get("game_duration")
                if riot_duration and riot_duration > 0:
                    duration_seconds = int(riot_duration)

                # Build player map by (champion_id, side) for reliable matching
                for rp in riot_stats["players"]:
                    rp_side = "blue" if rp["team_id"] == 100 else "red"
                    champ_name = rp.get("champion_name") or ""
                    cid = get_champion_id(champ_name)
                    if cid:
                        riot_player_map[(cid, rp_side)] = rp

                # Attach timeline + event-based stats to players
                if riot_timeline:
                    players_with_tl = LeaguepediaClient.attach_timeline_to_players(
                        riot_stats, riot_timeline
                    )
                    for pwt in players_with_tl:
                        pwt_side = "blue" if pwt["team_id"] == 100 else "red"
                        pwt_cid = get_champion_id(pwt.get("champion_name") or "")
                        if pwt_cid and (pwt_cid, pwt_side) in riot_player_map:
                            riot_player_map[(pwt_cid, pwt_side)]["timeline"] = pwt.get("timeline", {})
                            riot_player_map[(pwt_cid, pwt_side)]["stats_at_15"] = pwt.get("stats_at_15", {})
                            riot_player_map[(pwt_cid, pwt_side)]["solo_kills"] = pwt.get("solo_kills", 0)
                            riot_player_map[(pwt_cid, pwt_side)]["solo_deaths"] = pwt.get("solo_deaths", 0)
                            riot_player_map[(pwt_cid, pwt_side)]["plates_timeline"] = pwt.get("plates_timeline", {})
                            riot_player_map[(pwt_cid, pwt_side)]["first_blood_victim"] = pwt.get("first_blood_victim", False)
            else:
                logger.debug("No Riot data available, using scoreboard", game_id=game_id, rpgid=rpgid)
        else:
            logger.debug("No RiotPlatformId, using scoreboard only", game_id=game_id)

        # Upsert match
        match_meta = match_map.get(match_id_str, {})
        best_of = to_int(match_meta.get("BestOf"), 1)
        format_str = f"bo{best_of}" if best_of > 0 else "bo1"

        t1_ext = f"lp:{team1_name}" if team1_name else None
        t2_ext = f"lp:{team2_name}" if team2_name else None

        # Get match scores from pre-computed data
        scores = match_scores.get(match_id_str, {})
        team1_score = scores.get(team1_name, 0)
        team2_score = scores.get(team2_name, 0)

        # We use the Leaguepedia match ID or generate one
        lp_match_ext = f"lp:{match_id_str}" if match_id_str else f"lp:{game_id}_match"
        match_db_id = db.upsert_pro_match(
            external_id=lp_match_ext,
            tournament_id=tournament_id,
            team1_external_id=t1_ext,
            team2_external_id=t2_ext,
            team1_score=team1_score,
            team2_score=team2_score,
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
            if not link:
                continue

            # Parse parenthesized names: "Cabo (Oscar Munoz)" → pseudo="Cabo", slug keeps disambiguation
            clean_pseudo, slug, first_name, last_name = parse_player_name(link)

            if slug not in player_cache:
                # 1. Check aliases (try both raw link and clean pseudo)
                player_id = db.find_player_by_alias(link)
                if not player_id and clean_pseudo != link:
                    player_id = db.find_player_by_alias(clean_pseudo)

                # 2. Check players table by slug
                if not player_id:
                    player_id = db.find_player_by_slug(slug)

                # 3. Query Leaguepedia PlayerRedirects
                canonical = None
                if not player_id:
                    canonical = lp.resolve_player_redirect(link)
                    if canonical:
                        c_pseudo, c_slug, c_first, c_last = parse_player_name(canonical)
                        player_id = db.find_player_by_slug(c_slug)
                        if not player_id:
                            # Also try clean pseudo as slug (may exist without disambiguation)
                            player_id = db.find_player_by_slug(c_pseudo.lower().replace(" ", "-"))
                        if player_id:
                            db.upsert_player_alias(player_id, link)
                            if clean_pseudo != link:
                                db.upsert_player_alias(player_id, clean_pseudo)
                        # Merge canonical name data if available
                        if not first_name and c_first:
                            first_name = c_first
                        if not last_name and c_last:
                            last_name = c_last
                        if not player_id:
                            # Use canonical slug for new player
                            slug = c_slug
                            clean_pseudo = c_pseudo

                # 4. Truly new player — create with clean pseudo and names
                if not player_id:
                    player_id = db.upsert_player(slug, clean_pseudo, first_name, last_name)
                    db.upsert_player_alias(player_id, link)
                    if clean_pseudo != link:
                        db.upsert_player_alias(player_id, clean_pseudo)
                else:
                    # Update existing player with name data if we have it
                    if first_name or last_name:
                        db.upsert_player(slug, clean_pseudo, first_name, last_name)

                player_cache[slug] = player_id

            player_id = player_cache[slug]

            # Record link and clean pseudo as aliases
            db.upsert_player_alias(player_id, link)
            if clean_pseudo != link:
                db.upsert_player_alias(player_id, clean_pseudo)

            team_name = (p.get("Team") or "").strip()
            p_team_id = team_cache.get(team_name)

            side = (p.get("Side") or "").strip()
            team_side = "blue" if side in ("1", "Blue") else "red" if side in ("2", "Red") else None

            role = normalize_role(p.get("Role"))
            champion_name = (p.get("Champion") or "").strip()
            champion_id = get_champion_id(champion_name)

            # Check for Riot data override (match by champion_id + side)
            riot_key = (champion_id, team_side) if champion_id and team_side else None
            rp = riot_player_map.get(riot_key) if riot_key else None

            if rp:
                # Override with Riot stats (more precise)
                kills = rp.get("kills", 0)
                deaths = rp.get("deaths", 0)
                assists = rp.get("assists", 0)
                cs = rp.get("cs", 0)
                gold_earned = rp.get("gold_earned", 0)
                damage_dealt = rp.get("damage_to_champions", 0)
                damage_taken = rp.get("damage_taken", 0)
                vision_score = rp.get("vision_score", 0)

                vision_data = {
                    "score": vision_score,
                    "wards_placed": rp.get("wards_placed", 0),
                    "wards_destroyed": rp.get("wards_killed", 0),
                    "control_wards": rp.get("control_wards_placed", 0),
                }

                first_blood_participant = rp.get("first_blood_kill", False) or rp.get("first_blood_assist", False)
                first_blood_victim = rp.get("first_blood_victim", False)

                items_data = [i for i in rp.get("items", []) if i > 0]
                runes_data = rp.get("runes", {})
                multi_kills_data = rp.get("multi_kills", {})

                solo_stats_data = {
                    "solo_kills": rp.get("solo_kills", 0),
                    "solo_deaths": rp.get("solo_deaths", 0),
                }

                # Plates: aligned with GRID structure + before_15
                plates_data = rp.get("plates_timeline", {})

                # Timeline: stats_at_15 with diffs, full per-minute timing_data
                stats_at_15 = rp.get("stats_at_15", {})
                tl = rp.get("timeline", {})
                timing_data = {str(k): v for k, v in tl.items()} if tl else {}
            else:
                # Fallback: scoreboard stats
                kills = to_int(p.get("Kills"))
                deaths = to_int(p.get("Deaths"))
                assists = to_int(p.get("Assists"))
                cs = to_int(p.get("CS"))
                gold_earned = to_int(p.get("Gold"))
                damage_dealt = to_int(p.get("DamageToChampions"))
                damage_taken = 0
                vision_score = to_int(p.get("VisionScore"))
                vision_data = {"score": vision_score} if vision_score else {}
                first_blood_participant = False
                first_blood_victim = False
                items_data = []
                runes_data = {}
                multi_kills_data = {}
                solo_stats_data = {}
                plates_data = {}
                stats_at_15 = {}
                timing_data = {}

            player_stats.append({
                "player_id": player_id,
                "team_id": p_team_id,
                "team_side": team_side,
                "role": role,
                "champion_id": champion_id,
                "kills": kills,
                "deaths": deaths,
                "assists": assists,
                "cs": cs,
                "gold_earned": gold_earned,
                "damage_dealt": damage_dealt,
                "damage_taken": damage_taken,
                "first_blood_participant": first_blood_participant,
                "first_blood_victim": first_blood_victim,
                "vision": vision_data,
                "items": items_data,
                "runes": runes_data,
                "multi_kills": multi_kills_data,
                "solo_stats": solo_stats_data,
                "plates": plates_data,
                "timing_data": timing_data,
            })

        db.insert_player_stats_batch(game_db_id, player_stats)

        # Insert team game stats (2 rows per game)
        blue_kills_total = sum(
            ps.get("kills", 0) or 0 for ps in player_stats if ps.get("team_side") == "blue"
        )
        red_kills_total = sum(
            ps.get("kills", 0) or 0 for ps in player_stats if ps.get("team_side") == "red"
        )
        # Detect first blood from player data
        fb_team = None
        for ps in player_stats:
            if ps.get("first_blood_participant"):
                fb_team = ps.get("team_side")
                break

        db.upsert_team_game_stats(
            game_id=game_db_id,
            match_id=match_db_id,
            tournament_id=tournament_id,
            blue_team_id=blue_team_id,
            red_team_id=red_team_id,
            winner_team_id=winner_team_id,
            duration=duration_seconds,
            blue_kills=blue_kills_total,
            red_kills=red_kills_total,
            first_blood_team=fb_team,
        )

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
    compute_aggregated_stats(db, tournament_id)
    db.commit()

    return stats


def _f(val, default=0):
    """Convert a psycopg2 Decimal/numeric value to float for safe arithmetic."""
    if val is None:
        return float(default)
    return float(val)


def compute_aggregated_stats(
    db: DB, tournament_id: int,
) -> None:
    """Compute and upsert aggregated champion stats for a tournament."""

    with db.conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
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
              AND ps.champion_id IS NOT NULL
            GROUP BY ps.champion_id
            """,
            (tournament_id,),
        )

        champ_pick_data = {}
        for row in cur.fetchall():
            c_id = row["champion_id"]
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

        # Extract Leaguepedia metadata
        split = t.get("Split") or None
        split_number = to_int(t.get("SplitNumber")) or None
        tournament_level = t.get("TournamentLevel") or None
        is_playoffs = t.get("IsPlayoffs") == "1"
        is_qualifier = t.get("IsQualifier") == "1"
        is_official = t.get("IsOfficial", "1") == "1"
        t_region = t.get("Region") or None
        end_date = parse_datetime(t.get("Date"))

        # Upsert tournament
        start_dt = parse_datetime(date_start)
        tournament_id = db.upsert_pro_tournament(
            external_id=t_ext,
            name=name,
            slug=make_slug(overview),
            pro_league_id=league_id,
            start_date=start_dt,
            year=year,
            split=split,
            split_number=split_number,
            tournament_level=tournament_level,
            is_playoffs=is_playoffs,
            is_qualifier=is_qualifier,
            is_official=is_official,
            region=t_region,
            end_date=end_date,
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
        help="Legacy: create proposals + auto-approve + apply (backward compat)",
    )
    parser.add_argument(
        "--propose-dedup",
        action="store_true",
        help="Create dedup proposals for admin review (does not apply them)",
    )
    parser.add_argument(
        "--apply-proposals",
        action="store_true",
        help="Apply approved mapping proposals (merges entities)",
    )
    parser.add_argument(
        "--backfill-aliases",
        action="store_true",
        help="Backfill player_aliases from existing pro_player_stats data",
    )
    parser.add_argument(
        "--reset-aliases",
        action="store_true",
        help="Full reset of player_aliases: truncate and re-backfill from all sources",
    )
    parser.add_argument(
        "--backfill-short-names",
        action="store_true",
        help="Backfill pro_teams.short_name from soloq teams table",
    )
    parser.add_argument(
        "--cleanup-parents",
        action="store_true",
        help="Remove synthetic parent tournaments (lp:parent:*) and unlink children",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Reset completion flags and re-sync all tournaments",
    )
    args = parser.parse_args()

    global LEAGUEPEDIA_MAX_YEAR
    if args.max_year:
        LEAGUEPEDIA_MAX_YEAR = args.max_year

    # Dedup-only mode (legacy: propose + auto-approve + apply)
    if args.dedup:
        logger.info("Running team deduplication (legacy mode)")
        db = DB(DATABASE_URL)
        try:
            merged = db.dedup_teams()
            logger.info(f"Deduplication complete: {merged} teams merged")
        finally:
            db.close()
        return

    # Create dedup proposals only
    if args.propose_dedup:
        logger.info("Creating dedup proposals for admin review")
        db = DB(DATABASE_URL)
        try:
            count = db.create_dedup_proposals()
            logger.info(f"Created {count} dedup proposals")
        finally:
            db.close()
        return

    # Apply approved proposals
    if args.apply_proposals:
        logger.info("Applying approved mapping proposals")
        db = DB(DATABASE_URL)
        try:
            count = db.apply_approved_proposals()
            logger.info(f"Applied {count} proposals")
        finally:
            db.close()
        return

    # Reset aliases (full truncate + re-backfill)
    if args.reset_aliases:
        logger.info("Resetting player_aliases (full truncate + re-backfill)")
        db = DB(DATABASE_URL)
        try:
            stats = db.reset_aliases()
            logger.info("Reset complete", **stats)
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

    # Backfill short names from soloq teams table
    if args.backfill_short_names:
        logger.info("Backfilling pro_teams.short_name from soloq teams table")
        db = DB(DATABASE_URL)
        try:
            count = db.backfill_short_names()
            logger.info(f"Backfill complete: {count} teams updated")
        finally:
            db.close()
        return

    # Cleanup synthetic parent tournaments
    if args.cleanup_parents:
        logger.info("Cleaning up synthetic parent tournaments (lp:parent:*)")
        db = DB(DATABASE_URL)
        try:
            stats = db.cleanup_synthetic_parents()
            logger.info("Cleanup complete", **stats)
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

    # Handle --reset: purge ALL leaguepedia data before re-sync
    if args.reset:
        logger.info("Resetting all Leaguepedia data...")
        with db.conn.cursor() as cur:
            # 1. Delete player stats & draft actions for lp: games
            cur.execute("""
                DELETE FROM pro_player_stats
                WHERE game_id IN (SELECT game_id FROM pro_games WHERE external_id LIKE 'lp:%%')
            """)
            logger.info("Deleted pro_player_stats", count=cur.rowcount)

            cur.execute("""
                DELETE FROM pro_draft_actions
                WHERE game_id IN (SELECT game_id FROM pro_games WHERE external_id LIKE 'lp:%%')
            """)
            logger.info("Deleted pro_draft_actions", count=cur.rowcount)

            # 2. Delete games & matches
            cur.execute("DELETE FROM pro_games WHERE external_id LIKE 'lp:%%'")
            logger.info("Deleted pro_games", count=cur.rowcount)

            cur.execute("DELETE FROM pro_matches WHERE external_id LIKE 'lp:%%'")
            logger.info("Deleted pro_matches", count=cur.rowcount)

            # 3. Delete aggregated stats for lp: tournaments
            cur.execute("""
                DELETE FROM pro_team_stats
                WHERE tournament_id IN (SELECT tournament_id FROM pro_tournaments WHERE external_id LIKE 'lp:%%')
            """)
            logger.info("Deleted pro_team_stats", count=cur.rowcount)

            cur.execute("""
                DELETE FROM pro_champion_stats
                WHERE tournament_id IN (SELECT tournament_id FROM pro_tournaments WHERE external_id LIKE 'lp:%%')
            """)
            logger.info("Deleted pro_champion_stats", count=cur.rowcount)

            # 4. Delete tournaments & leagues
            cur.execute("DELETE FROM pro_tournaments WHERE external_id LIKE 'lp:%%'")
            logger.info("Deleted pro_tournaments", count=cur.rowcount)

            cur.execute("DELETE FROM pro_leagues WHERE external_id LIKE 'lp:%%'")
            logger.info("Deleted pro_leagues", count=cur.rowcount)

            # 5. Delete lp:-only teams (no references from non-lp data)
            cur.execute("""
                DELETE FROM pro_teams
                WHERE external_id LIKE 'lp:%%'
                  AND team_id NOT IN (
                    SELECT DISTINCT blue_team_id FROM pro_games WHERE blue_team_id IS NOT NULL
                    UNION
                    SELECT DISTINCT red_team_id FROM pro_games WHERE red_team_id IS NOT NULL
                    UNION
                    SELECT DISTINCT team_id FROM pro_player_stats WHERE team_id IS NOT NULL
                  )
            """)
            logger.info("Deleted orphan lp: teams", count=cur.rowcount)

            # 6. Delete aliases & orphan players
            cur.execute("DELETE FROM player_aliases WHERE source = 'leaguepedia'")
            logger.info("Deleted player_aliases", count=cur.rowcount)

            cur.execute("""
                DELETE FROM players
                WHERE player_id NOT IN (
                    SELECT DISTINCT player_id FROM player_aliases WHERE player_id IS NOT NULL
                    UNION
                    SELECT DISTINCT player_id FROM player_contracts WHERE player_id IS NOT NULL
                    UNION
                    SELECT DISTINCT player_id FROM lol_accounts WHERE player_id IS NOT NULL
                )
            """)
            logger.info("Deleted orphan players", count=cur.rowcount)

        db.commit()
        logger.info("Reset complete — all Leaguepedia data purged")

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

        # Backfill short names from soloq teams table
        count = db.backfill_short_names()
        if count:
            logger.info(f"Backfilled short_name for {count} pro teams")

        logger.info("Leaguepedia sync finished")

    finally:
        db.close()


if __name__ == "__main__":
    main()
