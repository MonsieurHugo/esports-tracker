"""
Pytest fixtures for worker tests.
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock

from src.services.activity_scorer import ActivityScorer
from src.services.account_selector import (
    AccountSelector,
    AccountSelectorConfig,
    PrioritizedAccount,
)
from src.services.riot_api import RateLimiter


@pytest.fixture
def mock_db():
    """Mock database service."""
    db = AsyncMock()
    db.get_active_accounts_with_activity = AsyncMock(return_value=[])
    db.update_account_priority = AsyncMock()
    db.update_account_fetch_time = AsyncMock()
    return db


@pytest.fixture
def activity_scorer():
    """ActivityScorer instance."""
    return ActivityScorer()


@pytest.fixture
def account_selector_config():
    """AccountSelectorConfig with test-friendly intervals."""
    return AccountSelectorConfig(
        interval_very_active=1,
        interval_active=5,
        interval_moderate=15,
        interval_inactive=60,
        max_interval_very_active=2,
        max_interval_active=10,
        max_interval_moderate=30,
        max_interval_inactive=120,
        batch_size=5,
        max_consecutive_empty=3,
    )


@pytest.fixture
def account_selector(mock_db, activity_scorer, account_selector_config):
    """AccountSelector instance with mocked dependencies."""
    return AccountSelector(
        db=mock_db,
        scorer=activity_scorer,
        config=account_selector_config,
    )


@pytest.fixture
def rate_limiter():
    """RateLimiter with test-friendly limits."""
    return RateLimiter(requests_per_second=5, requests_per_2min=50)


@pytest.fixture
def sample_account():
    """Sample account data as returned from database."""
    return {
        "id": 1,
        "puuid": "test-puuid-12345678-abcd-1234-abcd-123456789abc",
        "game_name": "TestPlayer",
        "tag_line": "EUW",
        "region": "EUW",
        "player_id": 42,
        "last_fetched_at": datetime.now(timezone.utc) - timedelta(hours=1),
        "next_fetch_at": None,
        "last_match_at": datetime.now(timezone.utc) - timedelta(hours=2),
        "activity_score": 50.0,
        "games_today": 3,
        "games_last_3_days": 10,
        "games_last_7_days": 25,
        "consecutive_empty_fetches": 0,
    }


@pytest.fixture
def sample_prioritized_account():
    """Sample PrioritizedAccount instance."""
    return PrioritizedAccount(
        puuid="test-puuid-12345678-abcd-1234-abcd-123456789abc",
        region="EUW",
        activity_score=50.0,
        tier="active",
        next_fetch_at=datetime.now(timezone.utc),
        last_fetched_at=datetime.now(timezone.utc) - timedelta(hours=1),
        last_match_at=datetime.now(timezone.utc) - timedelta(hours=2),
        consecutive_empty_fetches=0,
        game_name="TestPlayer",
        tag_line="EUW",
        player_id=42,
    )


@pytest.fixture
def multiple_accounts():
    """Multiple sample accounts for queue testing."""
    now = datetime.now(timezone.utc)
    return [
        {
            "puuid": f"puuid-{i}",
            "game_name": f"Player{i}",
            "tag_line": "EUW",
            "region": "EUW",
            "player_id": i,
            "last_fetched_at": now - timedelta(hours=i),
            "next_fetch_at": now - timedelta(minutes=i * 5),  # All due
            "last_match_at": now - timedelta(hours=i),
            "games_today": 5 - i,
            "games_last_3_days": 15 - i * 2,
            "games_last_7_days": 30 - i * 3,
            "consecutive_empty_fetches": 0,
        }
        for i in range(5)
    ]
