"""
Import Esports Data from JSON
Imports leagues, teams, players, and LoL accounts from scraped data.
"""

import asyncio
import json
import re
import sys
from datetime import date
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
DATA_FILE = Path(__file__).parent.parent.parent / "lck_lpl_lec_lckcl_lfl_lcp_ltas_ltan_data.json"

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


class ImportEsportsDataJob:
    """Job to import esports data from JSON into the database."""

    def __init__(self):
        self.db: DatabaseService | None = None
        self.riot_api: RiotAPIService | None = None
        self.rate_limiter = RateLimiter(requests_per_second=20, requests_per_2min=100)
        self.stats = {
            "leagues": 0,
            "organizations": 0,
            "teams": 0,
            "players": 0,
            "contracts": 0,
            "accounts": 0,
            "errors": [],
        }
        # Cache to avoid duplicate players
        self._player_cache: dict[str, int] = {}  # player_slug -> player_id
        self._league_cache: dict[str, int] = {}  # short_name -> league_id

    async def connect(self):
        """Initialize database and API connections."""
        if not settings.database_url:
            raise ValueError("DATABASE_URL environment variable is required")

        self.db = DatabaseService(settings.database_url)
        await self.db.connect()

        if not settings.riot_api_key:
            raise ValueError("RIOT_API_KEY environment variable is required")

        self.riot_api = RiotAPIService(settings.riot_api_key, rate_limiter=self.rate_limiter)
        logger.info("Connected to database and Riot API")

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

    async def _import_leagues(self) -> None:
        """Import all leagues from the mapping."""
        logger.info("Importing leagues...")
        for short_name, info in LEAGUE_MAPPING.items():
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

    async def _import_organization(self, team_data: dict[str, Any]) -> int:
        """Import or update an organization."""
        slug = slugify(team_data["slug"])
        name = team_data["name"]

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
            team_data["slug"][:20],  # short_name max 20 chars
        )
        self.stats["organizations"] += 1
        return org_id

    async def _import_team(self, team_data: dict[str, Any], league_short_name: str, org_id: int) -> int:
        """Import or update a team."""
        slug = slugify(team_data["slug"])
        name = team_data["name"]
        region = LEAGUE_MAPPING.get(league_short_name, {}).get("region", "EU")

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
        self.stats["teams"] += 1
        return team_id

    async def _import_player(self, player_data: dict[str, Any]) -> int:
        """Import or update a player."""
        name = player_data["name"]
        slug = slugify(name)

        # Check cache first
        if slug in self._player_cache:
            return self._player_cache[slug]

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
        logger.debug("Imported player", name=name.encode('ascii', 'replace').decode(), player_id=player_id)
        return player_id

    async def _create_contract(self, player_id: int, team_id: int, role: str | None) -> None:
        """Create a player contract linking player to team."""
        # Normalize role to standard codes: TOP, JGL, MID, ADC, SUP
        if not role:
            role_normalized = None
        else:
            role_normalized = role.upper()
        if role_normalized == "JUNGLE":
            role_normalized = "JGL"
        elif role_normalized == "SUPPORT":
            role_normalized = "SUP"
        elif role_normalized == "BOT" or role_normalized == "BOTTOM":
            role_normalized = "ADC"
        # ADC, TOP, MID remain unchanged

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
        # Create API service with correct routing region
        region = REGION_MAPPING.get(platform, platform)

        # Use the shared rate limiter
        api = RiotAPIService(
            self.riot_api.api_key,
            region=region,
            rate_limiter=self.rate_limiter,
        )

        try:
            # get_summoner_by_name actually calls the Account API which returns puuid
            data = await api.get_summoner_by_name(game_name, tag_line)
            return data["puuid"]
        finally:
            await api.close()

    async def _import_accounts(self, player_id: int, accounts: list[dict[str, Any]]) -> None:
        """Import LoL accounts for a player."""
        is_first = True

        for acc in accounts:
            game_name = acc["gameName"]
            tag_line = acc["tagLine"]
            platform = acc["platform"]
            region = REGION_MAPPING.get(platform, platform)

            try:
                # Fetch PUUID from Riot API
                puuid = await self._fetch_puuid(game_name, tag_line, platform)

                # Check if account already exists
                existing = await self.db.fetchrow(
                    "SELECT puuid FROM lol_accounts WHERE puuid = $1",
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
                        is_first,  # First account is primary
                    )
                    self.stats["accounts"] += 1

                logger.debug(
                    "Imported account",
                    game_name=game_name.encode('ascii', 'replace').decode(),
                    tag_line=tag_line,
                    region=region,
                    puuid=puuid[:16] + "...",
                )
                is_first = False

            except RiotAPIError as e:
                safe_name = game_name.encode('ascii', 'replace').decode()
                safe_error = str(e).encode('ascii', 'replace').decode()
                error_msg = f"{safe_name}#{tag_line} ({platform}): {e.message}"
                self.stats["errors"].append(error_msg)
                logger.warning("Failed to fetch PUUID", account=f"{safe_name}#{tag_line}", error=safe_error)

    async def run(self):
        """Run the import job."""
        logger.info("Starting esports data import...")

        # Load JSON data
        data = self._load_json()
        logger.info(
            "Loaded data",
            leagues=len(data["leagues"]),
            summary=data.get("summary", {}),
        )

        # Import leagues first
        await self._import_leagues()

        # Process each league
        for league_data in data["leagues"]:
            league_name = league_data["league"]
            teams = league_data["teams"]

            logger.info(f"Processing league: {league_name}", teams=len(teams))

            for team_data in teams:
                team_name = team_data["name"]
                players = team_data["players"]

                logger.info(f"  Processing team: {team_name}", players=len(players))

                # Import organization and team
                org_id = await self._import_organization(team_data)
                team_id = await self._import_team(team_data, league_name, org_id)

                # Process players
                for player_data in players:
                    player_name = player_data["name"]
                    role = player_data["role"]
                    accounts = player_data.get("accounts", [])

                    logger.info(f"    Processing player: {player_name}", role=role, accounts=len(accounts))

                    # Import player and contract
                    player_id = await self._import_player(player_data)
                    await self._create_contract(player_id, team_id, role)

                    # Import accounts (this will make API calls)
                    await self._import_accounts(player_id, accounts)

        # Print summary
        self._print_summary()

    def _print_summary(self):
        """Print import statistics."""
        logger.info("=" * 50)
        logger.info("IMPORT COMPLETE")
        logger.info("=" * 50)
        logger.info(f"Leagues:       {self.stats['leagues']}")
        logger.info(f"Organizations: {self.stats['organizations']}")
        logger.info(f"Teams:         {self.stats['teams']}")
        logger.info(f"Players:       {self.stats['players']}")
        logger.info(f"Contracts:     {self.stats['contracts']}")
        logger.info(f"Accounts:      {self.stats['accounts']}")
        logger.info(f"Errors:        {len(self.stats['errors'])}")

        if self.stats["errors"]:
            logger.info("-" * 50)
            logger.info("ERRORS:")
            for error in self.stats["errors"][:20]:  # Show first 20 errors
                logger.warning(f"  - {error}")
            if len(self.stats["errors"]) > 20:
                logger.warning(f"  ... and {len(self.stats['errors']) - 20} more errors")


async def main():
    """Run import manually."""
    job = ImportEsportsDataJob()
    try:
        await job.connect()
        await job.run()
    finally:
        await job.close()


if __name__ == "__main__":
    asyncio.run(main())
