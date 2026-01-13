-- Migration 003: Data Integrity Constraints
-- Priority: P1 (High)
-- Description: Add CHECK constraints for domain values to ensure data quality
-- Impact: Prevents invalid data from being inserted
--
-- Run with: psql -d esports_tracker -f 003_data_integrity.sql
-- Rollback: See bottom of file

BEGIN;

-- ============================================================================
-- 1. CONTRAINTES SUR LES TIERS (RANKS LOL)
-- ============================================================================
-- Valeurs valides pour le systeme de classement LoL

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_ranks_valid_tier'
    ) THEN
        ALTER TABLE lol_current_ranks
        ADD CONSTRAINT chk_ranks_valid_tier
        CHECK (
            tier IS NULL OR
            tier IN ('IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER')
        );
        RAISE NOTICE 'Added constraint: chk_ranks_valid_tier';
    END IF;
END $$;


-- ============================================================================
-- 2. CONTRAINTES SUR LES RANKS (I, II, III, IV)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_ranks_valid_rank'
    ) THEN
        ALTER TABLE lol_current_ranks
        ADD CONSTRAINT chk_ranks_valid_rank
        CHECK (
            rank IS NULL OR
            rank IN ('I', 'II', 'III', 'IV')
        );
        RAISE NOTICE 'Added constraint: chk_ranks_valid_rank';
    END IF;
END $$;


-- ============================================================================
-- 3. CONTRAINTES SUR LES QUEUE TYPES
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_ranks_valid_queue'
    ) THEN
        ALTER TABLE lol_current_ranks
        ADD CONSTRAINT chk_ranks_valid_queue
        CHECK (
            queue_type IN ('RANKED_SOLO_5x5', 'RANKED_FLEX_SR', 'RANKED_TFT', 'RANKED_TFT_TURBO')
        );
        RAISE NOTICE 'Added constraint: chk_ranks_valid_queue';
    END IF;
END $$;


-- ============================================================================
-- 4. CONTRAINTES SUR LES ROLES
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_contracts_valid_role'
    ) THEN
        ALTER TABLE player_contracts
        ADD CONSTRAINT chk_contracts_valid_role
        CHECK (
            role IS NULL OR
            role IN ('TOP', 'JGL', 'MID', 'ADC', 'SUP', 'COACH', 'ANALYST', 'MANAGER', 'SUB')
        );
        RAISE NOTICE 'Added constraint: chk_contracts_valid_role';
    END IF;
END $$;


-- ============================================================================
-- 5. CONTRAINTES SUR LES REGIONS LOL
-- ============================================================================
-- Regions officielles Riot Games

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_accounts_valid_region'
    ) THEN
        ALTER TABLE lol_accounts
        ADD CONSTRAINT chk_accounts_valid_region
        CHECK (
            region IN (
                -- Regions principales
                'EUW1', 'EUW',      -- Europe West
                'EUNE1', 'EUN1',    -- Europe Nordic & East
                'NA1',              -- North America
                'KR',               -- Korea
                'JP1',              -- Japan
                'BR1',              -- Brazil
                'LA1', 'LA2',       -- Latin America
                'OC1', 'OCE',       -- Oceania
                'TR1',              -- Turkey
                'RU',               -- Russia
                -- Regions SEA
                'PH2',              -- Philippines
                'SG2',              -- Singapore
                'TW2',              -- Taiwan
                'TH2',              -- Thailand
                'VN2'               -- Vietnam
            )
        );
        RAISE NOTICE 'Added constraint: chk_accounts_valid_region';
    END IF;
END $$;


-- ============================================================================
-- 6. CONTRAINTES SUR LES REGIONS TEAMS
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_teams_valid_region'
    ) THEN
        ALTER TABLE teams
        ADD CONSTRAINT chk_teams_valid_region
        CHECK (
            region IS NULL OR
            region IN (
                -- Ligues majeures LoL
                'LEC',      -- Europe
                'LCS',      -- North America
                'LCK',      -- Korea
                'LPL',      -- China
                'PCS',      -- Pacific
                'VCS',      -- Vietnam
                'CBLOL',    -- Brazil
                'LJL',      -- Japan
                'LLA',      -- Latin America
                -- Ligues regionales Europe
                'LFL',      -- France
                'PRM',      -- Germany (Prime League)
                'LVP',      -- Spain (Superliga)
                'PG',       -- Italy
                'UL',       -- UK (Ultraliga)
                'NLC',      -- Northern Europe
                'EBL',      -- Balkans
                'GLL',      -- Greece
                'EUM',      -- EU Masters
                -- Valorant
                'VCT_EMEA', 'VCT_AMERICAS', 'VCT_PACIFIC',
                -- Autres
                'OTHER'
            )
        );
        RAISE NOTICE 'Added constraint: chk_teams_valid_region';
    END IF;
