"""
Worker Configuration
"""

import re
import warnings

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def redact_url(url: str) -> str:
    """Redact password from a database URL for safe logging.

    Example: postgresql://user:password@host:5432/db -> postgresql://user:****@host:5432/db
    """
    if not url:
        return url
    # Match pattern: scheme://user:password@host
    return re.sub(
        r'(://[^:]+:)([^@]+)(@)',
        r'\1****\3',
        url
    )


def redact_api_key(key: str) -> str:
    """Redact an API key for safe logging.

    Shows only first 8 characters followed by asterisks.
    Example: RGAPI-12345678-abcd-... -> RGAPI-12********
    """
    if not key:
        return key
    if len(key) <= 8:
        return '****'
    return key[:8] + '********'


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    database_url: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Riot Games API
    riot_api_key: str = ""
    riot_api_base_url: str = "https://euw1.api.riotgames.com"
    riot_api_rate_limit: int = 100  # requests per 2 minutes

    # Application
    debug: bool = False
    log_level: str = "INFO"

    # Priority Queue Settings (V2)
    # Set to True to use new priority-based job
    use_priority_queue: bool = True

    # Activity tier thresholds (score 0-100)
    priority_tier_very_active: float = 70.0
    priority_tier_active: float = 40.0
    priority_tier_moderate: float = 20.0

    # Base refresh intervals by tier (in minutes)
    priority_interval_very_active: int = 3
    priority_interval_active: int = 15
    priority_interval_moderate: int = 60
    priority_interval_inactive: int = 240

    # Maximum intervals (caps for backoff)
    priority_max_interval_very_active: int = 5
    priority_max_interval_active: int = 30
    priority_max_interval_moderate: int = 120
    priority_max_interval_inactive: int = 360

    # Batch size per region per cycle
    priority_batch_size: int = 10

    @model_validator(mode='after')
    def validate_required_secrets(self) -> 'Settings':
        """Validate that required secrets are provided."""
        if not self.database_url:
            raise ValueError(
                "DATABASE_URL environment variable is required. "
                "Example: postgresql://user:password@localhost:5432/dbname"
            )
        if not self.riot_api_key:
            raise ValueError(
                "RIOT_API_KEY environment variable is required. "
                "Get your API key from https://developer.riotgames.com/"
            )
        return self

    @model_validator(mode='after')
    def validate_priority_tiers(self) -> 'Settings':
        """Ensure tier thresholds are valid and in strictly descending order."""
        tiers = [
            ('very_active', self.priority_tier_very_active),
            ('active', self.priority_tier_active),
            ('moderate', self.priority_tier_moderate),
        ]

        # First check: all tiers must be <= 100
        for name, val in tiers:
            if val > 100:
                raise ValueError(
                    f"priority_tier_{name} ({val}) cannot exceed 100"
                )

        # Second check: moderate tier must be > 0
        if self.priority_tier_moderate <= 0:
            raise ValueError(
                f"priority_tier_moderate ({self.priority_tier_moderate}) must be greater than 0"
            )

        # Third check: verify descending order
        for i in range(len(tiers) - 1):
            current_name, current_val = tiers[i]
            next_name, next_val = tiers[i + 1]

            if current_val <= next_val:
                raise ValueError(
                    f"Priority tier threshold error: "
                    f"'{current_name}' ({current_val}) must be greater than "
                    f"'{next_name}' ({next_val}). "
                    f"Expected descending order: very_active > active > moderate > 0"
                )

        return self

    @model_validator(mode='after')
    def validate_priority_intervals(self) -> 'Settings':
        """Ensure base intervals don't exceed max intervals."""
        interval_pairs = [
            ('very_active', self.priority_interval_very_active, self.priority_max_interval_very_active),
            ('active', self.priority_interval_active, self.priority_max_interval_active),
            ('moderate', self.priority_interval_moderate, self.priority_max_interval_moderate),
            ('inactive', self.priority_interval_inactive, self.priority_max_interval_inactive),
        ]

        for tier_name, base, max_val in interval_pairs:
            if base > max_val:
                raise ValueError(
                    f"priority_interval_{tier_name} ({base} min) cannot exceed "
                    f"priority_max_interval_{tier_name} ({max_val} min)"
                )
            if base <= 0:
                raise ValueError(
                    f"priority_interval_{tier_name} must be positive, got {base}"
                )

        return self

    @model_validator(mode='after')
    def validate_interval_ordering(self) -> 'Settings':
        """Ensure intervals increase as activity decreases (optional but recommended)."""
        intervals = [
            self.priority_interval_very_active,
            self.priority_interval_active,
            self.priority_interval_moderate,
            self.priority_interval_inactive,
        ]

        for i in range(len(intervals) - 1):
            if intervals[i] > intervals[i + 1]:
                # Warning only, not an error (advanced config possible)
                warnings.warn(
                    "Priority intervals are not in ascending order. "
                    "This is unusual but allowed for advanced configurations.",
                    UserWarning,
                    stacklevel=2,
                )
                break

        return self

    def get_redacted_database_url(self) -> str:
        """Get database URL with password redacted for safe logging."""
        return redact_url(self.database_url)

    def get_redacted_redis_url(self) -> str:
        """Get Redis URL with password redacted for safe logging."""
        return redact_url(self.redis_url)

    def get_redacted_api_key(self) -> str:
        """Get Riot API key redacted for safe logging."""
        return redact_api_key(self.riot_api_key)

    def __repr__(self) -> str:
        """Return a safe string representation that does not expose secrets."""
        return (
            f"Settings("
            f"database_url={self.get_redacted_database_url()!r}, "
            f"redis_url={self.get_redacted_redis_url()!r}, "
            f"riot_api_key={self.get_redacted_api_key()!r}, "
            f"debug={self.debug}, "
            f"log_level={self.log_level!r}, "
            f"use_priority_queue={self.use_priority_queue}"
            f")"
        )

    def __str__(self) -> str:
        """Return a safe string representation that does not expose secrets."""
        return self.__repr__()


settings = Settings()
