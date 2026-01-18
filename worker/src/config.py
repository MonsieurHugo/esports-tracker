"""
Worker Configuration
"""

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/esports_tracker"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Riot Games API
    riot_api_key: str = ""
    riot_api_base_url: str = "https://euw1.api.riotgames.com"
    riot_api_rate_limit: int = 100  # requests per 2 minutes

    # Application
    debug: bool = False
    log_level: str = "INFO"

    # Job intervals (in minutes) - V1 legacy
    fetch_players_interval: int = 5
    fetch_matches_interval: int = 10

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
        if not self.riot_api_key:
            raise ValueError(
                "RIOT_API_KEY environment variable is required. "
                "Get your API key from https://developer.riotgames.com/"
            )
        return self


settings = Settings()
