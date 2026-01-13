#!/usr/bin/env python3
"""
Sync Champions from DDragon
Run this script to download champion data and images manually.

Usage:
    python scripts/sync-champions.py
"""

import asyncio
import sys
from pathlib import Path

# Add worker to path
sys.path.insert(0, str(Path(__file__).parent.parent / "worker"))

from src.jobs.sync_champions import SyncChampionsJob


async def main():
    print("Syncing champions from DDragon...")
    job = SyncChampionsJob()
    try:
        await job.run()
        print("Done!")
    finally:
        await job.close()


if __name__ == "__main__":
    asyncio.run(main())
