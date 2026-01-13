-- Migration 006: Worker Optimization Indexes
-- Priority: P2 (Medium)
-- Description: Indexes optimized for worker batch operations
-- Impact: Faster upserts and account selection for refresh cycles
--
-- Run with: psql -d esports_tracker -f 006_worker_indexes.sql
-- Rollback: See bottom of file

BEGIN;

-- ============================================================================
-- 1. INDEX POUR LA SELECTION DES COMPTES A RAFRAICHIR
-- ============================================================================
-- Le worker selectionne les comptes par priorite:
--   1. Comptes jamais fetches (last_fetched_at IS NULL)
--   2. Comptes les plus anciens (last_fetched_at ASC)
--   3. Seulement les comptes actifs lies a un joueur

-- Index pour trouver les comptes prioritaires
CREATE INDEX IF NOT EXISTS idx_lol_accounts_refresh_priority
    ON lol_accounts(last_fetched_at ASC NULLS FIRST, player_id)
    WHERE player_id IS NOT NULL AND is_active = true;

COMMENT ON INDEX idx_lol_accounts_refresh_priority IS
'Index pour la selection des comptes a rafraichir par le worker. NULLS FIRST = priorite aux jamais fetches.';

-- Index similaire pour Valorant (si migration 005 executee)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'val_accounts') THEN
        CREATE INDEX IF NOT EXISTS idx_val_accounts_refresh_priority
            ON val_accounts(last_fetched_at ASC NULLS FIRST, player_id)
            WHERE player_id IS NOT NULL AND is_active = true;
    END IF;
END $$;


-- ============================================================================
-- 2. INDEX POUR LES UPSERTS DE RANKS
-- ============================================================================
-- Pattern worker: INSERT ... ON CONFLICT (puuid, queue_type) DO UPDATE
-- L'index unique existe deja, mais on s'assure qu'il est optimal

-- Verifier/creer l'index unique sur puuid pour les ranks
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_ranks_puuid_queue_unique'
    ) THEN
        CREATE UNIQUE INDEX idx_ranks_puuid_queue_unique
            ON lol_current_ranks(puuid, queue_type);
    END IF;
END $$;


-- ============================================================================
-- 3. INDEX POUR LES UPSERTS DE STATS JOURNALIERES
-- ============================================================================
-- Pattern worker: INSERT ... ON CONFLICT (puuid, date) DO UPDATE

-- L'index unique existe normalement via la contrainte, mais verifions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_daily_stats_upsert'
    ) THEN
        CREATE UNIQUE INDEX idx_daily_stats_upsert
            ON lol_daily_stats(puuid, date);
    END IF;
END $$;


-- ============================================================================
-- 4. INDEX POUR LA VERIFICATION D'EXISTENCE DES MATCHS
-- ============================================================================
-- Le worker verifie si un match existe avant de l'inserer
-- Pattern: SELECT 1 FROM lol_matches WHERE match_id = ?

-- match_id est deja PRIMARY KEY, donc indexe
-- Mais on peut ajouter un index partiel pour les matchs recents (optim marge)

CREATE INDEX IF NOT EXISTS idx_matches_recent
    ON lol_matches(match_id)
    WHERE game_start > NOW() - INTERVAL '7 days';

COMMENT ON INDEX idx_matches_recent IS
'Index partiel pour les matchs recents. Optimise les verifications d existence du worker.';


-- ============================================================================
-- 5. INDEX POUR LE BATCH DE STATS JOUEUR
-- ============================================================================
-- Quand le worker met a jour un compte, il recalcule souvent les streaks
-- Pattern: SELECT * FROM lol_daily_stats WHERE puuid = ? ORDER BY date DESC LIMIT N

-- L'index covering de migration 001 devrait suffire, mais ajoutons un index specifique
CREATE INDEX IF NOT EXISTS idx_daily_stats_recent_lookup
    ON lol_daily_stats(puuid, date DESC)
    WHERE date > CURRENT_DATE - INTERVAL '30 days';

COMMENT ON INDEX idx_daily_stats_recent_lookup IS
'Index partiel pour les stats des 30 derniers jours. Utilise par le worker pour les calculs de streak.';


-- ============================================================================
-- 6. INDEX POUR LES METRIQUES WORKER
-- ============================================================================
-- Le monitoring dashboard lit les metriques recentes
-- Pattern: SELECT * FROM worker_metrics_hourly WHERE hour > NOW() - INTERVAL '24 hours'