END $$;


-- ============================================================================
-- 7. CONTRAINTES LOGIQUES SUR LES STATS
-- ============================================================================

-- Wins ne peut pas depasser games_played
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_daily_stats_wins_games'
    ) THEN
        ALTER TABLE lol_daily_stats
        ADD CONSTRAINT chk_daily_stats_wins_games
        CHECK (wins <= games_played);
        RAISE NOTICE 'Added constraint: chk_daily_stats_wins_games';
    END IF;
END $$;

-- Constraint removed: soloq_games column no longer exists (migration 29)

-- LP doit etre positif
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_ranks_valid_lp'
    ) THEN
        ALTER TABLE lol_current_ranks
        ADD CONSTRAINT chk_ranks_valid_lp
        CHECK (league_points IS NULL OR league_points >= 0);
        RAISE NOTICE 'Added constraint: chk_ranks_valid_lp';
    END IF;
END $$;


-- ============================================================================
-- 8. CONTRAINTES SUR LES DATES DE CONTRAT
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_contracts_valid_dates'
    ) THEN
        ALTER TABLE player_contracts
        ADD CONSTRAINT chk_contracts_valid_dates
        CHECK (
            end_date IS NULL OR
            start_date IS NULL OR
            end_date >= start_date
        );
        RAISE NOTICE 'Added constraint: chk_contracts_valid_dates';
    END IF;
END $$;


-- ============================================================================
-- 9. CONTRAINTES SUR LES GAMES
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_games_valid_slug'
    ) THEN
        ALTER TABLE games
        ADD CONSTRAINT chk_games_valid_slug
        CHECK (slug IN ('lol', 'valorant', 'tft'));
        RAISE NOTICE 'Added constraint: chk_games_valid_slug';
    END IF;
END $$;


-- ============================================================================
-- VERIFICATION DES DONNEES EXISTANTES
-- ============================================================================
-- Avant d'activer les contraintes, verifier qu'il n'y a pas de violations

DO $$
DECLARE
    violation_count INTEGER;
BEGIN
    RAISE NOTICE '--- Verification des donnees existantes ---';

    -- Verifier les tiers invalides
    SELECT COUNT(*) INTO violation_count
    FROM lol_current_ranks
    WHERE tier IS NOT NULL
    AND tier NOT IN ('IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER');

    IF violation_count > 0 THEN
        RAISE WARNING 'Tiers invalides: % lignes', violation_count;
    ELSE
        RAISE NOTICE 'Tiers: OK';
    END IF;

    -- Verifier les ranks invalides
    SELECT COUNT(*) INTO violation_count
    FROM lol_current_ranks
    WHERE rank IS NOT NULL
    AND rank NOT IN ('I', 'II', 'III', 'IV');

    IF violation_count > 0 THEN
        RAISE WARNING 'Ranks invalides: % lignes', violation_count;
    ELSE
        RAISE NOTICE 'Ranks: OK';
    END IF;

    -- Verifier wins > games
    SELECT COUNT(*) INTO violation_count
    FROM lol_daily_stats
    WHERE wins > games_played;

    IF violation_count > 0 THEN
        RAISE WARNING 'Stats avec wins > games: % lignes', violation_count;
    ELSE
        RAISE NOTICE 'Stats wins/games: OK';
    END IF;

    RAISE NOTICE '--- Migration 003 complete ---';
END $$;

COMMIT;


-- ============================================================================
-- ROLLBACK (executer manuellement si necessaire)
-- ============================================================================
/*
BEGIN;

ALTER TABLE lol_current_ranks DROP CONSTRAINT IF EXISTS chk_ranks_valid_tier;
ALTER TABLE lol_current_ranks DROP CONSTRAINT IF EXISTS chk_ranks_valid_rank;
ALTER TABLE lol_current_ranks DROP CONSTRAINT IF EXISTS chk_ranks_valid_queue;
ALTER TABLE lol_current_ranks DROP CONSTRAINT IF EXISTS chk_ranks_valid_lp;
ALTER TABLE player_contracts DROP CONSTRAINT IF EXISTS chk_contracts_valid_role;
ALTER TABLE player_contracts DROP CONSTRAINT IF EXISTS chk_contracts_valid_dates;
ALTER TABLE lol_accounts DROP CONSTRAINT IF EXISTS chk_accounts_valid_region;
ALTER TABLE teams DROP CONSTRAINT IF EXISTS chk_teams_valid_region;
ALTER TABLE lol_daily_stats DROP CONSTRAINT IF EXISTS chk_daily_stats_wins_games;
ALTER TABLE lol_daily_stats DROP CONSTRAINT IF EXISTS chk_daily_stats_soloq_games;
ALTER TABLE games DROP CONSTRAINT IF EXISTS chk_games_valid_slug;

COMMIT;
*/
