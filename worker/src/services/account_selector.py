"""
Account Selector Service
Priority queue management for account refresh scheduling
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from heapq import heapify, heappop, heappush
from typing import TYPE_CHECKING

import structlog

from src.services.activity_scorer import ActivityScorer

if TYPE_CHECKING:
    from src.services.database import DatabaseService

logger = structlog.get_logger(__name__)


@dataclass
class PrioritizedAccount:
    """Account with priority metadata for queue management."""

    puuid: str
    region: str
    activity_score: float
    tier: str
    next_fetch_at: datetime
    last_fetched_at: datetime | None
    last_match_at: datetime | None
    consecutive_empty_fetches: int = 0

    # Account identification (for API calls and logging)
    game_name: str = ""
    tag_line: str = ""
    player_id: int = 0

    def __lt__(self, other: "PrioritizedAccount") -> bool:
        """Compare by next_fetch_at for heap ordering."""
        return self.next_fetch_at < other.next_fetch_at

    def __eq__(self, other: object) -> bool:
        """Equality based on puuid."""
        if not isinstance(other, PrioritizedAccount):
            return NotImplemented
        return self.puuid == other.puuid

    def __hash__(self) -> int:
        """Hash based on puuid."""
        return hash(self.puuid)


@dataclass
class AccountSelectorConfig:
    """Configuration for account selector."""

    # Base intervals by tier (in minutes)
    interval_very_active: int = 3
    interval_active: int = 15
    interval_moderate: int = 60
    interval_inactive: int = 240

    # Maximum intervals (caps for backoff)
    max_interval_very_active: int = 5
    max_interval_active: int = 30
    max_interval_moderate: int = 120
    max_interval_inactive: int = 360

    # Batch size per region
    batch_size: int = 10

    # Max consecutive empty fetches before max backoff
    max_consecutive_empty: int = 5


class AccountSelector:
    """Manages priority queues for account refresh scheduling."""

    def __init__(
        self,
        db: "DatabaseService",
        scorer: ActivityScorer,
        config: AccountSelectorConfig | None = None,
    ):
        self.db = db
        self.scorer = scorer
        self.config = config or AccountSelectorConfig()

        # Priority queues by region (min-heap based on next_fetch_at)
        self.queues: dict[str, list[PrioritizedAccount]] = {}
        self._locks: dict[str, asyncio.Lock] = {}

        # Track accounts by puuid for updates
        self._account_map: dict[str, PrioritizedAccount] = {}

        # Interval mappings
        self._base_intervals = {
            "very_active": timedelta(minutes=self.config.interval_very_active),
            "active": timedelta(minutes=self.config.interval_active),
            "moderate": timedelta(minutes=self.config.interval_moderate),
            "inactive": timedelta(minutes=self.config.interval_inactive),
        }

        self._max_intervals = {
            "very_active": timedelta(minutes=self.config.max_interval_very_active),
            "active": timedelta(minutes=self.config.max_interval_active),
            "moderate": timedelta(minutes=self.config.max_interval_moderate),
            "inactive": timedelta(minutes=self.config.max_interval_inactive),
        }

    async def initialize(self) -> None:
        """Load all accounts and build initial priority queues."""
        logger.info("Initializing account selector")

        accounts = await self.db.get_active_accounts_with_activity()

        for acc in accounts:
            region = acc["region"] or "EUW"

            # Initialize region queue if needed
            if region not in self.queues:
                self.queues[region] = []
                self._locks[region] = asyncio.Lock()

            # Calculate initial score
            score = self.scorer.calculate_score(
                games_today=acc["games_today"] or 0,
                games_last_3_days=acc["games_last_3_days"] or 0,
                games_last_7_days=acc["games_last_7_days"] or 0,
                last_match_at=acc["last_match_at"],
            )

            tier = self.scorer.determine_tier(score)

            # Determine next_fetch_at
            # If stored in DB, use it; otherwise schedule immediately
            if acc["next_fetch_at"]:
                next_fetch = acc["next_fetch_at"]
                if next_fetch.tzinfo is None:
                    next_fetch = next_fetch.replace(tzinfo=timezone.utc)
            else:
                next_fetch = datetime.now(timezone.utc)

            pa = PrioritizedAccount(
                puuid=acc["puuid"],
                region=region,
                activity_score=score,
                tier=tier,
                next_fetch_at=next_fetch,
                last_fetched_at=acc["last_fetched_at"],
                last_match_at=acc["last_match_at"],
                consecutive_empty_fetches=acc["consecutive_empty_fetches"] or 0,
                game_name=acc["game_name"] or "",
                tag_line=acc["tag_line"] or "",
                player_id=acc["player_id"],
            )

            heappush(self.queues[region], pa)
            self._account_map[pa.puuid] = pa

        # Log initialization summary
        total = sum(len(q) for q in self.queues.values())
        tier_counts = {"very_active": 0, "active": 0, "moderate": 0, "inactive": 0}
        for acc in self._account_map.values():
            tier_counts[acc.tier] += 1

        logger.info(
            "Account selector initialized",
            total_accounts=total,
            regions=list(self.queues.keys()),
            tier_distribution=tier_counts,
        )

    async def add_account(
        self,
        puuid: str,
        region: str,
        game_name: str,
        tag_line: str,
        player_id: int,
    ) -> None:
        """Add a newly validated account to the priority queue.

        Called when ValidateAccountsJob successfully validates an account.
        The account is scheduled for immediate fetching.

        Args:
            puuid: The account's PUUID
            region: Region code (EUW, NA, etc.)
            game_name: Riot ID game name
            tag_line: Riot ID tag line
            player_id: Associated player ID
        """
        # Skip if account already exists
        if puuid in self._account_map:
            logger.debug(
                "Account already in selector",
                puuid=puuid[:8],
                game_name=game_name,
            )
            return

        # Initialize region queue if needed
        if region not in self.queues:
            self.queues[region] = []
            self._locks[region] = asyncio.Lock()

        # New account starts with base score (no activity data yet)
        score = self.scorer.calculate_score(
            games_today=0,
            games_last_3_days=0,
            games_last_7_days=0,
            last_match_at=None,
        )
        tier = self.scorer.determine_tier(score)

        # Schedule immediately
        now = datetime.now(timezone.utc)

        pa = PrioritizedAccount(
            puuid=puuid,
            region=region,
            activity_score=score,
            tier=tier,
            next_fetch_at=now,
            last_fetched_at=None,
            last_match_at=None,
            consecutive_empty_fetches=0,
            game_name=game_name,
            tag_line=tag_line,
            player_id=player_id,
        )

        async with self._locks[region]:
            heappush(self.queues[region], pa)
            self._account_map[puuid] = pa

        logger.info(
            "Added new account to selector",
            puuid=puuid[:8],
            game_name=game_name,
            tag_line=tag_line,
            region=region,
            tier=tier,
        )

    async def get_ready_accounts(
        self, region: str, max_count: int | None = None
    ) -> list[PrioritizedAccount]:
        """Get accounts ready for fetching from a region.

        This method is atomic - all heap operations are performed within
        a single lock acquisition to prevent TOCTOU race conditions.

        Args:
            region: Region code (EUW, NA, etc.)
            max_count: Maximum accounts to return (default: config.batch_size)

        Returns:
            List of accounts whose next_fetch_at has passed
        """
        if region not in self.queues:
            return []

        if max_count is None:
            max_count = self.config.batch_size

        ready = []
        now = datetime.now(timezone.utc)

        async with self._locks[region]:  # Single atomic block for all heap operations
            while self.queues[region] and len(ready) < max_count:
                # Defensive check - verify queue is still non-empty before access
                if not self.queues[region]:
                    break

                # Peek and pop atomically within the same lock
                top = self.queues[region][0]
                top_time = top.next_fetch_at

                # Ensure timezone-aware comparison
                if top_time.tzinfo is None:
                    top_time = top_time.replace(tzinfo=timezone.utc)

                if top_time <= now:
                    account = heappop(self.queues[region])
                    ready.append(account)
                else:
                    # All remaining accounts are in the future (heap is sorted)
                    break

        return ready

    async def reschedule(
        self,
        account: PrioritizedAccount,
        new_matches: int,
        activity_data: dict | None = None,
    ) -> None:
        """Reschedule an account after processing.

        Args:
            account: The account that was processed
            new_matches: Number of new matches found
            activity_data: Optional fresh activity data from DB
        """
        now = datetime.now(timezone.utc)

        # Update score based on results
        if new_matches > 0:
            account.consecutive_empty_fetches = 0

            # If we have fresh data, recalculate properly
            if activity_data:
                account.activity_score = self.scorer.calculate_score(
                    games_today=activity_data.get("games_today", 0),
                    games_last_3_days=activity_data.get("games_last_3_days", 0),
                    games_last_7_days=activity_data.get("games_last_7_days", 0),
                    last_match_at=activity_data.get("last_match_at"),
                )
            else:
                # Simple boost
                account.activity_score = self.scorer.apply_match_boost(
                    account.activity_score, new_matches
                )
        else:
            account.consecutive_empty_fetches += 1
            account.activity_score = self.scorer.apply_empty_fetch_decay(
                account.activity_score
            )

        # Determine new tier
        account.tier = self.scorer.determine_tier(account.activity_score)

        # Calculate next fetch interval
        base_interval = self._base_intervals[account.tier]
        max_interval = self._max_intervals[account.tier]

        # Apply exponential backoff for consecutive empty fetches
        if account.consecutive_empty_fetches > 0:
            backoff_factor = min(
                2 ** account.consecutive_empty_fetches,
                8,  # Cap at 8x
            )
            interval = base_interval * backoff_factor
        else:
            interval = base_interval

        # Clamp to max interval
        if interval > max_interval:
            interval = max_interval

        account.next_fetch_at = now + interval
        account.last_fetched_at = now

        # Re-add to queue
        async with self._locks[account.region]:
            heappush(self.queues[account.region], account)

        # Update account map
        self._account_map[account.puuid] = account

        # Persist to database
        await self.db.update_account_priority(
            puuid=account.puuid,
            activity_score=account.activity_score,
            tier=account.tier,
            next_fetch_at=account.next_fetch_at,
            consecutive_empty_fetches=account.consecutive_empty_fetches,
        )

        logger.debug(
            "Account rescheduled",
            puuid=account.puuid[:8],
            game_name=f"{account.game_name}#{account.tag_line}",
            tier=account.tier,
            score=round(account.activity_score, 1),
            next_fetch_in_minutes=round(interval.total_seconds() / 60, 1),
            consecutive_empty=account.consecutive_empty_fetches,
        )

    async def get_next_fetch_time(self, region: str) -> datetime | None:
        """Get when the next account is due for a region.

        Args:
            region: Region code

        Returns:
            Datetime of next due account, or None if queue is empty
        """
        if region not in self.queues or not self.queues[region]:
            return None

        async with self._locks[region]:
            if self.queues[region]:
                return self.queues[region][0].next_fetch_at
            return None

    async def get_soonest_fetch_time(self) -> datetime | None:
        """Get the soonest next_fetch_at across all regions.

        Returns:
            Datetime of soonest due account, or None if all queues empty
        """
        soonest = None

        for region in self.queues:
            next_time = await self.get_next_fetch_time(region)
            if next_time and (soonest is None or next_time < soonest):
                soonest = next_time

        return soonest

    def get_stats(self) -> dict:
        """Get statistics about the queue state.

        Returns:
            Dict with queue statistics
        """
        stats = {
            "total_accounts": len(self._account_map),
            "by_region": {},
            "by_tier": {"very_active": 0, "active": 0, "moderate": 0, "inactive": 0},
            "ready_now": 0,
        }

        now = datetime.now(timezone.utc)

        for region, queue in self.queues.items():
            region_ready = sum(
                1
                for acc in queue
                if (
                    acc.next_fetch_at.replace(tzinfo=timezone.utc)
                    if acc.next_fetch_at.tzinfo is None
                    else acc.next_fetch_at
                )
                <= now
            )
            stats["by_region"][region] = {
                "total": len(queue),
                "ready_now": region_ready,
            }
            stats["ready_now"] += region_ready

        for acc in self._account_map.values():
            stats["by_tier"][acc.tier] += 1

        return stats
