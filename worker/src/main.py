"""
Esports Tracker - SoloQ Worker
Python async worker for Riot Games API data fetching (SoloQ matches)
"""

import asyncio
import signal
import sys

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from src.config import settings
from src.logging_config import setup_logging
from src.services.database import DatabaseService
from src.jobs.fetch_matches import FetchMatchesJob
from src.jobs.fetch_matches_v2 import FetchMatchesJobV2
from src.jobs.sync_champions import SyncChampionsJob
from src.jobs.validate_accounts import ValidateAccountsJob
from src.services.account_selector import AccountSelectorConfig

logger = setup_logging("worker.soloq")


class SoloQWorker:
    """Worker for SoloQ data fetching via Riot Games API."""

    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.db: DatabaseService | None = None
        self.fetch_matches_job: FetchMatchesJob | FetchMatchesJobV2 | None = None
        self.validate_accounts_job: ValidateAccountsJob | None = None
        self.fetch_matches_task: asyncio.Task | None = None
        self.running = False
        self.use_priority_queue = settings.use_priority_queue

    async def setup(self):
        """Initialize services and connections."""
        logger.info("Initializing SoloQ worker services...")

        # Validate Riot API key
        if not settings.has_riot_api():
            logger.error("RIOT_API_KEY is not configured. Set it in worker/.env")
            raise ValueError("RIOT_API_KEY environment variable is required for SoloQ worker")

        # Initialize database connection
        self.db = DatabaseService(settings.database_url)
        await self.db.connect()
        logger.info("Database connected")

        # Sync champions at startup
        await self._sync_champions()

        # Initialize jobs
        await self._setup_jobs()
        logger.info("Jobs initialized")

    async def _sync_champions(self):
        """Sync champion data from DDragon at startup."""
        try:
            sync_job = SyncChampionsJob()
            await sync_job.run()
            await sync_job.close()
        except Exception as e:
            logger.warning("Champion sync failed at startup", error=str(e))

    async def _setup_jobs(self):
        """Setup SoloQ jobs."""
        account_selector = None

        if self.use_priority_queue:
            # V2: Priority-based scheduling
            config = AccountSelectorConfig(
                interval_very_active=settings.priority_interval_very_active,
                interval_active=settings.priority_interval_active,
                interval_moderate=settings.priority_interval_moderate,
                interval_inactive=settings.priority_interval_inactive,
                max_interval_very_active=settings.priority_max_interval_very_active,
                max_interval_active=settings.priority_max_interval_active,
                max_interval_moderate=settings.priority_max_interval_moderate,
                max_interval_inactive=settings.priority_max_interval_inactive,
                batch_size=settings.priority_batch_size,
            )
            self.fetch_matches_job = FetchMatchesJobV2(
                self.db, settings.riot_api_key, config
            )
            # Initialize the selector early so it can be shared with validate job
            await self.fetch_matches_job.initialize()
            account_selector = self.fetch_matches_job.selector
            logger.info("Using priority-based fetch matches job (V2)")
        else:
            # V1: Legacy uniform polling
            self.fetch_matches_job = FetchMatchesJob(self.db, settings.riot_api_key)
            logger.info("Using legacy fetch matches job (V1)")

        # Validate accounts job (scheduled, runs every 5 minutes)
        # Pass the account selector so newly validated accounts are added to the queue
        self.validate_accounts_job = ValidateAccountsJob(
            self.db, settings.riot_api_key, account_selector
        )
        self.scheduler.add_job(
            self._run_validate_accounts,
            "interval",
            minutes=5,
            id="validate_accounts",
            name="Validate accounts without PUUID",
        )
        logger.info("Scheduled validate accounts job (every 5 minutes)")

    async def _run_validate_accounts(self):
        """Wrapper to run validate accounts job from scheduler."""
        if self.validate_accounts_job:
            await self.validate_accounts_job.run()

    async def start(self):
        """Start the worker."""
        await self.setup()

        # Mark worker as running in database
        await self.db.set_worker_running(True)
        await self.db.log_worker_activity(
            log_type="info",
            severity="info",
            message="Worker SoloQ démarré"
        )

        # Start the scheduler for periodic jobs
        self.scheduler.start()

        # Run validate accounts job once at startup
        await self._run_validate_accounts()

        # Start the continuous fetch matches job as a background task
        self.fetch_matches_task = asyncio.create_task(
            self.fetch_matches_job.run(),
            name="fetch_matches",
        )

        self.running = True
        logger.info(
            "SoloQ Worker started",
            scheduled_jobs=len(self.scheduler.get_jobs()),
            background_tasks=1,
        )

        # Keep running until shutdown
        while self.running:
            await asyncio.sleep(1)

    async def _safe_shutdown_step(self, name: str, coro, timeout: float = 5.0):
        """Execute a shutdown step safely, logging warnings on failure."""
        try:
            await asyncio.wait_for(coro, timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning(f"Timeout: {name}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"Error during {name}", error=str(e))

    async def shutdown(self):
        """Graceful shutdown with proper error handling."""
        logger.info("Starting graceful shutdown...")
        self.running = False

        if self.fetch_matches_job:
            await self._safe_shutdown_step("stop fetch matches job", self.fetch_matches_job.stop())

        if self.fetch_matches_task:
            self.fetch_matches_task.cancel()
            await self._safe_shutdown_step("cancel fetch matches task", self.fetch_matches_task, timeout=10.0)

        try:
            self.scheduler.shutdown(wait=True)
        except Exception as e:
            logger.warning("Error shutting down scheduler", error=str(e))

        if self.db:
            await self._safe_shutdown_step("update worker status", self.db.set_worker_running(False))
            await self._safe_shutdown_step(
                "log worker stop",
                self.db.log_worker_activity(log_type="info", severity="info", message="Worker SoloQ arrêté"),
            )
            try:
                await asyncio.wait_for(self.db.disconnect(), timeout=10.0)
            except asyncio.TimeoutError:
                logger.warning("Timeout disconnecting database, forcing pool termination")
                await self.db.force_terminate()
            except Exception as e:
                logger.warning("Failed to disconnect database", error=str(e))

        logger.info("Shutdown completed")


async def main():
    """Main entry point."""
    worker = SoloQWorker()
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
    except ValueError as e:
        # Configuration error (e.g., missing RIOT_API_KEY)
        logger.error(str(e))
        sys.exit(1)
    except Exception as e:
        logger.exception("Worker error", error=str(e))
        shutdown_event.set()
        await shutdown_task
        sys.exit(1)
    finally:
        shutdown_task.cancel()


if __name__ == "__main__":
    asyncio.run(main())
