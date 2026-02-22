"""
Champion Name ↔ ID Mapping

Shared module for resolving champion names to Riot IDs and vice versa.
Sources: frontend/src/lib/champions.json (local) or DDragon (HTTP fallback).
"""

import json
import os

import httpx
import structlog

logger = structlog.get_logger(__name__)

_champion_name_to_id: dict[str, int] = {}
_champion_id_to_name: dict[int, str] = {}


def load_champion_mapping() -> None:
    """Load champion name↔id mapping from local JSON or DDragon."""
    global _champion_name_to_id, _champion_id_to_name

    # Try local file first (frontend/src/lib/champions.json)
    local_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "frontend", "src", "lib", "champions.json",
    )

    data = None
    if os.path.exists(local_path):
        with open(local_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        logger.info("Loaded champion mapping from local file", count=len(data.get("champions", {})))
    else:
        # Fetch from DDragon (get latest version first)
        try:
            versions_resp = httpx.get(
                "https://ddragon.leagueoflegends.com/api/versions.json",
                timeout=15,
            )
            versions_resp.raise_for_status()
            latest_version = versions_resp.json()[0]
            logger.info("Using DDragon version", version=latest_version)

            resp = httpx.get(
                f"https://ddragon.leagueoflegends.com/cdn/{latest_version}/data/en_US/champion.json",
                timeout=30,
            )
            resp.raise_for_status()
            ddragon = resp.json()
            # Build same format as local file
            data = {"champions": {}}
            for champ_data in ddragon.get("data", {}).values():
                cid = int(champ_data["key"])
                data["champions"][str(cid)] = {
                    "id": cid,
                    "name": champ_data["name"],
                    "key": champ_data["id"],
                }
            logger.info("Loaded champion mapping from DDragon", count=len(data["champions"]))
        except Exception as e:
            raise RuntimeError(
                f"Failed to load champion mapping from both local file and DDragon: {e}"
            ) from e

    if data:
        for cid_str, champ in data.get("champions", {}).items():
            cid = int(cid_str)
            name = champ["name"]
            _champion_name_to_id[name.lower()] = cid
            _champion_id_to_name[cid] = name
            # Also index by DDragon key (e.g. "MonkeyKing" for "Wukong")
            if "key" in champ and champ["key"].lower() != name.lower():
                _champion_name_to_id[champ["key"].lower()] = cid

    # Common name variants / aliases (map alternate name → DDragon key already indexed)
    aliases = {
        "wukong": "monkeyking",
        "renata glasc": "renata",
        "nunu & willump": "nunu",
    }
    for alias, canonical in aliases.items():
        if canonical.lower() in _champion_name_to_id and alias.lower() not in _champion_name_to_id:
            _champion_name_to_id[alias.lower()] = _champion_name_to_id[canonical.lower()]

    logger.info("Champion mapping ready", names=len(_champion_name_to_id), ids=len(_champion_id_to_name))


def get_champion_id(name: str | None) -> int | None:
    """Get champion ID from name, returns None if not found."""
    if not name:
        return None
    return _champion_name_to_id.get(name.lower())


def get_champion_name(champion_id: int | None) -> str | None:
    """Get champion name from ID, returns None if not found."""
    if champion_id is None or champion_id == 0:
        return None
    return _champion_id_to_name.get(champion_id)


def is_loaded() -> bool:
    """Check if the champion mapping has been loaded."""
    return len(_champion_name_to_id) > 0
