"""
Worker Configuration
"""

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

    # Job intervals (in minutes)
    fetch_players_interval: int = 5
    fetch_matches_interval: int = 10


settings = Settings()
