"""
Pro Worker Main Entry Point

Discovery-only sync architecture for pro esports data from GRID API:
- Discovery sync (~15min): series-first discovery of finished matches via get_all_series
- Only processes series that are fully finished (no live processing)
"""

import argparse
import asyncio
import signal
import structlog
from aiohttp import web
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from src.config import settings
from src.jobs.aggregate_champion_stats import AggregateChampionStatsJob
from src.jobs.sync_pro_data import SyncProDataJob
from src.services.database import DatabaseService
from src.services.grid_client import GridClient

logger = structlog.get_logger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description="Pro Worker - GRID esports data sync")
    parser.add_argument(
        "--tournaments",
        type=str,
        default=None,
        help="Comma-separated GRID tournament IDs to sync (one-shot mode). Example: --tournaments 12345,67890",
    )
    parser.add_argument(
        "--no-aggregate",
        action="store_true",
        help="Skip champion stats aggregation after sync",
    )
    return parser.parse_args()


class ProWorker:
    """Pro data synchronization worker with discovery-only sync."""

    def __init__(self):
        self.db = DatabaseService(settings.database_url)
        self.grid_client = GridClient()
        self.scheduler = AsyncIOScheduler()
        self.sync_job: SyncProDataJob | None = None
        self.aggregate_job: AggregateChampionStatsJob | None = None
        self._shutdown_event = asyncio.Event()
        self._running = False
        self._sync_lock = asyncio.Lock()
        self._web_runner: web.AppRunner | None = None

    async def setup(self) -> None:
        """Initialize connections and validate configuration."""
        logger.info("Setting up pro worker...")

        if not settings.has_grid_api():
            logger.error("GRID_API_KEY not configured.")
            raise ValueError("GRID_API_KEY is required")

        await self.db.connect_with_retry()
        logger.info("Database connected")

        await self.grid_client.connect()
        logger.info(
            "GRID client connected",
            api_key=settings.get_redacted_grid_api_key(),
            rate_limit=settings.grid_api_rate_limit,
        )

        self.aggregate_job = AggregateChampionStatsJob(self.db)
        self.sync_job = SyncProDataJob(self.db, self.grid_client)

        logger.info("Pro worker setup complete")

    async def start(self) -> None:
        """Start the worker with discovery-only sync."""
        logger.info(
            "Starting pro worker (discovery-only)",
            year=settings.pro_tournament_year,
            discovery_interval_minutes=settings.pro_discovery_interval_minutes,
            discovery_window_hours=settings.pro_discovery_window_hours,
        )

        self._running = True

        # Mark worker as running in DB
        try:
            await self.db.set_pro_worker_running(True)
        except Exception as e:
            logger.warning("Failed to set pro worker running status", error=str(e))

        # Start minimal health check server
        await self._start_health_server()

        # Run initial discovery before starting the scheduler
        logger.info("Running initial discovery sync...")
        await self._discovery_loop()

        # Schedule discovery loop only (no live poll — we only process finished series)
        self.scheduler.add_job(
            self._discovery_loop,
            trigger=IntervalTrigger(minutes=settings.pro_discovery_interval_minutes),
            id="discovery_sync",
            name="Discovery Sync",
            replace_existing=True,
        )
        self.scheduler.start()
        logger.info(
            "Scheduler started",
            discovery_interval=f"{settings.pro_discovery_interval_minutes}min",
        )

        # Wait for shutdown signal
        await self._shutdown_event.wait()

    async def _discovery_loop(self) -> None:
        """Discovery sync: find recent finished series via get_all_series."""
        if not self._running:
            return

        if self._sync_lock.locked():
            logger.warning("Sync in progress, deferring discovery")
            return

        async with self._sync_lock:
            try:
                await self.db.update_pro_worker_task("Discovery sync")
                stats = await self.sync_job.run_discovery()
                logger.info("Discovery sync completed", **stats)

                # Update session counters
                await self.db.increment_pro_worker_stats(
                    tournaments=stats.get("tournaments_processed", 0),
                    matches=stats.get("series_processed", 0),
                    games=stats.get("games_processed", 0),
                    errors=stats.get("errors", 0),
                )
            except Exception as e:
                logger.error("Discovery sync failed", error=str(e))
                try:
                    await self.db.set_pro_worker_error(str(e))
                    await self.db.increment_pro_worker_stats(errors=1)
                except Exception:
                    pass

        # Aggregate after releasing lock
        try:
            await self.db.update_pro_worker_task("Aggregating stats (discovery)")
            agg_stats = await self.aggregate_job.run(days_back=1)
            logger.info("Discovery aggregation completed", **agg_stats)
        except Exception as e:
            logger.error("Aggregation failed", error=str(e))
            try:
                await self.db.set_pro_worker_error(str(e))
                await self.db.increment_pro_worker_stats(errors=1)
            except Exception:
                pass

        # Mark idle
        try:
            await self.db.update_pro_worker_task(None)
        except Exception:
            pass

    async def _start_health_server(self) -> None:
        """Start a minimal HTTP server with only a health endpoint."""
        app = web.Application()
        app.router.add_get("/api/health", self._handle_health)

        self._web_runner = web.AppRunner(app)
        await self._web_runner.setup()
        site = web.TCPSite(self._web_runner, settings.pro_api_host, settings.pro_api_port)
        await site.start()

        logger.info(
            "Health check server started",
            host=settings.pro_api_host,
            port=settings.pro_api_port,
        )

    async def _handle_health(self, request: web.Request) -> web.Response:
        """GET /api/health - Simple health check."""
        return web.json_response({"status": "ok", "running": self._running})

    async def run_once(
        self,
        tournament_ids: list[str],
        aggregate: bool = True,
    ) -> None:
        """Run a one-shot sync for specific tournaments, then exit."""
        logger.info("Running one-shot sync", tournament_ids=tournament_ids)

        stats = await self.sync_job.run(tournament_ids=tournament_ids)
        logger.info("One-shot sync completed", **stats)

        if aggregate:
            logger.info("Running champion stats aggregation...")
            agg_stats = await self.aggregate_job.run(days_back=7)
            logger.info("Aggregation completed", **agg_stats)

    async def shutdown(self, update_db: bool = True) -> None:
        """Graceful shutdown (idempotent)."""
        if not self._running and self._shutdown_event.is_set():
            return
        logger.info("Shutting down pro worker...")
        self._running = False

        # Mark worker as stopped in DB (skip for one-shot mode)
        if update_db:
            try:
                await self.db.set_pro_worker_running(False)
            except Exception as e:
                logger.warning("Failed to set pro worker stopped status", error=str(e))

        if self._web_runner:
            await self._web_runner.cleanup()

        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)

        await self.grid_client.close()
        await self.db.disconnect()

        self._shutdown_event.set()
        logger.info("Pro worker shutdown complete")