CREATE INDEX IF NOT EXISTS idx_worker_metrics_recent
    ON worker_metrics_hourly(hour DESC)
    WHERE hour > NOW() - INTERVAL '7 days';

-- Index pour les logs avec filtrage par type et severite
CREATE INDEX IF NOT EXISTS idx_worker_logs_filtered
    ON worker_logs(timestamp DESC, log_type, severity)
    WHERE timestamp > NOW() - INTERVAL '24 hours';


-- ============================================================================
-- 7. INDEX POUR LA MISE A JOUR DES TIMESTAMPS
-- ============================================================================
-- Apres chaque fetch, le worker update last_fetched_at et updated_at
-- Pattern: UPDATE lol_accounts SET last_fetched_at = NOW() WHERE puuid = ?

-- puuid est deja la PK ou a un index unique, c'est optimal


-- ============================================================================
-- 8. INDEX POUR LES CHAMPION/AGENT STATS UPSERTS
-- ============================================================================
-- Pattern: INSERT ... ON CONFLICT (puuid, champion_id) DO UPDATE

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_champion_stats_upsert'
    ) THEN
        CREATE UNIQUE INDEX idx_champion_stats_upsert
            ON lol_champion_stats(puuid, champion_id);
    END IF;
END $$;


-- ============================================================================
-- 9. ANALYSE DES TABLES POUR LE QUERY PLANNER
-- ============================================================================
-- Apres l'ajout d'index, on analyse les tables pour que PostgreSQL
-- utilise les bonnes statistiques

ANALYZE lol_accounts;
ANALYZE lol_current_ranks;
ANALYZE lol_daily_stats;
ANALYZE lol_matches;
ANALYZE lol_match_stats;
ANALYZE lol_champion_stats;
ANALYZE worker_metrics_hourly;
ANALYZE worker_logs;

DO $$
BEGIN
    -- Analyser les tables Valorant si elles existent
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'val_accounts') THEN
        ANALYZE val_accounts;
        ANALYZE val_current_ranks;
        ANALYZE val_daily_stats;
    END IF;
END $$;


-- ============================================================================
-- 10. CONFIGURATION RECOMMANDEE POUR LE WORKER
-- ============================================================================
-- Ces parametres peuvent etre configures au niveau session ou global

-- Pour les batchs d'insert/update massifs
-- SET synchronous_commit = off;  -- A utiliser avec precaution!
-- SET work_mem = '256MB';        -- Pour les gros tris

COMMENT ON INDEX idx_lol_accounts_refresh_priority IS
'Index principal pour le worker. Recommandation: le worker devrait executer:
  SELECT puuid, summoner_name
  FROM lol_accounts
  WHERE player_id IS NOT NULL AND is_active = true
  ORDER BY last_fetched_at ASC NULLS FIRST
  LIMIT <batch_size>
';


-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
    idx_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO idx_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%';

    RAISE NOTICE 'Migration 006 complete. Total custom indexes: %', idx_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Index crees pour optimisation worker:';
    RAISE NOTICE '  - idx_lol_accounts_refresh_priority (selection des comptes)';
    RAISE NOTICE '  - idx_matches_recent (verification existence)';
    RAISE NOTICE '  - idx_daily_stats_recent_lookup (calcul streaks)';
    RAISE NOTICE '  - idx_worker_metrics_recent (monitoring)';
    RAISE NOTICE '  - idx_worker_logs_filtered (monitoring)';
    RAISE NOTICE '';
    RAISE NOTICE 'ANALYZE execute sur les tables principales.';
END $$;

COMMIT;


-- ============================================================================
-- ROLLBACK (executer manuellement si necessaire)
-- ============================================================================
/*
BEGIN;

DROP INDEX IF EXISTS idx_lol_accounts_refresh_priority;
DROP INDEX IF EXISTS idx_val_accounts_refresh_priority;
DROP INDEX IF EXISTS idx_ranks_puuid_queue_unique;
DROP INDEX IF EXISTS idx_daily_stats_upsert;
DROP INDEX IF EXISTS idx_matches_recent;
DROP INDEX IF EXISTS idx_daily_stats_recent_lookup;
DROP INDEX IF EXISTS idx_worker_metrics_recent;
DROP INDEX IF EXISTS idx_worker_logs_filtered;
DROP INDEX IF EXISTS idx_champion_stats_upsert;

COMMIT;
*/
