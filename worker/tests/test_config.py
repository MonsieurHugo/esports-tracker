"""
Tests for worker configuration validation.
"""

import os
import pytest
from pydantic import ValidationError

from src.config import Settings


# Required secrets for all tests
REQUIRED_SECRETS = {
    "database_url": "postgresql://user:password@localhost:5432/dbname",
    "riot_api_key": "RGAPI-test-key-12345",
}


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    """Remove environment variables that might interfere with tests."""
    # Remove any existing env vars that pydantic-settings might pick up
    for key in list(os.environ.keys()):
        if key.upper() in (
            "DATABASE_URL",
            "RIOT_API_KEY",
            "PRIORITY_TIER_VERY_ACTIVE",
            "PRIORITY_TIER_ACTIVE",
            "PRIORITY_TIER_MODERATE",
            "PRIORITY_INTERVAL_VERY_ACTIVE",
            "PRIORITY_INTERVAL_ACTIVE",
            "PRIORITY_INTERVAL_MODERATE",
            "PRIORITY_INTERVAL_INACTIVE",
            "PRIORITY_MAX_INTERVAL_VERY_ACTIVE",
            "PRIORITY_MAX_INTERVAL_ACTIVE",
            "PRIORITY_MAX_INTERVAL_MODERATE",
            "PRIORITY_MAX_INTERVAL_INACTIVE",
        ):
            monkeypatch.delenv(key, raising=False)


class TestPriorityTierValidation:
    """Tests for priority tier threshold validation."""

    def test_valid_default_config(self):
        """Default config should be valid."""
        settings = Settings(**REQUIRED_SECRETS)
        assert settings.priority_tier_very_active == 70.0
        assert settings.priority_tier_active == 40.0
        assert settings.priority_tier_moderate == 20.0

    def test_valid_custom_tiers(self):
        """Custom tiers in descending order should be valid."""
        settings = Settings(
            **REQUIRED_SECRETS,
            priority_tier_very_active=80.0,
            priority_tier_active=50.0,
            priority_tier_moderate=25.0,
        )
        assert settings.priority_tier_very_active == 80.0
        assert settings.priority_tier_active == 50.0
        assert settings.priority_tier_moderate == 25.0

    def test_rejects_unordered_tiers(self):
        """Should reject if tiers are not in descending order."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_tier_very_active=30.0,  # < active!
                priority_tier_active=50.0,
                priority_tier_moderate=20.0,
            )
        assert "must be greater than" in str(exc_info.value)

    def test_rejects_active_lower_than_moderate(self):
        """Should reject if active is lower than moderate."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_tier_very_active=70.0,
                priority_tier_active=15.0,  # < moderate!
                priority_tier_moderate=20.0,
            )
        assert "must be greater than" in str(exc_info.value)

    def test_rejects_equal_tiers(self):
        """Should reject if two tiers have same value."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_tier_very_active=50.0,
                priority_tier_active=50.0,  # == very_active!
                priority_tier_moderate=20.0,
            )
        assert "must be greater than" in str(exc_info.value)

    def test_rejects_equal_active_and_moderate(self):
        """Should reject if active equals moderate."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_tier_very_active=70.0,
                priority_tier_active=30.0,
                priority_tier_moderate=30.0,  # == active!
            )
        assert "must be greater than" in str(exc_info.value)

    def test_rejects_negative_moderate(self):
        """Moderate tier must be > 0."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_tier_moderate=-5.0,
            )
        assert "must be greater than 0" in str(exc_info.value)

    def test_rejects_zero_moderate(self):
        """Moderate tier must be > 0, not equal to 0."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_tier_moderate=0.0,
            )
        assert "must be greater than 0" in str(exc_info.value)

    def test_rejects_tier_over_100(self):
        """Tiers cannot exceed 100."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_tier_very_active=150.0,
            )
        assert "cannot exceed 100" in str(exc_info.value)

    def test_rejects_active_over_100(self):
        """Active tier cannot exceed 100."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_tier_very_active=99.0,
                priority_tier_active=105.0,  # > 100!
            )
        assert "cannot exceed 100" in str(exc_info.value)

    def test_rejects_moderate_over_100(self):
        """Moderate tier cannot exceed 100."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_tier_very_active=99.0,
                priority_tier_active=98.0,
                priority_tier_moderate=101.0,  # > 100!
            )
        assert "cannot exceed 100" in str(exc_info.value)

    def test_boundary_value_100(self):
        """Tier at exactly 100 should be valid."""
        settings = Settings(
            **REQUIRED_SECRETS,
            priority_tier_very_active=100.0,
            priority_tier_active=50.0,
            priority_tier_moderate=25.0,
        )
        assert settings.priority_tier_very_active == 100.0

    def test_boundary_value_just_above_zero(self):
        """Moderate tier just above 0 should be valid."""
        settings = Settings(
            **REQUIRED_SECRETS,
            priority_tier_very_active=70.0,
            priority_tier_active=40.0,
            priority_tier_moderate=0.1,
        )
        assert settings.priority_tier_moderate == 0.1


class TestIntervalValidation:
    """Tests for priority interval validation."""

    def test_valid_default_intervals(self):
        """Default intervals should be valid."""
        settings = Settings(**REQUIRED_SECRETS)
        assert settings.priority_interval_very_active == 3
        assert settings.priority_max_interval_very_active == 5
        assert settings.priority_interval_active == 15
        assert settings.priority_max_interval_active == 30

    def test_valid_custom_intervals(self):
        """Custom intervals where base <= max should be valid."""
        settings = Settings(
            **REQUIRED_SECRETS,
            priority_interval_very_active=5,
            priority_max_interval_very_active=10,
        )
        assert settings.priority_interval_very_active == 5
        assert settings.priority_max_interval_very_active == 10

    def test_valid_equal_base_and_max(self):
        """Base interval equal to max should be valid (no backoff)."""
        settings = Settings(
            **REQUIRED_SECRETS,
            priority_interval_very_active=5,
            priority_max_interval_very_active=5,
        )
        assert settings.priority_interval_very_active == 5
        assert settings.priority_max_interval_very_active == 5

    def test_rejects_base_exceeding_max_very_active(self):
        """Base interval cannot exceed max interval for very_active."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_interval_very_active=10,  # > max!
                priority_max_interval_very_active=5,
            )
        assert "cannot exceed" in str(exc_info.value)
        assert "very_active" in str(exc_info.value)

    def test_rejects_base_exceeding_max_active(self):
        """Base interval cannot exceed max interval for active."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_interval_active=60,  # > max!
                priority_max_interval_active=30,
            )
        assert "cannot exceed" in str(exc_info.value)
        assert "active" in str(exc_info.value)

    def test_rejects_base_exceeding_max_moderate(self):
        """Base interval cannot exceed max interval for moderate."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_interval_moderate=150,  # > max!
                priority_max_interval_moderate=120,
            )
        assert "cannot exceed" in str(exc_info.value)
        assert "moderate" in str(exc_info.value)

    def test_rejects_base_exceeding_max_inactive(self):
        """Base interval cannot exceed max interval for inactive."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_interval_inactive=500,  # > max!
                priority_max_interval_inactive=360,
            )
        assert "cannot exceed" in str(exc_info.value)
        assert "inactive" in str(exc_info.value)

    def test_rejects_zero_interval(self):
        """Intervals must be positive."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_interval_very_active=0,
            )
        assert "must be positive" in str(exc_info.value)

    def test_rejects_negative_interval(self):
        """Negative intervals should be rejected."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                **REQUIRED_SECRETS,
                priority_interval_active=-5,
            )
        assert "must be positive" in str(exc_info.value)


class TestIntervalOrderingWarning:
    """Tests for interval ordering warning."""

    def test_warns_unusual_interval_order(self):
        """Should warn if intervals don't increase with lower activity."""
        with pytest.warns(UserWarning, match="not in ascending order"):
            Settings(
                **REQUIRED_SECRETS,
                priority_interval_very_active=60,  # > active (unusual)
                priority_interval_active=30,
                priority_max_interval_very_active=120,  # Make valid
            )

    def test_no_warning_for_normal_order(self):
        """Should not warn when intervals are in ascending order."""
        # This should not raise any warnings
        import warnings
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            Settings(**REQUIRED_SECRETS)
            # Filter for UserWarnings about interval order
            interval_warnings = [
                warning for warning in w
                if issubclass(warning.category, UserWarning)
                and "ascending order" in str(warning.message)
            ]
            assert len(interval_warnings) == 0

    def test_warns_when_moderate_less_than_active(self):
        """Should warn if moderate interval is less than active."""
        with pytest.warns(UserWarning, match="not in ascending order"):
            Settings(
                **REQUIRED_SECRETS,
                priority_interval_active=100,  # > moderate (unusual)
                priority_interval_moderate=50,
                priority_max_interval_active=200,  # Make valid
            )


