-- Migration 005: Valorant Schema
-- Priority: P2 (Medium - needed in few weeks)
-- Description: Add Valorant-specific tables mirroring LoL structure
-- Impact: Enables Valorant tracking with game-specific data
--
-- Run with: psql -d esports_tracker -f 005_valorant_schema.sql
-- Rollback: See bottom of file
--
-- Architecture:
--   - Tables prefixees 'val_' pour Valorant
--   - Structure similaire a LoL (accounts, ranks, matches, stats)
--   - Specificites: agents au lieu de champions, acts au lieu de splits

BEGIN;

-- ============================================================================
-- 1. AJOUTER VALORANT A LA TABLE GAMES
-- ============================================================================

INSERT INTO games (slug, name, is_active)
VALUES ('valorant', 'Valorant', true)
ON CONFLICT (slug) DO UPDATE SET is_active = true;


-- ============================================================================
-- 2. TABLE DES COMPTES VALORANT
-- ============================================================================
-- Equivalent de lol_accounts pour Valorant

CREATE TABLE IF NOT EXISTS val_accounts (
    account_id SERIAL PRIMARY KEY,

    -- Identifiant Riot unique
    puuid VARCHAR(100) UNIQUE NOT NULL,

    -- Informations du compte
    game_name VARCHAR(50) NOT NULL,           -- Nom de jeu Riot
    tag_line VARCHAR(10) NOT NULL,            -- Tag (ex: #EUW)
    region VARCHAR(10) NOT NULL DEFAULT 'eu', -- eu, na, ap, kr

    -- Lien vers le joueur (optionnel pour les comptes non-pro)
    player_id INTEGER REFERENCES players(player_id) ON DELETE SET NULL,

    -- Metadata tracking
    last_fetched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,

    -- Index de recherche
    CONSTRAINT val_accounts_unique_name UNIQUE(game_name, tag_line, region)
);

CREATE INDEX IF NOT EXISTS idx_val_accounts_player ON val_accounts(player_id) WHERE player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_val_accounts_region ON val_accounts(region);
CREATE INDEX IF NOT EXISTS idx_val_accounts_name_trgm ON val_accounts USING gin(game_name gin_trgm_ops);

COMMENT ON TABLE val_accounts IS 'Comptes Valorant suivis. Equivalent de lol_accounts.';


-- ============================================================================
-- 3. TABLE DES RANKS VALORANT
-- ============================================================================
-- Systeme de ranked different de LoL: tiers + RR (Ranked Rating)

CREATE TABLE IF NOT EXISTS val_current_ranks (
    rank_id SERIAL PRIMARY KEY,

    puuid VARCHAR(100) NOT NULL REFERENCES val_accounts(puuid) ON DELETE CASCADE,

    -- Rank actuel
    tier VARCHAR(20),                 -- 'IRON', 'BRONZE', ..., 'IMMORTAL', 'RADIANT'
    tier_number INTEGER,              -- 1, 2, 3 (pour Iron 1, Iron 2, Iron 3)
    ranked_rating INTEGER DEFAULT 0,  -- RR (0-100, ou plus pour Immortal+)

    -- Peak rank de la saison
    peak_tier VARCHAR(20),
    peak_tier_number INTEGER,
    peak_ranked_rating INTEGER,

    -- Stats ranked
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    games_needed INTEGER,             -- Games restantes pour placement

    -- Act/Episode info
    act_id VARCHAR(50),               -- ID de l'act actuel
    episode INTEGER,                  -- Numero d'episode (ex: 8)
    act INTEGER,                      -- Numero d'act (ex: 3)

    -- Total RR calcule (comme total_lp pour LoL)
    total_rr INTEGER,

    -- Metadata
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(puuid)
);

CREATE INDEX IF NOT EXISTS idx_val_ranks_total_rr ON val_current_ranks(total_rr DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_val_ranks_tier ON val_current_ranks(tier);

COMMENT ON TABLE val_current_ranks IS 'Ranks actuels Valorant. Equivalent de lol_current_ranks.';


-- ============================================================================
-- 4. FONCTION DE CALCUL TOTAL RR
-- ============================================================================
-- Equivalent de calculate_total_lp pour Valorant

CREATE OR REPLACE FUNCTION calculate_total_rr(
    p_tier VARCHAR,
    p_tier_number INTEGER,
    p_rr INTEGER
) RETURNS INTEGER AS $$
DECLARE
    base_rr INTEGER;
BEGIN
    -- Base RR par tier (100 RR par division, 3 divisions par tier sauf Radiant)
    base_rr := CASE p_tier
        WHEN 'IRON' THEN 0
        WHEN 'BRONZE' THEN 300
        WHEN 'SILVER' THEN 600
        WHEN 'GOLD' THEN 900
        WHEN 'PLATINUM' THEN 1200
        WHEN 'DIAMOND' THEN 1500
        WHEN 'ASCENDANT' THEN 1800
        WHEN 'IMMORTAL' THEN 2100
        WHEN 'RADIANT' THEN 2400
        ELSE 0
    END;

    -- Ajouter le RR de la division (sauf Radiant qui n'a pas de divisions)
    IF p_tier NOT IN ('IMMORTAL', 'RADIANT') AND p_tier_number IS NOT NULL THEN
        base_rr := base_rr + (p_tier_number - 1) * 100;
    END IF;

    RETURN base_rr + COALESCE(p_rr, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ============================================================================
-- 5. TRIGGER POUR MISE A JOUR AUTOMATIQUE DE total_rr
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_update_val_total_rr()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_rr := calculate_total_rr(NEW.tier, NEW.tier_number, NEW.ranked_rating);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_val_ranks_total_rr ON val_current_ranks;

CREATE TRIGGER trg_val_ranks_total_rr
    BEFORE INSERT OR UPDATE OF tier, tier_number, ranked_rating
    ON val_current_ranks
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_val_total_rr();


-- ============================================================================
-- 6. TABLE DES MATCHS VALORANT
-- ============================================================================

CREATE TABLE IF NOT EXISTS val_matches (
    match_id VARCHAR(50) PRIMARY KEY,   -- UUID Riot

    -- Info de la partie
    map_id VARCHAR(50) NOT NULL,        -- 'Ascent', 'Bind', etc.
    game_mode VARCHAR(30) NOT NULL,     -- 'Competitive', 'Unrated', 'Spike Rush', etc.
    game_start TIMESTAMPTZ NOT NULL,
    game_duration INTEGER NOT NULL,     -- en secondes

    -- Score final
    rounds_played INTEGER,
    team_blue_rounds INTEGER,
    team_red_rounds INTEGER,

    -- Metadata
    game_version VARCHAR(20),
    season_id VARCHAR(50),              -- Act ID
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_val_matches_start ON val_matches(game_start DESC);
CREATE INDEX IF NOT EXISTS idx_val_matches_mode ON val_matches(game_mode);

COMMENT ON TABLE val_matches IS 'Matchs Valorant. Equivalent de lol_matches.';


-- ============================================================================
-- 7. TABLE DES STATS PAR MATCH (PARTICIPATION JOUEUR)
-- ============================================================================

CREATE TABLE IF NOT EXISTS val_match_stats (
    id SERIAL PRIMARY KEY,

    match_id VARCHAR(50) NOT NULL REFERENCES val_matches(match_id) ON DELETE CASCADE,
    puuid VARCHAR(100) NOT NULL REFERENCES val_accounts(puuid) ON DELETE CASCADE,

    -- Info equipe
    team VARCHAR(10) NOT NULL,          -- 'Blue' ou 'Red'
    team_won BOOLEAN NOT NULL,

    -- Agent joue
    agent_id VARCHAR(50) NOT NULL,      -- 'Jett', 'Reyna', etc.

    -- Stats de combat
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    headshots INTEGER DEFAULT 0,
    bodyshots INTEGER DEFAULT 0,
    legshots INTEGER DEFAULT 0,

    -- Stats avancees
    score INTEGER DEFAULT 0,            -- Score ACS (Average Combat Score)
    damage_dealt INTEGER DEFAULT 0,
    damage_received INTEGER DEFAULT 0,
    first_bloods INTEGER DEFAULT 0,
    first_deaths INTEGER DEFAULT 0,
    clutches_won INTEGER DEFAULT 0,
    clutches_lost INTEGER DEFAULT 0,

    -- Stats economiques
    spent_credits INTEGER DEFAULT 0,
    spent_credits_avg INTEGER DEFAULT 0,

    -- Position finale
    placement INTEGER,                  -- 1-5 dans l'equipe

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(match_id, puuid)
);

CREATE INDEX IF NOT EXISTS idx_val_match_stats_puuid ON val_match_stats(puuid, match_id);
CREATE INDEX IF NOT EXISTS idx_val_match_stats_agent ON val_match_stats(agent_id);

COMMENT ON TABLE val_match_stats IS 'Stats par joueur par match Valorant. Equivalent de lol_match_stats.';


-- ============================================================================
-- 8. TABLE DES STATS JOURNALIERES VALORANT
-- ============================================================================
-- Agregation quotidienne pour le dashboard

CREATE TABLE IF NOT EXISTS val_daily_stats (
    id SERIAL PRIMARY KEY,

    puuid VARCHAR(100) NOT NULL REFERENCES val_accounts(puuid) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Stats de parties
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    competitive_games INTEGER DEFAULT 0,

    -- Stats de combat agregees
    total_kills INTEGER DEFAULT 0,
    total_deaths INTEGER DEFAULT 0,
    total_assists INTEGER DEFAULT 0,
    total_headshots INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,

    -- Evolution RR
    rr_start INTEGER,
    rr_end INTEGER,
    rr_change INTEGER GENERATED ALWAYS AS (COALESCE(rr_end, 0) - COALESCE(rr_start, 0)) STORED,

    -- Temps de jeu
    total_game_duration INTEGER DEFAULT 0,  -- en secondes

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(puuid, date)
);

CREATE INDEX IF NOT EXISTS idx_val_daily_stats_lookup ON val_daily_stats(puuid, date DESC);
CREATE INDEX IF NOT EXISTS idx_val_daily_stats_date ON val_daily_stats(date DESC);

COMMENT ON TABLE val_daily_stats IS 'Stats journalieres Valorant. Equivalent de lol_daily_stats.';


-- ============================================================================
-- 9. TABLE DES STATS PAR AGENT
-- ============================================================================
-- Stats cumulatives par agent (comme lol_champion_stats)

CREATE TABLE IF NOT EXISTS val_agent_stats (
    id SERIAL PRIMARY KEY,

    puuid VARCHAR(100) NOT NULL REFERENCES val_accounts(puuid) ON DELETE CASCADE,
    agent_id VARCHAR(50) NOT NULL,

    -- Stats de base
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER GENERATED ALWAYS AS (games_played - wins) STORED,
    winrate DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE WHEN games_played > 0 THEN ROUND(wins::DECIMAL / games_played * 100, 2) ELSE 0 END
    ) STORED,

    -- Stats de combat
    total_kills INTEGER DEFAULT 0,
    total_deaths INTEGER DEFAULT 0,
    total_assists INTEGER DEFAULT 0,
    avg_score DECIMAL(6,1) DEFAULT 0,   -- ACS moyen
    total_first_bloods INTEGER DEFAULT 0,

    -- Metadata
    last_played_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(puuid, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_val_agent_stats_puuid ON val_agent_stats(puuid);
CREATE INDEX IF NOT EXISTS idx_val_agent_stats_agent ON val_agent_stats(agent_id);

COMMENT ON TABLE val_agent_stats IS 'Stats par agent Valorant. Equivalent de lol_champion_stats.';


-- ============================================================================
-- 10. TABLE DES STREAKS VALORANT
-- ============================================================================

CREATE TABLE IF NOT EXISTS val_streaks (
    id SERIAL PRIMARY KEY,

    puuid VARCHAR(100) NOT NULL REFERENCES val_accounts(puuid) ON DELETE CASCADE,

    -- Streak actuelle (positif = wins, negatif = losses)
    current_streak INTEGER DEFAULT 0,

    -- Records de la saison
    longest_win_streak INTEGER DEFAULT 0,
    longest_loss_streak INTEGER DEFAULT 0,

    -- Act/Season
    act_id VARCHAR(50),

    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(puuid, act_id)
);

CREATE INDEX IF NOT EXISTS idx_val_streaks_current ON val_streaks(current_streak DESC) WHERE current_streak > 0;

COMMENT ON TABLE val_streaks IS 'Streaks Valorant par act. Equivalent de lol_streaks.';


-- ============================================================================
-- 11. VUE CONSOLIDEE DES STATS JOUEUR VALORANT
-- ============================================================================
-- Equivalent de player_current_stats pour Valorant

CREATE OR REPLACE VIEW val_player_current_stats AS
SELECT
    p.player_id,
    p.current_pseudo AS pseudo,
    p.slug,
    t.current_name AS team_name,
    t.short_name AS team_tag,
    t.region AS league,
    va.puuid,
    va.game_name,
    va.tag_line,
    va.region AS account_region,
    vr.tier,
    vr.tier_number,
    vr.ranked_rating,
    vr.total_rr,
    vr.peak_tier,
    vr.peak_tier_number,
    vr.wins,
    vr.losses,
    va.last_fetched_at
FROM players p
LEFT JOIN player_contracts pc ON p.player_id = pc.player_id
    AND (pc.end_date IS NULL OR pc.end_date > CURRENT_DATE)
LEFT JOIN teams t ON pc.team_id = t.team_id
LEFT JOIN val_accounts va ON p.player_id = va.player_id
LEFT JOIN val_current_ranks vr ON va.puuid = vr.puuid
WHERE va.puuid IS NOT NULL;

COMMENT ON VIEW val_player_current_stats IS 'Vue consolidee des stats actuelles Valorant par joueur.';


-- ============================================================================
-- 12. CONTRAINTES D'INTEGRITE VALORANT
-- ============================================================================

-- Regions Valorant valides
ALTER TABLE val_accounts
ADD CONSTRAINT chk_val_accounts_region
CHECK (region IN ('eu', 'na', 'ap', 'kr', 'br', 'latam'));

-- Tiers Valorant valides
ALTER TABLE val_current_ranks
ADD CONSTRAINT chk_val_ranks_tier
CHECK (tier IS NULL OR tier IN (
    'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
    'DIAMOND', 'ASCENDANT', 'IMMORTAL', 'RADIANT'
));

-- Tier numbers valides (1-3, sauf Radiant qui n'en a pas)
ALTER TABLE val_current_ranks
ADD CONSTRAINT chk_val_ranks_tier_number
CHECK (
    tier_number IS NULL
    OR (tier = 'RADIANT' AND tier_number IS NULL)
    OR (tier != 'RADIANT' AND tier_number BETWEEN 1 AND 3)
);

-- Game modes Valorant valides
ALTER TABLE val_matches
ADD CONSTRAINT chk_val_matches_mode
CHECK (game_mode IN (
    'Competitive', 'Unrated', 'Spike Rush', 'Deathmatch',
    'Escalation', 'Replication', 'Snowball Fight', 'Premier', 'Swiftplay', 'Custom'
));


-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
    table_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name LIKE 'val_%';

    RAISE NOTICE 'Migration 005 complete. Tables Valorant creees: %', table_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Tables: val_accounts, val_current_ranks, val_matches, val_match_stats,';
    RAISE NOTICE '        val_daily_stats, val_agent_stats, val_streaks';
    RAISE NOTICE '';
    RAISE NOTICE 'Vue: val_player_current_stats';
    RAISE NOTICE '';
    RAISE NOTICE 'Prochaine etape: Modifier le worker Python pour supporter Valorant API.';
END $$;

COMMIT;


-- ============================================================================
-- ROLLBACK (executer manuellement si necessaire)
-- ============================================================================
/*
BEGIN;

DROP VIEW IF EXISTS val_player_current_stats;
DROP TABLE IF EXISTS val_streaks;
DROP TABLE IF EXISTS val_agent_stats;
DROP TABLE IF EXISTS val_daily_stats;
DROP TABLE IF EXISTS val_match_stats;
DROP TABLE IF EXISTS val_matches;
DROP TABLE IF EXISTS val_current_ranks;
DROP TABLE IF EXISTS val_accounts;
DROP FUNCTION IF EXISTS calculate_total_rr(VARCHAR, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS trigger_update_val_total_rr();

-- Remettre Valorant en inactif
UPDATE games SET is_active = false WHERE slug = 'valorant';

COMMIT;
*/
