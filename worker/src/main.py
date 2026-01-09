"""
Esports Tracker - Worker
Python async worker for Riot Games API data fetching
"""

import asyncio
import signal
import sys
from contextlib import asynccontextmanager

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from src.config import settings
from src.services.riot_api import RiotAPIService
from src.services.database import DatabaseService
from src.jobs.fetch_players import FetchPlayersJob
from src.jobs.fetch_matches import FetchMatchesJob

# Configure logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.dev.ConsoleRenderer() if settings.debug else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger(__name__)


class Worker:
    """Main worker class that orchestrates all background jobs."""

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.db: DatabaseService | None = None
        self.riot_api: RiotAPIService | None = None
        self.running = False

    async def setup(self):
        """Initialize services and connections."""
        logger.info("Initializing worker services...")

        # Initialize database connection
        self.db = DatabaseService(settings.database_url)
        await self.db.connect()
        logger.info("Database connected")

        # Initialize Riot API client
        self.riot_api = RiotAPIService(settings.riot_api_key)
        logger.info("Riot API client initialized")

        # Register jobs
        self._register_jobs()
        logger.info("Jobs registered")

    def _register_jobs(self):
        """Register all scheduled jobs."""
        # Fetch player stats every 5 minutes
        fetch_players_job = FetchPlayersJob(self.db, self.riot_api)
        self.scheduler.add_job(
            fetch_players_job.run,
            trigger=IntervalTrigger(minutes=5),
            id="fetch_players",
            name="Fetch Player Stats",
            replace_existing=True,
        )

        # Fetch match history every 10 minutes
        fetch_matches_job = FetchMatchesJob(self.db, self.riot_api)
        self.scheduler.add_job(
            fetch_matches_job.run,
            trigger=IntervalTrigger(minutes=10),
            id="fetch_matches",
            name="Fetch Match History",
            replace_existing=True,
        )

    async def start(self):
        """Start the worker."""
        await self.setup()
        self.scheduler.start()
        self.running = True
        logger.info("Worker started", jobs=len(self.scheduler.get_jobs()))

        # Keep running until shutdown
        while self.running:
            await asyncio.sleep(1)

    async def shutdown(self):
        """Gracefully shutdown the worker."""
        logger.info("Shutting down worker...")
        self.running = False

        # Shutdown scheduler
        self.scheduler.shutdown(wait=True)

        # Close database connection
        if self.db:
            await self.db.disconnect()

        logger.info("Worker shutdown complete")


async def main():
    """Main entry point."""
    worker = Worker()

    # Setup signal handlers
    loop = asyncio.get_running_loop()

    def signal_handler():
        logger.info("Received shutdown signal")
        asyncio.create_task(worker.shutdown())

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)

    try:
        await worker.start()
    except Exception as e:
        logger.exception("Worker error", error=str(e))
        await worker.shutdown()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
