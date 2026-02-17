"""
GRID Events Parser

Parses GRID JSONL events to extract game data, player stats, draft actions, and events.

Data source: Events JSONL file (primary source for all data)
- game_info: patch, participants, runes
- game_end: duration, winner
- stats_update: player stats, team stats, items
- champ_select: draft picks and bans
- role_selected: accurate role assignments
- champion_kill: kill events
- champion_kill_special: first blood, multi-kills
- epic_monster_kill: dragons, barons, heralds, grubs
- building_destroyed: towers, inhibitors
- turret_plate_destroyed: plate last hitter and lane
- building_gold_grant: plate gold per player per lane
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class ProDraftAction:
    """Represents a draft pick or ban action."""

    action_order: int  # 1-20 for standard draft
    action_type: str  # 'ban' or 'pick'
    team_side: str  # 'blue' or 'red'
    champion_id: int
    champion_name: str | None = None
    role: str | None = None  # Only for picks
    player_name: str | None = None  # Only for picks


@dataclass
class ProPlayerStats:
    """Represents a player's stats for a game."""

    player_name: str
    player_external_id: str | None = None  # PUUID
    team_side: str = ""  # 'blue' or 'red'
    role: str | None = None
    champion_id: int = 0
    champion_name: str | None = None

    # Core stats
    kills: int = 0
    deaths: int = 0
    assists: int = 0
    cs: int = 0
    gold_earned: int = 0
    damage_dealt: int = 0
    damage_taken: int = 0
    first_blood: dict | None = None

    # Vision stats (JSONB)
    vision: dict[str, int] = field(default_factory=lambda: {
        "score": 0,
        "wards_placed": 0,
        "wards_destroyed": 0,
        "control_wards": 0,
    })

    # Early game stats at 15 min (JSONB)
    stats_at_15: dict[str, int | float] = field(default_factory=lambda: {
        "kills": 0,
        "deaths": 0,
        "assists": 0,
        "cs": 0,
        "gold": 0,
        "xp": 0,
        "damage": 0,
        "cs_diff": 0,
        "gold_diff": 0,
        "xp_diff": 0,
    })

    # Max diffs - best lead during the game (JSONB)
    max_diffs: dict[str, int] = field(default_factory=lambda: {
        "cs": 0,
        "gold": 0,
        "xp": 0,
    })

    # Multi-kills (JSONB)
    multi_kills: dict[str, int] = field(default_factory=lambda: {
        "double": 0,
        "triple": 0,
        "quadra": 0,
        "penta": 0,
    })

    # Solo stats - 1v1 situations (JSONB)
    solo_stats: dict[str, int] = field(default_factory=lambda: {
        "solo_kills": 0,
        "solo_deaths": 0,
        "iso_deaths": 0,
    })

    # Proximity data (seconds spent within 2000 units of each role, between 1-15 min)
    proximity: dict[str, int] = field(default_factory=dict)

    # Isolation (seconds with no teammate within 2000 units, between 1-15 min)
    isolation: int = 0

    # Items and runes (JSON)
    items: list[int] = field(default_factory=list)
    runes: dict[str, Any] = field(default_factory=dict)

    # Timing data (per-minute stats, keys are minute numbers as strings)
    timing_data: dict[str, dict[str, int]] = field(default_factory=dict)

    # Quest completed at in seconds (for support items)
    quest_completed_at: int | None = None

    # Turret plates data (JSONB)
    plates: dict[str, Any] = field(default_factory=lambda: {
        "destroyed": 0,
        "gold": 0,
        "before_15": 0,
        "top": {"destroyed": 0, "gold": 0, "before_15": 0},
        "mid": {"destroyed": 0, "gold": 0, "before_15": 0},
        "bot": {"destroyed": 0, "gold": 0, "before_15": 0},
    })


@dataclass
class ProGameEvent:
    """Represents a game event (kill, objective, structure)."""

    event_type: str  # 'champion_kill', 'epic_monster_kill', 'building_destroyed', etc.
    game_time: int  # In milliseconds
    actor_player_name: str | None = None
    target_player_name: str | None = None
    position_x: int | None = None
    position_y: int | None = None
    event_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class ProGameInfo:
    """Represents parsed game information."""

    game_number: int
    duration: int | None = None  # In seconds
    patch: str | None = None
    winner_team_side: str | None = None  # 'blue' or 'red'
    team1_side: str | None = None  # 'blue' or 'red' - side of series team1 in this game
    started_at: str | None = None  # ISO timestamp
    ended_at: str | None = None  # ISO timestamp

    # Objectives
    blue_towers: int = 0
    red_towers: int = 0
    blue_dragons: int = 0
    red_dragons: int = 0
    blue_barons: int = 0
    red_barons: int = 0
    blue_heralds: int = 0
    red_heralds: int = 0
    blue_grubs: int = 0
    red_grubs: int = 0
    blue_inhibs: int = 0
    red_inhibs: int = 0

    # First objectives
    first_blood_team: str | None = None  # 'blue' or 'red'
    first_blood_time: int | None = None  # In seconds
    first_tower_team: str | None = None
    first_dragon_team: str | None = None
    first_baron_team: str | None = None
    first_herald_team: str | None = None
    first_grubs_team: str | None = None

    # Gold/kills at 15 min
    blue_gold_at_15: int | None = None
    red_gold_at_15: int | None = None
    blue_kills_at_15: int | None = None
    red_kills_at_15: int | None = None

    # Total kills per team
    blue_kills: int = 0
    red_kills: int = 0

    # Team plates
    blue_plates: int = 0
    red_plates: int = 0
    plates_detail: dict = field(default_factory=dict)

    # Objectives timeline (parsed from details file)
    objectives_timeline: dict = field(default_factory=dict)


@dataclass
class ParsedGameData:
    """Container for all parsed game data."""

    game: ProGameInfo
    player_stats: list[ProPlayerStats]
    draft_actions: list[ProDraftAction]
    game_events: list[ProGameEvent]
    participant_names_by_side: dict[str, list[str]] = field(default_factory=dict)
    # {"blue": ["LR Baus", "LR Nemesis", ...], "red": ["KC Canna", "KC Yike", ...]}


