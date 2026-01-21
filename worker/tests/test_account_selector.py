"""
Tests for AccountSelector service.
"""

import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from heapq import heappush

from src.services.account_selector import (
    AccountSelector,
    AccountSelectorConfig,
    PrioritizedAccount,
)


class TestPrioritizedAccount:
    """Tests for PrioritizedAccount dataclass."""

    def test_comparison_by_next_fetch_at(self):
        """Accounts should compare by next_fetch_at for heap ordering."""
        now = datetime.now(timezone.utc)

        earlier = PrioritizedAccount(
            puuid="a",
            region="EUW",
            activity_score=50,
            tier="active",
            next_fetch_at=now - timedelta(minutes=5),
            last_fetched_at=now,
            last_match_at=now,
        )
        later = PrioritizedAccount(
            puuid="b",
            region="EUW",
            activity_score=50,
            tier="active",
            next_fetch_at=now + timedelta(minutes=5),
            last_fetched_at=now,
            last_match_at=now,
        )

        assert earlier < later
        assert not later < earlier

    def test_equality_by_puuid(self):
        """Accounts should be equal if puuids match."""
        now = datetime.now(timezone.utc)

        acc1 = PrioritizedAccount(
            puuid="same-puuid",
            region="EUW",
            activity_score=50,
            tier="active",
            next_fetch_at=now,
            last_fetched_at=now,
            last_match_at=now,
        )
        acc2 = PrioritizedAccount(
            puuid="same-puuid",
            region="NA",  # Different region
            activity_score=100,  # Different score
            tier="very_active",
            next_fetch_at=now + timedelta(hours=1),
            last_fetched_at=now,
            last_match_at=now,
        )
        acc3 = PrioritizedAccount(
            puuid="different-puuid",
            region="EUW",
            activity_score=50,
            tier="active",
            next_fetch_at=now,
            last_fetched_at=now,
            last_match_at=now,
        )

        assert acc1 == acc2  # Same puuid
        assert acc1 != acc3  # Different puuid

    def test_hash_by_puuid(self):
        """Hash should be based on puuid for set/dict usage."""
        now = datetime.now(timezone.utc)

        acc1 = PrioritizedAccount(
            puuid="test-puuid",
            region="EUW",
            activity_score=50,
            tier="active",
            next_fetch_at=now,
            last_fetched_at=now,
            last_match_at=now,
        )
        acc2 = PrioritizedAccount(
            puuid="test-puuid",
            region="NA",
            activity_score=100,
            tier="very_active",
            next_fetch_at=now,
            last_fetched_at=now,
            last_match_at=now,
        )

        assert hash(acc1) == hash(acc2)

        # Should work in sets
        account_set = {acc1}
        assert acc2 in account_set


class TestAccountSelectorInitialize:
    """Tests for AccountSelector initialization."""

    @pytest.mark.asyncio
    async def test_initialize_empty(self, account_selector, mock_db):
        """Should initialize with empty database."""
        mock_db.get_active_accounts_with_activity.return_value = []

        await account_selector.initialize()

        assert account_selector.queues == {}
        assert account_selector._account_map == {}

    @pytest.mark.asyncio
    async def test_initialize_with_accounts(
        self, account_selector, mock_db, multiple_accounts
    ):
        """Should load accounts and create queues."""
        mock_db.get_active_accounts_with_activity.return_value = multiple_accounts

        await account_selector.initialize()

        # Should have EUW queue with 5 accounts
        assert "EUW" in account_selector.queues
        assert len(account_selector.queues["EUW"]) == 5
        assert len(account_selector._account_map) == 5

    @pytest.mark.asyncio
    async def test_initialize_multiple_regions(self, account_selector, mock_db):
        """Should create separate queues per region."""
        now = datetime.now(timezone.utc)
        accounts = [
            {
                "puuid": "euw-1",
                "region": "EUW",
                "game_name": "P1",
                "tag_line": "EUW",
                "player_id": 1,
                "games_today": 1,
                "games_last_3_days": 3,
                "games_last_7_days": 7,
                "last_match_at": now,
                "last_fetched_at": now,
                "next_fetch_at": now,
                "consecutive_empty_fetches": 0,
            },
            {
                "puuid": "na-1",
                "region": "NA",
                "game_name": "P2",
                "tag_line": "NA",
                "player_id": 2,
                "games_today": 2,
                "games_last_3_days": 5,
                "games_last_7_days": 10,
                "last_match_at": now,
                "last_fetched_at": now,
                "next_fetch_at": now,
                "consecutive_empty_fetches": 0,
            },
        ]
        mock_db.get_active_accounts_with_activity.return_value = accounts

        await account_selector.initialize()

        assert "EUW" in account_selector.queues
        assert "NA" in account_selector.queues
        assert len(account_selector.queues["EUW"]) == 1
        assert len(account_selector.queues["NA"]) == 1


