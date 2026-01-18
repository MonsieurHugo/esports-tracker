"""
Priority-Based Fetch Matches Job
Fetches match history from Riot API with activity-based priority scheduling
"""

import asyncio
from collections import defaultdict
from datetime import datetime, timezone

import structlog

from src.services.account_selector import (
    AccountSelector,
    AccountSelectorConfig,
    PrioritizedAccount,
)
from src.services.activity_scorer import ActivityScorer
from src.services.database import DatabaseService
from src.services.riot_api import RateLimiter, RiotAPIError, RiotAPIService

logger = structlog.get_logger(__name__)

# Only fetch matches from 01/01/2026 onwards
DEFAULT_START_TIME = 1735689600  # 01/01/2026 00:00:00 UTC

# Queue ID for Ranked Solo/Duo
QUEUE_SOLO_DUO = 420


class FetchMatchesJobV2:
    """Priority-based job to fetch and store match history.

    Improvements over V1:
    - Activity-based scoring determines refresh frequency
    - Very active players (grinders) get checked every 2-5 minutes
    - Inactive players get checked every 3-6 hours
    - Exponential backoff on consecutive empty fetches
    - Dynamic sleep based on queue state
    """

    def __init__(
        self,
        db: DatabaseService,
        api_key: str,
        config: AccountSelectorConfig | None = None,
    ):
        self.db = db
        self.api_key = api_key
        self.config = config or AccountSelectorConfig()

        self._region_clients: dict[str, RiotAPIService] = {}
        self._scorer: ActivityScorer | None = None
        self._selector: AccountSelector | None = None
        self._running = False

        # Metrics tracking
        self._cycle_count = 0
        self._total_matches_found = 0
        self._fetches_by_tier: dict[str, int] = defaultdict(int)
        self._matches_by_tier: dict[str, int] = defaultdict(int)

    def _get_region_client(self, region: str) -> RiotAPIService:
        """Get or create a Riot API client for a specific region."""
        if region not in self._region_clients:
            rate_limiter = RateLimiter()
            self._region_clients[region] = RiotAPIService(
                api_key=self.api_key,
                region=region,
                rate_limiter=rate_limiter,
            )
        return self._region_clients[region]

    async def run(self) -> None:
        """Execute the job continuously with priority-based scheduling."""
        self._running = True
        logger.info("Starting priority-based fetch matches job (V2)")

        # Initialize scoring and selection components
        self._scorer = ActivityScorer()
        self._selector = AccountSelector(self.db, self._scorer, self.config)
        await self._selector.initialize()

        try:
            while self._running:
                await self._run_cycle()

                # Dynamic sleep based on queue state
                sleep_time = await self._calculate_sleep_time()
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)

        except asyncio.CancelledError:
            logger.info("Fetch matches job V2 cancelled")
        except Exception as e:
            logger.exception("Fetch matches job V2 failed", error=str(e))
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
        """Run one priority-based fetch cycle across all regions."""
        self._cycle_count += 1

        if not self._selector:
            return

        # Get stats before cycle
        stats = self._selector.get_stats()

        # Process each region in parallel
        regions = list(self._selector.queues.keys())
        tasks = [self._process_region(region) for region in regions]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Aggregate results
        cycle_matches = 0
        cycle_accounts = 0

        for region, result in zip(regions, results):
            if isinstance(result, Exception):
                logger.error(
                    "Region processing failed", region=region, error=str(result)
                )
            else:
                matches, accounts = result
                cycle_matches += matches
                cycle_accounts += accounts

        self._total_matches_found += cycle_matches

        # Log cycle summary
        if cycle_accounts > 0:
            logger.info(
                "Priority cycle completed",
                cycle=self._cycle_count,
                accounts_processed=cycle_accounts,
                new_matches=cycle_matches,
                ready_accounts=stats["ready_now"],
                tier_distribution=stats["by_tier"],
            )

    async def _process_region(self, region: str) -> tuple[int, int]:
        """Process ready accounts for a specific region.

        Returns:
            Tuple of (new_matches_count, accounts_processed)
        """
        if not self._selector:
            return 0, 0

        riot_api = self._get_region_client(region)
        total_new_matches = 0
        accounts_processed = 0

        # Get batch of ready accounts
        accounts = await self._selector.get_ready_accounts(region)

        for account in accounts:
            if not self._running:
                break

            game_name = f"{account.game_name}#{account.tag_line}"

            # Update worker status
            try:
                await self.db.update_worker_current_account(game_name, region)
            except Exception as e:
                logger.debug(
                    "Failed to update worker current account",
                    error=str(e),
                    game_name=game_name,
                    region=region,
                )
                # Continue execution - this is non-critical

            try:
                new_matches = await self._fetch_account_matches(riot_api, account)
                total_new_matches += new_matches
                accounts_processed += 1

                # Track metrics by tier
                self._fetches_by_tier[account.tier] += 1
                self._matches_by_tier[account.tier] += new_matches

                # Update last_fetched_at in accounts table
                await self.db.update_account_last_fetched(account.puuid)

                # Get fresh activity data if we found matches
                activity_data = None
                if new_matches > 0:
                    activity_data = await self.db.get_account_activity_data(
                        account.puuid
                    )

                    # Update worker stats
                    await self.db.increment_worker_stats(
                        matches_added=new_matches,
                        accounts_processed=1,
                    )
                    await self.db.log_worker_activity(
                        log_type="lol",
                        severity="info",
                        message=f"{new_matches} nouveau(x) match(s) ajoute(s)",
                        account_name=game_name,
                        account_puuid=account.puuid,
                    )
                else:
                    await self.db.increment_worker_stats(accounts_processed=1)

                # Reschedule with updated priority
                await self._selector.reschedule(account, new_matches, activity_data)

            except Exception as e:
                logger.error(
                    "Failed to fetch matches for account",
                    puuid=account.puuid[:8],
                    game_name=game_name,
                    error=str(e),
                )
                # Log error
                try:
                    await self.db.set_worker_error(str(e))
                    await self.db.log_worker_activity(
                        log_type="error",
                        severity="error",
                        message=str(e),
                        account_name=game_name,
                        account_puuid=account.puuid,
                    )
                except Exception as log_error:
                    logger.debug(
                        "Failed to log worker error to database",
                        original_error=str(e),
                        log_error=str(log_error),
                        game_name=game_name,
                    )
                    # Continue execution - logging failure is non-critical

                # Still reschedule (with 0 matches to apply decay)
                await self._selector.reschedule(account, 0)

        # Clear current account after region is done
        try:
            await self.db.update_worker_current_account(None, None)
        except Exception as e:
            logger.debug(
                "Failed to clear worker current account",
                error=str(e),
                region=region,
            )
            # Continue execution - this is non-critical

        return total_new_matches, accounts_processed

    async def _fetch_account_matches(
        self, riot_api: RiotAPIService, account: PrioritizedAccount
    ) -> int:
        """Fetch matches for a single account.

        This is largely the same as V1, but works with PrioritizedAccount.
        """
        puuid = account.puuid
        new_matches = 0
        champions_to_update: set[int] = set()
        dates_to_update: set = set()

        # Determine start_time
        if account.last_match_at:
            try:
                ts = int(account.last_match_at.timestamp())
                start_time = ts if ts > 1577836800 else DEFAULT_START_TIME
            except (OSError, ValueError):
                start_time = DEFAULT_START_TIME
        else:
            start_time = DEFAULT_START_TIME

        try:
            # Get recent match IDs
            match_ids = await riot_api.get_match_ids(
                puuid=puuid,
                count=100,
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

                        if (
                            latest_game_start is None
                            or result["game_start"] > latest_game_start
                        ):
                            latest_game_start = result["game_start"]

                except RiotAPIError as e:
                    if e.status_code == 404:
                        logger.debug("Match not found", match_id=match_id)
                    else:
                        logger.warning(
                            "Failed to fetch match", match_id=match_id, error=str(e)
                        )

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
                logger.debug("Could not fetch rank", puuid=puuid[:8], error=str(e))

            # Update daily stats for today
            await self.db.update_daily_stats(puuid, today, tier, rank_div, lp)

            # Update historical dates without rank
            for stats_date in dates_to_update:
                if stats_date != today:
                    await self.db.update_daily_stats(puuid, stats_date, None, None, 0)

            # Update computed stats if we have new matches
            if new_matches > 0:
                await self.db.update_streak(puuid)

                for champion_id in champions_to_update:
                    await self.db.update_champion_stats(puuid, champion_id)

                if latest_game_start:
                    await self.db.update_account_last_match(puuid, latest_game_start)

                logger.debug(
                    "Processed matches",
                    game_name=f"{account.game_name}#{account.tag_line}",
                    new_matches=new_matches,
                    tier=account.tier,
                    score=round(account.activity_score, 1),
                )

        except RiotAPIError as e:
            if e.status_code == 404:
                logger.warning(
                    "Account not found",
                    puuid=puuid[:8],
                    game_name=f"{account.game_name}#{account.tag_line}",
                )
            else:
                logger.error(
                    "Failed to fetch match IDs",
                    game_name=f"{account.game_name}#{account.tag_line}",
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
            cs = participant.get("totalMinionsKilled", 0) + participant.get(
                "neutralMinionsKilled", 0
            )
            vision_score = participant.get("visionScore", 0)
            damage_dealt = participant.get("totalDamageDealtToChampions", 0)
            gold_earned = participant.get("goldEarned", 0)
            raw_role = participant.get("teamPosition") or participant.get(
                "individualPosition"
            )
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

            if p_puuid == tracked_puuid:
                tracked_participant = {
                    "champion_id": champion_id,
                    "win": win,
                }

        if not tracked_participant:
            logger.warning(
                "Tracked participant not found in match",
                match_id=match_id,
                puuid=tracked_puuid[:8],
            )
            return None

        # Update synergies with other tracked players
        await self.db.update_player_synergies(tracked_puuid, match_id)

        return {
            "champion_id": tracked_participant["champion_id"],
            "date": game_start.date(),
            "game_start": game_start,
        }

    async def _calculate_sleep_time(self) -> float:
        """Calculate how long to sleep before next cycle.

        Returns time until the soonest account is due, capped at 5 seconds.
        """
        if not self._selector:
            return 5.0

        soonest = await self._selector.get_soonest_fetch_time()

        if soonest is None:
            return 5.0

        # Ensure timezone-aware comparison
        if soonest.tzinfo is None:
            soonest = soonest.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)

        if soonest <= now:
            return 0.1  # Immediate processing needed

        wait_seconds = (soonest - now).total_seconds()
        return min(wait_seconds, 5.0)  # Cap at 5 seconds

    def get_metrics(self) -> dict:
        """Get job metrics for monitoring."""
        return {
            "cycle_count": self._cycle_count,
            "total_matches_found": self._total_matches_found,
            "fetches_by_tier": dict(self._fetches_by_tier),
            "matches_by_tier": dict(self._matches_by_tier),
            "efficiency_by_tier": {
                tier: (
                    self._matches_by_tier[tier] / self._fetches_by_tier[tier]
                    if self._fetches_by_tier[tier] > 0
                    else 0
                )
                for tier in self._fetches_by_tier
            },
        }
