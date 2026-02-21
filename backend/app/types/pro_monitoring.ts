// Shared types for pro monitoring controllers

export interface TournamentRow {
  tournament_id: number
  external_id: string
  name: string
  year: number | null
  split: string | null
  tournament_level: string | null
  start_date: Date | null
  end_date: Date | null
  match_count: number
  game_count: number
  pro_league_id: number | null
  league_name: string | null
  league_short_name: string | null
  parent_tournament_id: number | null
  child_count: number
}

export interface MatchRow {
  match_id: number
  external_id: string
  team1_name: string | null
  team2_name: string | null
  team1_score: number
  team2_score: number
  status: string
  started_at: Date | null
  tournament_name: string | null
  game_count: number
}

export interface PlayerStatsRow {
  player_name: string | null
  team_side: string
  role: string | null
  champion_id: number | null
  kills: number
  deaths: number
  assists: number
  cs: number
  gold_earned: number
  damage_dealt: number
  kill_participation: number
}

export interface DraftActionRow {
  action_order: number
  action_type: string
  team_side: string
  champion_id: number | null
  role: string | null
}

export interface LeagueRow {
  league_id: number
  external_id: string | null
  name: string
  short_name: string | null
  region: string | null
  logo_url: string | null
  tier: number | null
  is_followed: boolean
}

export interface MatchOverviewRow {
  match_id: number
  external_id: string
  team1_name: string | null
  team1_tag: string | null
  team2_name: string | null
  team2_tag: string | null
  team1_score: number
  team2_score: number
  format: string
  status: string
  scheduled_at: Date | null
  started_at: Date | null
  ended_at: Date | null
  tournament_name: string | null
  league_short_name: string | null
}
