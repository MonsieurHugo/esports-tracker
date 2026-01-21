"""
Tests for DatabaseService.

These tests use mocking since they don't require a real database connection.
For integration tests with a real database, use pytest fixtures with a test database.
"""

import pytest
from datetime import datetime, date, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from contextlib import asynccontextmanager
import asyncio

from src.services.database import DatabaseService


class MockAsyncContextManager:
    """Helper class to create async context manager mocks."""

    def __init__(self, return_value):
        self.return_value = return_value

    async def __aenter__(self):
        return self.return_value

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


def create_mock_pool(mock_conn):
    """Create a properly mocked pool with async context manager support."""
    mock_pool = MagicMock()
    mock_pool.acquire.return_value = MockAsyncContextManager(mock_conn)
    mock_pool.close = AsyncMock()
    return mock_pool


class TestDatabaseServiceConnection:
    """Tests for database connection methods."""

    @pytest.mark.asyncio
    async def test_connect_creates_pool(self):
        """Should create connection pool on connect."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")

        mock_pool = MagicMock()
        mock_pool.close = AsyncMock()

        async def mock_create_pool(*args, **kwargs):
            return mock_pool

        with patch("asyncpg.create_pool", side_effect=mock_create_pool) as mock_create:
            await db.connect()

            mock_create.assert_called_once()
            assert db._pool is mock_pool

    @pytest.mark.asyncio
    async def test_connect_timeout_handling(self):
        """Should handle connection timeout."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")

        async def slow_create(*args, **kwargs):
            await asyncio.sleep(60)  # Longer than timeout

        with patch("asyncpg.create_pool", side_effect=slow_create):
            with pytest.raises(asyncio.TimeoutError):
                await db.connect()

    @pytest.mark.asyncio
    async def test_disconnect_closes_pool(self):
        """Should close pool on disconnect."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")

        mock_pool = MagicMock()
        mock_pool.close = AsyncMock()
        db._pool = mock_pool

        await db.disconnect()

        mock_pool.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_connect_with_retry_success(self):
        """Should succeed on retry after initial failure."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")

        call_count = 0

        async def failing_then_success(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise Exception("Connection failed")
            return MagicMock()

        with patch("asyncpg.create_pool", side_effect=failing_then_success):
            with patch("asyncio.sleep", new_callable=AsyncMock):
                await db.connect_with_retry(max_retries=3, base_delay=0.1)

        assert call_count == 2

    @pytest.mark.asyncio
    async def test_connect_with_retry_exhausted(self):
        """Should raise after all retries exhausted."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")

        with patch("asyncpg.create_pool", side_effect=Exception("Connection failed")):
            with patch("asyncio.sleep", new_callable=AsyncMock):
                with pytest.raises(Exception, match="Connection failed"):
                    await db.connect_with_retry(max_retries=2, base_delay=0.1)


class TestDatabaseServiceNotConnected:
    """Tests for operations when database is not connected."""

    @pytest.mark.asyncio
    async def test_execute_without_connection_raises_error(self):
        """Should raise RuntimeError if execute() called before connect()."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")

        with pytest.raises(RuntimeError, match="Database not connected"):
            await db.execute("SELECT 1")

    @pytest.mark.asyncio
    async def test_fetch_without_connection_raises_error(self):
        """Should raise RuntimeError if fetch() called before connect()."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")

        with pytest.raises(RuntimeError, match="Database not connected"):
            await db.fetch("SELECT * FROM test")

    @pytest.mark.asyncio
    async def test_fetchrow_without_connection_raises_error(self):
        """Should raise RuntimeError if fetchrow() called before connect()."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")

        with pytest.raises(RuntimeError, match="Database not connected"):
            await db.fetchrow("SELECT * FROM test WHERE id = $1", 1)

    @pytest.mark.asyncio
    async def test_fetchval_without_connection_raises_error(self):
        """Should raise RuntimeError if fetchval() called before connect()."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")

        with pytest.raises(RuntimeError, match="Database not connected"):
            await db.fetchval("SELECT COUNT(*) FROM test")

    @pytest.mark.asyncio
    async def test_execute_after_disconnect_raises_error(self):
        """Should raise RuntimeError if execute() called after disconnect()."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")

        mock_pool = MagicMock()
        mock_pool.close = AsyncMock()
        db._pool = mock_pool

        await db.disconnect()

        # Pool is not set to None after disconnect, but let's simulate it
        db._pool = None

        with pytest.raises(RuntimeError, match="Database not connected"):
            await db.execute("SELECT 1")

    def test_ensure_connected_with_pool(self):
        """Should not raise if pool is initialized."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")
        db._pool = MagicMock()  # Simulate connected state

        # Should not raise
        db._ensure_connected()

    def test_ensure_connected_without_pool(self):
        """Should raise RuntimeError if pool is None."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")

        with pytest.raises(RuntimeError, match="Database not connected. Call connect\\(\\) first."):
            db._ensure_connected()