class TestRequiredSecretsValidation:
    """Tests for required secrets validation."""

    def test_rejects_missing_database_url(self):
        """Should reject if DATABASE_URL is missing."""
        with pytest.raises(ValidationError) as exc_info:
            # Disable env file loading to test validation
            Settings(riot_api_key="RGAPI-test-key", _env_file=None)
        assert "DATABASE_URL" in str(exc_info.value)

    def test_rejects_missing_riot_api_key(self):
        """Should reject if RIOT_API_KEY is missing."""
        with pytest.raises(ValidationError) as exc_info:
            # Disable env file loading to test validation
            Settings(database_url="postgresql://user:pass@localhost/db", _env_file=None)
        assert "RIOT_API_KEY" in str(exc_info.value)

    def test_rejects_empty_database_url(self):
        """Should reject if DATABASE_URL is empty."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(database_url="", riot_api_key="RGAPI-test-key", _env_file=None)
        assert "DATABASE_URL" in str(exc_info.value)

    def test_rejects_empty_riot_api_key(self):
        """Should reject if RIOT_API_KEY is empty."""
        with pytest.raises(ValidationError) as exc_info:
            Settings(database_url="postgresql://user:pass@localhost/db", riot_api_key="", _env_file=None)
        assert "RIOT_API_KEY" in str(exc_info.value)


class TestCombinedValidation:
    """Tests for combined validation scenarios."""

    def test_all_validations_run(self):
        """All validators should run and catch multiple issues."""
        # This tests that validators are properly chained
        # First error encountered should be raised
        with pytest.raises(ValidationError):
            Settings(
                database_url="",  # Invalid
                riot_api_key="",  # Invalid
                priority_tier_very_active=30.0,  # Invalid order
                priority_interval_very_active=0,  # Invalid
            )

    def test_valid_complex_config(self):
        """A complex but valid config should pass all validations."""
        settings = Settings(
            database_url="postgresql://user:password@localhost:5432/esports",
            riot_api_key="RGAPI-valid-key-123",
            priority_tier_very_active=85.0,
            priority_tier_active=55.0,
            priority_tier_moderate=30.0,
            priority_interval_very_active=2,
            priority_interval_active=10,
            priority_interval_moderate=45,
            priority_interval_inactive=180,
            priority_max_interval_very_active=4,
            priority_max_interval_active=20,
            priority_max_interval_moderate=90,
            priority_max_interval_inactive=360,
            priority_batch_size=15,
        )
        assert settings.priority_tier_very_active == 85.0
        assert settings.priority_batch_size == 15
