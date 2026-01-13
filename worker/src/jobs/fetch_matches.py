"""
Fetch Matches Job
Continuously fetches match history from Riot API with parallelism by region
"""

import asyncio
from collections import defaultdict
from datetime import datetime

import structlog

from src.services.database import DatabaseService
from src.services.riot_api import RiotAPIService, RiotAPIError, RateLimiter

logger = structlog.get_logger(__name__)

# Only fetch matches from 01/01/2026 onwards
DEFAULT_START_TIME = 1735689600  # 01/01/2026 00:00:00 UTC

# Queue ID for Ranked Solo/Duo
QUEUE_SOLO_DUO = 420


class FetchMatchesJob:
    """Job to fetch and store match history with region parallelism."""

    def __init__(self, db: DatabaseService, api_key: str):
        self.db = db
        self.api_key = api_key
        self._region_clients: dict[str, RiotAPIService] = {}
        self._running = False

    def _get_region_client(self, region: str) -> RiotAPIService:
        """Get or create a Riot API client for a specific region."""
        if region not in self._region_clients:
            # Each region has its own rate limiter (independent limits)
            rate_limiter = RateLimiter()
            self._region_clients[region] = RiotAPIService(
                api_key=self.api_key,
                region=region,
                rate_limiter=rate_limiter,
            )
        return self._region_clients[region]

    async def run(self) -> None:
        """Execute the job continuously."""
        self._running = True
        logger.info("Starting fetch matches job (continuous mode)")

        try:
            while self._running:
                await self._run_cycle()
                # Small pause between cycles
                await asyncio.sleep(5)
        except asyncio.CancelledError:
            logger.info("Fetch matches job cancelled")
        except Exception as e:
            logger.exception("Fetch matches job failed", error=str(e))
        finally:
            await self._cleanup()

    async def stop(self) -> None:
        """Stop the job gracefully."""
        self._running = False

    async def _cleanup(self) -> None:
        """Clean up region clients."""
        for client in self._region_clients.values():
            await client.close()
        self._region_clients.clear()

    async def _run_cycle(self) -> None:
        """Run one cycle: fetch matches for all accounts grouped by region."""
        accounts = await self.db.get_active_accounts()

        if not accounts:
            logger.debug("No active accounts to process")
            return

        # Group accounts by region
        accounts_by_region: dict[str, list] = defaultdict(list)
        for account in accounts:
            region = account["region"] or "EUW"
            accounts_by_region[region].append(account)

        logger.info(
            "Processing accounts",
            total=len(accounts),
            regions=list(accounts_by_region.keys()),
        )

        # Process each region in parallel
        tasks = [
            self._process_region(region, region_accounts)
            for region, region_accounts in accounts_by_region.items()
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Log results
        total_matches = 0
        for region, result in zip(accounts_by_region.keys(), results):
            if isinstance(result, Exception):
                logger.error("Region processing failed", region=region, error=str(result))
            else:
                total_matches += result
                logger.info("Region completed", region=region, new_matches=result)

        logger.info("Cycle completed", total_new_matches=total_matches)

    async def _process_region(self, region: str, accounts: list) -> int:
        """Process all accounts for a specific region sequentially."""
        riot_api = self._get_region_client(region)
        total_new_matches = 0

        for account in accounts:
            if not self._running:
                break

            game_name = f"{account['game_name']}#{account['tag_line']}"

            # Update worker status with current account
            try:
                await self.db.update_worker_current_account(game_name, region)
            except Exception:
                pass  # Don't fail on status update

            try:
                new_matches = await self._fetch_account_matches(riot_api, account)
                total_new_matches += new_matches

                # Always update last_fetched_at to track when account was checked
                await self.db.update_account_last_fetched(account["puuid"])

                # Update worker stats
                if new_matches > 0:
                    await self.db.increment_worker_stats(
                        matches_added=new_matches,
                        accounts_processed=1,
                    )
                    await self.db.log_worker_activity(
                        log_type="lol",
                        severity="info",
                        message=f"{new_matches} nouveau(x) match(s) ajouté(s)",
                        account_name=game_name,
                        account_puuid=account["puuid"],
                    )
                else:
                    # Count account as processed even with no new matches
                    await self.db.increment_worker_stats(accounts_processed=1)

            except Exception as e:
                logger.error(
                    "Failed to fetch matches for account",
                    puuid=account["puuid"],
                    game_name=account["game_name"],
                    error=str(e),
                )
                # Log error to database
                try:
                    await self.db.set_worker_error(str(e))
                    await self.db.log_worker_activity(
                        log_type="error",
                        severity="error",
                        message=str(e),
                        account_name=game_name,
                        account_puuid=account["puuid"],
                    )
                except Exception:
                    pass

        # Clear current account after region is done
        try:
            await self.db.update_worker_current_account(None, None)
        except Exception:
            pass

        return total_new_matches

    async def _fetch_account_matches(self, riot_api: RiotAPIService, account) -> int:
        """Fetch matches for a single account."""
        puuid = account["puuid"]
        new_matches = 0
        champions_to_update: set[int] = set()
        dates_to_update: set = set()

        # Determine start_time: last match or default
        # Handle edge case where last_match_at is epoch (1970) or invalid
        if account["last_match_at"]:
            try:
                ts = int(account["last_match_at"].timestamp())
                # If timestamp is before 2020, use default (handles epoch dates)
                start_time = ts if ts > 1577836800 else DEFAULT_START_TIME
            except (OSError, ValueError):
                # Windows can fail on epoch dates
                start_time = DEFAULT_START_TIME
        else:
            start_time = DEFAULT_START_TIME

        try:
            # Get recent match IDs (only Solo/Duo from start_time)
            match_ids = await riot_api.get_match_ids(
                puuid=puuid,
                count=100,  # Max allowed
                queue=QUEUE_SOLO_DUO,
                start_time=start_time,
            )

            if not match_ids:
                return 0

            latest_game_start: datetime | None = None

            for match_id in match_ids:
                if not self._running:
                    break

                # Check if we already have this match
                if await self.db.match_exists(match_id):
                    continue

                # Fetch and process new match
                try:
                    match_data = await riot_api.get_match(match_id)
                    result = await self._process_match(match_data, puuid)

                    if result:
                        new_matches += 1
                        champions_to_update.add(result["champion_id"])
                        dates_to_update.add(result["date"])

                        # Track latest game for last_match_at update
                        if latest_game_start is None or result["game_start"] > latest_game_start:
                            latest_game_start = result["game_start"]

                except RiotAPIError as e:
                    if e.status_code == 404:
                        logger.debug("Match not found", match_id=match_id)
                    else:
                        logger.warning("Failed to fetch match", match_id=match_id, error=str(e))

            # Always fetch current rank and update today's daily stats
            from datetime import date as date_type
            today = date_type.today()
            tier, rank_div, lp = None, None, 0
            try:
                league_entries = await riot_api.get_league_entries_by_puuid(puuid)
                for entry in league_entries:
                    if entry.get("queueType") == "RANKED_SOLO_5x5":
                        tier = entry.get("tier")
                        rank_div = entry.get("rank")
                        lp = entry.get("leaguePoints", 0)
                        break
            except RiotAPIError as e:
                logger.debug("Could not fetch rank", puuid=puuid, error=str(e))

            # Always update daily stats for today (even if no new matches)
            await self.db.update_daily_stats(puuid, today, tier, rank_div, lp)

            # Update daily stats for other affected dates (historical, without rank)
            for stats_date in dates_to_update:
                if stats_date != today:
                    await self.db.update_daily_stats(puuid, stats_date, None, None, 0)

            # Update computed stats only if we have new matches
            if new_matches > 0:
                # Update streak
                await self.db.update_streak(puuid)

                # Update champion stats for affected champions
                for champion_id in champions_to_update:
                    await self.db.update_champion_stats(puuid, champion_id)

                # Update last_match_at timestamp
                if latest_game_start:
                    await self.db.update_account_last_match(puuid, latest_game_start)

                logger.debug(
                    "Processed matches",
                    game_name=account["game_name"],
                    new_matches=new_matches,
                    champions=len(champions_to_update),
                    dates=len(dates_to_update),
                    tier=tier,
                    rank=rank_div,
                    lp=lp,
                )

        except RiotAPIError as e:
            if e.status_code == 404:
                logger.warning("Account not found", puuid=puuid, game_name=account["game_name"])
            else:
                logger.error(
                    "Failed to fetch match IDs",
                    game_name=account["game_name"],
                    error=str(e),
                )

        return new_matches

    async def _process_match(self, match_data: dict, tracked_puuid: str) -> dict | None:
        """Process and store a single match with all participants."""
        info = match_data.get("info", {})
        metadata = match_data.get("metadata", {})

        match_id = metadata.get("matchId")
        game_start_timestamp = info.get("gameStartTimestamp", 0)
        game_start = datetime.fromtimestamp(game_start_timestamp / 1000)
        game_duration = info.get("gameDuration", 0)
        queue_id = info.get("queueId", 0)
        game_version = info.get("gameVersion")

        # Insert match
        await self.db.insert_match(
            match_id=match_id,
            game_start=game_start,
            game_duration=game_duration,
            queue_id=queue_id,
            game_version=game_version,
        )

        # Insert ALL 10 participants
        participants = info.get("participants", [])
        tracked_participant = None

        for participant in participants:
            p_puuid = participant.get("puuid")
            champion_id = participant.get("championId", 0)
            win = participant.get("win", False)
            kills = participant.get("kills", 0)
            deaths = participant.get("deaths", 0)
            assists = participant.get("assists", 0)
            cs = participant.get("totalMinionsKilled", 0) + participant.get("neutralMinionsKilled", 0)
            vision_score = participant.get("visionScore", 0)
            damage_dealt = participant.get("totalDamageDealtToChampions", 0)
            gold_earned = participant.get("goldEarned", 0)
            raw_role = participant.get("teamPosition") or participant.get("individualPosition")
            # Normalize role to standard codes: TOP, JGL, MID, ADC, SUP
            role_map = {
                "JUNGLE": "JGL",
                "MIDDLE": "MID",
                "BOTTOM": "ADC",
                "UTILITY": "SUP",
            }
            role = role_map.get(raw_role, raw_role) if raw_role else None
            team_id = participant.get("teamId")

            await self.db.insert_match_stats(
                match_id=match_id,
                puuid=p_puuid,
                champion_id=champion_id,
                win=win,
                kills=kills,
                deaths=deaths,
                assists=assists,
                cs=cs,
                vision_score=vision_score,
                damage_dealt=damage_dealt,
                gold_earned=gold_earned,
                role=role,
                team_id=team_id,
            )

            # Track the participant we're interested in
            if p_puuid == tracked_puuid:
                tracked_participant = {
                    "champion_id": champion_id,
                    "win": win,
                }

        if not tracked_participant:
            logger.warning("Tracked participant not found in match", match_id=match_id, puuid=tracked_puuid)
            return None

        # Update synergies with other tracked players
        await self.db.update_player_synergies(tracked_puuid, match_id)

        return {
            "champion_id": tracked_participant["champion_id"],
            "date": game_start.date(),
            "game_start": game_start,
        }