class TestDatabaseServiceQueries:
    """Tests for basic query methods."""

    @pytest.fixture
    def connected_db(self):
        """Database service with mocked pool."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")
        mock_conn = AsyncMock()
        db._pool = create_mock_pool(mock_conn)
        db._mock_conn = mock_conn  # Store for test access
        return db

    @pytest.mark.asyncio
    async def test_execute(self, connected_db):
        """Should execute query through pool."""
        connected_db._mock_conn.execute = AsyncMock(return_value="INSERT 0 1")

        result = await connected_db.execute("INSERT INTO test VALUES ($1)", "value")

        connected_db._mock_conn.execute.assert_called_once_with(
            "INSERT INTO test VALUES ($1)", "value"
        )
        assert result == "INSERT 0 1"

    @pytest.mark.asyncio
    async def test_fetch(self, connected_db):
        """Should fetch multiple rows."""
        mock_rows = [{"id": 1, "name": "test1"}, {"id": 2, "name": "test2"}]
        connected_db._mock_conn.fetch = AsyncMock(return_value=mock_rows)

        result = await connected_db.fetch("SELECT * FROM test")

        connected_db._mock_conn.fetch.assert_called_once()
        assert result == mock_rows

    @pytest.mark.asyncio
    async def test_fetchrow(self, connected_db):
        """Should fetch single row."""
        mock_row = {"id": 1, "name": "test"}
        connected_db._mock_conn.fetchrow = AsyncMock(return_value=mock_row)

        result = await connected_db.fetchrow("SELECT * FROM test WHERE id = $1", 1)

        connected_db._mock_conn.fetchrow.assert_called_once()
        assert result == mock_row

    @pytest.mark.asyncio
    async def test_fetchval(self, connected_db):
        """Should fetch single value."""
        connected_db._mock_conn.fetchval = AsyncMock(return_value=42)

        result = await connected_db.fetchval("SELECT COUNT(*) FROM test")

        connected_db._mock_conn.fetchval.assert_called_once()
        assert result == 42


class TestDatabaseServiceAccountOperations:
    """Tests for account-related database operations."""

    @pytest.fixture
    def connected_db(self):
        """Database service with mocked pool."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")
        mock_conn = AsyncMock()
        db._pool = create_mock_pool(mock_conn)
        db._mock_conn = mock_conn
        return db

    @pytest.mark.asyncio
    async def test_get_active_accounts(self, connected_db):
        """Should return active accounts."""
        expected_accounts = [
            {"puuid": "puuid1", "game_name": "Player1", "region": "EUW"},
            {"puuid": "puuid2", "game_name": "Player2", "region": "NA"},
        ]
        connected_db._mock_conn.fetch = AsyncMock(return_value=expected_accounts)

        result = await connected_db.get_active_accounts()

        assert len(result) == 2
        assert result[0]["puuid"] == "puuid1"

    @pytest.mark.asyncio
    async def test_get_tracked_puuids(self, connected_db):
        """Should return set of tracked puuids."""
        mock_rows = [{"puuid": "puuid1"}, {"puuid": "puuid2"}, {"puuid": "puuid3"}]
        connected_db._mock_conn.fetch = AsyncMock(return_value=mock_rows)

        result = await connected_db.get_tracked_puuids()

        assert result == {"puuid1", "puuid2", "puuid3"}
        assert isinstance(result, set)

    @pytest.mark.asyncio
    async def test_update_account_last_match(self, connected_db):
        """Should update last_match_at timestamp."""
        connected_db._mock_conn.execute = AsyncMock()

        now = datetime.now(timezone.utc)
        await connected_db.update_account_last_match("test-puuid", now)

        connected_db._mock_conn.execute.assert_called_once()
        call_args = connected_db._mock_conn.execute.call_args
        assert "test-puuid" in call_args[0]
        assert now in call_args[0]


class TestDatabaseServiceMatchOperations:
    """Tests for match-related database operations."""

    @pytest.fixture
    def connected_db(self):
        """Database service with mocked pool."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")
        mock_conn = AsyncMock()
        db._pool = create_mock_pool(mock_conn)
        db._mock_conn = mock_conn
        return db

    @pytest.mark.asyncio
    async def test_match_exists_true(self, connected_db):
        """Should return True if match exists."""
        connected_db._mock_conn.fetchval = AsyncMock(return_value=True)

        result = await connected_db.match_exists("EUW1_12345")

        assert result is True

    @pytest.mark.asyncio
    async def test_match_exists_false(self, connected_db):
        """Should return False if match doesn't exist."""
        connected_db._mock_conn.fetchval = AsyncMock(return_value=False)

        result = await connected_db.match_exists("EUW1_99999")

        assert result is False

    @pytest.mark.asyncio
    async def test_insert_match(self, connected_db):
        """Should insert match with correct parameters."""
        connected_db._mock_conn.execute = AsyncMock()

        game_start = datetime.now(timezone.utc)
        await connected_db.insert_match(
            match_id="EUW1_12345",
            game_start=game_start,
            game_duration=1800,
            queue_id=420,
            game_version="14.24.1",
        )

        connected_db._mock_conn.execute.assert_called_once()
        call_args = connected_db._mock_conn.execute.call_args[0]
        assert "EUW1_12345" in call_args
        assert game_start in call_args
        assert 1800 in call_args
        assert 420 in call_args