class EventsParser:
    """Parser for GRID JSONL events (primary data source)."""

    ROLE_MAP = {
        "top": "Top",
        "jungle": "Jungle",
        "middle": "Mid",
        "mid": "Mid",
        "bottom": "ADC",
        "adc": "ADC",
        "utility": "Support",
        "support": "Support",
    }

    # Riot team IDs
    BLUE_TEAM_ID = 100
    RED_TEAM_ID = 200

    # Details file mappings (Riot API format)
    DRAGON_SUBTYPE_MAP = {
        "AIR_DRAGON": "air",
        "FIRE_DRAGON": "fire",
        "WATER_DRAGON": "ocean",
        "EARTH_DRAGON": "mountain",
        "HEXTECH_DRAGON": "hextech",
        "CHEMTECH_DRAGON": "chemtech",
        "ELDER_DRAGON": "elder",
    }

    DETAILS_LANE_MAP = {
        "TOP_LANE": "top",
        "MID_LANE": "mid",
        "BOT_LANE": "bot",
    }

    TOWER_TIER_MAP = {
        "OUTER_TURRET": "outer",
        "INNER_TURRET": "inner",
        "BASE_TURRET": "base",
        "NEXUS_TURRET": "nexus",
    }

    def __init__(
        self,
        events: list[dict[str, Any]],
        summary: dict[str, Any] | None = None,
        details: dict[str, Any] | None = None,
    ):
        """
        Initialize parser.

        Args:
            events: List of event dictionaries from JSONL (primary source)
            summary: Summary data (unused, kept for API compatibility)
            details: Details data (unused, kept for API compatibility)
        """
        self.events = events
        # Summary/details kept for API compatibility but not used
        self._summary = summary
        self._details = details

        # Parsed data
        self._player_stats: dict[int, ProPlayerStats] = {}  # Keyed by participantID
        self._draft_actions: list[ProDraftAction] = []
        self._game_events: list[ProGameEvent] = []
        self._game_info = ProGameInfo(game_number=1)

        # Mappings from events
        self._participant_id_to_name: dict[int, str] = {}
        self._participant_id_to_raw_name: dict[int, str] = {}  # Raw name with team tag
        self._participant_id_to_puuid: dict[int, str] = {}
        self._participant_id_to_team: dict[int, int] = {}
        self._participant_id_to_champion: dict[int, tuple[int, str]] = {}  # (id, name)
        self._participant_id_to_role: dict[int, str] = {}

        # Track first objectives
        self._first_tower_taken = False
        self._first_dragon_taken = False
        self._first_baron_taken = False
        self._first_herald_taken = False
        self._first_grubs_taken = False

        # Track player positions for iso death calculation
        self._player_positions: dict[int, tuple[float, float]] = {}  # pid -> (x, y)
        # Track player death times for iso death calculation (to know who's alive)
        self._player_death_times: dict[int, int] = {}  # pid -> death time in ms

    def parse(self) -> ParsedGameData:
        """
        Parse JSONL events and return structured data.

        Returns:
            ParsedGameData with game info, player stats, drafts, and events
        """
        if not self.events:
            logger.warning("No events to parse")
            return ParsedGameData(
                game=self._game_info,
                player_stats=[],
                draft_actions=[],
                game_events=[],
            )

        # 1. First pass: extract metadata and build mappings
        self._extract_metadata()

        # 1b. Enrich champion IDs from summary (game_info only has names)
        self._enrich_champion_ids_from_summary()

        # 1c. Extract game timestamps from summary
        if self._summary:
            start_ts = self._summary.get("gameStartTimestamp")
            end_ts = self._summary.get("gameEndTimestamp")
            if start_ts:
                self._game_info.started_at = datetime.fromtimestamp(start_ts / 1000, tz=timezone.utc).isoformat()
            if end_ts:
                self._game_info.ended_at = datetime.fromtimestamp(end_ts / 1000, tz=timezone.utc).isoformat()

        # 2. Second pass: process all events
        self._process_events()

        # 3. Enrich player stats from summary (multi-kills, control wards, first blood victim)
        self._enrich_stats_from_summary()

        # 4. Calculate derived stats
        self._calculate_derived_stats()

        # 5. Parse details file for objectives timeline
        self._parse_details_file()

        # Convert player stats from dict to list
        player_stats_list = list(self._player_stats.values())

        # Build participant names by side for roster matching
        names_by_side: dict[str, list[str]] = {"blue": [], "red": []}
        for pid, raw_name in self._participant_id_to_raw_name.items():
            team_id = self._participant_id_to_team.get(pid)
            if team_id == self.BLUE_TEAM_ID:
                names_by_side["blue"].append(raw_name)
            elif team_id == self.RED_TEAM_ID:
                names_by_side["red"].append(raw_name)

        return ParsedGameData(
            game=self._game_info,
            player_stats=player_stats_list,
            draft_actions=self._draft_actions,
            game_events=self._game_events,
            participant_names_by_side=names_by_side,
        )

    def _extract_metadata(self) -> None:
        """Extract game metadata and participant info from game_info event."""
        for event in self.events:
            schema = event.get("rfc461Schema")

            if schema == "game_info":
                # Extract patch version
                self._game_info.patch = event.get("gameVersion")

                # Extract participant metadata
                for p in event.get("participants", []):
                    pid = p.get("participantID")
                    if pid is None:
                        continue

                    # Name – strip team tag prefix (e.g. "BKR Boda" -> "Boda")
                    riot_id = p.get("riotId", {})
                    raw_name = riot_id.get("displayName") or p.get("summonerName") or ""
                    self._participant_id_to_raw_name[pid] = raw_name
                    parts = raw_name.split(" ", 1)
                    name = parts[1] if len(parts) > 1 else raw_name
                    self._participant_id_to_name[pid] = name

                    # PUUID
                    puuid = p.get("puuid")
                    if puuid:
                        self._participant_id_to_puuid[pid] = puuid

                    # Team
                    team_id = p.get("teamID")
                    if team_id:
                        self._participant_id_to_team[pid] = team_id

                    # Champion
                    champion_name = p.get("championName")
                    # Champion ID not directly available in game_info, will get from stats
                    if champion_name:
                        self._participant_id_to_champion[pid] = (0, champion_name)

                    # Role
                    role = p.get("role")
                    if role:
                        self._participant_id_to_role[pid] = self.ROLE_MAP.get(role.lower(), role)

                    # Runes/Perks
                    perks = p.get("perks", [])
                    if perks and len(perks) > 0:
                        # Initialize player stats with runes
                        self._ensure_player_stats(pid)
                        self._player_stats[pid].runes = {
                            "perkStyle": perks[0].get("perkStyle"),
                            "perkSubStyle": perks[0].get("perkSubStyle"),
                            "perkIds": perks[0].get("perkIds", []),
                        }

                logger.debug(
                    "Extracted game_info metadata",
                    patch=self._game_info.patch,
                    participants=len(self._participant_id_to_name),
                )
                break  # Only one game_info event

    def _enrich_champion_ids_from_summary(self) -> None:
        """Enrich champion ID mapping using summary data.

        The game_info event only has championName, not championID.
        The summary file has both championId and participantId.
        """
        if not self._summary:
            return

        for p in self._summary.get("participants", []):
            pid = p.get("participantId")
            champion_id = p.get("championId")
            champion_name = p.get("championName")
            if pid is None or not champion_id:
                continue

            existing = self._participant_id_to_champion.get(pid)
            name = champion_name or (existing[1] if existing else None)
            self._participant_id_to_champion[pid] = (champion_id, name)

            # Update already-created player stats
            if pid in self._player_stats:
                self._player_stats[pid].champion_id = champion_id
                if name:
                    self._player_stats[pid].champion_name = name

    def _enrich_stats_from_summary(self) -> None:
        """Enrich player stats from summary data.

        The GRID events file doesn't always emit champion_kill_special events
        for multi-kills, and doesn't include control ward data.
        The summary file (Riot API format) has these fields reliably.
        """
        if not self._summary:
            return

        for p in self._summary.get("participants", []):
            pid = p.get("participantId")
            if pid is None or pid not in self._player_stats:
                continue

            stats = self._player_stats[pid]

            # Multi-kills: use summary as source of truth (events often missing)
            double = int(p.get("doubleKills", 0))
            triple = int(p.get("tripleKills", 0))
            quadra = int(p.get("quadraKills", 0))
            penta = int(p.get("pentaKills", 0))
            if double or triple or quadra or penta:
                stats.multi_kills = {
                    "double": double,
                    "triple": triple,
                    "quadra": quadra,
                    "penta": penta,
                }

            # Control wards: detectorWardsPlaced in summary
            control_wards = int(p.get("detectorWardsPlaced", 0) or 0)
            if control_wards:
                stats.vision["control_wards"] = control_wards

            # First blood victim: first CHAMPION_KILL victim in details timeline
            # is more reliable, but summary has firstBloodKill for the killer.
            # We handle victim separately below.

        # First blood victim: find from details file timeline
        self._enrich_first_blood_victim_from_details()

    def _enrich_first_blood_victim_from_details(self) -> None:
        """Find first blood victim from the details (timeline) file.

        The GRID events may not include victim in champion_kill_special,
        but the details file (Riot API timeline format) has CHAMPION_KILL
        events with victimId. Also extracts first blood timestamp.
        """
        if not self._details:
            return

        frames = self._details.get("frames", [])
        for frame in frames:
            for ev in frame.get("events", []):
                if ev.get("type") == "CHAMPION_KILL":
                    # Extract timestamp (ms -> seconds)
                    timestamp_ms = ev.get("timestamp", 0)
                    fb_time = timestamp_ms // 1000 if timestamp_ms else None

                    # Set game-level first_blood_time if not already set
                    if fb_time and self._game_info.first_blood_time is None:
                        self._game_info.first_blood_time = fb_time

                    victim_pid = ev.get("victimId")
                    if victim_pid and victim_pid in self._player_stats:
                        self._player_stats[victim_pid].first_blood = {
                            "participant": False, "victim": True, "assist": False, "time": fb_time,
                        }
                    return  # First kill = first blood, done

    def _ensure_player_stats(self, participant_id: int) -> ProPlayerStats:
        """Ensure player stats exist for a participant ID."""
        if participant_id not in self._player_stats:
            name = self._participant_id_to_name.get(participant_id, f"Player_{participant_id}")
            team_id = self._participant_id_to_team.get(participant_id, 0)
            team_side = "blue" if team_id == self.BLUE_TEAM_ID else "red"

            self._player_stats[participant_id] = ProPlayerStats(
                player_name=name,
                player_external_id=self._participant_id_to_puuid.get(participant_id),
                team_side=team_side,
                role=self._participant_id_to_role.get(participant_id),
            )

            # Set champion if known
            champion_info = self._participant_id_to_champion.get(participant_id)
            if champion_info:
                self._player_stats[participant_id].champion_id = champion_info[0]
                self._player_stats[participant_id].champion_name = champion_info[1]

        return self._player_stats[participant_id]

    def _process_events(self) -> None:
        """Process all events to extract data."""
        last_stats_update = None
        final_champ_select = None

        for event in self.events:
            schema = event.get("rfc461Schema")

            if schema == "role_selected":
                self._handle_role_selected(event)

            elif schema == "champ_select":
                if event.get("gameState") == "POST_CHAMP_SELECT":
                    final_champ_select = event

            elif schema == "stats_update":
                self._handle_stats_update(event)
                last_stats_update = event

            elif schema == "champion_kill":
                self._handle_champion_kill(event)

            elif schema == "champion_kill_special":
                self._handle_champion_kill_special(event)

            elif schema == "epic_monster_kill":
                self._handle_epic_monster_kill(event)

            elif schema == "building_destroyed":
                self._handle_building_destroyed(event)

            elif schema == "turret_plate_destroyed":
                self._handle_turret_plate_destroyed(event)

            elif schema == "building_gold_grant":
                self._handle_building_gold_grant(event)

            elif schema == "game_end":
                self._handle_game_end(event)

            elif schema == "role_bound_quest_completed":
                self._handle_quest_completed(event)

        # Process final stats from last stats_update
        if last_stats_update:
            self._process_final_stats(last_stats_update)

        # Determine which side (blue/red) team1 is on for this game
        if final_champ_select:
            self._determine_team1_side(final_champ_select)

        # Process draft from final champ_select
        if final_champ_select:
            self._process_draft(final_champ_select)

    def _handle_role_selected(self, event: dict) -> None:
        """Handle role_selected event for accurate role assignments."""
        participant_id = event.get("participantID")
        role = event.get("role")

        if participant_id is not None and role:
            normalized_role = self.ROLE_MAP.get(role.lower(), role)
            self._participant_id_to_role[participant_id] = normalized_role

            # Update player stats if already created
            if participant_id in self._player_stats:
                self._player_stats[participant_id].role = normalized_role

    def _handle_stats_update(self, event: dict) -> None:
        """Handle stats_update for per-minute storage and per-second max diff calculation."""
        game_time = event.get("gameTime", 0)
        second = game_time // 1000  # Convert ms to seconds
        minute = game_time // 60000  # Convert ms to minutes

        if second <= 0:
            return

        # Build participant data for this update (needed for max diff calculation)
        participant_data: dict[int, dict] = {}

        # Update participant timing data
        for p in event.get("participants", []):
            pid = p.get("participantID")
            if pid is None:
                continue

            stats = self._ensure_player_stats(pid)

            # Update champion info if available
            champion_name = p.get("championName")
            if champion_name and not stats.champion_name:
                stats.champion_name = champion_name

            # Update role if available
            role = p.get("role")
            if role and not stats.role:
                stats.role = self.ROLE_MAP.get(role.lower(), role)

            # Track player position for iso death calculation
            position = p.get("position", {})
            if position:
                x = position.get("x", 0)
                y = position.get("y") or position.get("z", 0)
                self._player_positions[pid] = (x, y)

            # Extract stats from stats array
            stats_dict = {s["name"]: s["value"] for s in p.get("stats", [])}
            cs = stats_dict.get("MINIONS_KILLED", 0) + stats_dict.get("NEUTRAL_MINIONS_KILLED", 0)
            gold = p.get("totalGold", 0) or sum(p.get("goldStats", {}).values())
            xp = p.get("XP", 0)

            # Store for max diff calculation (per second)
            participant_data[pid] = {
                "cs": cs,
                "gold": gold,
                "xp": xp,
                "role": stats.role,
                "team_side": stats.team_side,
            }

            # Store timing data per minute (only update once per minute)
            if str(minute) not in stats.timing_data:
                stats.timing_data[str(minute)] = {
                    "cs": cs,
                    "gold": gold,
                    "xp": xp,
                    "damage": stats_dict.get("TOTAL_DAMAGE_DEALT_TO_CHAMPIONS", 0),
                    "kills": stats_dict.get("CHAMPIONS_KILLED", 0),
                    "deaths": stats_dict.get("NUM_DEATHS", 0),
                    "assists": stats_dict.get("ASSISTS", 0),
                }

            # Capture 15-minute stats (exactly at 15:00 = 900 seconds)
            if second == 900 and stats.stats_at_15["gold"] == 0:
                stats.stats_at_15["cs"] = cs
                stats.stats_at_15["gold"] = gold
                stats.stats_at_15["xp"] = xp
                stats.stats_at_15["damage"] = stats_dict.get("TOTAL_DAMAGE_DEALT_TO_CHAMPIONS", 0)
                stats.stats_at_15["kills"] = stats_dict.get("CHAMPIONS_KILLED", 0)
                stats.stats_at_15["deaths"] = stats_dict.get("NUM_DEATHS", 0)
                stats.stats_at_15["assists"] = stats_dict.get("ASSISTS", 0)

        # Calculate max diffs per second (for accuracy)
        self._update_max_diffs(participant_data)

        # Calculate proximity between teammates (1-15 min only)
        if 60 <= second <= 900:
            self._update_proximity(second)

        # Team stats at 15 min (exactly at 15:00 = 900 seconds)
        if second == 900 and self._game_info.blue_gold_at_15 is None:
            for t in event.get("teams", []):
                team_id = t.get("teamID")
                total_gold = t.get("totalGold", 0)
                total_kills = t.get("championsKills", 0)

                if team_id == self.BLUE_TEAM_ID:
                    self._game_info.blue_gold_at_15 = total_gold
                    self._game_info.blue_kills_at_15 = total_kills
                else:
                    self._game_info.red_gold_at_15 = total_gold
                    self._game_info.red_kills_at_15 = total_kills

    def _process_final_stats(self, event: dict) -> None:
        """Extract final stats from the last stats_update event."""
        # Process team objectives
        for t in event.get("teams", []):
            team_id = t.get("teamID")
            side = "blue" if team_id == self.BLUE_TEAM_ID else "red"

            if side == "blue":
                self._game_info.blue_towers = t.get("towerKills", 0)
                self._game_info.blue_dragons = t.get("dragonKills", 0)
                self._game_info.blue_barons = t.get("baronKills", 0)
                self._game_info.blue_inhibs = t.get("inhibKills", 0)
                self._game_info.blue_kills = t.get("championsKills", 0)
            else:
                self._game_info.red_towers = t.get("towerKills", 0)
                self._game_info.red_dragons = t.get("dragonKills", 0)
                self._game_info.red_barons = t.get("baronKills", 0)
                self._game_info.red_inhibs = t.get("inhibKills", 0)
                self._game_info.red_kills = t.get("championsKills", 0)

        # Process player final stats
        for p in event.get("participants", []):
            pid = p.get("participantID")
            if pid is None:
                continue

            stats = self._ensure_player_stats(pid)

            # Extract from stats array
            stats_dict = {s["name"]: s["value"] for s in p.get("stats", [])}

            # Core stats
            stats.kills = int(stats_dict.get("CHAMPIONS_KILLED", 0))
            stats.deaths = int(stats_dict.get("NUM_DEATHS", 0))
            stats.assists = int(stats_dict.get("ASSISTS", 0))
            stats.cs = int(
                stats_dict.get("MINIONS_KILLED", 0) + stats_dict.get("NEUTRAL_MINIONS_KILLED", 0)
            )
            stats.damage_dealt = int(stats_dict.get("TOTAL_DAMAGE_DEALT_TO_CHAMPIONS", 0))
            stats.damage_taken = int(stats_dict.get("TOTAL_DAMAGE_TAKEN", 0))

            # Vision stats
            stats.vision["score"] = int(stats_dict.get("VISION_SCORE", 0))
            stats.vision["wards_placed"] = int(stats_dict.get("WARD_PLACED", 0))
            stats.vision["wards_destroyed"] = int(stats_dict.get("WARD_KILLED", 0))

            # Gold from totalGold (more accurate than sum of goldStats)
            stats.gold_earned = p.get("totalGold", 0) or sum(p.get("goldStats", {}).values())

            # Items
            items = []
            for item in p.get("items", []):
                item_id = item.get("itemID")
                if item_id and item_id > 0:
                    items.append(item_id)
            stats.items = items

            # Champion info
            champion_name = p.get("championName")
            if champion_name:
                stats.champion_name = champion_name

            # Role (ensure we have the correct one)
            role = p.get("role")
            if role:
                stats.role = self.ROLE_MAP.get(role.lower(), role)

            # Override with role_selected if available (more accurate)
            if pid in self._participant_id_to_role:
                stats.role = self._participant_id_to_role[pid]

            # Quest completion
            if p.get("roleBoundQuestComplete"):
                # Quest was completed, but we don't know exact time here
                # The exact time comes from role_bound_quest_completed event
                pass

    def _determine_team1_side(self, champ_select: dict) -> None:
        """Determine which side (blue/red) series team1 is on.

        In a Bo3/Bo5, teams swap sides between games. The GRID API returns
        teamOne/teamTwo in champ_select corresponding to the series order
        (not blue/red). We correlate a teamOne participant with their Riot
        team ID (100=blue, 200=red) to figure out which side team1 is on.
        """
        team_one_players = champ_select.get("teamOne", [])
        if not team_one_players:
            logger.warning("No teamOne players in champ_select, cannot determine team1_side")
            return

        # Take the first teamOne participant and find their Riot team ID
        first_player = team_one_players[0]
        display_name = first_player.get("displayName") or first_player.get("summonerName") or ""
        parts = display_name.split(" ", 1)
        player_name = parts[1] if len(parts) > 1 else display_name

        # Find this player's participant ID
        target_pid = None
        for pid, name in self._participant_id_to_name.items():
            if name == player_name:
                target_pid = pid
                break

        if target_pid is None:
            logger.warning(
                "Could not find teamOne player in participants",
                player_name=player_name,
            )
            return

        riot_team_id = self._participant_id_to_team.get(target_pid)
        if riot_team_id == self.BLUE_TEAM_ID:
            self._game_info.team1_side = "blue"
        elif riot_team_id == self.RED_TEAM_ID:
            self._game_info.team1_side = "red"
        else:
            logger.warning(
                "Unknown Riot team ID for teamOne player",
                player_name=player_name,
                riot_team_id=riot_team_id,
            )

        logger.debug(
            "Determined team1_side",
            team1_side=self._game_info.team1_side,
            player_name=player_name,
            riot_team_id=riot_team_id,
        )

    def _process_draft(self, event: dict) -> None:
        """Extract draft picks and bans from final champ_select event."""
        # Build name-to-stats lookup for correlating champ_select with game data
        name_to_stats: dict[str, ProPlayerStats] = {}
        for stats in self._player_stats.values():
            name_to_stats[stats.player_name] = stats

        # Extract bans - map Riot team ID to series team order using team1_side
        banned_champions = event.get("bannedChampions", [])
        for ban in banned_champions:
            champion_id = ban.get("championID", 0)
            pick_turn = ban.get("pickTurn", 0)
            team_id = ban.get("teamID")
            # Map Riot team ID (100/200) to series team order using team1_side
            if self._game_info.team1_side == "blue":
                team_order = "team1" if team_id == self.BLUE_TEAM_ID else "team2"
            elif self._game_info.team1_side == "red":
                team_order = "team1" if team_id == self.RED_TEAM_ID else "team2"
            else:
                # Fallback: assume team1=blue (old behavior)
                team_order = "team1" if team_id == self.BLUE_TEAM_ID else "team2"

            self._draft_actions.append(
                ProDraftAction(
                    action_order=pick_turn,
                    action_type="ban",
                    team_side=team_order,
                    champion_id=champion_id,
                )
            )

        # Extract picks from teamOne and teamTwo
        picks = []

        for p in event.get("teamOne", []):
            _raw = p.get("displayName") or p.get("summonerName") or ""
            _parts = _raw.split(" ", 1)
            _pname = _parts[1] if len(_parts) > 1 else _raw
            picks.append(
                {
                    "player_name": _pname,
                    "champion_id": p.get("championID", 0),
                    "pick_turn": p.get("pickTurn", 0),
                    "team_order": "team1",
                }
            )

        for p in event.get("teamTwo", []):
            _raw = p.get("displayName") or p.get("summonerName") or ""
            _parts = _raw.split(" ", 1)
            _pname = _parts[1] if len(_parts) > 1 else _raw
            picks.append(
                {
                    "player_name": _pname,
                    "champion_id": p.get("championID", 0),
                    "pick_turn": p.get("pickTurn", 0),
                    "team_order": "team2",
                }
            )

        # Sort by pick turn and add as draft actions
        picks.sort(key=lambda x: x["pick_turn"])

        for pick in picks:
            player_name = pick["player_name"]
            # Look up player stats by name to get role
            player_stats = name_to_stats.get(player_name)
            role = player_stats.role if player_stats else None

            self._draft_actions.append(
                ProDraftAction(
                    action_order=pick["pick_turn"],
                    action_type="pick",
                    team_side=pick["team_order"],
                    champion_id=pick["champion_id"],
                    role=role,
                    player_name=player_name,
                )
            )

    def _handle_champion_kill(self, event: dict) -> None:
        """Handle champion_kill event."""
        game_time = event.get("gameTime", 0)

        killer = event.get("killer")
        victim = event.get("victim")
        assistants = event.get("assistants", [])
        position = event.get("position", {})

        # Resolve participant IDs
        killer_pid = killer if isinstance(killer, int) else None
        victim_pid = victim if isinstance(victim, int) else None

        # Resolve names
        killer_name = self._resolve_participant_name(killer)
        victim_name = self._resolve_participant_name(victim)

        # Handle assistants
        assistant_names = []
        for a in assistants:
            name = self._resolve_participant_name(a)
            if name:
                assistant_names.append(name)

        # Track solo kills/deaths (no assists = 1v1)
        if len(assistants) == 0 and killer_pid is not None:
            # Solo kill for the killer
            if killer_pid in self._player_stats:
                self._player_stats[killer_pid].solo_stats["solo_kills"] += 1
            # Solo death for the victim
            if victim_pid is not None and victim_pid in self._player_stats:
                self._player_stats[victim_pid].solo_stats["solo_deaths"] += 1

        # Record death time for respawn tracking
        if victim_pid is not None:
            self._player_death_times[victim_pid] = game_time

        # Track iso deaths (no teammate within 2000 units)
        # But don't count if all teammates are dead (player was the last alive)
        if victim_pid is not None and victim_pid in self._player_stats:
            victim_stats = self._player_stats[victim_pid]
            victim_team = self._participant_id_to_team.get(victim_pid)
            kill_x = position.get("x", 0)
            kill_y = position.get("y") or position.get("z", 0)

            if victim_team and kill_x and kill_y:
                # Estimate respawn time (~40 seconds average)
                respawn_time_ms = 40000

                # Check distance to all alive teammates
                teammate_nearby = False
                alive_teammates = 0

                for pid, pos in self._player_positions.items():
                    # Skip the victim and enemies
                    if pid == victim_pid:
                        continue
                    if self._participant_id_to_team.get(pid) != victim_team:
                        continue

                    # Check if teammate is alive (not dead recently)
                    death_time = self._player_death_times.get(pid, 0)
                    if game_time - death_time < respawn_time_ms:
                        # Teammate is dead (died recently and hasn't respawned)
                        continue

                    alive_teammates += 1

                    # Calculate distance
                    dx = pos[0] - kill_x
                    dy = pos[1] - kill_y
                    distance = (dx * dx + dy * dy) ** 0.5

                    if distance <= 2000:
                        teammate_nearby = True
                        break

                # Only count as iso death if there were alive teammates but none nearby
                if alive_teammates > 0 and not teammate_nearby:
                    victim_stats.solo_stats["iso_deaths"] += 1

        # Track 2v2 botlane kills
        if self._is_2v2_botlane_kill(event):
            if killer_pid is not None and killer_pid in self._player_stats:
                ks = self._player_stats[killer_pid]
                ks.solo_stats["botlane_2v2_kills"] = ks.solo_stats.get("botlane_2v2_kills", 0) + 1
            if victim_pid is not None and victim_pid in self._player_stats:
                vs = self._player_stats[victim_pid]
                vs.solo_stats["botlane_2v2_deaths"] = vs.solo_stats.get("botlane_2v2_deaths", 0) + 1
            for a_pid in assistants:
                if a_pid in self._player_stats:
                    a_stats = self._player_stats[a_pid]
                    a_stats.solo_stats["botlane_2v2_assists"] = (
                        a_stats.solo_stats.get("botlane_2v2_assists", 0) + 1
                    )

        # Track jungle ganks (kills in lane zones involving a jungler, pre-15 min)
        if game_time <= 900_000:
            kill_x = position.get("x", 0)
            kill_y = position.get("y") or position.get("z", 0)
            lane_zone = self._get_lane_zone(kill_x, kill_y) if kill_x and kill_y else None

            if lane_zone:
                # Build participant sets with roles
                all_involved_pids = set()
                if killer_pid is not None:
                    all_involved_pids.add(killer_pid)
                if victim_pid is not None:
                    all_involved_pids.add(victim_pid)
                for a_pid in assistants:
                    if isinstance(a_pid, int):
                        all_involved_pids.add(a_pid)

                # Identify junglers among killer + assistants (kill side)
                kill_side_pids = set()
                if killer_pid is not None:
                    kill_side_pids.add(killer_pid)
                for a_pid in assistants:
                    if isinstance(a_pid, int):
                        kill_side_pids.add(a_pid)

                kill_side_junglers = [
                    pid for pid in kill_side_pids
                    if self._participant_id_to_role.get(pid) == "Jungle"
                ]

                # Victim's team jungler check
                victim_is_jungler = (
                    victim_pid is not None
                    and self._participant_id_to_role.get(victim_pid) == "Jungle"
                )

                if kill_side_junglers:
                    for jgl_pid in kill_side_junglers:
                        jgl_stats = self._player_stats.get(jgl_pid)
                        if jgl_stats:
                            key = f"jgl_ganks_{lane_zone}"
                            jgl_stats.solo_stats[key] = jgl_stats.solo_stats.get(key, 0) + 1

                    # Counter-gank: both teams' junglers involved (opposing teams)
                    if victim_is_jungler:
                        victim_team = self._participant_id_to_team.get(victim_pid)
                        for jgl_pid in kill_side_junglers:
                            jgl_team = self._participant_id_to_team.get(jgl_pid)
                            if jgl_team != victim_team:
                                jgl_stats = self._player_stats.get(jgl_pid)
                                if jgl_stats:
                                    jgl_stats.solo_stats["jgl_counter_ganks"] = (
                                        jgl_stats.solo_stats.get("jgl_counter_ganks", 0) + 1
                                    )

                    # Laner stats: victim ganked by enemy jungler
                    if victim_pid is not None and not victim_is_jungler:
                        victim_team = self._participant_id_to_team.get(victim_pid)
                        # Check that the jungler is from the opposing team
                        for jgl_pid in kill_side_junglers:
                            jgl_team = self._participant_id_to_team.get(jgl_pid)
                            if jgl_team != victim_team:
                                vs = self._player_stats.get(victim_pid)
                                if vs:
                                    vs.solo_stats["ganked_by_enemy_jgl"] = (
                                        vs.solo_stats.get("ganked_by_enemy_jgl", 0) + 1
                                    )
                                break

                    # Laner stats: kill/assist with allied jungler
                    for pid in kill_side_pids:
                        if pid in kill_side_junglers:
                            continue  # Skip the jungler itself
                        pid_role = self._participant_id_to_role.get(pid)
                        if pid_role and pid_role != "Jungle":
                            pid_team = self._participant_id_to_team.get(pid)
                            for jgl_pid in kill_side_junglers:
                                if self._participant_id_to_team.get(jgl_pid) == pid_team:
                                    laner_stats = self._player_stats.get(pid)
                                    if laner_stats:
                                        laner_stats.solo_stats["ganked_by_ally_jgl"] = (
                                            laner_stats.solo_stats.get("ganked_by_ally_jgl", 0) + 1
                                        )
                                    break

                # Jungler dying in a lane zone
                if victim_is_jungler and victim_pid in self._player_stats:
                    self._player_stats[victim_pid].solo_stats["jgl_lane_deaths"] = (
                        self._player_stats[victim_pid].solo_stats.get("jgl_lane_deaths", 0) + 1
                    )

        # Record game event
        self._game_events.append(
            ProGameEvent(
                event_type="champion_kill",
                game_time=game_time,
                actor_player_name=killer_name,
                target_player_name=victim_name,
                position_x=position.get("x"),
                position_y=position.get("y") or position.get("z"),
                event_data={
                    "bounty": event.get("bounty"),
                    "kill_streak": event.get("killStreakLength"),
                    "assistants": assistant_names,
                },
            )
        )

    @staticmethod
    def _get_lane_zone(x: float, y: float) -> str | None:
        """Determine which lane zone a position falls in on Summoner's Rift.

        Map is ~15000x15000 with blue base at bottom-left (0,0).
        Returns "top", "mid", "bot", or None (jungle/river).
        """
        # Bot lane (L-shape: bottom + right edges)
        if (x >= 7500 and y <= 5500) or (x >= 12000 and y <= 7500):
            return "bot"
        # Top lane (L-shape: left + top edges)
        if (x <= 5500 and y >= 7500) or (x <= 7500 and y >= 12000):
            return "top"
        # Mid lane (diagonal corridor)
        if abs(x - y) <= 3000 and 3000 <= x <= 12000 and 3000 <= y <= 12000:
            return "mid"
        return None

    @staticmethod
    def _is_in_botlane(x: float, y: float) -> bool:
        """Check if coordinates are in the botlane area of Summoner's Rift.

        Botlane runs along the bottom and right edges of the map.
        Map is ~15000x15000 with blue base at bottom-left (0,0).
        """
        # Main botlane corridor (horizontal part)
        if x >= 7500 and y <= 5500:
            return True
        # Extended botlane corridor (right side, toward red base)
        if x >= 12000 and y <= 7500:
            return True
        return False

    def _is_2v2_botlane_kill(self, event: dict) -> bool:
        """Check if a champion_kill event is a pure 2v2 botlane kill.

        Requires:
        1. Killer is ADC or Support
        2. Exactly 1 assistant who is also ADC or Support (killer's bot partner)
        3. Victim is ADC or Support
        4. Kill is in botlane zone
        5. Victim's bot lane partner is alive and within 2000 units (confirming 2v2)
        6. No non-botlaner alive within 2000 units of the kill
        """
        killer_pid = event.get("killer")
        victim_pid = event.get("victim")
        assistants = event.get("assistants", [])
        position = event.get("position", {})
        game_time = event.get("gameTime", 0)

        if not isinstance(killer_pid, int) or not isinstance(victim_pid, int):
            return False

        # 2v2 = killer + 1 assistant vs victim + partner
        if len(assistants) != 1:
            return False

        assistant_pid = assistants[0]

        # All 3 event participants must be ADC or Support
        bot_roles = {"ADC", "Support"}
        killer_role = self._participant_id_to_role.get(killer_pid)
        assistant_role = self._participant_id_to_role.get(assistant_pid)
        victim_role = self._participant_id_to_role.get(victim_pid)

        if not all(r in bot_roles for r in [killer_role, assistant_role, victim_role]):
            return False

        # Killer and assistant must be on the same team, victim on the other
        killer_team = self._participant_id_to_team.get(killer_pid)
        assistant_team = self._participant_id_to_team.get(assistant_pid)
        victim_team = self._participant_id_to_team.get(victim_pid)

        if killer_team != assistant_team or killer_team == victim_team:
            return False

        # Kill must be in botlane
        kill_x = position.get("x", 0)
        kill_y = position.get("y") or position.get("z", 0)

        if not kill_x or not kill_y:
            return False

        if not self._is_in_botlane(kill_x, kill_y):
            return False

        respawn_time_ms = 40000

        # Find victim's bot lane partner (the other ADC/Support on victim's team)
        victim_partner_pid = None
        for pid, role in self._participant_id_to_role.items():
            if pid == victim_pid:
                continue
            if role in bot_roles and self._participant_id_to_team.get(pid) == victim_team:
                victim_partner_pid = pid
                break

        if victim_partner_pid is None:
            return False

        # Victim's partner must be alive (or died in the same fight — trade kill)
        trade_window_ms = 10_000  # 10s window for trade kills
        partner_death_time = self._player_death_times.get(victim_partner_pid, 0)
        if partner_death_time > 0:
            time_since_death = game_time - partner_death_time
            # Dead and NOT a trade kill: died > 10s ago but hasn't respawned
            if trade_window_ms < time_since_death < respawn_time_ms:
                return False

        # Victim's partner must be within 2000 units
        partner_pos = self._player_positions.get(victim_partner_pid)
        if not partner_pos:
            return False

        dx = partner_pos[0] - kill_x
        dy = partner_pos[1] - kill_y
        if (dx * dx + dy * dy) ** 0.5 > 2000:
            return False

        # No non-botlaner alive within 2000 units
        involved_pids = {killer_pid, victim_pid, assistant_pid, victim_partner_pid}

        for pid, pos in self._player_positions.items():
            if pid in involved_pids:
                continue

            # Check if this player is alive
            death_time = self._player_death_times.get(pid, 0)
            if death_time > 0 and game_time - death_time < respawn_time_ms:
                continue

            dx = pos[0] - kill_x
            dy = pos[1] - kill_y
            if (dx * dx + dy * dy) ** 0.5 <= 2000:
                return False

        return True

    def _handle_champion_kill_special(self, event: dict) -> None:
        """Handle champion_kill_special event (first blood, multi-kills)."""
        kill_type = event.get("killType", "")
        killer_pid = event.get("killer")
        victim_pid = event.get("victim")

        if kill_type == "firstBlood":
            game_time = event.get("gameTime", 0)
            fb_time_seconds = game_time // 1000 if game_time else None
            self._game_info.first_blood_time = fb_time_seconds

            # Determine first blood team
            if killer_pid is not None:
                team_id = self._participant_id_to_team.get(killer_pid)
                if team_id:
                    self._game_info.first_blood_team = (
                        "blue" if team_id == self.BLUE_TEAM_ID else "red"
                    )

                # Mark player as first blood participant
                if killer_pid in self._player_stats:
                    self._player_stats[killer_pid].first_blood = {
                        "participant": True, "victim": False, "assist": False, "time": fb_time_seconds,
                    }

            if victim_pid is not None and victim_pid in self._player_stats:
                self._player_stats[victim_pid].first_blood = {
                    "participant": False, "victim": True, "assist": False, "time": fb_time_seconds,
                }

        elif kill_type == "kill_double":
            if killer_pid in self._player_stats:
                self._player_stats[killer_pid].multi_kills["double"] += 1

        elif kill_type == "kill_triple":
            if killer_pid in self._player_stats:
                self._player_stats[killer_pid].multi_kills["triple"] += 1

        elif kill_type == "kill_quadra":
            if killer_pid in self._player_stats:
                self._player_stats[killer_pid].multi_kills["quadra"] += 1

        elif kill_type == "kill_penta":
            if killer_pid in self._player_stats:
                self._player_stats[killer_pid].multi_kills["penta"] += 1

    def _handle_epic_monster_kill(self, event: dict) -> None:
        """Handle epic_monster_kill event."""
        game_time = event.get("gameTime", 0)
        monster_type = event.get("monsterType", "").lower()
        killer_team_id = event.get("killerTeamID")
        position = event.get("position", {})

        team_side = "blue" if killer_team_id == self.BLUE_TEAM_ID else "red"

        # Track first objectives
        if "dragon" in monster_type and not self._first_dragon_taken:
            self._game_info.first_dragon_team = team_side
            self._first_dragon_taken = True
        elif "baron" in monster_type and not self._first_baron_taken:
            self._game_info.first_baron_team = team_side
            self._first_baron_taken = True
        elif "herald" in monster_type or "riftHerald" in monster_type:
            if not self._first_herald_taken:
                self._game_info.first_herald_team = team_side
                self._first_herald_taken = True
            # Count heralds
            if team_side == "blue":
                self._game_info.blue_heralds += 1
            else:
                self._game_info.red_heralds += 1
        elif "horde" in monster_type or "grub" in monster_type:
            # Track first grubs
            if not self._first_grubs_taken:
                self._game_info.first_grubs_team = team_side
                self._first_grubs_taken = True
            # Count grubs
            if team_side == "blue":
                self._game_info.blue_grubs += 1
            else:
                self._game_info.red_grubs += 1

        # Record game event
        self._game_events.append(
            ProGameEvent(
                event_type="epic_monster_kill",
                game_time=game_time,
                event_data={
                    "monster_type": monster_type,
                    "team_side": team_side,
                    "bounty_gold": event.get("bountyGold"),
                },
                position_x=position.get("x"),
                position_y=position.get("y") or position.get("z"),
            )
        )

    def _handle_building_destroyed(self, event: dict) -> None:
        """Handle building_destroyed event."""
        game_time = event.get("gameTime", 0)
        building_type = event.get("buildingType", "")
        team_id = event.get("teamID")  # Team that LOST the building
        lane = event.get("lane")
        position = event.get("position", {})

        # Destroyer is opposite team
        destroyer_side = "red" if team_id == self.BLUE_TEAM_ID else "blue"

        # Track first tower
        if "tower" in building_type.lower() and not self._first_tower_taken:
            self._game_info.first_tower_team = destroyer_side
            self._first_tower_taken = True

        # Track nexus destruction as fallback for winner detection
        if building_type.lower() == "nexus":
            # Team that lost their nexus loses the game
            # Winner is the opposite team
            self._game_info.winner_team_side = destroyer_side
            # Also set duration from this event if not already set
            if not self._game_info.duration:
                duration = game_time // 1000 if game_time > 100000 else game_time
                self._game_info.duration = duration

        self._game_events.append(
            ProGameEvent(
                event_type="building_destroyed",
                game_time=game_time,
                event_data={
                    "building_type": building_type,
                    "destroyer_team": destroyer_side,
                    "lane": lane,
                    "turret_tier": event.get("turretTier"),
                },
                position_x=position.get("x"),
                position_y=position.get("y") or position.get("z"),
            )
        )

    def _handle_game_end(self, event: dict) -> None:
        """Handle game_end event."""
        game_time = event.get("gameTime", 0)
        winning_team = event.get("winningTeam")

        # Convert ms to seconds
        if game_time > 100000:
            game_time = game_time // 1000
        self._game_info.duration = game_time

        if winning_team is not None:
            self._game_info.winner_team_side = (
                "blue" if winning_team == self.BLUE_TEAM_ID else "red"
            )

    def _handle_quest_completed(self, event: dict) -> None:
        """Handle role_bound_quest_completed event (support item quest)."""
        game_time = event.get("gameTime", 0)
        participant_id = event.get("participantID")

        if participant_id is not None and participant_id in self._player_stats:
            seconds = game_time // 1000
            self._player_stats[participant_id].quest_completed_at = seconds

    def _handle_turret_plate_destroyed(self, event: dict) -> None:
        """Handle turret_plate_destroyed event to count plates per player and per team."""
        last_hitter = event.get("lastHitter")
        lane = event.get("lane", "")
        lane_key = self._normalize_lane(lane)
        game_time = event.get("gameTime", 0)
        is_before_15 = game_time < 900_000  # 15 min in ms

        # Track at team level using teamID (team that LOST the plate)
        team_id_lost = event.get("teamID")
        side_took = None
        if team_id_lost is not None:
            side_took = "red" if team_id_lost == self.BLUE_TEAM_ID else "blue"
        elif last_hitter is not None:
            hitter_team = self._participant_id_to_team.get(last_hitter)
            if hitter_team:
                side_took = "blue" if hitter_team == self.BLUE_TEAM_ID else "red"

        if side_took:
            if not self._game_info.plates_detail:
                self._game_info.plates_detail = {
                    "blue": {"top": 0, "mid": 0, "bot": 0},
                    "red": {"top": 0, "mid": 0, "bot": 0},
                }
            if lane_key in self._game_info.plates_detail.get(side_took, {}):
                self._game_info.plates_detail[side_took][lane_key] += 1
            if side_took == "blue":
                self._game_info.blue_plates += 1
            else:
                self._game_info.red_plates += 1

        # Track at player level
        if not last_hitter:
            return

        stats = self._ensure_player_stats(last_hitter)
        stats.plates["destroyed"] += 1
        if is_before_15:
            stats.plates["before_15"] += 1
        if lane_key in stats.plates:
            stats.plates[lane_key]["destroyed"] += 1
            if is_before_15:
                stats.plates[lane_key]["before_15"] += 1

    def _handle_building_gold_grant(self, event: dict) -> None:
        """Handle building_gold_grant event to track plate gold per player per lane."""
        source = event.get("source", "")
        if source != "turretPlate":
            return

        recipient_id = event.get("recipientId")
        amount = event.get("amount", 0)
        lane = event.get("lane", "")

        if not recipient_id:
            return

        lane_key = self._normalize_lane(lane)

        stats = self._ensure_player_stats(recipient_id)
        stats.plates["gold"] += amount
        if lane_key in stats.plates:
            stats.plates[lane_key]["gold"] += amount

    @staticmethod
    def _normalize_lane(lane: str) -> str:
        """Normalize lane name to top/mid/bot."""
        lane_lower = lane.lower()
        if lane_lower in ("top", "top_lane"):
            return "top"
        if lane_lower in ("middle", "mid", "mid_lane"):
            return "mid"
        if lane_lower in ("bottom", "bot", "bot_lane"):
            return "bot"
        return lane_lower

    def _parse_details_file(self) -> None:
        """Parse details file for objectives timeline (dragon types, souls, towers, etc.)."""
        if not self._details:
            return

        dragons: list[dict] = []
        elder_dragons: list[dict] = []
        barons: list[dict] = []
        heralds: list[dict] = []
        grubs_raw: list[dict] = []
        towers: list[dict] = []
        dragon_soul: dict | None = None
        first_tower_entry: dict | None = None

        for frame in self._details.get("frames", []):
            for event in frame.get("events", []):
                event_type = event.get("type")

                if event_type == "ELITE_MONSTER_KILL":
                    monster_type = event.get("monsterType", "")
                    monster_sub_type = event.get("monsterSubType", "")
                    killer_team_id = event.get("killerTeamId", 0)
                    timestamp = event.get("timestamp", 0)
                    time_s = timestamp // 1000

                    if killer_team_id not in (self.BLUE_TEAM_ID, self.RED_TEAM_ID):
                        continue

                    team = "blue" if killer_team_id == self.BLUE_TEAM_ID else "red"

                    if monster_type == "DRAGON":
                        if monster_sub_type == "ELDER_DRAGON":
                            elder_dragons.append({"team": team, "time_s": time_s})
                        else:
                            dragon_type = self.DRAGON_SUBTYPE_MAP.get(
                                monster_sub_type, monster_sub_type.lower()
                            )
                            dragons.append({"type": dragon_type, "team": team, "time_s": time_s})

                    elif monster_type == "BARON_NASHOR":
                        barons.append({"team": team, "time_s": time_s})

                    elif monster_type == "RIFTHERALD":
                        heralds.append({"team": team, "time_s": time_s})

                    elif monster_type == "HORDE":
                        grubs_raw.append({"team": team, "time_s": time_s})

                elif event_type == "DRAGON_SOUL_GIVEN":
                    soul_name = event.get("name", "")
                    soul_team_id = event.get("teamId", 0)

                    if soul_team_id in (self.BLUE_TEAM_ID, self.RED_TEAM_ID):
                        soul_team = "blue" if soul_team_id == self.BLUE_TEAM_ID else "red"
                    else:
                        # Infer from dragon kills (team with 4+ dragons gets soul)
                        blue_count = sum(1 for d in dragons if d["team"] == "blue")
                        red_count = sum(1 for d in dragons if d["team"] == "red")
                        if blue_count >= 4:
                            soul_team = "blue"
                        elif red_count >= 4:
                            soul_team = "red"
                        else:
                            soul_team = None

                    if soul_team:
                        dragon_soul = {
                            "team": soul_team,
                            "type": soul_name.lower(),
                        }

                elif event_type == "BUILDING_KILL":
                    building_type = event.get("buildingType", "")
                    if building_type != "TOWER_BUILDING":
                        continue

                    team_id_lost = event.get("teamId", 0)
                    if team_id_lost not in (self.BLUE_TEAM_ID, self.RED_TEAM_ID):
                        continue

                    lane_type = event.get("laneType", "")
                    tower_type = event.get("towerType", "")
                    timestamp = event.get("timestamp", 0)
                    time_s = timestamp // 1000

                    # Team that destroyed = opposite of team that lost
                    destroyer_team = (
                        "red" if team_id_lost == self.BLUE_TEAM_ID else "blue"
                    )
                    lane = self.DETAILS_LANE_MAP.get(lane_type, lane_type.lower())
                    tier = self.TOWER_TIER_MAP.get(tower_type, tower_type.lower())

                    tower_entry = {
                        "team": destroyer_team,
                        "lane": lane,
                        "tier": tier,
                        "time_s": time_s,
                    }
                    towers.append(tower_entry)

                    if first_tower_entry is None:
                        first_tower_entry = {
                            "team": destroyer_team,
                            "lane": lane,
                            "time_s": time_s,
                        }

        # Group consecutive grub kills
        grubs = self._group_grubs(grubs_raw)

        self._game_info.objectives_timeline = {
            "dragons": dragons,
            "elder_dragons": elder_dragons,
            "barons": barons,
            "heralds": heralds,
            "grubs": grubs,
            "towers": towers,
            "dragon_soul": dragon_soul,
            "first_tower": first_tower_entry,
        }

    @staticmethod
    def _group_grubs(grubs_raw: list[dict]) -> list[dict]:
        """Group consecutive grub kills by same team within 30 seconds."""
        if not grubs_raw:
            return []

        grubs_sorted = sorted(grubs_raw, key=lambda g: g["time_s"])

        groups: list[dict] = []
        current = {
            "team": grubs_sorted[0]["team"],
            "time_s": grubs_sorted[0]["time_s"],
            "count": 1,
            "_last_time": grubs_sorted[0]["time_s"],
        }

        for grub in grubs_sorted[1:]:
            if (
                grub["team"] == current["team"]
                and grub["time_s"] - current["_last_time"] <= 30
            ):
                current["count"] += 1
                current["_last_time"] = grub["time_s"]
            else:
                groups.append({
                    "team": current["team"],
                    "time_s": current["time_s"],
                    "count": current["count"],
                })
                current = {
                    "team": grub["team"],
                    "time_s": grub["time_s"],
                    "count": 1,
                    "_last_time": grub["time_s"],
                }

        groups.append({
            "team": current["team"],
            "time_s": current["time_s"],
            "count": current["count"],
        })

        return groups

    def _resolve_participant_name(self, participant: int | dict | None) -> str | None:
        """Resolve participant to player name."""
        if participant is None:
            return None

        if isinstance(participant, dict):
            raw = participant.get("displayName") or participant.get("summonerName") or ""
            parts = raw.split(" ", 1)
            return parts[1] if len(parts) > 1 else raw
        elif isinstance(participant, int):
            return self._participant_id_to_name.get(participant)

        return None

    def _calculate_derived_stats(self) -> None:
        """Calculate derived statistics."""
        # Calculate team totals for shares
        team_totals: dict[str, dict[str, int]] = {"blue": {}, "red": {}}
        for stats in self._player_stats.values():
            side = stats.team_side
            if side not in team_totals:
                continue

            if "kills" not in team_totals[side]:
                team_totals[side] = {"kills": 0, "gold": 0, "damage": 0}

            team_totals[side]["kills"] += stats.kills
            team_totals[side]["gold"] += stats.gold_earned
            team_totals[side]["damage"] += stats.damage_dealt

        # Calculate 15-minute differentials
        self._calculate_15min_diffs()

    def _update_max_diffs(self, participant_data: dict[int, dict]) -> None:
        """Update max diffs by comparing role opponents at this second.

        Called for every stats_update event to track max diffs with per-second precision.
        """
        # Group by role for matchup comparison
        role_players: dict[str, list[tuple[int, dict]]] = {}
        for pid, data in participant_data.items():
            role = data.get("role")
            if role:
                if role not in role_players:
                    role_players[role] = []
                role_players[role].append((pid, data))

        # Compare role opponents and update max diffs
        for role, players in role_players.items():
            if len(players) == 2:
                pid1, data1 = players[0]
                pid2, data2 = players[1]

                # Ensure opposite teams
                if data1["team_side"] != data2["team_side"]:
                    cs_diff = data1["cs"] - data2["cs"]
                    gold_diff = data1["gold"] - data2["gold"]
                    xp_diff = data1["xp"] - data2["xp"]

                    # Update max diffs for player 1
                    stats1 = self._player_stats[pid1]
                    if cs_diff > stats1.max_diffs["cs"]:
                        stats1.max_diffs["cs"] = cs_diff
                    if gold_diff > stats1.max_diffs["gold"]:
                        stats1.max_diffs["gold"] = gold_diff
                    if xp_diff > stats1.max_diffs["xp"]:
                        stats1.max_diffs["xp"] = xp_diff

                    # Update max diffs for player 2
                    stats2 = self._player_stats[pid2]
                    if -cs_diff > stats2.max_diffs["cs"]:
                        stats2.max_diffs["cs"] = -cs_diff
                    if -gold_diff > stats2.max_diffs["gold"]:
                        stats2.max_diffs["gold"] = -gold_diff
                    if -xp_diff > stats2.max_diffs["xp"]:
                        stats2.max_diffs["xp"] = -xp_diff

    def _update_proximity(self, second: int) -> None:
        """Update proximity data between teammates at this second.

        Tracks seconds spent within 2000 units of each teammate role.
        Also tracks self proximity (total seconds alive) for percentage calculation.
        Also tracks isolation (seconds with no teammate within 2000 units).
        Only counts if both players are alive.
        Called for each second between 1-15 min.
        """
        # Estimate respawn time for "alive" check
        respawn_time_ms = 40000
        current_time_ms = second * 1000

        # Group alive players by team with their positions
        team_alive_players: dict[str, list[tuple[int, tuple[float, float]]]] = {"blue": [], "red": []}
        for pid, stats in self._player_stats.items():
            if stats.team_side not in team_alive_players:
                continue

            # Check if player is alive
            death_time = self._player_death_times.get(pid, 0)
            if current_time_ms - death_time < respawn_time_ms and death_time > 0:
                continue  # Player is dead

            pos = self._player_positions.get(pid)
            if not pos:
                continue

            team_alive_players[stats.team_side].append((pid, pos))

        # For each team, process each alive player
        for team_side, alive_players in team_alive_players.items():
            for i, (pid1, pos1) in enumerate(alive_players):
                stats1 = self._player_stats[pid1]
                role1 = stats1.role or "Unknown"

                # Track self proximity (seconds alive) for percentage calculation
                if role1 not in stats1.proximity:
                    stats1.proximity[role1] = 0
                stats1.proximity[role1] += 1

                # Track if player has any teammate nearby (for isolation)
                has_teammate_nearby = False

                # Check against all other alive teammates
                for j, (pid2, pos2) in enumerate(alive_players):
                    if i == j:
                        continue  # Skip self

                    stats2 = self._player_stats[pid2]
                    role2 = stats2.role or "Unknown"

                    # Calculate distance
                    dx = pos1[0] - pos2[0]
                    dy = pos1[1] - pos2[1]
                    distance = (dx * dx + dy * dy) ** 0.5

                    # If within 2000 units
                    if distance <= 2000:
                        has_teammate_nearby = True

                        # Only add proximity once per pair (when i < j)
                        if i < j:
                            # Player 1 gains proximity with player 2's role
                            if role2 not in stats1.proximity:
                                stats1.proximity[role2] = 0
                            stats1.proximity[role2] += 1

                            # Player 2 gains proximity with player 1's role
                            if role1 not in stats2.proximity:
                                stats2.proximity[role1] = 0
                            stats2.proximity[role1] += 1

                # If no teammate nearby, player is isolated
                if not has_teammate_nearby:
                    stats1.isolation += 1

    def _calculate_15min_diffs(self) -> None:
        """Calculate CS, gold, XP differentials at 15 minutes and per minute in timing_data."""
        # Group players by role for matchup comparison
        role_players: dict[str, list[ProPlayerStats]] = {}
        for stats in self._player_stats.values():
            if stats.role:
                if stats.role not in role_players:
                    role_players[stats.role] = []
                role_players[stats.role].append(stats)

        # Calculate diffs for each role matchup
        for role, players in role_players.items():
            if len(players) == 2:
                # Ensure we're comparing opposite teams
                if players[0].team_side != players[1].team_side:
                    p1, p2 = players

                    # Diffs at 15 minutes
                    p1.stats_at_15["cs_diff"] = p1.stats_at_15["cs"] - p2.stats_at_15["cs"]
                    p1.stats_at_15["gold_diff"] = p1.stats_at_15["gold"] - p2.stats_at_15["gold"]
                    p1.stats_at_15["xp_diff"] = p1.stats_at_15["xp"] - p2.stats_at_15["xp"]

                    p2.stats_at_15["cs_diff"] = -p1.stats_at_15["cs_diff"]
                    p2.stats_at_15["gold_diff"] = -p1.stats_at_15["gold_diff"]
                    p2.stats_at_15["xp_diff"] = -p1.stats_at_15["xp_diff"]

                    # Diffs for each minute in timing_data
                    all_minutes = set(p1.timing_data.keys()) & set(p2.timing_data.keys())
                    for minute in all_minutes:
                        td1 = p1.timing_data[minute]
                        td2 = p2.timing_data[minute]

                        cs1 = int(td1.get("cs", 0))
                        cs2 = int(td2.get("cs", 0))
                        gold1 = td1.get("gold", 0)
                        gold2 = td2.get("gold", 0)
                        xp1 = td1.get("xp", 0)
                        xp2 = td2.get("xp", 0)

                        td1["cs_diff"] = cs1 - cs2
                        td1["gold_diff"] = gold1 - gold2
                        td1["xp_diff"] = xp1 - xp2

                        td2["cs_diff"] = -(cs1 - cs2)
                        td2["gold_diff"] = -(gold1 - gold2)
                        td2["xp_diff"] = -(xp1 - xp2)


