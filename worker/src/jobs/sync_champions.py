"""
Sync Champions from DDragon
Downloads champion data and images from Riot's Data Dragon CDN
"""

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)

# Path to store champion images (relative to project root)
CHAMPIONS_DIR = Path(__file__).parent.parent.parent.parent / "frontend" / "public" / "images" / "champions"
CHAMPIONS_JSON = Path(__file__).parent.parent.parent.parent / "frontend" / "src" / "lib" / "champions.json"

DDRAGON_BASE = "https://ddragon.leagueoflegends.com"


class SyncChampionsJob:
    """Job to sync champion data and images from DDragon."""

    def __init__(self):
        self._client: httpx.AsyncClient | None = None
        self._current_version: str | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=60.0)
        return self._client

    async def get_latest_version(self) -> str:
        """Get the latest DDragon version."""
        client = await self._get_client()
        response = await client.get(f"{DDRAGON_BASE}/api/versions.json")
        response.raise_for_status()
        versions = response.json()
        return versions[0]  # First version is the latest

    async def get_champion_data(self, version: str) -> dict[str, Any]:
        """Get champion data from DDragon."""
        client = await self._get_client()
        url = f"{DDRAGON_BASE}/cdn/{version}/data/en_US/champion.json"
        response = await client.get(url)
        response.raise_for_status()
        return response.json()

    async def download_champion_image(self, version: str, champion_key: str) -> bool:
        """Download a single champion image."""
        client = await self._get_client()
        url = f"{DDRAGON_BASE}/cdn/{version}/img/champion/{champion_key}.png"

        try:
            response = await client.get(url)
            response.raise_for_status()

            # Save image
            image_path = CHAMPIONS_DIR / f"{champion_key}.png"
            image_path.write_bytes(response.content)
            return True

        except Exception as e:
            logger.warning("Failed to download champion image", champion=champion_key, error=str(e))
            return False

    async def run(self):
        """Run the champion sync job."""
        logger.info("Starting champion sync job")

        try:
            # Get latest version
            version = await self.get_latest_version()
            logger.info("DDragon version", version=version)

            # Check if we need to update
            version_file = CHAMPIONS_DIR / ".version"
            current_version = version_file.read_text().strip() if version_file.exists() else None

            if current_version == version:
                logger.info("Champions already up to date", version=version)
                return

            # Get champion data
            data = await self.get_champion_data(version)
            champions = data["data"]
            logger.info("Found champions", count=len(champions))

            # Ensure directory exists
            CHAMPIONS_DIR.mkdir(parents=True, exist_ok=True)

            # Build champion mapping (ID -> data)
            champion_map = {}
            for champ_key, champ_data in champions.items():
                champion_id = int(champ_data["key"])
                champion_map[champion_id] = {
                    "id": champion_id,
                    "name": champ_data["name"],
                    "key": champ_key,  # DDragon key for images
                }

            # Save champion JSON for frontend
            CHAMPIONS_JSON.parent.mkdir(parents=True, exist_ok=True)
            with open(CHAMPIONS_JSON, "w", encoding="utf-8") as f:
                json.dump({
                    "version": version,
                    "champions": champion_map,
                }, f, indent=2, ensure_ascii=False)
            logger.info("Saved champions.json", path=str(CHAMPIONS_JSON))

            # Download images concurrently (with limit)
            semaphore = asyncio.Semaphore(10)  # Max 10 concurrent downloads

            async def download_with_limit(champ_key: str):
                async with semaphore:
                    return await self.download_champion_image(version, champ_key)

            tasks = [download_with_limit(key) for key in champions.keys()]
            results = await asyncio.gather(*tasks)

            success_count = sum(1 for r in results if r)
            logger.info("Downloaded champion images", success=success_count, total=len(champions))

            # Save version file
            version_file.write_text(version)
            logger.info("Champion sync complete", version=version)

        except Exception as e:
            logger.exception("Champion sync failed", error=str(e))
            raise

    async def close(self):
        """Close HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None


async def main():
    """Run sync manually."""
    job = SyncChampionsJob()
    try:
        await job.run()
    finally:
        await job.close()


if __name__ == "__main__":
    asyncio.run(main())
