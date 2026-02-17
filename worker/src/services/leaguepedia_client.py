"""
Leaguepedia Client - mwrogue-based client for Cargo queries.

Adapted from site-data/leaguepedia_Fonction.py.
Uses mwrogue EsportsClient with retry logic and exponential backoff.
"""

import os
import time
from collections import defaultdict

import structlog
from mwclient.errors import APIError
from mwclient.sleep import MaximumRetriesExceeded
from mwrogue.esports_client import EsportsClient
from mwrogue.auth_credentials import AuthCredentials

logger = structlog.get_logger(__name__)


class LeaguepediaClient:
    """Leaguepedia Cargo query client with retry and rate-limit handling."""

    def __init__(self):
        username = os.getenv("LEAGUEPEDIA_USERNAME")
        password = os.getenv("LEAGUEPEDIA_PASSWORD")

        kwargs = {}
        if username and password:
            kwargs["credentials"] = AuthCredentials(
                username=username, password=password
            )
            logger.info("Leaguepedia: authenticating", username=username)

        self.site = EsportsClient("lol", **kwargs)
        logger.info("Leaguepedia: client initialized")

    def safe_cargo_query(
        self,
        tables: str,
        fields: str,
        where: str | None = None,
        join_on: str | None = None,
        order_by: str | None = None,
        group_by: str | None = None,
        having: str | None = None,
        limit: int | None = None,
        offset: int = 0,
        max_retries: int = 5,
        retry_delay: int = 5,
    ) -> list[dict]:
        """Execute a Cargo query with retry and exponential backoff.

        Args:
            tables: Cargo table(s)
            fields: Fields to select
            where: WHERE clause
            join_on: JOIN condition
            order_by: ORDER BY clause
            group_by: GROUP BY clause
            having: HAVING clause
            limit: Max rows
            offset: Offset for pagination
            max_retries: Max retry attempts
            retry_delay: Initial delay in seconds

        Returns:
            List of result dicts
        """
        params = {
            "tables": tables,
            "fields": fields,
            "limit": limit,
            "offset": offset,
        }
        if where:
            params["where"] = where
        if join_on:
            params["join_on"] = join_on
        if order_by:
            params["order_by"] = order_by
        if group_by:
            params["group_by"] = group_by
        if having:
            params["having"] = having

        retries = 0
        current_delay = retry_delay

        while retries < max_retries:
            try:
                return self.site.cargo_client.query(**params)
            except MaximumRetriesExceeded:
                retries += 1
                logger.warning(
                    "MaximumRetriesExceeded, retrying",
                    retry=retries,
                    max_retries=max_retries,
                    delay=current_delay,
                )
                time.sleep(current_delay)
                current_delay *= 2
            except APIError as e:
                code = e.args[0] if e.args else None
                if code == "ratelimited":
                    retries += 1
                    logger.warning(
                        "Rate limited by Leaguepedia, retrying",
                        retry=retries,
                        max_retries=max_retries,
                        delay=current_delay,
                    )
                    time.sleep(current_delay)
                    current_delay *= 2
                else:
                    raise

        raise RuntimeError(
            f"Leaguepedia query failed after {max_retries} retries"
        )

    def safe_cargo_query_all(
        self,
        tables: str,
        fields: str,
        where: str | None = None,
        join_on: str | None = None,
        order_by: str | None = None,
        group_by: str | None = None,
        page_size: int = 500,
        max_results: int = 10000,
    ) -> list[dict]:
        """Paginate through all results.

        Args:
            tables: Cargo table(s)
            fields: Fields to select
            where: WHERE clause
            join_on: JOIN condition
            order_by: ORDER BY clause
            group_by: GROUP BY clause
            page_size: Results per page
            max_results: Maximum total results to fetch (safety limit)

        Returns:
            All results combined
        """
        all_results = []
        offset = 0

        while True:
            results = self.safe_cargo_query(
                tables=tables,
                fields=fields,
                where=where,
                join_on=join_on,
                order_by=order_by,
                group_by=group_by,
                limit=page_size,
                offset=offset,
            )
            if not results:
                break

            all_results.extend(results)
            if len(all_results) >= max_results:
                logger.warning(
                    "Pagination limit reached",
                    tables=tables,
                    max_results=max_results,
                    fetched=len(all_results),
                )
                all_results = all_results[:max_results]
                break
            if len(results) < page_size:
                break

            offset += page_size

        return all_results

    # ==========================================
    # Player Redirect Queries
    # ==========================================

    def resolve_player_redirect(self, name: str) -> str | None:
        """Query PlayerRedirects to find the canonical OverviewPage for a name.

        Returns the OverviewPage if found, None otherwise.
        """
        rows = self.safe_cargo_query(
            tables="PlayerRedirects",
            fields="OverviewPage",
            where=f'AllName="{name}"',
            limit=1,
        )
        if rows:
            return rows[0].get("OverviewPage")
        return None

    # ==========================================
    # League and Tournament Queries
    # ==========================================

    def get_league(self, league_name: str) -> dict | None:
        """Get league info from Leaguepedia."""
        rows = self.safe_cargo_query(
            tables="Leagues",
            fields="League, League_Short, Region, IsOfficial, Level",
            where=f"League='{_escape(league_name)}'",
            limit=1,
        )
        return rows[0] if rows else None

    def get_tournaments_by_league(self, league_name: str) -> list[dict]:
        """Get all tournaments for a league."""
        return self.safe_cargo_query_all(
            tables="Tournaments",
            fields="Name, OverviewPage, League, Region, TournamentLevel, DateStart, Date, Year, Split, SplitNumber, IsPlayoffs, IsQualifier, IsOfficial",
            where=f"League='{_escape(league_name)}'",
            order_by="DateStart DESC",
        )

    # ==========================================
    # Game Data Queries
    # ==========================================

    def get_scoreboard_data(self, overview_page: str) -> list[dict]:
        """Get ScoreboardPlayers + ScoreboardGames join for a tournament.

        Returns rows with player stats per game, including game metadata.
        """
        return self.safe_cargo_query_all(
            tables="ScoreboardPlayers=SP, ScoreboardGames=SG",
            join_on="SP.GameId=SG.GameId",
            fields=(
                "SP.Name, SP.Link, SP.Team, SP.PlayerWin, SP.Champion, "
                "SP.Role, SP.Kills, SP.Deaths, SP.Assists, SP.CS, "
                "SP.Gold, SP.DamageToChampions, SP.VisionScore, SP.Side, "
                "SG.GameId, SG.DateTime_UTC, SG.Team1, SG.Team2, "
                "SG.Gamelength_Number, SG.Patch, SG.OverviewPage, "
                "SG.MatchId, SG.N_GameInMatch, SG.RiotPlatformGameId"
            ),
            where=f"SG.OverviewPage='{_escape(overview_page)}'",
            order_by="SG.DateTime_UTC, SG.GameId, SP.Side, SP.Role",
        )

    def get_picks_bans(self, overview_page: str) -> list[dict]:
        """Get picks/bans from PicksAndBansS7 for a tournament."""
        return self.safe_cargo_query_all(
            tables="PicksAndBansS7",
            fields=(
                "GameId, Team1, Team2, "
                "Team1Ban1, Team1Ban2, Team1Ban3, Team1Ban4, Team1Ban5, "
                "Team2Ban1, Team2Ban2, Team2Ban3, Team2Ban4, Team2Ban5, "
                "Team1Pick1, Team1Pick2, Team1Pick3, Team1Pick4, Team1Pick5, "
                "Team2Pick1, Team2Pick2, Team2Pick3, Team2Pick4, Team2Pick5, "
                "Team1Role1, Team1Role2, Team1Role3, Team1Role4, Team1Role5, "
                "Team2Role1, Team2Role2, Team2Role3, Team2Role4, Team2Role5"
            ),
            where=f"OverviewPage='{_escape(overview_page)}'",
            order_by="GameId",
        )

    def get_match_schedule(self, overview_page: str) -> list[dict]:
        """Get match schedule for a tournament (for match metadata)."""
        return self.safe_cargo_query_all(
            tables="MatchSchedule",
            fields=(
                "MatchId, Team1, Team2, DateTime_UTC, BestOf, Winner, "
                "OverviewPage, Tab"
            ),
            where=f"OverviewPage='{_escape(overview_page)}'",
            order_by="DateTime_UTC",
        )

    def all_games_played(self, overview_page: str) -> bool:
        """Check if all games in a tournament have a winner."""
        rows = self.safe_cargo_query(
            tables="MatchScheduleGame=MSG, MatchSchedule=MS",
            join_on="MSG.MatchId=MS.MatchId",
            fields="MSG.GameId, MSG.Winner",
            where=f"MS.OverviewPage='{_escape(overview_page)}' AND MSG.Winner=''",
            limit=1,
        )
        return len(rows) == 0

    # ==========================================
    # Riot Match Data (v5/v4 via Leaguepedia)
    # ==========================================

    def get_riot_game_data(
        self, riot_platform_game_id: str
    ) -> tuple[dict | None, list | None, int | None]:
        """Try Riot v5 then v4 match data from Leaguepedia.

        Returns (parsed_stats, timeline_frames, version) or (None, None, None).
        """
        for version in (5, 4):
            try:
                raw_data, raw_timeline = self.site.get_data_and_timeline(
                    riot_platform_game_id, version=version
                )
                if version == 5:
                    stats = self._parse_v5_endgame_stats(raw_data)
                    timeline = self._parse_v5_timeline(raw_timeline)
                else:
                    stats = self._parse_v4_endgame_stats(raw_data)
                    timeline = self._parse_v4_timeline(raw_timeline)
                return stats, timeline, version
            except Exception:
                continue
        return None, None, None

    def _parse_v5_endgame_stats(self, data: dict) -> dict:
        """Parse match-v5 endgame JSON into normalized player stats."""
        info = data.get("info", data)
        participants = info.get("participants", [])

        players = []
        for p in participants:
            total_cs = (p.get("totalMinionsKilled", 0) or 0) + (
                p.get("neutralMinionsKilled", 0) or 0
            )
            items = [p.get(f"item{i}", 0) or 0 for i in range(7)]

            # Convert Riot perks to GRID format
            raw_perks = p.get("perks") or {}
            styles = raw_perks.get("styles") or []
            stat_perks = raw_perks.get("statPerks") or {}
            perk_style = styles[0]["style"] if len(styles) > 0 else None
            perk_sub_style = styles[1]["style"] if len(styles) > 1 else None
            perk_ids = []
            for style in styles:
                for sel in style.get("selections", []):
                    perk_ids.append(sel.get("perk", 0))
            for key in ("offense", "flex", "defense"):
                if stat_perks.get(key):
                    perk_ids.append(stat_perks[key])
            perks = {
                "perkStyle": perk_style,
                "perkSubStyle": perk_sub_style,
                "perkIds": perk_ids,
            }

            players.append({
                "participant_id": p.get("participantId"),
                "team_id": p.get("teamId"),
                "champion_name": p.get("championName"),
                "champion_id": p.get("championId"),
                "kills": p.get("kills", 0),
                "deaths": p.get("deaths", 0),
                "assists": p.get("assists", 0),
                "cs": total_cs,
                "gold_earned": p.get("goldEarned", 0),
                "damage_to_champions": p.get("totalDamageDealtToChampions", 0),
                "damage_taken": p.get("totalDamageTaken", 0),
                "vision_score": p.get("visionScore", 0),
                "win": p.get("win", False),
                # First blood
                "first_blood_kill": p.get("firstBloodKill", False),
                "first_blood_assist": p.get("firstBloodAssist", False),
                # Items & runes
                "items": items,
                "runes": perks,
                # Multi-kills
                "multi_kills": {
                    "double": p.get("doubleKills", 0),
                    "triple": p.get("tripleKills", 0),
                    "quadra": p.get("quadraKills", 0),
                    "penta": p.get("pentaKills", 0),
                },
                # Vision détaillée
                "wards_placed": p.get("wardsPlaced", 0),
                "wards_killed": p.get("wardsKilled", 0),
                "control_wards_placed": p.get("detectorWardsPlaced", 0),
                # Solo stats
                "damage_to_buildings": p.get("damageDealtToBuildings", 0),
                "damage_to_turrets": p.get("damageDealtToTurrets", 0),
                "damage_mitigated": p.get("damageSelfMitigated", 0),
                "damage_shielded": p.get("totalDamageShieldedOnTeammates", 0),
                "total_heal": p.get("totalHeal", 0),
                "heals_on_teammates": p.get("totalHealsOnTeammates", 0),
                "cc_time": p.get("totalTimeCCDealt", 0),
                "time_ccing_others": p.get("timeCCingOthers", 0),
                "time_spent_dead": p.get("totalTimeSpentDead", 0),
                # Summoner spells
                "summoner1_id": p.get("spell1Id", 0),
                "summoner2_id": p.get("spell2Id", 0),
            })

        # Parse team objectives
        teams_data = {}
        for team in info.get("teams", []):
            tid = team.get("teamId")
            objectives = team.get("objectives") or {}
            teams_data[tid] = {
                obj_name: {"first": obj.get("first", False), "kills": obj.get("kills", 0)}
                for obj_name, obj in objectives.items()
            }

        # Riot match-v5: gameDuration was in ms before patch 11.20, seconds after
        game_duration = info.get("gameDuration")
        if game_duration and game_duration > 100000:
            game_duration = game_duration // 1000

        return {
            "game_duration": game_duration,
            "game_version": info.get("gameVersion"),
            "players": players,
            "teams": teams_data,
        }

    def _parse_v5_timeline(self, timeline: dict) -> dict | None:
        """Parse match-v5 timeline JSON into per-minute frames + events.

        Returns dict with:
            - frames: list of per-minute participant snapshots
            - events: dict with first_blood_victim, solo_kills, solo_deaths, plates
            - kill_events: list of all champion kill events
        """
        if timeline is None:
            return None

        info = timeline.get("info", timeline)
        frames = info.get("frames", [])

        parsed_frames = []
        # Track KDA per participant across events
        kill_tracker: dict[int, dict] = {}  # pid → {kills, deaths, assists}

        # Event-based stats
        first_blood_time_ms: int | None = None
        first_blood_victim_pid: int | None = None
        solo_kills: dict[int, int] = {}   # pid → count
        solo_deaths: dict[int, int] = {}  # pid → count
        # plates: pid → {total, top, mid, bot}
        plates_by_player: dict[int, dict] = {}

        for frame in frames:
            ts = frame.get("timestamp", 0)
            minute = int(ts // 60000) if ts is not None else None

            # Parse events in this frame
            for event in frame.get("events", []):
                etype = event.get("type")

                if etype == "CHAMPION_KILL":
                    killer_id = event.get("killerId", 0)
                    victim_id = event.get("victimId", 0)
                    assists = event.get("assistingParticipantIds", [])

                    # Track KDA
                    if killer_id > 0:
                        kill_tracker.setdefault(killer_id, {"kills": 0, "deaths": 0, "assists": 0})
                        kill_tracker[killer_id]["kills"] += 1
                    kill_tracker.setdefault(victim_id, {"kills": 0, "deaths": 0, "assists": 0})
                    kill_tracker[victim_id]["deaths"] += 1
                    for a in assists:
                        kill_tracker.setdefault(a, {"kills": 0, "deaths": 0, "assists": 0})
                        kill_tracker[a]["assists"] += 1

                    # First blood (first kill event)
                    if first_blood_victim_pid is None and victim_id > 0:
                        first_blood_victim_pid = victim_id
                        first_blood_time_ms = event.get("timestamp", 0)

                    # Solo kills (no assists, killer is a player)
                    if len(assists) == 0 and killer_id > 0:
                        solo_kills[killer_id] = solo_kills.get(killer_id, 0) + 1
                        solo_deaths[victim_id] = solo_deaths.get(victim_id, 0) + 1

                elif etype == "TURRET_PLATE_DESTROYED":
                    killer_id = event.get("killerId", 0)
                    if killer_id > 0:
                        lane = (event.get("laneType") or "").lower()
                        lane_key = "top" if "top" in lane else "mid" if "mid" in lane else "bot" if "bot" in lane else "other"
                        event_ts = event.get("timestamp", 0)
                        is_before_15 = event_ts < 900_000  # 15 min in ms

                        pd = plates_by_player.setdefault(killer_id, {
                            "destroyed": 0, "gold": 0, "before_15": 0,
                            "top": {"destroyed": 0, "gold": 0, "before_15": 0},
                            "mid": {"destroyed": 0, "gold": 0, "before_15": 0},
                            "bot": {"destroyed": 0, "gold": 0, "before_15": 0},
                        })
                        pd["destroyed"] += 1
                        if lane_key in pd:
                            pd[lane_key]["destroyed"] += 1
                        if is_before_15:
                            pd["before_15"] += 1
                            if lane_key in pd:
                                pd[lane_key]["before_15"] += 1

            # Parse participant frames
            participants_frame = {}
            for pid, pf in (frame.get("participantFrames") or {}).items():
                pid_int = int(pid) if isinstance(pid, str) and pid.isdigit() else pid
                total_cs = (pf.get("minionsKilled", 0) or 0) + (
                    pf.get("jungleMinionsKilled", 0) or 0
                )
                damage_stats = pf.get("damageStats") or {}

                # Get current KDA from tracked events
                kda = kill_tracker.get(pid_int, {"kills": 0, "deaths": 0, "assists": 0})

                participants_frame[pid_int] = {
                    "total_gold": pf.get("totalGold", 0),
                    "xp": pf.get("xp", 0),
                    "level": pf.get("level", 0),
                    "cs": total_cs,
                    "damage": damage_stats.get("totalDamageDoneToChampions", 0),
                    "kills": kda["kills"],
                    "deaths": kda["deaths"],
                    "assists": kda["assists"],
                }

            parsed_frames.append({
                "timestamp": ts,
                "minute": minute,
                "participants": participants_frame,
            })

        return {
            "frames": parsed_frames,
            "events": {
                "first_blood_victim_pid": first_blood_victim_pid,
                "first_blood_time": first_blood_time_ms // 1000 if first_blood_time_ms else None,
                "solo_kills": solo_kills,
                "solo_deaths": solo_deaths,
                "plates": plates_by_player,
            },
        }

    def _parse_v4_endgame_stats(self, data: dict) -> dict:
        """Parse match-v4 endgame JSON (same structure as v5)."""
        return self._parse_v5_endgame_stats(data)

    def _parse_v4_timeline(self, timeline: dict) -> list[dict] | None:
        """Parse match-v4 timeline (same structure as v5)."""
        return self._parse_v5_timeline(timeline)

    @staticmethod
    def attach_timeline_to_players(
        players_stats: dict,
        timeline_data: dict,
    ) -> list[dict]:
        """Merge timeline data into each player dict.

        Extracts every minute, calculates role-opponent diffs, and attaches
        event-based stats (solo kills, solo deaths, plates, first blood victim).

        Args:
            players_stats: dict with "players" key from parse_v5/v4.
            timeline_data: dict with "frames" and "events" from _parse_v5_timeline.

        Returns:
            List of player dicts with added timeline, stats_at_15, solo_stats,
            plates, and first_blood_victim fields.
        """
        timeline_frames = timeline_data.get("frames", [])
        events = timeline_data.get("events", {})

        # Index all frames by minute
        frames_by_minute: dict[int, dict] = {}
        for frame in timeline_frames:
            m = frame.get("minute")
            if m is not None:
                frames_by_minute[m] = frame

        # Build minute → participant → stats index
        minute_participant_stats: dict[int, dict] = defaultdict(dict)
        for minute, frame in frames_by_minute.items():
            for pid, pdata in (frame.get("participants") or {}).items():
                minute_participant_stats[minute][pid] = pdata

        # Build role → [pid_blue, pid_red] map from endgame data
        # participantId 1-5 = team 100 (blue), 6-10 = team 200 (red)
        # Roles are matched positionally: pid 1↔6, 2↔7, 3↔8, 4↔9, 5↔10
        def get_opponent_pid(pid: int) -> int | None:
            if 1 <= pid <= 5:
                return pid + 5
            elif 6 <= pid <= 10:
                return pid - 5
            return None

        # Attach timeline to each player
        players_with_timeline = []
        for p in players_stats.get("players", []):
            pid = p["participant_id"]
            opp_pid = get_opponent_pid(pid)
            player_copy = dict(p)

            # Full per-minute timeline
            player_copy["timeline"] = {}
            all_minutes = sorted(frames_by_minute.keys())
            for minute in all_minutes:
                pdata = minute_participant_stats.get(minute, {}).get(pid)
                if not pdata:
                    continue
                entry = {
                    "gold": pdata.get("total_gold", 0),
                    "cs": pdata.get("cs", 0),
                    "xp": pdata.get("xp", 0),
                    "damage": pdata.get("damage", 0),
                    "kills": pdata.get("kills", 0),
                    "deaths": pdata.get("deaths", 0),
                    "assists": pdata.get("assists", 0),
                }
                # Calculate diffs vs role opponent
                if opp_pid is not None:
                    opp_data = minute_participant_stats.get(minute, {}).get(opp_pid)
                    if opp_data:
                        entry["cs_diff"] = entry["cs"] - opp_data.get("cs", 0)
                        entry["gold_diff"] = entry["gold"] - opp_data.get("total_gold", 0)
                        entry["xp_diff"] = entry["xp"] - opp_data.get("xp", 0)
                player_copy["timeline"][minute] = entry

            # stats_at_15 with diffs
            player_copy["stats_at_15"] = player_copy["timeline"].get(15, {})

            # Event-based: solo kills, solo deaths
            player_copy["solo_kills"] = events.get("solo_kills", {}).get(pid, 0)
            player_copy["solo_deaths"] = events.get("solo_deaths", {}).get(pid, 0)

            # Event-based: plates
            player_copy["plates_timeline"] = events.get("plates", {}).get(pid, {})

            # Event-based: first blood victim
            player_copy["first_blood_victim"] = (
                events.get("first_blood_victim_pid") == pid
            )

            players_with_timeline.append(player_copy)

        return players_with_timeline


def _escape(value: str) -> str:
    """Escape single quotes for Cargo WHERE clauses."""
    return value.replace("'", "''")