class SummaryParser:
    """Fallback parser using summary + details when events JSONL is unavailable (e.g. chronobreaks)."""

    BLUE_TEAM_ID = 100
    RED_TEAM_ID = 200

    ROLE_MAP = {
        "TOP": "Top",
        "JUNGLE": "Jungle",
        "MIDDLE": "Mid",
        "BOTTOM": "ADC",
        "UTILITY": "Support",
    }

    DRAGON_SUBTYPE_MAP = EventsParser.DRAGON_SUBTYPE_MAP
    DETAILS_LANE_MAP = EventsParser.DETAILS_LANE_MAP
    TOWER_TIER_MAP = EventsParser.TOWER_TIER_MAP

    def __init__(self, summary: dict, details: dict | None = None):
        self._summary = summary
        self._details = details

    def parse(self) -> ParsedGameData:
        game_info = self._parse_game_info()
        player_stats, participant_names_by_side = self._parse_participants()
        self._parse_details(game_info, player_stats)
        return ParsedGameData(
            game=game_info,
            player_stats=player_stats,
            draft_actions=[],
            game_events=[],
            participant_names_by_side=participant_names_by_side,
        )

    def _parse_game_info(self) -> ProGameInfo:
        """Extract game-level info from summary."""
        info = ProGameInfo(game_number=1)
        info.duration = self._summary.get("gameDuration")
        info.patch = self._summary.get("gameVersion")

        start_ts = self._summary.get("gameStartTimestamp")
        end_ts = self._summary.get("gameEndTimestamp")
        if start_ts:
            info.started_at = datetime.fromtimestamp(start_ts / 1000, tz=timezone.utc).isoformat()
        if end_ts:
            info.ended_at = datetime.fromtimestamp(end_ts / 1000, tz=timezone.utc).isoformat()

        # Winner and team objectives from teams array
        for team in self._summary.get("teams", []):
            team_id = team.get("teamId")
            side = "blue" if team_id == self.BLUE_TEAM_ID else "red"
            objectives = team.get("objectives", {})

            if team.get("win"):
                info.winner_team_side = side

            towers = objectives.get("tower", {}).get("kills", 0)
            dragons = objectives.get("dragon", {}).get("kills", 0)
            barons = objectives.get("baron", {}).get("kills", 0)
            heralds = objectives.get("riftHerald", {}).get("kills", 0)
            grubs = objectives.get("horde", {}).get("kills", 0)
            inhibs = objectives.get("inhibitor", {}).get("kills", 0)
            kills = objectives.get("champion", {}).get("kills", 0)

            if side == "blue":
                info.blue_towers = towers
                info.blue_dragons = dragons
                info.blue_barons = barons
                info.blue_heralds = heralds
                info.blue_grubs = grubs
                info.blue_inhibs = inhibs
                info.blue_kills = kills
            else:
                info.red_towers = towers
                info.red_dragons = dragons
                info.red_barons = barons
                info.red_heralds = heralds
                info.red_grubs = grubs
                info.red_inhibs = inhibs
                info.red_kills = kills

            # First objectives
            if objectives.get("champion", {}).get("first"):
                info.first_blood_team = side
            if objectives.get("tower", {}).get("first"):
                info.first_tower_team = side
            if objectives.get("dragon", {}).get("first"):
                info.first_dragon_team = side
            if objectives.get("baron", {}).get("first"):
                info.first_baron_team = side
            if objectives.get("riftHerald", {}).get("first"):
                info.first_herald_team = side
            if objectives.get("horde", {}).get("first"):
                info.first_grubs_team = side

        return info

    def _parse_participants(self) -> tuple[list[ProPlayerStats], dict[str, list[str]]]:
        """Extract player stats from summary participants."""
        player_stats: list[ProPlayerStats] = []
        names_by_side: dict[str, list[str]] = {"blue": [], "red": []}

        for p in self._summary.get("participants", []):
            team_id = p.get("teamId")
            team_side = "blue" if team_id == self.BLUE_TEAM_ID else "red"

            raw_name = p.get("riotIdGameName", "") or p.get("summonerName", "")
            names_by_side[team_side].append(raw_name)

            # Strip team tag prefix
            parts = raw_name.split(" ", 1)
            player_name = parts[1] if len(parts) > 1 else raw_name

            position = p.get("teamPosition", "")
            role = self.ROLE_MAP.get(position)

            # Items (item0 through item6, filter out 0)
            items = []
            for i in range(7):
                item_id = p.get(f"item{i}", 0)
                if item_id and item_id > 0:
                    items.append(item_id)

            stats = ProPlayerStats(
                player_name=player_name,
                team_side=team_side,
                role=role,
                champion_id=p.get("championId", 0),
                champion_name=p.get("championName"),
                kills=int(p.get("kills", 0)),
                deaths=int(p.get("deaths", 0)),
                assists=int(p.get("assists", 0)),
                cs=int(p.get("totalMinionsKilled", 0)) + int(p.get("neutralMinionsKilled", 0)),
                gold_earned=int(p.get("goldEarned", 0)),
                damage_dealt=int(p.get("totalDamageDealtToChampions", 0)),
                damage_taken=int(p.get("totalDamageTaken", 0)),
                vision={
                    "score": int(p.get("visionScore", 0)),
                    "wards_placed": int(p.get("wardsPlaced", 0)),
                    "wards_destroyed": int(p.get("wardsKilled", 0)),
                    "control_wards": int(p.get("detectorWardsPlaced", 0)),
                },
                multi_kills={
                    "double": int(p.get("doubleKills", 0)),
                    "triple": int(p.get("tripleKills", 0)),
                    "quadra": int(p.get("quadraKills", 0)),
                    "penta": int(p.get("pentaKills", 0)),
                },
                items=items,
            )
            player_stats.append(stats)

        return player_stats, names_by_side

    def _parse_details(self, game_info: ProGameInfo, player_stats: list[ProPlayerStats]) -> None:
        """Parse details file for objectives timeline and first blood info."""
        if not self._details:
            return

        dragons: list[dict] = []
        elder_dragons: list[dict] = []
        barons: list[dict] = []
        heralds: list[dict] = []
        grubs_raw: list[dict] = []
        towers: list[dict] = []
        dragon_soul: dict | None = None
        first_tower_entry: dict | None = None

        # Build pid -> player stats lookup for first blood victim
        pid_to_stats: dict[int, ProPlayerStats] = {}
        for i, p in enumerate(self._summary.get("participants", [])):
            pid = p.get("participantId")
            if pid is not None and i < len(player_stats):
                pid_to_stats[pid] = player_stats[i]

        for frame in self._details.get("frames", []):
            for event in frame.get("events", []):
                event_type = event.get("type")

                # First blood victim from first CHAMPION_KILL
                if event_type == "CHAMPION_KILL" and game_info.first_blood_time is None:
                    timestamp_ms = event.get("timestamp", 0)
                    fb_time = timestamp_ms // 1000 if timestamp_ms else None
                    game_info.first_blood_time = fb_time

                    victim_pid = event.get("victimId")
                    if victim_pid is not None and victim_pid in pid_to_stats:
                        pid_to_stats[victim_pid].first_blood = {
                            "participant": False, "victim": True, "assist": False, "time": fb_time,
                        }

                elif event_type == "ELITE_MONSTER_KILL":
                    monster_type = event.get("monsterType", "")
                    monster_sub_type = event.get("monsterSubType", "")
                    killer_team_id = event.get("killerTeamId", 0)
                    timestamp = event.get("timestamp", 0)
                    time_s = timestamp // 1000

                    if killer_team_id not in (self.BLUE_TEAM_ID, self.RED_TEAM_ID):
                        continue

                    team = "blue" if killer_team_id == self.BLUE_TEAM_ID else "red"

                    if monster_type == "DRAGON":
                        if monster_sub_type == "ELDER_DRAGON":
                            elder_dragons.append({"team": team, "time_s": time_s})
                        else:
                            dragon_type = self.DRAGON_SUBTYPE_MAP.get(
                                monster_sub_type, monster_sub_type.lower()
                            )
                            dragons.append({"type": dragon_type, "team": team, "time_s": time_s})
                    elif monster_type == "BARON_NASHOR":
                        barons.append({"team": team, "time_s": time_s})
                    elif monster_type == "RIFTHERALD":
                        heralds.append({"team": team, "time_s": time_s})
                    elif monster_type == "HORDE":
                        grubs_raw.append({"team": team, "time_s": time_s})

                elif event_type == "DRAGON_SOUL_GIVEN":
                    soul_name = event.get("name", "")
                    soul_team_id = event.get("teamId", 0)

                    if soul_team_id in (self.BLUE_TEAM_ID, self.RED_TEAM_ID):
                        soul_team = "blue" if soul_team_id == self.BLUE_TEAM_ID else "red"
                    else:
                        blue_count = sum(1 for d in dragons if d["team"] == "blue")
                        red_count = sum(1 for d in dragons if d["team"] == "red")
                        if blue_count >= 4:
                            soul_team = "blue"
                        elif red_count >= 4:
                            soul_team = "red"
                        else:
                            soul_team = None

                    if soul_team:
                        dragon_soul = {"team": soul_team, "type": soul_name.lower()}

                elif event_type == "BUILDING_KILL":
                    building_type = event.get("buildingType", "")
                    if building_type != "TOWER_BUILDING":
                        continue

                    team_id_lost = event.get("teamId", 0)
                    if team_id_lost not in (self.BLUE_TEAM_ID, self.RED_TEAM_ID):
                        continue

                    lane_type = event.get("laneType", "")
                    tower_type = event.get("towerType", "")
                    timestamp = event.get("timestamp", 0)
                    time_s = timestamp // 1000

                    destroyer_team = "red" if team_id_lost == self.BLUE_TEAM_ID else "blue"
                    lane = self.DETAILS_LANE_MAP.get(lane_type, lane_type.lower())
                    tier = self.TOWER_TIER_MAP.get(tower_type, tower_type.lower())

                    tower_entry = {"team": destroyer_team, "lane": lane, "tier": tier, "time_s": time_s}
                    towers.append(tower_entry)

                    if first_tower_entry is None:
                        first_tower_entry = {"team": destroyer_team, "lane": lane, "time_s": time_s}

        grubs = EventsParser._group_grubs(grubs_raw)

        game_info.objectives_timeline = {
            "dragons": dragons,
            "elder_dragons": elder_dragons,
            "barons": barons,
            "heralds": heralds,
            "grubs": grubs,
            "towers": towers,
            "dragon_soul": dragon_soul,
            "first_tower": first_tower_entry,
        }
