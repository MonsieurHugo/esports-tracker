"""
Esports Tracker - Worker
Python async worker for Riot Games API data fetching
"""

import asyncio
import logging
import signal
import sys

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from src.config import settings
from src.services.database import DatabaseService
from src.jobs.fetch_matches import FetchMatchesJob
from src.jobs.sync_champions import SyncChampionsJob

# Configure standard logging
logging.basicConfig(
    format="%(message)s",
    stream=sys.stdout,
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
)

# Configure structlog
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
        self.fetch_matches_job: FetchMatchesJob | None = None
        self.fetch_matches_task: asyncio.Task | None = None
        self.running = False

    async def setup(self):
        """Initialize services and connections."""
        logger.info("Initializing worker services...")

        # Initialize database connection
        self.db = DatabaseService(settings.database_url)
        await self.db.connect()
        logger.info("Database connected")

        # Sync champions at startup
        await self._sync_champions()

        # Initialize jobs
        self._setup_jobs()
        logger.info("Jobs initialized")

    async def _sync_champions(self):
        """Sync champion data from DDragon at startup."""
        try:
            sync_job = SyncChampionsJob()
            await sync_job.run()
            await sync_job.close()
        except Exception as e:
            logger.warning("Champion sync failed at startup", error=str(e))

    def _setup_jobs(self):
        """Setup all jobs."""
        # Fetch matches job (continuous, runs as background task)
        # Note: Rank is fetched directly in fetch_matches when new matches are found
        self.fetch_matches_job = FetchMatchesJob(self.db, settings.riot_api_key)

    async def start(self):
        """Start the worker."""
        await self.setup()

        # Mark worker as running in database
        await self.db.set_worker_running(True)
        await self.db.log_worker_activity(
            log_type="info",
            severity="info",
            message="Worker démarré"
        )

        # Start the scheduler for periodic jobs
        self.scheduler.start()

        # Start the continuous fetch matches job as a background task
        self.fetch_matches_task = asyncio.create_task(
            self.fetch_matches_job.run(),
            name="fetch_matches",
        )

        self.running = True
        logger.info(
            "Worker started",
            scheduled_jobs=len(self.scheduler.get_jobs()),
            background_tasks=1,
        )

        # Keep running until shutdown
        while self.running:
            await asyncio.sleep(1)

    async def shutdown(self):
        """Gracefully shutdown the worker."""
        logger.info("Shutting down worker...")
        self.running = False

        # Stop the fetch matches job
        if self.fetch_matches_job:
            await self.fetch_matches_job.stop()

        # Cancel and wait for the background task
        if self.fetch_matches_task:
            self.fetch_matches_task.cancel()
            try:
                await self.fetch_matches_task
            except asyncio.CancelledError:
                pass

        # Shutdown scheduler
        self.scheduler.shutdown(wait=True)

        # Mark worker as stopped in database
        if self.db:
            try:
                await self.db.set_worker_running(False)
                await self.db.log_worker_activity(
                    log_type="info",
                    severity="info",
                    message="Worker arrêté"
                )
            except Exception as e:
                logger.warning("Failed to update worker status on shutdown", error=str(e))
            await self.db.disconnect()

        logger.info("Worker shutdown complete")


async def main():
    """Main entry point."""
    worker = Worker()
    shutdown_event = asyncio.Event()

    # Setup signal handlers (platform-specific)
    def signal_handler():
        logger.info("Received shutdown signal")
        shutdown_event.set()

    if sys.platform != 'win32':
        # Unix signal handling
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, signal_handler)
    else:
        # Windows signal handling via Ctrl+C
        import signal as sig_module
        sig_module.signal(sig_module.SIGINT, lambda s, f: signal_handler())

    # Task to handle graceful shutdown
    async def wait_for_shutdown():
        await shutdown_event.wait()
        await worker.shutdown()

    shutdown_task = asyncio.create_task(wait_for_shutdown())

    try:
        await worker.start()
    except Exception as e:
        logger.exception("Worker error", error=str(e))
        shutdown_event.set()
        await shutdown_task
        sys.exit(1)
    finally:
        shutdown_task.cancel()


if __name__ == "__main__":
    asyncio.run(main())
