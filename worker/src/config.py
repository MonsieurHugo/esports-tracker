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

    # GRID API Configuration
    grid_api_key: str = ""
    grid_api_rate_limit: int = 3  # requests per second
    grid_central_graphql_url: str = "https://api.grid.gg/central-data/graphql"
    grid_live_data_graphql_url: str = "https://api.grid.gg/live-data-feed/series-state/graphql"
    grid_file_download_url: str = "https://api.grid.gg/file-download"
    grid_use_graphql: bool = True  # Use GraphQL API (recommended)

    # Pro Worker Settings
    pro_tournament_year: int = 2026
    pro_max_concurrent_games: int = 2
    pro_sync_interval_minutes: int = 5  # Sync tournaments every 5 minutes
    pro_api_port: int = 8000  # HTTP API port for pro worker
    pro_api_host: str = "0.0.0.0"  # HTTP API host
    # Leaguepedia sync settings
    leaguepedia_username: str = ""
    leaguepedia_password: str = ""
    leaguepedia_max_year: int = 2025

    @model_validator(mode='after')
    def validate_required_secrets(self) -> 'Settings':
        """Validate that required secrets are provided."""
        if not self.database_url:
            raise ValueError(
                "DATABASE_URL environment variable is required. "
                "Example: postgresql://user:password@localhost:5432/dbname"
            )
        return self

    def has_riot_api(self) -> bool:
        """Check if Riot API key is configured."""
        return bool(self.riot_api_key)

    def has_grid_api(self) -> bool:
        """Check if GRID API key is configured."""
        return bool(self.grid_api_key)

    def get_redacted_grid_api_key(self) -> str:
        """Get GRID API key redacted for safe logging."""
        return redact_api_key(self.grid_api_key)

    @model_validator(mode='after')
    def validate_priority_config(self) -> 'Settings':
        """Validate all priority queue tier thresholds and intervals."""
        # Validate tier thresholds: must be 0 < moderate < active < very_active <= 100
        tiers = [
            ('very_active', self.priority_tier_very_active),
            ('active', self.priority_tier_active),
            ('moderate', self.priority_tier_moderate),
        ]
        for name, val in tiers:
            if val > 100:
                raise ValueError(f"priority_tier_{name} ({val}) cannot exceed 100")
        if self.priority_tier_moderate <= 0:
            raise ValueError(f"priority_tier_moderate ({self.priority_tier_moderate}) must be greater than 0")
        for i in range(len(tiers) - 1):
            cur_name, cur_val = tiers[i]
            nxt_name, nxt_val = tiers[i + 1]
            if cur_val <= nxt_val:
                raise ValueError(
                    f"Priority tier '{cur_name}' ({cur_val}) must be greater than '{nxt_name}' ({nxt_val})"
                )

        # Validate intervals: base must be positive and <= max
        interval_pairs = [
            ('very_active', self.priority_interval_very_active, self.priority_max_interval_very_active),
            ('active', self.priority_interval_active, self.priority_max_interval_active),
            ('moderate', self.priority_interval_moderate, self.priority_max_interval_moderate),
            ('inactive', self.priority_interval_inactive, self.priority_max_interval_inactive),
        ]
        for tier_name, base, max_val in interval_pairs:
            if base <= 0:
                raise ValueError(f"priority_interval_{tier_name} must be positive, got {base}")
            if base > max_val:
                raise ValueError(
                    f"priority_interval_{tier_name} ({base} min) cannot exceed "
                    f"priority_max_interval_{tier_name} ({max_val} min)"
                )

        # Warn if intervals are not in ascending order (unusual but allowed)
        intervals = [self.priority_interval_very_active, self.priority_interval_active,
                     self.priority_interval_moderate, self.priority_interval_inactive]
        for i in range(len(intervals) - 1):
            if intervals[i] > intervals[i + 1]:
                warnings.warn(
                    "Priority intervals are not in ascending order. "
                    "This is unusual but allowed for advanced configurations.",
                    UserWarning, stacklevel=2,
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
