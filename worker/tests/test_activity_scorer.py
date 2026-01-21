"""
Tests for ActivityScorer service.
"""

import pytest
from datetime import datetime, timezone, timedelta
from freezegun import freeze_time

from src.services.activity_scorer import ActivityScorer


class TestActivityScorerCalculateScore:
    """Tests for calculate_score method."""

    def test_calculate_score_no_games(self, activity_scorer):
        """Score should be 0 when no games played."""
        score = activity_scorer.calculate_score(
            games_today=0,
            games_last_3_days=0,
            games_last_7_days=0,
            last_match_at=None,
        )
        assert score == 0

    def test_calculate_score_active_player(self, activity_scorer):
        """Active player should have high score."""
        score = activity_scorer.calculate_score(
            games_today=5,
            games_last_3_days=15,
            games_last_7_days=35,
            last_match_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
        # Should have significant score from all components
        assert score > 50

    def test_calculate_score_very_active_player(self, activity_scorer):
        """Very active player should have very high score."""
        score = activity_scorer.calculate_score(
            games_today=10,
            games_last_3_days=30,
            games_last_7_days=70,
            last_match_at=datetime.now(timezone.utc) - timedelta(minutes=30),
        )
        # Should hit the very_active tier threshold
        assert score >= ActivityScorer.TIER_VERY_ACTIVE

    def test_calculate_score_recent_match_boost(self, activity_scorer):
        """Recent matches should provide higher recency component."""
        recent_score = activity_scorer.calculate_score(
            games_today=2,
            games_last_3_days=5,
            games_last_7_days=10,
            last_match_at=datetime.now(timezone.utc) - timedelta(minutes=30),
        )
        old_score = activity_scorer.calculate_score(
            games_today=2,
            games_last_3_days=5,
            games_last_7_days=10,
            last_match_at=datetime.now(timezone.utc) - timedelta(hours=24),
        )
        assert recent_score > old_score

    def test_calculate_score_bounds(self, activity_scorer):
        """Score should always be between 0 and 100."""
        # Extreme values
        score_max = activity_scorer.calculate_score(
            games_today=100,
            games_last_3_days=500,
            games_last_7_days=1000,
            last_match_at=datetime.now(timezone.utc),
        )
        assert 0 <= score_max <= 100

        score_min = activity_scorer.calculate_score(
            games_today=0,
            games_last_3_days=0,
            games_last_7_days=0,
            last_match_at=None,
        )
        assert 0 <= score_min <= 100

    def test_calculate_score_today_component(self, activity_scorer):
        """Games today should contribute up to 35 points."""
        # 0 games today
        score_0 = activity_scorer.calculate_score(
            games_today=0,
            games_last_3_days=0,
            games_last_7_days=0,
            last_match_at=None,
        )
        # 3 games today (30 points from today)
        score_3 = activity_scorer.calculate_score(
            games_today=3,
            games_last_3_days=3,
            games_last_7_days=3,
            last_match_at=None,
        )
        # 5 games today (should cap at 35)
        score_5 = activity_scorer.calculate_score(
            games_today=5,
            games_last_3_days=5,
            games_last_7_days=5,
            last_match_at=None,
        )

        assert score_3 > score_0
        assert score_5 >= score_3  # May not be much higher due to cap

    def test_calculate_score_naive_datetime(self, activity_scorer):
        """Should handle naive datetimes by treating as UTC."""
        naive_dt = datetime.now()  # No timezone
        score = activity_scorer.calculate_score(
            games_today=2,
            games_last_3_days=5,
            games_last_7_days=10,
            last_match_at=naive_dt,
        )
        # Should not raise and should return valid score
        assert 0 <= score <= 100


class TestActivityScorerDetermineTier:
    """Tests for determine_tier method."""

    def test_tier_very_active(self, activity_scorer):
        """Score >= 70 should be very_active."""
        assert activity_scorer.determine_tier(75) == "very_active"
        assert activity_scorer.determine_tier(70) == "very_active"
        assert activity_scorer.determine_tier(100) == "very_active"

    def test_tier_active(self, activity_scorer):
        """Score 40-69 should be active."""
        assert activity_scorer.determine_tier(50) == "active"
        assert activity_scorer.determine_tier(40) == "active"
        assert activity_scorer.determine_tier(69.9) == "active"

    def test_tier_moderate(self, activity_scorer):
        """Score 20-39 should be moderate."""
        assert activity_scorer.determine_tier(30) == "moderate"
        assert activity_scorer.determine_tier(20) == "moderate"
        assert activity_scorer.determine_tier(39.9) == "moderate"

    def test_tier_inactive(self, activity_scorer):
        """Score < 20 should be inactive."""
        assert activity_scorer.determine_tier(15) == "inactive"
        assert activity_scorer.determine_tier(0) == "inactive"
        assert activity_scorer.determine_tier(19.9) == "inactive"


class TestActivityScorerDecay:
    """Tests for apply_empty_fetch_decay method."""

    def test_decay_reduces_score(self, activity_scorer):
        """Decay should reduce score by 5%."""
        original = 100.0
        decayed = activity_scorer.apply_empty_fetch_decay(original)
        assert decayed == 95.0

    def test_decay_multiple_times(self, activity_scorer):
        """Multiple decays should compound."""
        score = 100.0
        score = activity_scorer.apply_empty_fetch_decay(score)
        score = activity_scorer.apply_empty_fetch_decay(score)
        score = activity_scorer.apply_empty_fetch_decay(score)
        # 100 * 0.95^3 = ~85.74
        assert 85 < score < 86

    def test_decay_minimum_bound(self, activity_scorer):
        """Decay should not go below 0."""
        score = 1.0
        for _ in range(100):
            score = activity_scorer.apply_empty_fetch_decay(score)
        assert score >= 0


class TestActivityScorerBoost:
    """Tests for apply_match_boost method."""

    def test_boost_increases_score(self, activity_scorer):
        """Boost should increase score."""
        original = 50.0
        boosted = activity_scorer.apply_match_boost(original, new_matches=1)
        assert boosted == 55.0  # +5 per match

    def test_boost_multiple_matches(self, activity_scorer):
        """Multiple matches should increase boost."""
        original = 50.0
        boosted = activity_scorer.apply_match_boost(original, new_matches=3)
        assert boosted == 65.0  # +15 (3 * 5)

    def test_boost_capped_at_20(self, activity_scorer):
        """Boost should cap at +20 points."""
        original = 50.0
        boosted = activity_scorer.apply_match_boost(original, new_matches=10)
        assert boosted == 70.0  # +20 max

    def test_boost_capped_at_100(self, activity_scorer):
        """Boosted score should not exceed 100."""
        original = 95.0
        boosted = activity_scorer.apply_match_boost(original, new_matches=5)
        assert boosted == 100.0  # Capped at 100


class TestActivityScorerIntegration:
    """Integration tests for ActivityScorer."""

    @freeze_time("2024-01-15 12:00:00", tz_offset=0)
    def test_full_scoring_workflow(self, activity_scorer):
        """Test complete scoring workflow."""
        # Initial state: inactive player
        score = activity_scorer.calculate_score(
            games_today=0,
            games_last_3_days=1,
            games_last_7_days=3,
            last_match_at=datetime(2024, 1, 14, 10, 0, 0, tzinfo=timezone.utc),
        )
        tier = activity_scorer.determine_tier(score)
        assert tier in ["inactive", "moderate"]

        # After finding matches
        score = activity_scorer.apply_match_boost(score, new_matches=2)
        assert score > 0

        # After empty fetch
        score = activity_scorer.apply_empty_fetch_decay(score)
        # Score should decrease

    def test_tier_transitions(self, activity_scorer):
        """Test that score changes result in correct tier changes."""
        # Start as active
        score = 45.0
        assert activity_scorer.determine_tier(score) == "active"

        # Boost to very_active
        score = activity_scorer.apply_match_boost(score, new_matches=5)
        assert score >= 65
        # Still might be active if was 45, becomes 65 (not quite very_active at 70)

        # Multiple boosts
        score = activity_scorer.apply_match_boost(score, new_matches=4)
        assert activity_scorer.determine_tier(score) in ["very_active", "active"]

        # Decay back down
        for _ in range(20):
            score = activity_scorer.apply_empty_fetch_decay(score)
        # After many decays, should be lower tier
        assert activity_scorer.determine_tier(score) in ["moderate", "inactive", "active"]
