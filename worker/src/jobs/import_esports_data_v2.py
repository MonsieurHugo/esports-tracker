"""
Import Esports Data from JSON - Version 2 (Improved)
Imports leagues, teams, players, and LoL accounts from scraped data.

Improvements over v1:
- Better error handling with continuation
- Resume capability from specific league/team
- Better slug handling for duplicate team names across leagues
- Detailed error logging to JSON file
- Dry-run mode for validation
"""

import asyncio
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import structlog

from src.config import settings
from src.services.database import DatabaseService
from src.services.riot_api import RateLimiter, RiotAPIError, RiotAPIService

logger = structlog.get_logger(__name__)

# Path to JSON data file
DATA_FILE = Path(__file__).parent.parent.parent / "lck_lpl_lec_lckcl_lfl_lcp_ltas_ltan_data copy.json"
ERROR_LOG_FILE = Path(__file__).parent.parent.parent / "import_errors.json"

# League mapping with full names, regions, and tiers
LEAGUE_MAPPING = {
    "LCK": {"name": "LoL Champions Korea", "region": "KR", "tier": 1},
    "LPL": {"name": "LoL Pro League", "region": "CN", "tier": 1},
    "LEC": {"name": "LoL EMEA Championship", "region": "EU", "tier": 1},
    "LCKCL": {"name": "LCK Challengers League", "region": "KR", "tier": 2},
    "LFL": {"name": "La Ligue Française", "region": "FR", "tier": 2},
    "LCP": {"name": "Liga Portuguesa", "region": "PT", "tier": 2},
    "LTAS": {"name": "LoL TAL South", "region": "LATAM", "tier": 2},
    "LTAN": {"name": "LoL TAL North", "region": "LATAM", "tier": 2},
}

# Platform/region normalization
REGION_MAPPING = {
    "EUW1": "EUW",
    "EUW": "EUW",
    "NA1": "NA",
    "NA": "NA",
    "KR": "KR",
    "BR1": "BR",
    "BR": "BR",
    "JP1": "JP",
    "JP": "JP",
    "TW2": "TW",
    "TW": "TW",
    "LA1": "LAN",
    "LA2": "LAS",
    "OC1": "OCE",
    "TR1": "TR",
    "RU": "RU",
}

# Routing region for Riot API
ROUTING_REGION_MAPPING = {
    "EUW": "europe",
    "EUW1": "europe",
    "NA": "americas",
    "NA1": "americas",
    "KR": "asia",
    "BR": "americas",
    "BR1": "americas",
    "JP": "asia",
    "JP1": "asia",
    "TW": "asia",
    "TW2": "asia",
    "LA1": "americas",
    "LA2": "americas",
    "OC1": "americas",
    "TR1": "europe",
    "RU": "europe",
}


def slugify(text: str) -> str:
    """Convert text to a URL-safe slug."""
    # Convert to lowercase
    slug = text.lower()
    # Replace spaces with hyphens
    slug = re.sub(r"\s+", "-", slug)
    # Remove special characters except hyphens
    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    # Remove multiple consecutive hyphens
    slug = re.sub(r"-+", "-", slug)
    # Remove leading/trailing hyphens
    slug = slug.strip("-")
    return slug or "unknown"


def safe_str(text: str) -> str:
    """Convert string to ASCII-safe for logging."""
    return text.encode('ascii', 'replace').decode()


