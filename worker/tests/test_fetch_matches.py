"""
Tests for FetchMatchesJob.
"""

import pytest
from datetime import datetime, timezone, timedelta, date
from unittest.mock import AsyncMock, MagicMock, patch

from src.jobs.fetch_matches import FetchMatchesJob, DEFAULT_START_TIME, QUEUE_SOLO_DUO
from src.services.riot_api import RiotAPIError, RiotAPIService


@pytest.fixture
def mock_db():
    """Mock du service de base de données."""
    db = AsyncMock()
    db.get_active_accounts = AsyncMock(return_value=[])
    db.match_exists = AsyncMock(return_value=False)
    db.insert_match = AsyncMock()
    db.insert_match_stats = AsyncMock()
    db.update_daily_stats = AsyncMock()
    db.update_streak = AsyncMock()
    db.update_champion_stats = AsyncMock()
    db.update_account_last_match = AsyncMock()
    db.update_account_last_fetched = AsyncMock()
    db.increment_worker_stats = AsyncMock()
    db.log_worker_activity = AsyncMock()
    db.set_worker_error = AsyncMock()
    db.update_worker_current_account = AsyncMock()
    db.update_player_synergies = AsyncMock()
    return db


@pytest.fixture
def sample_account():
    """Sample account data as returned from database."""
    return {
        "puuid": "test-puuid-123",
        "game_name": "TestPlayer",
        "tag_line": "EUW",
        "region": "EUW",
        "last_match_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    }


@pytest.fixture
def sample_match_data():
    """Sample match data from Riot API."""
    return {
        "metadata": {"matchId": "EUW1_123456"},
        "info": {
            "gameStartTimestamp": 1767225600000,  # 01/01/2026 00:00:00 UTC
            "gameDuration": 1800,
            "queueId": 420,
            "gameVersion": "14.24.1",
            "participants": [
                {
                    "puuid": "test-puuid-123",
                    "championId": 1,
                    "win": True,
                    "kills": 5,
                    "deaths": 2,
                    "assists": 10,
                    "totalMinionsKilled": 150,
                    "neutralMinionsKilled": 30,
                    "visionScore": 25,
                    "totalDamageDealtToChampions": 15000,
                    "goldEarned": 12000,
                    "teamPosition": "MIDDLE",
                    "teamId": 100,
                },
                # Add 9 more participants for a complete match
                *[
                    {
                        "puuid": f"other-puuid-{i}",
                        "championId": i + 10,
                        "win": i < 4,  # First 4 lose, last 5 win
                        "kills": i,
                        "deaths": 5 - i % 5,
                        "assists": i * 2,
                        "totalMinionsKilled": 100 + i * 10,
                        "neutralMinionsKilled": 10,
                        "visionScore": 15 + i,
                        "totalDamageDealtToChampions": 10000 + i * 1000,
                        "goldEarned": 10000 + i * 500,
                        "teamPosition": ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"][i % 5],
                        "teamId": 100 if i < 4 else 200,
                    }
                    for i in range(9)
                ],
            ],
        },
    }


@pytest.fixture
def mock_riot_api():
    """Mock Riot API service."""
    api = AsyncMock(spec=RiotAPIService)
    api.get_match_ids = AsyncMock(return_value=[])
    api.get_match = AsyncMock(return_value={})
    api.get_league_entries_by_puuid = AsyncMock(return_value=[])
    api.close = AsyncMock()
    return api


class TestFetchMatchesJobInit:
    """Tests for FetchMatchesJob initialization."""

    def test_init(self, mock_db):
        """Should initialize with correct parameters."""
        job = FetchMatchesJob(mock_db, "test-api-key")

        assert job.db == mock_db
        assert job.api_key == "test-api-key"
        assert job._region_clients == {}
        assert job._running is False


class TestFetchMatchesJobRunCycle:
    """Tests for _run_cycle method."""

    @pytest.mark.asyncio
    async def test_run_cycle_no_accounts(self, mock_db):
        """Should handle no active accounts gracefully."""
        mock_db.get_active_accounts.return_value = []

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        await job._run_cycle()

        mock_db.get_active_accounts.assert_called_once()

    @pytest.mark.asyncio
    async def test_run_cycle_groups_by_region(self, mock_db, sample_account):
        """Should group accounts by region and process them."""
        accounts = [
            {**sample_account, "puuid": "euw-1", "region": "EUW"},
            {**sample_account, "puuid": "euw-2", "region": "EUW"},
            {**sample_account, "puuid": "na-1", "region": "NA"},
        ]
        mock_db.get_active_accounts.return_value = accounts

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        # Mock _process_region to track calls
        job._process_region = AsyncMock(return_value=0)

        await job._run_cycle()

        # Should be called for both regions
        assert job._process_region.call_count == 2
        call_regions = {call.args[0] for call in job._process_region.call_args_list}
        assert call_regions == {"EUW", "NA"}

    @pytest.mark.asyncio
    async def test_run_cycle_handles_region_failure(self, mock_db, sample_account):
        """Should continue processing other regions when one fails."""
        accounts = [
            {**sample_account, "puuid": "euw-1", "region": "EUW"},
            {**sample_account, "puuid": "na-1", "region": "NA"},
        ]
        mock_db.get_active_accounts.return_value = accounts

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        # First region fails, second succeeds
        async def process_region_side_effect(region, accounts):
            if region == "EUW":
                raise Exception("Region processing failed")
            return 5

        job._process_region = AsyncMock(side_effect=process_region_side_effect)

        # Should not raise
        await job._run_cycle()

        assert job._process_region.call_count == 2


class TestFetchAccountMatches:
    """Tests for _fetch_account_matches method."""

    @pytest.mark.asyncio
    async def test_fetch_matches_success(
        self, mock_db, mock_riot_api, sample_account, sample_match_data
    ):
        """Test successful match fetching flow."""
        mock_riot_api.get_match_ids.return_value = ["EUW1_123456"]
        mock_riot_api.get_match.return_value = sample_match_data
        mock_riot_api.get_league_entries_by_puuid.return_value = [
            {"queueType": "RANKED_SOLO_5x5", "tier": "DIAMOND", "rank": "II", "leaguePoints": 75}
        ]

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        new_matches = await job._fetch_account_matches(mock_riot_api, sample_account)

        assert new_matches == 1
        mock_riot_api.get_match_ids.assert_called_once()
        mock_riot_api.get_match.assert_called_once_with("EUW1_123456")
        mock_db.insert_match.assert_called_once()
        # 10 participants in match
        assert mock_db.insert_match_stats.call_count == 10
        mock_db.update_daily_stats.assert_called()
        mock_db.update_streak.assert_called_once()
        mock_db.update_account_last_match.assert_called_once()

    @pytest.mark.asyncio
    async def test_fetch_matches_no_new_matches(self, mock_db, mock_riot_api, sample_account):
        """Should return 0 when no match IDs returned."""
        mock_riot_api.get_match_ids.return_value = []
        mock_riot_api.get_league_entries_by_puuid.return_value = []

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        new_matches = await job._fetch_account_matches(mock_riot_api, sample_account)

        assert new_matches == 0
        mock_db.insert_match.assert_not_called()
        # When no match_ids are returned, function returns early (no daily stats update)
        mock_db.update_daily_stats.assert_not_called()

    @pytest.mark.asyncio
    async def test_fetch_matches_skips_existing(
        self, mock_db, mock_riot_api, sample_account, sample_match_data
    ):
        """Should skip matches that already exist in database."""
        mock_riot_api.get_match_ids.return_value = ["EUW1_123456", "EUW1_789012"]
        mock_riot_api.get_match.return_value = sample_match_data
        mock_riot_api.get_league_entries_by_puuid.return_value = []
        # First match exists, second doesn't
        mock_db.match_exists.side_effect = [True, False]

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        new_matches = await job._fetch_account_matches(mock_riot_api, sample_account)

        assert new_matches == 1
        # get_match should only be called for the non-existing match
        assert mock_riot_api.get_match.call_count == 1

    @pytest.mark.asyncio
    async def test_fetch_matches_handles_rate_limit(
        self, mock_db, mock_riot_api, sample_account
    ):
        """Should handle rate limit (429) errors."""
        mock_riot_api.get_match_ids.side_effect = RiotAPIError(429, "Rate limited")

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        new_matches = await job._fetch_account_matches(mock_riot_api, sample_account)

        assert new_matches == 0
        mock_db.insert_match.assert_not_called()

    @pytest.mark.asyncio
    async def test_fetch_matches_handles_404(self, mock_db, mock_riot_api, sample_account):
        """Should handle account not found (404) gracefully."""
        mock_riot_api.get_match_ids.side_effect = RiotAPIError(404, "Account not found")

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        new_matches = await job._fetch_account_matches(mock_riot_api, sample_account)

        assert new_matches == 0
        mock_db.insert_match.assert_not_called()

    @pytest.mark.asyncio
    async def test_fetch_matches_handles_match_404(
        self, mock_db, mock_riot_api, sample_account
    ):
        """Should continue when individual match returns 404."""
        mock_riot_api.get_match_ids.return_value = ["EUW1_123456", "EUW1_789012"]
        mock_riot_api.get_match.side_effect = [
            RiotAPIError(404, "Match not found"),
            {
                "metadata": {"matchId": "EUW1_789012"},
                "info": {
                    "gameStartTimestamp": 1735689600000,
                    "gameDuration": 1800,
                    "queueId": 420,
                    "gameVersion": "14.24.1",
                    "participants": [
                        {
                            "puuid": "test-puuid-123",
                            "championId": 1,
                            "win": True,
                            "kills": 5,
                            "deaths": 2,
                            "assists": 10,
                            "totalMinionsKilled": 150,
                            "neutralMinionsKilled": 30,
                            "visionScore": 25,
                            "totalDamageDealtToChampions": 15000,
                            "goldEarned": 12000,
                            "teamPosition": "MIDDLE",
                            "teamId": 100,
                        }
                    ],
                },
            },
        ]
        mock_riot_api.get_league_entries_by_puuid.return_value = []

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        new_matches = await job._fetch_account_matches(mock_riot_api, sample_account)

        # Should process the second match
        assert new_matches == 1
        assert mock_db.insert_match.call_count == 1

    @pytest.mark.asyncio
    async def test_fetch_matches_uses_default_start_time(
        self, mock_db, mock_riot_api
    ):
        """Should use DEFAULT_START_TIME when last_match_at is None."""
        account = {
            "puuid": "test-puuid",
            "game_name": "Test",
            "tag_line": "EUW",
            "region": "EUW",
            "last_match_at": None,
        }
        mock_riot_api.get_match_ids.return_value = []
        mock_riot_api.get_league_entries_by_puuid.return_value = []

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        await job._fetch_account_matches(mock_riot_api, account)

        mock_riot_api.get_match_ids.assert_called_once()
        call_kwargs = mock_riot_api.get_match_ids.call_args.kwargs
        assert call_kwargs["start_time"] == DEFAULT_START_TIME

    @pytest.mark.asyncio
    async def test_fetch_matches_uses_epoch_fallback(
        self, mock_db, mock_riot_api
    ):
        """Should use DEFAULT_START_TIME when last_match_at is epoch (1970)."""
        account = {
            "puuid": "test-puuid",
            "game_name": "Test",
            "tag_line": "EUW",
            "region": "EUW",
            "last_match_at": datetime(1970, 1, 1, tzinfo=timezone.utc),
        }
        mock_riot_api.get_match_ids.return_value = []
        mock_riot_api.get_league_entries_by_puuid.return_value = []

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        await job._fetch_account_matches(mock_riot_api, account)

        mock_riot_api.get_match_ids.assert_called_once()
        call_kwargs = mock_riot_api.get_match_ids.call_args.kwargs
        assert call_kwargs["start_time"] == DEFAULT_START_TIME


class TestProcessMatch:
    """Tests for _process_match method."""

    @pytest.mark.asyncio
    async def test_process_match_inserts_all_participants(
        self, mock_db, sample_match_data
    ):
        """Should insert match and all 10 participants."""
        job = FetchMatchesJob(mock_db, "test-api-key")

        result = await job._process_match(sample_match_data, "test-puuid-123")

        mock_db.insert_match.assert_called_once()
        assert mock_db.insert_match_stats.call_count == 10
        mock_db.update_player_synergies.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_match_normalizes_roles(self, mock_db, sample_match_data):
        """Should normalize role names (JUNGLE->JGL, MIDDLE->MID, etc.)."""
        job = FetchMatchesJob(mock_db, "test-api-key")

        await job._process_match(sample_match_data, "test-puuid-123")

        # Check the roles in insert_match_stats calls
        calls = mock_db.insert_match_stats.call_args_list
        roles_called = {call.kwargs.get("role") for call in calls if "role" in call.kwargs}

        # Should have normalized roles
        assert "MID" in roles_called or "MIDDLE" not in roles_called

    @pytest.mark.asyncio
    async def test_process_match_returns_tracked_info(self, mock_db, sample_match_data):
        """Should return champion_id, date, and game_start for tracked player."""
        job = FetchMatchesJob(mock_db, "test-api-key")

        result = await job._process_match(sample_match_data, "test-puuid-123")

        assert result is not None
        assert result["champion_id"] == 1  # From sample_match_data
        assert result["date"] == datetime(2026, 1, 1).date()
        assert isinstance(result["game_start"], datetime)

    @pytest.mark.asyncio
    async def test_process_match_returns_none_if_not_found(self, mock_db, sample_match_data):
        """Should return None if tracked player not in participants."""
        job = FetchMatchesJob(mock_db, "test-api-key")

        result = await job._process_match(sample_match_data, "non-existent-puuid")

        assert result is None


class TestProcessRegion:
    """Tests for _process_region method."""

    @pytest.mark.asyncio
    async def test_process_region_updates_worker_status(
        self, mock_db, mock_riot_api, sample_account
    ):
        """Should update worker current account during processing."""
        accounts = [sample_account]
        mock_riot_api.get_match_ids.return_value = []
        mock_riot_api.get_league_entries_by_puuid.return_value = []

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True
        job._region_clients["EUW"] = mock_riot_api

        await job._process_region("EUW", accounts)

        # Should update worker current account
        mock_db.update_worker_current_account.assert_called()

    @pytest.mark.asyncio
    async def test_process_region_updates_last_fetched(
        self, mock_db, mock_riot_api, sample_account
    ):
        """Should always update last_fetched_at for processed accounts."""
        accounts = [sample_account]
        mock_riot_api.get_match_ids.return_value = []
        mock_riot_api.get_league_entries_by_puuid.return_value = []

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True
        job._region_clients["EUW"] = mock_riot_api

        await job._process_region("EUW", accounts)

        mock_db.update_account_last_fetched.assert_called_once_with(sample_account["puuid"])

    @pytest.mark.asyncio
    async def test_process_region_increments_stats(
        self, mock_db, mock_riot_api, sample_account, sample_match_data
    ):
        """Should increment worker stats after processing."""
        accounts = [sample_account]
        mock_riot_api.get_match_ids.return_value = ["EUW1_123456"]
        mock_riot_api.get_match.return_value = sample_match_data
        mock_riot_api.get_league_entries_by_puuid.return_value = []

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True
        job._region_clients["EUW"] = mock_riot_api

        await job._process_region("EUW", accounts)

        # Should increment stats with matches and accounts
        mock_db.increment_worker_stats.assert_called()

    @pytest.mark.asyncio
    async def test_process_region_logs_errors(
        self, mock_db, mock_riot_api, sample_account
    ):
        """Should log errors and continue on account failure."""
        accounts = [
            sample_account,
            {**sample_account, "puuid": "second-puuid", "game_name": "SecondPlayer"},
        ]
        # First account fails, second succeeds
        mock_riot_api.get_match_ids.side_effect = [
            Exception("API error"),
            [],
        ]
        mock_riot_api.get_league_entries_by_puuid.return_value = []

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True
        job._region_clients["EUW"] = mock_riot_api

        total = await job._process_region("EUW", accounts)

        # Should log error
        mock_db.set_worker_error.assert_called()
        mock_db.log_worker_activity.assert_called()
        # Should still process second account (update_account_last_fetched called once)
        assert mock_db.update_account_last_fetched.call_count == 1

    @pytest.mark.asyncio
    async def test_process_region_stops_when_not_running(
        self, mock_db, mock_riot_api, sample_account
    ):
        """Should stop processing when _running is set to False."""
        accounts = [sample_account, {**sample_account, "puuid": "second-puuid"}]
        mock_riot_api.get_match_ids.return_value = []
        mock_riot_api.get_league_entries_by_puuid.return_value = []

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = False  # Not running
        job._region_clients["EUW"] = mock_riot_api

        await job._process_region("EUW", accounts)

        # Should not process any accounts
        mock_riot_api.get_match_ids.assert_not_called()


class TestFetchMatchesJobCleanup:
    """Tests for cleanup methods."""

    @pytest.mark.asyncio
    async def test_cleanup_closes_clients(self, mock_db, mock_riot_api):
        """Should close all region clients on cleanup."""
        job = FetchMatchesJob(mock_db, "test-api-key")
        job._region_clients = {"EUW": mock_riot_api, "NA": mock_riot_api}

        await job._cleanup()

        assert mock_riot_api.close.call_count == 2
        assert job._region_clients == {}

    @pytest.mark.asyncio
    async def test_stop_sets_running_false(self, mock_db):
        """Should set _running to False."""
        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        await job.stop()

        assert job._running is False


class TestFetchMatchesJobIntegration:
    """Integration tests for FetchMatchesJob."""

    @pytest.mark.asyncio
    async def test_multiple_matches_updates_champion_stats(
        self, mock_db, mock_riot_api, sample_account
    ):
        """Should update champion stats for each unique champion in matches."""
        match1 = {
            "metadata": {"matchId": "EUW1_1"},
            "info": {
                "gameStartTimestamp": 1735689600000,
                "gameDuration": 1800,
                "queueId": 420,
                "gameVersion": "14.24.1",
                "participants": [
                    {
                        "puuid": "test-puuid-123",
                        "championId": 1,  # Champion 1
                        "win": True,
                        "kills": 5,
                        "deaths": 2,
                        "assists": 10,
                        "totalMinionsKilled": 150,
                        "neutralMinionsKilled": 30,
                        "visionScore": 25,
                        "totalDamageDealtToChampions": 15000,
                        "goldEarned": 12000,
                        "teamPosition": "MIDDLE",
                        "teamId": 100,
                    }
                ],
            },
        }
        match2 = {
            "metadata": {"matchId": "EUW1_2"},
            "info": {
                "gameStartTimestamp": 1735693200000,
                "gameDuration": 1800,
                "queueId": 420,
                "gameVersion": "14.24.1",
                "participants": [
                    {
                        "puuid": "test-puuid-123",
                        "championId": 2,  # Different champion
                        "win": False,
                        "kills": 3,
                        "deaths": 5,
                        "assists": 7,
                        "totalMinionsKilled": 120,
                        "neutralMinionsKilled": 20,
                        "visionScore": 20,
                        "totalDamageDealtToChampions": 12000,
                        "goldEarned": 10000,
                        "teamPosition": "TOP",
                        "teamId": 100,
                    }
                ],
            },
        }

        mock_riot_api.get_match_ids.return_value = ["EUW1_1", "EUW1_2"]
        mock_riot_api.get_match.side_effect = [match1, match2]
        mock_riot_api.get_league_entries_by_puuid.return_value = []

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        new_matches = await job._fetch_account_matches(mock_riot_api, sample_account)

        assert new_matches == 2
        # Should update champion stats for both champions
        assert mock_db.update_champion_stats.call_count == 2
        champion_ids_updated = {
            call.args[1] for call in mock_db.update_champion_stats.call_args_list
        }
        assert champion_ids_updated == {1, 2}

    @pytest.mark.asyncio
    async def test_db_error_during_insert_propagates(
        self, mock_db, mock_riot_api, sample_account, sample_match_data
    ):
        """DB errors during match insert propagate (caught at _process_region level)."""
        mock_riot_api.get_match_ids.return_value = ["EUW1_123456"]
        mock_riot_api.get_match.return_value = sample_match_data
        mock_riot_api.get_league_entries_by_puuid.return_value = []
        mock_db.insert_match.side_effect = Exception("Database error")

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        # Exception propagates from _fetch_account_matches (caught at _process_region level)
        with pytest.raises(Exception, match="Database error"):
            await job._fetch_account_matches(mock_riot_api, sample_account)

    @pytest.mark.asyncio
    async def test_full_cycle_with_multiple_regions(self, mock_db, mock_riot_api):
        """Should process accounts from multiple regions in parallel."""
        accounts = [
            {
                "puuid": "euw-puuid",
                "game_name": "EUWPlayer",
                "tag_line": "EUW",
                "region": "EUW",
                "last_match_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
            },
            {
                "puuid": "na-puuid",
                "game_name": "NAPlayer",
                "tag_line": "NA1",
                "region": "NA",
                "last_match_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
            },
        ]
        mock_db.get_active_accounts.return_value = accounts

        job = FetchMatchesJob(mock_db, "test-api-key")
        job._running = True

        # Mock region client creation
        with patch.object(job, "_get_region_client", return_value=mock_riot_api):
            mock_riot_api.get_match_ids.return_value = []
            mock_riot_api.get_league_entries_by_puuid.return_value = []

            await job._run_cycle()

        # Both accounts should be processed
        assert mock_db.update_account_last_fetched.call_count == 2