class TestDatabaseServiceWorkerOperations:
    """Tests for worker status operations."""

    @pytest.fixture
    def connected_db(self):
        """Database service with mocked pool."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")
        mock_conn = AsyncMock()
        db._pool = create_mock_pool(mock_conn)
        db._mock_conn = mock_conn
        return db

    @pytest.mark.asyncio
    async def test_set_worker_running_true(self, connected_db):
        """Should set worker as running."""
        connected_db._mock_conn.execute = AsyncMock()

        await connected_db.set_worker_running(True)

        connected_db._mock_conn.execute.assert_called_once()
        query = connected_db._mock_conn.execute.call_args[0][0]
        assert "is_running = true" in query

    @pytest.mark.asyncio
    async def test_set_worker_running_false(self, connected_db):
        """Should set worker as not running."""
        connected_db._mock_conn.execute = AsyncMock()

        await connected_db.set_worker_running(False)

        connected_db._mock_conn.execute.assert_called_once()
        query = connected_db._mock_conn.execute.call_args[0][0]
        assert "is_running = false" in query

    @pytest.mark.asyncio
    async def test_increment_worker_stats(self, connected_db):
        """Should increment worker stats correctly."""
        connected_db._mock_conn.execute = AsyncMock()

        await connected_db.increment_worker_stats(
            matches_added=5,
            accounts_processed=2,
            errors=1,
            api_requests=10,
        )

        connected_db._mock_conn.execute.assert_called_once()
        call_args = connected_db._mock_conn.execute.call_args[0]
        assert 5 in call_args  # matches_added
        assert 2 in call_args  # accounts_processed
        assert 1 in call_args  # errors
        assert 10 in call_args  # api_requests


class TestDatabaseServicePriorityQueue:
    """Tests for priority queue operations."""

    @pytest.fixture
    def connected_db(self):
        """Database service with mocked pool."""
        db = DatabaseService("postgresql://test:test@localhost:5432/testdb")
        mock_conn = AsyncMock()
        db._pool = create_mock_pool(mock_conn)
        db._mock_conn = mock_conn
        return db

    @pytest.mark.asyncio
    async def test_get_active_accounts_with_activity(self, connected_db):
        """Should return accounts with activity metrics."""
        expected = [
            {
                "puuid": "puuid1",
                "game_name": "Player1",
                "games_today": 5,
                "games_last_3_days": 15,
                "games_last_7_days": 30,
                "activity_score": 75.0,
            }
        ]
        connected_db._mock_conn.fetch = AsyncMock(return_value=expected)

        result = await connected_db.get_active_accounts_with_activity()

        assert len(result) == 1
        assert result[0]["games_today"] == 5
        assert result[0]["activity_score"] == 75.0

    @pytest.mark.asyncio
    async def test_get_account_activity_data(self, connected_db):
        """Should return activity data for single account."""
        mock_row = {
            "last_match_at": datetime.now(timezone.utc),
            "games_today": 3,
            "games_last_3_days": 10,
            "games_last_7_days": 25,
        }
        connected_db._mock_conn.fetchrow = AsyncMock(return_value=mock_row)

        result = await connected_db.get_account_activity_data("test-puuid")

        assert result["games_today"] == 3
        assert result["games_last_7_days"] == 25

    @pytest.mark.asyncio
    async def test_get_account_activity_data_missing(self, connected_db):
        """Should return defaults for missing account."""
        connected_db._mock_conn.fetchrow = AsyncMock(return_value=None)

        result = await connected_db.get_account_activity_data("nonexistent")

        assert result["games_today"] == 0
        assert result["games_last_3_days"] == 0
        assert result["games_last_7_days"] == 0
        assert result["last_match_at"] is None

    @pytest.mark.asyncio
    async def test_update_account_priority(self, connected_db):
        """Should update account priority data."""
        connected_db._mock_conn.execute = AsyncMock()

        next_fetch = datetime.now(timezone.utc) + timedelta(minutes=10)
        await connected_db.update_account_priority(
            puuid="test-puuid",
            activity_score=65.5,
            tier="active",
            next_fetch_at=next_fetch,
            consecutive_empty_fetches=2,
        )

        connected_db._mock_conn.execute.assert_called_once()
        call_args = connected_db._mock_conn.execute.call_args[0]
        assert "test-puuid" in call_args
        assert 65.5 in call_args
        assert "active" in call_args
        assert 2 in call_args

    @pytest.mark.asyncio
    async def test_get_priority_queue_stats(self, connected_db):
        """Should return queue statistics."""
        mock_stats = {
            "very_active_count": 10,
            "active_count": 25,
            "moderate_count": 40,
            "inactive_count": 25,
            "avg_score": 45.5,
            "ready_now": 15,
        }
        connected_db._mock_conn.fetchrow = AsyncMock(return_value=mock_stats)

        result = await connected_db.get_priority_queue_stats()

        assert result["very_active_count"] == 10
        assert result["avg_score"] == 45.5
        assert result["ready_now"] == 15
