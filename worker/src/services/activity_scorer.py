"""
Activity Scorer Service
Calculates activity scores for accounts to determine refresh priority
"""

import math
from datetime import datetime, timezone

import structlog

logger = structlog.get_logger(__name__)


class ActivityScorer:
    """Calculates activity scores for player accounts.

    Score components (0-100 total):
    - Recent activity (0-55): Games today + last 3 days
    - Recency (0-30): Exponential decay based on hours since last match
    - Weekly trend (0-15): Average games per day over last 7 days
    """

    # Tier thresholds
    TIER_VERY_ACTIVE = 70.0
    TIER_ACTIVE = 40.0
    TIER_MODERATE = 20.0

    def calculate_score(
        self,
        games_today: int,
        games_last_3_days: int,
        games_last_7_days: int,
        last_match_at: datetime | None,
    ) -> float:
        """Calculate activity score for an account.

        Args:
            games_today: Number of games played today
            games_last_3_days: Total games in last 3 days (including today)
            games_last_7_days: Total games in last 7 days
            last_match_at: Timestamp of most recent match (timezone-aware or naive UTC)

        Returns:
            Activity score between 0 and 100
        """
        # Recent activity component (0-55)
        # Today: up to 35 points (3.5+ games = max)
        today_score = min(games_today * 10, 35)
        # Last 3 days: up to 20 points (10+ games = max)
        recent_score = min(games_last_3_days * 2, 20)
        recent_component = today_score + recent_score

        # Recency component (0-30) - exponential decay
        # Half-life of ~8 hours: after 8h score is ~15, after 24h ~5, after 48h ~1
        if last_match_at:
            # Handle both naive and aware datetimes
            if last_match_at.tzinfo is None:
                last_match_at = last_match_at.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            hours_since = (now - last_match_at).total_seconds() / 3600
            # Clamp to 0 in case of future timestamps
            hours_since = max(0, hours_since)
            recency_component = 30 * math.exp(-hours_since / 12)
        else:
            recency_component = 0

        # Weekly trend component (0-15)
        # 5+ games/day average = max points
        if games_last_7_days > 0:
            daily_avg = games_last_7_days / 7
            trend_component = min(daily_avg * 3, 15)
        else:
            trend_component = 0

        total_score = recent_component + recency_component + trend_component

        # Ensure score stays in valid range
        return max(0.0, min(100.0, total_score))

    def determine_tier(self, score: float) -> str:
        """Determine activity tier based on score.

        Args:
            score: Activity score (0-100)

        Returns:
            Tier name: 'very_active', 'active', 'moderate', or 'inactive'
        """
        if score >= self.TIER_VERY_ACTIVE:
            return "very_active"
        elif score >= self.TIER_ACTIVE:
            return "active"
        elif score >= self.TIER_MODERATE:
            return "moderate"
        else:
            return "inactive"

    def apply_empty_fetch_decay(self, current_score: float) -> float:
        """Apply decay when no new matches are found.

        Args:
            current_score: Current activity score

        Returns:
            Decayed score (5% reduction)
        """
        return max(0.0, current_score * 0.95)

    def apply_match_boost(self, current_score: float, new_matches: int) -> float:
        """Apply boost when new matches are found.

        Args:
            current_score: Current activity score
            new_matches: Number of new matches found

        Returns:
            Boosted score (capped at 100)
        """
        # +5 points per new match found, up to +20
        boost = min(new_matches * 5, 20)
        return min(100.0, current_score + boost)
