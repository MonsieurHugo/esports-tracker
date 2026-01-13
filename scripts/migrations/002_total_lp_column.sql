-- Migration 002: Total LP Calculated Column
-- Priority: P0 (Critical)
-- Description: Add pre-calculated total_lp column for fast leaderboard sorting
-- Estimated improvement: 60-80% faster leaderboard queries
--
-- Run with: psql -d esports_tracker -f 002_total_lp_column.sql
-- Rollback: See bottom of file

BEGIN;

-- ============================================================================
-- 1. AJOUTER LA COLONNE total_lp
-- ============================================================================
-- Cette colonne stocke le LP total calcule, evitant le calcul a chaque requete
-- Valeurs: IRON I 0LP = 0, CHALLENGER 1500LP = 4300

ALTER TABLE lol_current_ranks
ADD COLUMN IF NOT EXISTS total_lp INTEGER;

COMMENT ON COLUMN lol_current_ranks.total_lp IS
'LP total pre-calcule pour tri rapide. Mis a jour automatiquement via trigger.
Formule: base_tier + rank_offset + league_points
Ex: Diamond II 75LP = 2400 + 200 + 75 = 2675';


-- ============================================================================
-- 2. FONCTION DE CALCUL (si elle n'existe pas deja)
-- ============================================================================
-- Note: La fonction calculate_total_lp existe deja dans schema.sql
-- On la recree avec CREATE OR REPLACE pour s'assurer qu'elle est a jour

CREATE OR REPLACE FUNCTION calculate_total_lp(
    p_tier VARCHAR,
    p_rank VARCHAR,
    p_lp INTEGER
) RETURNS INTEGER AS $$
DECLARE
    base_lp INTEGER;
    rank_lp INTEGER;
BEGIN
    -- Base LP par tier
    base_lp := CASE p_tier
        WHEN 'IRON' THEN 0
        WHEN 'BRONZE' THEN 400
        WHEN 'SILVER' THEN 800
        WHEN 'GOLD' THEN 1200
        WHEN 'PLATINUM' THEN 1600
        WHEN 'EMERALD' THEN 2000
        WHEN 'DIAMOND' THEN 2400
        WHEN 'MASTER' THEN 2800
        WHEN 'GRANDMASTER' THEN 2800
        WHEN 'CHALLENGER' THEN 2800
        ELSE 0
    END;

    -- LP additionnel par rank (IV=0, III=100, II=200, I=300)
    -- Pour Master+, pas de subdivision par rank
    IF p_tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER') THEN
        rank_lp := 0;
    ELSE
        rank_lp := CASE p_rank
            WHEN 'IV' THEN 0
            WHEN 'III' THEN 100
            WHEN 'II' THEN 200
            WHEN 'I' THEN 300
            ELSE 0
        END;
    END IF;

    RETURN base_lp + rank_lp + COALESCE(p_lp, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ============================================================================
-- 3. TRIGGER POUR MISE A JOUR AUTOMATIQUE
-- ============================================================================
-- Chaque fois que tier, rank ou league_points change, total_lp est recalcule

CREATE OR REPLACE FUNCTION trigger_update_total_lp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_lp := calculate_total_lp(NEW.tier, NEW.rank, NEW.league_points);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Supprimer le trigger s'il existe deja (pour idempotence)
DROP TRIGGER IF EXISTS trg_ranks_total_lp ON lol_current_ranks;

-- Creer le trigger
CREATE TRIGGER trg_ranks_total_lp
    BEFORE INSERT OR UPDATE OF tier, rank, league_points
    ON lol_current_ranks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_total_lp();


-- ============================================================================
-- 4. MISE A JOUR DES DONNEES EXISTANTES
-- ============================================================================
-- Calculer total_lp pour toutes les lignes existantes

UPDATE lol_current_ranks
SET total_lp = calculate_total_lp(tier, rank, league_points)
WHERE total_lp IS NULL OR total_lp != calculate_total_lp(tier, rank, league_points);

-- Afficher le nombre de lignes mises a jour
DO $$
DECLARE
    updated_count INTEGER;
BEGIN
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RAISE NOTICE 'Updated % rows with calculated total_lp', updated_count;
END $$;


-- ============================================================================
-- 5. INDEX POUR LE TRI PAR LP
-- ============================================================================
-- Index principal pour les leaderboards Solo/Duo

CREATE INDEX IF NOT EXISTS idx_ranks_total_lp_soloq
    ON lol_current_ranks(total_lp DESC NULLS LAST)
    WHERE queue_type = 'RANKED_SOLO_5x5';

-- Index pour Flex (moins utilise mais present)
CREATE INDEX IF NOT EXISTS idx_ranks_total_lp_flex
    ON lol_current_ranks(total_lp DESC NULLS LAST)
    WHERE queue_type = 'RANKED_FLEX_SR';


-- ============================================================================
-- 6. CONTRAINTE NOT NULL (optionnel, a activer apres verification)
-- ============================================================================
-- Decommenter apres avoir verifie que toutes les lignes ont un total_lp

-- ALTER TABLE lol_current_ranks
-- ALTER COLUMN total_lp SET NOT NULL;


-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
    null_count INTEGER;
    sample_data RECORD;
BEGIN
    -- Verifier qu'il n'y a pas de NULL
    SELECT COUNT(*) INTO null_count
    FROM lol_current_ranks
    WHERE total_lp IS NULL AND tier IS NOT NULL;

    IF null_count > 0 THEN
        RAISE WARNING 'Il reste % lignes avec total_lp NULL', null_count;
    ELSE
        RAISE NOTICE 'Migration 002 complete. Toutes les lignes ont un total_lp calcule.';
    END IF;

    -- Afficher un exemple pour verification
    SELECT tier, rank, league_points, total_lp
    INTO sample_data
    FROM lol_current_ranks
    WHERE tier IS NOT NULL
    ORDER BY total_lp DESC NULLS LAST
    LIMIT 1;

    IF FOUND THEN
        RAISE NOTICE 'Exemple: % % %LP -> total_lp = %',
            sample_data.tier, sample_data.rank, sample_data.league_points, sample_data.total_lp;
    END IF;
END $$;

COMMIT;


-- ============================================================================
-- ROLLBACK (executer manuellement si necessaire)
-- ============================================================================
/*
BEGIN;

DROP TRIGGER IF EXISTS trg_ranks_total_lp ON lol_current_ranks;
DROP FUNCTION IF EXISTS trigger_update_total_lp();
DROP INDEX IF EXISTS idx_ranks_total_lp_soloq;
DROP INDEX IF EXISTS idx_ranks_total_lp_flex;
ALTER TABLE lol_current_ranks DROP COLUMN IF EXISTS total_lp;

COMMIT;
*/