class ImportEsportsDataJobV2:
    """Improved job to import esports data from JSON into the database."""

    def __init__(self, dry_run: bool = False, start_from_league: str | None = None, only_league: str | None = None):
        self.db: DatabaseService | None = None
        self.riot_api: RiotAPIService | None = None
        self.rate_limiter = RateLimiter(requests_per_second=15, requests_per_2min=80)
        self.dry_run = dry_run
        self.start_from_league = start_from_league
        self.only_league = only_league
        self.stats = {
            "leagues": 0,
            "organizations": 0,
            "teams": 0,
            "players": 0,
            "contracts": 0,
            "accounts_created": 0,
            "accounts_updated": 0,
            "accounts_failed": 0,
            "errors": [],
        }
        # Cache to avoid duplicate players
        self._player_cache: dict[str, int] = {}  # player_slug -> player_id
        self._league_cache: dict[str, int] = {}  # short_name -> league_id
        self._org_cache: dict[str, int] = {}  # org_slug -> org_id
        self._team_cache: dict[str, int] = {}  # team_key -> team_id

    async def connect(self):
        """Initialize database and API connections."""
        if not settings.database_url:
            raise ValueError("DATABASE_URL environment variable is required")

        self.db = DatabaseService(settings.database_url)
        await self.db.connect()

        if not settings.riot_api_key:
            raise ValueError("RIOT_API_KEY environment variable is required")

        self.riot_api = RiotAPIService(settings.riot_api_key, rate_limiter=self.rate_limiter)
        logger.info("Connected to database and Riot API", dry_run=self.dry_run)

    async def close(self):
        """Close connections."""
        if self.db:
            await self.db.disconnect()
        if self.riot_api:
            await self.riot_api.close()

    def _load_json(self) -> dict[str, Any]:
        """Load the JSON data file."""
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)

    def _save_errors(self):
        """Save errors to JSON file."""
        with open(ERROR_LOG_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "stats": self.stats,
            }, f, indent=2, ensure_ascii=False)

    async def _import_leagues(self) -> None:
        """Import all leagues from the mapping."""
        logger.info("Importing leagues...")
        for short_name, info in LEAGUE_MAPPING.items():
            if self.dry_run:
                logger.info(f"[DRY-RUN] Would import league: {short_name}")
                self._league_cache[short_name] = 0
                continue

            league_id = await self.db.fetchval(
                """
                INSERT INTO leagues (name, short_name, region, tier, is_active)
                VALUES ($1, $2, $3, $4, true)
                ON CONFLICT (short_name) DO UPDATE SET
                    name = EXCLUDED.name,
                    region = EXCLUDED.region,
                    tier = EXCLUDED.tier
                RETURNING league_id
                """,
                info["name"],
                short_name,
                info["region"],
                info["tier"],
            )
            self._league_cache[short_name] = league_id
            self.stats["leagues"] += 1
            logger.debug("Imported league", short_name=short_name, league_id=league_id)

    async def _import_organization(self, team_data: dict[str, Any], league_name: str) -> int:
        """Import or update an organization."""
        # Use original slug for org (orgs are cross-league)
        slug = slugify(team_data["slug"])
        name = team_data["name"]

        # Check cache
        if slug in self._org_cache:
            return self._org_cache[slug]

        if self.dry_run:
            logger.info(f"[DRY-RUN] Would import org: {slug} ({name})")
            self._org_cache[slug] = 0
            return 0

        org_id = await self.db.fetchval(
            """
            INSERT INTO organizations (slug, current_name, current_short_name)
            VALUES ($1, $2, $3)
            ON CONFLICT (slug) DO UPDATE SET
                current_name = EXCLUDED.current_name,
                current_short_name = EXCLUDED.current_short_name,
                updated_at = NOW()
            RETURNING org_id
            """,
            slug,
            name,
            team_data["slug"][:20],
        )
        self._org_cache[slug] = org_id
        self.stats["organizations"] += 1
        return org_id

    async def _import_team(self, team_data: dict[str, Any], league_short_name: str, org_id: int) -> int:
        """Import or update a team."""
        # Use league-prefixed slug to avoid collisions (e.g., lck-geng vs lckcl-geng)
        base_slug = slugify(team_data["slug"])
        slug = f"{league_short_name.lower()}-{base_slug}"
        name = team_data["name"]
        region = LEAGUE_MAPPING.get(league_short_name, {}).get("region", "EU")

        # Cache key includes league
        cache_key = f"{league_short_name}:{base_slug}"
        if cache_key in self._team_cache:
            return self._team_cache[cache_key]

        if self.dry_run:
            logger.info(f"[DRY-RUN] Would import team: {slug} ({name}) in {league_short_name}")
            self._team_cache[cache_key] = 0
            return 0

        team_id = await self.db.fetchval(
            """
            INSERT INTO teams (org_id, game_id, slug, current_name, short_name, region, league, is_active)
            VALUES ($1, 1, $2, $3, $4, $5, $6, true)
            ON CONFLICT (slug, game_id) DO UPDATE SET
                current_name = EXCLUDED.current_name,
                short_name = EXCLUDED.short_name,
                region = EXCLUDED.region,
                league = EXCLUDED.league,
                updated_at = NOW()
            RETURNING team_id
            """,
            org_id,
            slug,
            name,
            team_data["slug"][:20],
            region,
            league_short_name,
        )
        self._team_cache[cache_key] = team_id
        self.stats["teams"] += 1
        return team_id

    async def _import_player(self, player_data: dict[str, Any]) -> int:
        """Import or update a player."""
        name = player_data["name"]
        slug = slugify(name)

        # Handle empty slugs (e.g., purely non-ASCII names)
        if not slug or slug == "unknown":
            # Use a hash-based slug
            import hashlib
            slug = f"player-{hashlib.md5(name.encode()).hexdigest()[:8]}"

        # Check cache first
        if slug in self._player_cache:
            return self._player_cache[slug]

        if self.dry_run:
            logger.info(f"[DRY-RUN] Would import player: {slug} ({safe_str(name)})")
            self._player_cache[slug] = 0
            return 0

        # Check if player exists with this slug
        existing = await self.db.fetchrow(
            "SELECT player_id FROM players WHERE slug = $1",
            slug,
        )

        if existing:
            player_id = existing["player_id"]
            self._player_cache[slug] = player_id
            return player_id

        # Create new player
        player_id = await self.db.fetchval(
            """
            INSERT INTO players (slug, current_pseudo, is_active)
            VALUES ($1, $2, true)
            ON CONFLICT (slug) DO UPDATE SET
                current_pseudo = EXCLUDED.current_pseudo,
                is_active = true,
                updated_at = NOW()
            RETURNING player_id
            """,
            slug,
            name,
        )
        self._player_cache[slug] = player_id
        self.stats["players"] += 1
        logger.debug("Imported player", name=safe_str(name), player_id=player_id)
        return player_id

    async def _create_contract(self, player_id: int, team_id: int, role: str | None) -> None:
        """Create a player contract linking player to team."""
        if self.dry_run:
            return

        # Normalize role
        role_normalized = None
        if role:
            role_normalized = role.upper()
            if role_normalized == "ADC":
                role_normalized = "BOT"
            elif role_normalized == "JUNGLE":
                role_normalized = "JNG"
            elif role_normalized == "SUPPORT":
                role_normalized = "SUP"

        # Check if active contract already exists
        existing = await self.db.fetchrow(
            """
            SELECT contract_id FROM player_contracts
            WHERE player_id = $1 AND team_id = $2 AND end_date IS NULL
            """,
            player_id,
            team_id,
        )

        if existing:
            # Update existing contract
            await self.db.execute(
                """
                UPDATE player_contracts
                SET role = $2, is_starter = true, updated_at = NOW()
                WHERE contract_id = $1
                """,
                existing["contract_id"],
                role_normalized,
            )
        else:
            # Create new contract
            await self.db.execute(
                """
                INSERT INTO player_contracts (player_id, team_id, role, is_starter, start_date)
                VALUES ($1, $2, $3, true, $4)
                ON CONFLICT DO NOTHING
                """,
                player_id,
                team_id,
                role_normalized,
                date.today(),
            )
            self.stats["contracts"] += 1

    async def _fetch_puuid(self, game_name: str, tag_line: str, platform: str) -> str:
        """Fetch PUUID from Riot API."""
        # Determine routing region
        routing = ROUTING_REGION_MAPPING.get(platform, "europe")

        # Create API service with correct routing region
        api = RiotAPIService(
            self.riot_api.api_key,
            region=platform,
            rate_limiter=self.rate_limiter,
        )
        # Override routing region
        api.routing_region = routing

        try:
            data = await api.get_summoner_by_name(game_name, tag_line)
            return data["puuid"]
        finally:
            await api.close()

    async def _import_accounts(self, player_id: int, player_name: str, accounts: list[dict[str, Any]]) -> None:
        """Import LoL accounts for a player."""
        if not accounts:
            return

        is_first = True

        for acc in accounts:
            game_name = acc["gameName"]
            tag_line = acc["tagLine"]
            platform = acc["platform"]
            region = REGION_MAPPING.get(platform, platform)

            if self.dry_run:
                logger.info(f"[DRY-RUN] Would import account: {safe_str(game_name)}#{tag_line} ({platform})")
                continue

            try:
                # Fetch PUUID from Riot API
                puuid = await self._fetch_puuid(game_name, tag_line, platform)

                # Check if account already exists
                existing = await self.db.fetchrow(
                    "SELECT puuid, player_id FROM lol_accounts WHERE puuid = $1",
                    puuid,
                )

                if existing:
                    # Update existing account
                    await self.db.execute(
                        """
                        UPDATE lol_accounts
                        SET player_id = $2, game_name = $3, tag_line = $4, region = $5, updated_at = NOW()
                        WHERE puuid = $1
                        """,
                        puuid,
                        player_id,
                        game_name,
                        tag_line,
                        region,
                    )
                    self.stats["accounts_updated"] += 1
                    logger.debug(
                        "Updated account",
                        game_name=safe_str(game_name),
                        tag_line=tag_line,
                        region=region,
                    )
                else:
                    # Insert new account
                    await self.db.execute(
                        """
                        INSERT INTO lol_accounts (puuid, player_id, game_name, tag_line, region, is_primary)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (puuid) DO UPDATE SET
                            player_id = EXCLUDED.player_id,
                            game_name = EXCLUDED.game_name,
                            tag_line = EXCLUDED.tag_line,
                            region = EXCLUDED.region,
                            updated_at = NOW()
                        """,
                        puuid,
                        player_id,
                        game_name,
                        tag_line,
                        region,
                        is_first,
                    )
                    self.stats["accounts_created"] += 1
                    logger.debug(
                        "Created account",
                        game_name=safe_str(game_name),
                        tag_line=tag_line,
                        region=region,
                        puuid=puuid[:16] + "...",
                    )

                is_first = False

            except RiotAPIError as e:
                self.stats["accounts_failed"] += 1
                error_msg = f"{safe_str(game_name)}#{tag_line} ({platform}): {e.message}"
                self.stats["errors"].append({
                    "type": "riot_api",
                    "player": safe_str(player_name),
                    "account": f"{safe_str(game_name)}#{tag_line}",
                    "platform": platform,
                    "error_code": e.status_code,
                    "error_message": e.message,
                })
                logger.warning(
                    "Failed to fetch PUUID",
                    player=safe_str(player_name),
                    account=f"{safe_str(game_name)}#{tag_line}",
                    error=e.message,
                    status_code=e.status_code,
                )

            except Exception as e:
                self.stats["accounts_failed"] += 1
                self.stats["errors"].append({
                    "type": "unexpected",
                    "player": safe_str(player_name),
                    "account": f"{safe_str(game_name)}#{tag_line}",
                    "platform": platform,
                    "error": str(e),
                })
                logger.error(
                    "Unexpected error importing account",
                    player=safe_str(player_name),
                    account=f"{safe_str(game_name)}#{tag_line}",
                    error=str(e),
                )

    async def run(self):
        """Run the import job."""
        logger.info("Starting esports data import v2...", dry_run=self.dry_run)

        # Load JSON data
        data = self._load_json()
        logger.info(
            "Loaded data",
            leagues=len(data["leagues"]),
            summary=data.get("summary", {}),
        )

        # Import leagues first
        await self._import_leagues()

        # Track if we should skip leagues
        skip_until_found = self.start_from_league is not None

        # Process each league
        for league_data in data["leagues"]:
            league_name = league_data["league"]
            teams = league_data["teams"]

            # Filter by only_league if specified
            if self.only_league and league_name != self.only_league:
                logger.info(f"Skipping league: {league_name} (only importing {self.only_league})")
                continue

            # Skip leagues until we find the start league
            if skip_until_found:
                if league_name == self.start_from_league:
                    skip_until_found = False
                    logger.info(f"Resuming from league: {league_name}")
                else:
                    logger.info(f"Skipping league: {league_name} (resuming from {self.start_from_league})")
                    continue

            logger.info(f"Processing league: {league_name}", teams=len(teams))

            for team_data in teams:
                team_name = team_data["name"]
                players = team_data["players"]

                if not players:
                    logger.warning(f"  Skipping team with no players: {team_name}")
                    continue

                logger.info(f"  Processing team: {team_name}", players=len(players))

                try:
                    # Import organization and team
                    org_id = await self._import_organization(team_data, league_name)
                    team_id = await self._import_team(team_data, league_name, org_id)

                    # Process players
                    for player_data in players:
                        player_name = player_data["name"]
                        role = player_data.get("role")
                        accounts = player_data.get("accounts", [])

                        logger.info(
                            f"    Processing player: {safe_str(player_name)}",
                            role=role,
                            accounts=len(accounts),
                        )

                        try:
                            # Import player and contract
                            player_id = await self._import_player(player_data)
                            await self._create_contract(player_id, team_id, role)

                            # Import accounts (this will make API calls)
                            await self._import_accounts(player_id, player_name, accounts)

                        except Exception as e:
                            self.stats["errors"].append({
                                "type": "player_import",
                                "player": safe_str(player_name),
                                "team": team_name,
                                "league": league_name,
                                "error": str(e),
                            })
                            logger.error(
                                "Error importing player",
                                player=safe_str(player_name),
                                error=str(e),
                            )
                            # Continue with next player

                except Exception as e:
                    self.stats["errors"].append({
                        "type": "team_import",
                        "team": team_name,
                        "league": league_name,
                        "error": str(e),
                    })
                    logger.error(
                        "Error importing team",
                        team=team_name,
                        error=str(e),
                    )
                    # Continue with next team

        # Save errors to file
        self._save_errors()

        # Print summary
        self._print_summary()

    def _print_summary(self):
        """Print import statistics."""
        print("\n" + "=" * 60)
        print("IMPORT COMPLETE" + (" (DRY-RUN)" if self.dry_run else ""))
        print("=" * 60)
        print(f"Leagues:          {self.stats['leagues']}")
        print(f"Organizations:    {self.stats['organizations']}")
        print(f"Teams:            {self.stats['teams']}")
        print(f"Players:          {self.stats['players']}")
        print(f"Contracts:        {self.stats['contracts']}")
        print(f"Accounts created: {self.stats['accounts_created']}")
        print(f"Accounts updated: {self.stats['accounts_updated']}")
        print(f"Accounts failed:  {self.stats['accounts_failed']}")
        print(f"Total errors:     {len(self.stats['errors'])}")

        if self.stats["errors"]:
            print("\n" + "-" * 60)
            print("ERRORS (first 20):")
            for error in self.stats["errors"][:20]:
                if error["type"] == "riot_api":
                    print(f"  [{error['error_code']}] {error['player']}: {error['account']} - {error['error_message']}")
                else:
                    print(f"  [{error['type']}] {error.get('player', error.get('team', 'unknown'))}: {error.get('error', 'unknown')}")
            if len(self.stats["errors"]) > 20:
                print(f"  ... and {len(self.stats['errors']) - 20} more errors")
            print(f"\nFull error log saved to: {ERROR_LOG_FILE}")

        print("=" * 60 + "\n")


async def main():
    """Run import manually."""
    import argparse

    parser = argparse.ArgumentParser(description="Import esports data from JSON")
    parser.add_argument("--dry-run", action="store_true", help="Run without making changes")
    parser.add_argument("--start-from", type=str, help="Start from specific league (e.g., LEC)")
    parser.add_argument("--only", type=str, help="Import only specific league (e.g., LCK)")
    args = parser.parse_args()

    job = ImportEsportsDataJobV2(dry_run=args.dry_run, start_from_league=args.start_from, only_league=args.only)
    try:
        await job.connect()
        await job.run()
    finally:
        await job.close()


if __name__ == "__main__":
    asyncio.run(main())