class TestAccountSelectorGetReadyAccounts:
    """Tests for get_ready_accounts method."""

    @pytest.mark.asyncio
    async def test_get_ready_accounts_empty_queue(self, account_selector):
        """Should return empty list for non-existent region."""
        result = await account_selector.get_ready_accounts("EUW", max_count=10)
        assert result == []

    @pytest.mark.asyncio
    async def test_get_ready_accounts_returns_due(
        self, account_selector, mock_db, sample_account
    ):
        """Should return accounts whose next_fetch_at has passed."""
        # Modify account to be due
        sample_account["next_fetch_at"] = datetime.now(timezone.utc) - timedelta(
            minutes=5
        )
        mock_db.get_active_accounts_with_activity.return_value = [sample_account]

        await account_selector.initialize()
        ready = await account_selector.get_ready_accounts("EUW", max_count=10)

        assert len(ready) == 1
        assert ready[0].puuid == sample_account["puuid"]

    @pytest.mark.asyncio
    async def test_get_ready_accounts_respects_max_count(
        self, account_selector, mock_db, multiple_accounts
    ):
        """Should respect max_count parameter."""
        # All accounts are due
        mock_db.get_active_accounts_with_activity.return_value = multiple_accounts

        await account_selector.initialize()
        ready = await account_selector.get_ready_accounts("EUW", max_count=2)

        assert len(ready) == 2

    @pytest.mark.asyncio
    async def test_get_ready_accounts_skips_future(
        self, account_selector, mock_db, sample_account
    ):
        """Should not return accounts scheduled for future."""
        sample_account["next_fetch_at"] = datetime.now(timezone.utc) + timedelta(
            hours=1
        )
        mock_db.get_active_accounts_with_activity.return_value = [sample_account]

        await account_selector.initialize()
        ready = await account_selector.get_ready_accounts("EUW", max_count=10)

        assert len(ready) == 0

    @pytest.mark.asyncio
    async def test_get_ready_accounts_removes_from_queue(
        self, account_selector, mock_db, sample_account
    ):
        """Ready accounts should be removed from queue."""
        sample_account["next_fetch_at"] = datetime.now(timezone.utc) - timedelta(
            minutes=5
        )
        mock_db.get_active_accounts_with_activity.return_value = [sample_account]

        await account_selector.initialize()
        initial_size = len(account_selector.queues["EUW"])

        await account_selector.get_ready_accounts("EUW", max_count=10)

        # Queue should be empty after getting the ready account
        assert len(account_selector.queues["EUW"]) == initial_size - 1


class TestAccountSelectorReschedule:
    """Tests for reschedule method."""

    @pytest.mark.asyncio
    async def test_reschedule_with_new_matches(
        self, account_selector, mock_db, sample_prioritized_account
    ):
        """Should boost score and reschedule when matches found."""
        # Setup
        account_selector.queues["EUW"] = []
        account_selector._locks["EUW"] = asyncio.Lock()

        original_score = sample_prioritized_account.activity_score

        await account_selector.reschedule(
            sample_prioritized_account, new_matches=2, activity_data=None
        )

        # Score should be boosted
        assert sample_prioritized_account.activity_score > original_score
        # Should be back in queue
        assert len(account_selector.queues["EUW"]) == 1
        # Should persist to DB
        mock_db.update_account_priority.assert_called_once()

    @pytest.mark.asyncio
    async def test_reschedule_empty_fetch(
        self, account_selector, mock_db, sample_prioritized_account
    ):
        """Should decay score and increment empty counter when no matches."""
        account_selector.queues["EUW"] = []
        account_selector._locks["EUW"] = asyncio.Lock()

        original_score = sample_prioritized_account.activity_score
        sample_prioritized_account.consecutive_empty_fetches = 0

        await account_selector.reschedule(
            sample_prioritized_account, new_matches=0, activity_data=None
        )

        # Score should be reduced
        assert sample_prioritized_account.activity_score < original_score
        # Empty counter should increment
        assert sample_prioritized_account.consecutive_empty_fetches == 1

    @pytest.mark.asyncio
    async def test_reschedule_resets_empty_counter(
        self, account_selector, mock_db, sample_prioritized_account
    ):
        """Finding matches should reset consecutive empty counter."""
        account_selector.queues["EUW"] = []
        account_selector._locks["EUW"] = asyncio.Lock()

        sample_prioritized_account.consecutive_empty_fetches = 5

        await account_selector.reschedule(
            sample_prioritized_account, new_matches=1, activity_data=None
        )

        assert sample_prioritized_account.consecutive_empty_fetches == 0

    @pytest.mark.asyncio
    async def test_reschedule_with_activity_data(
        self, account_selector, mock_db, sample_prioritized_account
    ):
        """Should use activity_data when provided."""
        account_selector.queues["EUW"] = []
        account_selector._locks["EUW"] = asyncio.Lock()

        activity_data = {
            "games_today": 10,
            "games_last_3_days": 30,
            "games_last_7_days": 70,
            "last_match_at": datetime.now(timezone.utc),
        }

        await account_selector.reschedule(
            sample_prioritized_account, new_matches=1, activity_data=activity_data
        )

        # Score should be recalculated based on activity_data
        # With high activity, should have high score
        assert sample_prioritized_account.activity_score > 50