async def main():
    """Main entry point."""
    args = parse_args()

    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
            if not settings.debug
            else structlog.dev.ConsoleRenderer(colors=True),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Parse tournament IDs if provided
    tournament_ids: list[str] | None = None
    if args.tournaments:
        tournament_ids = [t.strip() for t in args.tournaments.split(",") if t.strip()]

    logger.info(
        "Pro Worker starting",
        mode="one-shot" if tournament_ids else "scheduler",
        debug=settings.debug,
        log_level=settings.log_level,
        database_url=settings.get_redacted_database_url(),
        grid_api_key=settings.get_redacted_grid_api_key(),
        tournament_ids=tournament_ids,
    )

    worker = ProWorker()

    if tournament_ids:
        # One-shot mode: sync specific tournaments then exit
        try:
            await worker.setup()
            await worker.run_once(
                tournament_ids=tournament_ids,
                aggregate=not args.no_aggregate,
            )
        except Exception as e:
            logger.error("One-shot sync failed", error=str(e))
            raise
        finally:
            await worker.shutdown(update_db=False)
    else:
        # Scheduler mode: run continuously
        shutdown_event = asyncio.Event()

        def signal_handler():
            logger.info("Received shutdown signal")
            shutdown_event.set()

        loop = asyncio.get_event_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            try:
                loop.add_signal_handler(sig, signal_handler)
            except NotImplementedError:
                signal.signal(sig, lambda s, f: signal_handler())

        async def wait_for_shutdown():
            await shutdown_event.wait()
            await worker.shutdown()

        try:
            await worker.setup()
            shutdown_task = asyncio.create_task(wait_for_shutdown())
            await worker.start()
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received")
        except Exception as e:
            logger.error("Worker failed", error=str(e))
            raise
        finally:
            await worker.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
