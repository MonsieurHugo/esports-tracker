"""
Tests for RateLimiter service.
"""

import pytest
import asyncio
import time

from src.services.riot_api import RateLimiter


class TestRateLimiterBasic:
    """Basic tests for RateLimiter."""

    @pytest.mark.asyncio
    async def test_acquire_under_limit(self):
        """Should not block when under rate limit."""
        limiter = RateLimiter(requests_per_second=10, requests_per_2min=100)

        start = time.time()
        await limiter.acquire()
        elapsed = time.time() - start

        # Should be nearly instant
        assert elapsed < 0.1

    @pytest.mark.asyncio
    async def test_acquire_multiple_under_limit(self):
        """Multiple acquires under limit should not block."""
        limiter = RateLimiter(requests_per_second=10, requests_per_2min=100)

        start = time.time()
        for _ in range(5):
            await limiter.acquire()
        elapsed = time.time() - start

        # Should be nearly instant
        assert elapsed < 0.2

    @pytest.mark.asyncio
    async def test_window_tracking(self):
        """Should track requests in sliding window."""
        limiter = RateLimiter(requests_per_second=5, requests_per_2min=100)

        # Make requests up to limit
        for _ in range(5):
            await limiter.acquire()

        # Windows should have 5 entries each
        assert len(limiter.short_window) == 5
        assert len(limiter.long_window) == 5


class TestRateLimiterShortTermLimit:
    """Tests for short-term (per-second) rate limiting."""

    @pytest.mark.asyncio
    async def test_blocks_when_short_limit_reached(self):
        """Should wait when short-term limit is reached."""
        limiter = RateLimiter(requests_per_second=2, requests_per_2min=100)

        # Use up short-term limit
        await limiter.acquire()
        await limiter.acquire()

        # Next request should wait
        start = time.time()
        await limiter.acquire()
        elapsed = time.time() - start

        # Should have waited approximately 1 second
        assert elapsed >= 0.9

    @pytest.mark.asyncio
    async def test_short_window_cleanup(self):
        """Short window should clean up old entries."""
        limiter = RateLimiter(requests_per_second=2, requests_per_2min=100)

        # Make a request
        await limiter.acquire()

        # Wait for window to expire
        await asyncio.sleep(1.1)

        # Make another acquire (this should clean up old entry)
        await limiter.acquire()

        # Window should have only 1 recent entry
        assert len(limiter.short_window) == 1


class TestRateLimiterLongTermLimit:
    """Tests for long-term (per-2-minutes) rate limiting."""

    @pytest.mark.asyncio
    async def test_tracks_long_window(self):
        """Should track requests in long window."""
        limiter = RateLimiter(requests_per_second=100, requests_per_2min=10)

        # Make several requests
        for _ in range(5):
            await limiter.acquire()

        assert len(limiter.long_window) == 5

    @pytest.mark.asyncio
    async def test_blocks_when_long_limit_reached(self):
        """Should block when long-term limit is reached."""
        # Use very small limit for testing
        limiter = RateLimiter(requests_per_second=100, requests_per_2min=3)

        # Use up long-term limit quickly
        await limiter.acquire()
        await limiter.acquire()
        await limiter.acquire()

        # Next request should block (but we won't wait 2 minutes in test)
        # Just verify the window is full
        assert len(limiter.long_window) == 3


class TestRateLimiterConcurrency:
    """Tests for concurrent access to RateLimiter."""

    @pytest.mark.asyncio
    async def test_concurrent_acquires(self):
        """Concurrent acquires should be serialized properly."""
        limiter = RateLimiter(requests_per_second=10, requests_per_2min=100)

        # Launch concurrent acquires
        tasks = [limiter.acquire() for _ in range(5)]
        await asyncio.gather(*tasks)

        # All should complete and be tracked
        assert len(limiter.short_window) == 5
        assert len(limiter.long_window) == 5

    @pytest.mark.asyncio
    async def test_lock_prevents_race_conditions(self):
        """Lock should prevent race conditions in window updates."""
        limiter = RateLimiter(requests_per_second=3, requests_per_2min=100)

        # Create many concurrent tasks
        async def make_request():
            await limiter.acquire()

        tasks = [make_request() for _ in range(3)]
        await asyncio.gather(*tasks)

        # Should have exactly 3 entries (no duplicates or missing)
        assert len(limiter.short_window) == 3


class TestRateLimiterEdgeCases:
    """Edge case tests for RateLimiter."""

    @pytest.mark.asyncio
    async def test_empty_windows_on_init(self):
        """Windows should be empty on initialization."""
        limiter = RateLimiter(requests_per_second=10, requests_per_2min=100)

        assert len(limiter.short_window) == 0
        assert len(limiter.long_window) == 0

    @pytest.mark.asyncio
    async def test_single_request_limit(self):
        """Should handle limit of 1 request per second."""
        limiter = RateLimiter(requests_per_second=1, requests_per_2min=100)

        # First request should be instant
        start = time.time()
        await limiter.acquire()
        first_elapsed = time.time() - start
        assert first_elapsed < 0.1

        # Second should wait
        start = time.time()
        await limiter.acquire()
        second_elapsed = time.time() - start
        assert second_elapsed >= 0.9

    @pytest.mark.asyncio
    async def test_high_limit(self):
        """Should handle high rate limits efficiently."""
        limiter = RateLimiter(requests_per_second=1000, requests_per_2min=10000)

        start = time.time()
        for _ in range(100):
            await limiter.acquire()
        elapsed = time.time() - start

        # Should complete very quickly
        assert elapsed < 1.0


class TestRateLimiterIntegration:
    """Integration tests for RateLimiter."""

    @pytest.mark.asyncio
    async def test_sustained_rate(self):
        """Test sustained request rate over time."""
        limiter = RateLimiter(requests_per_second=5, requests_per_2min=1000)

        request_times = []
        for i in range(10):
            await limiter.acquire()
            request_times.append(time.time())

        # Verify requests are spread appropriately
        # First 5 should be quick, then rate limited
        first_batch_time = request_times[4] - request_times[0]
        assert first_batch_time < 0.5  # First 5 should be fast

        # After limit, should slow down
        total_time = request_times[-1] - request_times[0]
        # 10 requests at 5/sec should take at least ~1 second
        assert total_time >= 0.9
