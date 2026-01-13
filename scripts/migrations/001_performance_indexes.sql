-- Migration 001: Performance Indexes
-- Priority: P0 (Critical)
-- Description: Add missing indexes for dashboard and leaderboard queries
-- Estimated improvement: 50-70% faster queries on main views
--
-- Run with: psql -d esports_tracker -f 001_performance_indexes.sql
-- Rollback: See bottom of file

BEGIN;

-- ============================================================================
-- 1. INDEX TRIGRAM POUR LA RECHERCHE FUZZY
-- ============================================================================
-- Utilise par: PlayerSearchDropdown, recherche de joueurs
-- Avant: Sequential scan sur ~1000 lignes pour chaque recherche
-- Apres: Index scan avec support des fautes de frappe

-- Verifier que l'extension est active
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index sur le pseudo actuel des joueurs
CREATE INDEX IF NOT EXISTS idx_players_pseudo_trgm
    ON players USING gin(current_pseudo gin_trgm_ops);

-- Index sur les noms d'invocateur des comptes LoL
CREATE INDEX IF NOT EXISTS idx_lol_accounts_summoner_trgm
    ON lol_accounts USING gin(summoner_name gin_trgm_ops);

-- Index sur les noms d'equipe
CREATE INDEX IF NOT EXISTS idx_teams_name_trgm
    ON teams USING gin(name gin_trgm_ops);


-- ============================================================================
-- 2. INDEX POUR LES STATS JOURNALIERES (DASHBOARD)
-- ============================================================================
-- Utilise par: GamesChart, WinrateChart, TopGrinders, tous les calculs de periode
-- Pattern: WHERE puuid = ? AND date BETWEEN ? AND ?
--
-- Index "covering" = inclut les colonnes frequemment SELECT
-- Evite de lire la table principale (index-only scan)

CREATE INDEX IF NOT EXISTS idx_daily_stats_period_covering
    ON lol_daily_stats(puuid, date DESC)
    INCLUDE (games_played, wins, total_kills, total_deaths, total_assists, total_game_duration, tier, rank, lp);


-- ============================================================================
-- 3. INDEX POUR LES STREAKS (WIDGET DASHBOARD)
-- ============================================================================
-- Utilise par: StreakList component
-- Pattern: WHERE current_streak > 0 ORDER BY current_streak DESC LIMIT 10

CREATE INDEX IF NOT EXISTS idx_streaks_current_win
    ON lol_streaks(current_streak DESC)
    WHERE current_streak > 0;

CREATE INDEX IF NOT EXISTS idx_streaks_current_loss
    ON lol_streaks(current_streak ASC)
    WHERE current_streak < 0;


-- ============================================================================
-- 4. INDEX POUR LES MATCHS RECENTS
-- ============================================================================
-- Utilise par: Page joueur, historique des matchs
-- Pattern: JOIN lol_match_stats ON match_id WHERE puuid = ? ORDER BY game_start DESC

CREATE INDEX IF NOT EXISTS idx_match_stats_puuid_match
    ON lol_match_stats(puuid, match_id);

-- Index composite pour la jointure efficace matches <-> match_stats
CREATE INDEX IF NOT EXISTS idx_matches_start_queue
    ON lol_matches(game_start DESC, queue_id);


-- ============================================================================
-- 5. INDEX POUR LES COMPTES PAR JOUEUR
-- ============================================================================
-- Utilise par: PlayerLeaderboard avec accordion des comptes
-- Pattern: WHERE player_id = ? ou JOIN sur player_id

CREATE INDEX IF NOT EXISTS idx_lol_accounts_player_active
    ON lol_accounts(player_id)
    WHERE player_id IS NOT NULL;


-- ============================================================================
-- 6. INDEX POUR LES CONTRATS ACTIFS
-- ============================================================================
-- Utilise par: TeamLeaderboard, affichage du roster actuel
-- Pattern: WHERE team_id = ? AND (end_date IS NULL OR end_date > NOW())

CREATE INDEX IF NOT EXISTS idx_contracts_team_active
    ON player_contracts(team_id, player_id)
    WHERE end_date IS NULL OR end_date > CURRENT_DATE;


-- ============================================================================
-- 7. INDEX POUR LE TRI DES RANKS
-- ============================================================================
-- Utilise par: Leaderboard par LP
-- Note: Sera optimise par migration 002 avec colonne total_lp
-- En attendant, index sur tier pour filtrage rapide

CREATE INDEX IF NOT EXISTS idx_ranks_tier_queue
    ON lol_current_ranks(tier, queue_type)
    WHERE queue_type = 'RANKED_SOLO_5x5';


-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
    idx_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO idx_count
    FROM pg_indexes
    WHERE indexname LIKE 'idx_%'
    AND schemaname = 'public';

    RAISE NOTICE 'Migration 001 complete. Total custom indexes: %', idx_count;
END $$;

COMMIT;


-- ============================================================================
-- ROLLBACK (executer manuellement si necessaire)
-- ============================================================================
/*
DROP INDEX IF EXISTS idx_players_pseudo_trgm;
DROP INDEX IF EXISTS idx_lol_accounts_summoner_trgm;
DROP INDEX IF EXISTS idx_teams_name_trgm;
DROP INDEX IF EXISTS idx_daily_stats_period_covering;
DROP INDEX IF EXISTS idx_streaks_current_win;
DROP INDEX IF EXISTS idx_streaks_current_loss;
DROP INDEX IF EXISTS idx_match_stats_puuid_match;
DROP INDEX IF EXISTS idx_matches_start_queue;
DROP INDEX IF EXISTS idx_lol_accounts_player_active;
DROP INDEX IF EXISTS idx_contracts_team_active;
DROP INDEX IF EXISTS idx_ranks_tier_queue;
*/