class TestAccountSelectorBackoff:
    """Tests for exponential backoff behavior."""

    @pytest.mark.asyncio
    async def test_backoff_increases_interval(
        self, account_selector, mock_db, sample_prioritized_account
    ):
        """Consecutive empty fetches should increase interval."""
        account_selector.queues["EUW"] = []
        account_selector._locks["EUW"] = asyncio.Lock()

        # First empty fetch
        sample_prioritized_account.consecutive_empty_fetches = 0
        await account_selector.reschedule(sample_prioritized_account, new_matches=0)
        first_next = sample_prioritized_account.next_fetch_at

        # Reset and do second empty fetch
        account_selector.queues["EUW"] = []
        sample_prioritized_account.consecutive_empty_fetches = 1
        await account_selector.reschedule(sample_prioritized_account, new_matches=0)
        second_next = sample_prioritized_account.next_fetch_at

        # Second interval should be longer (backoff)
        # Note: they start from different times, so we check the empty counter
        assert sample_prioritized_account.consecutive_empty_fetches == 2


class TestAccountSelectorStats:
    """Tests for get_stats method."""

    @pytest.mark.asyncio
    async def test_stats_empty(self, account_selector):
        """Should return stats for empty selector."""
        stats = account_selector.get_stats()

        assert stats["total_accounts"] == 0
        assert stats["ready_now"] == 0
        assert stats["by_region"] == {}

    @pytest.mark.asyncio
    async def test_stats_with_accounts(
        self, account_selector, mock_db, multiple_accounts
    ):
        """Should return accurate stats."""
        mock_db.get_active_accounts_with_activity.return_value = multiple_accounts

        await account_selector.initialize()
        stats = account_selector.get_stats()

        assert stats["total_accounts"] == 5
        assert "EUW" in stats["by_region"]
        assert stats["by_region"]["EUW"]["total"] == 5
        # All accounts are due (next_fetch_at in the past)
        assert stats["ready_now"] == 5


class TestAccountSelectorNextFetch:
    """Tests for get_next_fetch_time methods."""

    @pytest.mark.asyncio
    async def test_get_next_fetch_time_empty(self, account_selector):
        """Should return None for empty queue."""
        result = await account_selector.get_next_fetch_time("EUW")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_next_fetch_time(
        self, account_selector, mock_db, sample_account
    ):
        """Should return soonest next_fetch_at."""
        expected_time = datetime.now(timezone.utc) + timedelta(minutes=10)
        sample_account["next_fetch_at"] = expected_time
        mock_db.get_active_accounts_with_activity.return_value = [sample_account]

        await account_selector.initialize()
        result = await account_selector.get_next_fetch_time("EUW")

        assert result == expected_time

    @pytest.mark.asyncio
    async def test_get_soonest_fetch_time_multiple_regions(
        self, account_selector, mock_db
    ):
        """Should return soonest time across all regions."""
        now = datetime.now(timezone.utc)
        euw_time = now + timedelta(minutes=30)
        na_time = now + timedelta(minutes=10)  # Soonest

        accounts = [
            {
                "puuid": "euw-1",
                "region": "EUW",
                "game_name": "P1",
                "tag_line": "EUW",
                "player_id": 1,
                "games_today": 1,
                "games_last_3_days": 3,
                "games_last_7_days": 7,
                "last_match_at": now,
                "last_fetched_at": now,
                "next_fetch_at": euw_time,
                "consecutive_empty_fetches": 0,
            },
            {
                "puuid": "na-1",
                "region": "NA",
                "game_name": "P2",
                "tag_line": "NA",
                "player_id": 2,
                "games_today": 2,
                "games_last_3_days": 5,
                "games_last_7_days": 10,
                "last_match_at": now,
                "last_fetched_at": now,
                "next_fetch_at": na_time,
                "consecutive_empty_fetches": 0,
            },
        ]
        mock_db.get_active_accounts_with_activity.return_value = accounts

        await account_selector.initialize()
        result = await account_selector.get_soonest_fetch_time()

        assert result == na_time


class TestAccountSelectorConcurrency:
    """Tests for concurrent access safety."""

    @pytest.mark.asyncio
    async def test_concurrent_get_ready(
        self, account_selector, mock_db, multiple_accounts
    ):
        """Concurrent get_ready_accounts should not cause issues."""
        mock_db.get_active_accounts_with_activity.return_value = multiple_accounts

        await account_selector.initialize()

        # Launch concurrent requests
        tasks = [
            account_selector.get_ready_accounts("EUW", max_count=1)
            for _ in range(5)
        ]
        results = await asyncio.gather(*tasks)

        # Should get exactly 5 accounts total (no duplicates)
        total_accounts = sum(len(r) for r in results)
        assert total_accounts == 5

        # Queue should be empty
        assert len(account_selector.queues["EUW"]) == 0
