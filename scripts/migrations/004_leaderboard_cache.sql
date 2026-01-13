-- Migration 004: Leaderboard Cache Tables
-- Priority: P1 (High)
-- Description: Add pre-computed cache tables for fast leaderboard queries
-- Impact: Reduces leaderboard query time from 100-500ms to <10ms
--
-- Run with: psql -d esports_tracker -f 004_leaderboard_cache.sql
-- Rollback: See bottom of file
--
-- NOTE: Ces tables sont remplies par le worker Python, pas par des triggers SQL
-- Le worker doit etre modifie pour appeler refresh_leaderboard_cache() apres chaque batch

BEGIN;

-- ============================================================================
-- 1. TABLE DE CACHE DES STATS PAR PERIODE
-- ============================================================================
-- Stocke les agregations pre-calculees pour eviter les SUM() couteux
-- Granularites: day, week, month, split

CREATE TABLE IF NOT EXISTS lol_period_stats_cache (
    id SERIAL PRIMARY KEY,

    -- Identifiant du compte
    puuid VARCHAR(100) NOT NULL,

    -- Definition de la periode
    period_type VARCHAR(20) NOT NULL,  -- 'day', 'week', 'month', 'split'
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Stats agregees
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER GENERATED ALWAYS AS (games_played - wins) STORED,
    winrate DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE WHEN games_played > 0 THEN ROUND(wins::DECIMAL / games_played * 100, 2) ELSE 0 END
    ) STORED,

    -- Stats detaillees
    total_kills INTEGER DEFAULT 0,
    total_deaths INTEGER DEFAULT 0,
    total_assists INTEGER DEFAULT 0,
    total_game_duration INTEGER DEFAULT 0,  -- en secondes

    -- KDA calcule
    kda DECIMAL(4,2) GENERATED ALWAYS AS (
        CASE WHEN total_deaths > 0
             THEN ROUND((total_kills + total_assists)::DECIMAL / total_deaths, 2)
             ELSE total_kills + total_assists
        END
    ) STORED,

    -- Rank at end of period
    tier VARCHAR(20),
    rank VARCHAR(5),
    lp INTEGER DEFAULT 0,

    -- Metadata
    calculated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Contrainte d'unicite
    UNIQUE(puuid, period_type, period_start)
);

-- Index pour les lookups rapides
CREATE INDEX IF NOT EXISTS idx_period_cache_lookup
    ON lol_period_stats_cache(period_type, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_period_cache_puuid
    ON lol_period_stats_cache(puuid, period_type);

COMMENT ON TABLE lol_period_stats_cache IS
'Cache des stats agregees par periode. Rafraichi par le worker apres chaque batch de mise a jour.';


-- ============================================================================
-- 2. TABLE DE CACHE DES LEADERBOARDS
-- ============================================================================
-- Stocke les classements pre-calcules pour affichage instantane

CREATE TABLE IF NOT EXISTS lol_leaderboard_cache (
    id SERIAL PRIMARY KEY,

    -- Definition du leaderboard
    period_type VARCHAR(20) NOT NULL,      -- 'day', 'week', 'month', 'split', 'all'
    period_key VARCHAR(20) NOT NULL,       -- '2025-01-10', '2025-W02', '2025-01', 'split1_2025'
    sort_by VARCHAR(20) NOT NULL,          -- 'lp', 'games', 'winrate', 'lp_change'
    region_filter VARCHAR(100),            -- NULL = all, 'LEC', 'LFL,PRM,LVP', etc.

    -- Position et joueur
    rank_position INTEGER NOT NULL,
    player_id INTEGER NOT NULL,

    -- Valeurs pour l'affichage (evite les JOINs)
    player_pseudo VARCHAR(100),
    team_name VARCHAR(100),
    team_tag VARCHAR(20),

    -- Stats du leaderboard
    total_lp INTEGER,
    games INTEGER,
    wins INTEGER,
    winrate DECIMAL(5,2),
    lp_change INTEGER,

    -- Metadata
    calculated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Contrainte d'unicite (un seul rang par joueur par leaderboard)
    UNIQUE(period_type, period_key, sort_by, region_filter, player_id)
);

-- Index principal pour l'affichage du leaderboard
CREATE INDEX IF NOT EXISTS idx_leaderboard_display
    ON lol_leaderboard_cache(period_type, period_key, sort_by, region_filter, rank_position);

-- Index pour invalidation par joueur
CREATE INDEX IF NOT EXISTS idx_leaderboard_player
    ON lol_leaderboard_cache(player_id);

COMMENT ON TABLE lol_leaderboard_cache IS
'Cache des classements pre-calcules. Limite a top 100 par combinaison.
Rafraichi toutes les 5-10 minutes par le worker.';


-- ============================================================================
-- 3. FONCTION DE RAFRAICHISSEMENT DES STATS DE PERIODE
-- ============================================================================
-- Appelee par le worker pour mettre a jour le cache d'un joueur

CREATE OR REPLACE FUNCTION refresh_player_period_stats(
    p_puuid VARCHAR(100),
    p_period_type VARCHAR(20),
    p_start DATE,
    p_end DATE
) RETURNS VOID AS $$
BEGIN
    INSERT INTO lol_period_stats_cache (
        puuid, period_type, period_start, period_end,
        games_played, wins,
        total_kills, total_deaths, total_assists, total_game_duration,
        tier, rank, lp, calculated_at
    )
    SELECT
        p_puuid,
        p_period_type,
        p_start,
        p_end,
        COALESCE(SUM(games_played), 0),
        COALESCE(SUM(wins), 0),
        COALESCE(SUM(total_kills), 0),
        COALESCE(SUM(total_deaths), 0),
        COALESCE(SUM(total_assists), 0),
        COALESCE(SUM(total_game_duration), 0),
        (SELECT tier FROM lol_daily_stats WHERE puuid = p_puuid AND date <= p_end ORDER BY date DESC LIMIT 1),
        (SELECT rank FROM lol_daily_stats WHERE puuid = p_puuid AND date <= p_end ORDER BY date DESC LIMIT 1),
        COALESCE((SELECT lp FROM lol_daily_stats WHERE puuid = p_puuid AND date <= p_end ORDER BY date DESC LIMIT 1), 0),
        NOW()
    FROM lol_daily_stats
    WHERE puuid = p_puuid
      AND date BETWEEN p_start AND p_end
    ON CONFLICT (puuid, period_type, period_start)
    DO UPDATE SET
        games_played = EXCLUDED.games_played,
        wins = EXCLUDED.wins,
        total_kills = EXCLUDED.total_kills,
        total_deaths = EXCLUDED.total_deaths,
        total_assists = EXCLUDED.total_assists,
        total_game_duration = EXCLUDED.total_game_duration,
        tier = EXCLUDED.tier,
        rank = EXCLUDED.rank,
        lp = EXCLUDED.lp,
        calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 4. FONCTION DE RAFRAICHISSEMENT DU LEADERBOARD
-- ============================================================================
-- Regenere le classement pour une combinaison periode/tri/region

CREATE OR REPLACE FUNCTION refresh_leaderboard_cache(
    p_period_type VARCHAR(20),
    p_period_key VARCHAR(20),
    p_period_start DATE,
    p_period_end DATE,
    p_sort_by VARCHAR(20),
    p_region_filter VARCHAR(100) DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
) RETURNS INTEGER AS $$
DECLARE
    affected_rows INTEGER;
BEGIN
    -- Supprimer l'ancien cache pour cette combinaison
    DELETE FROM lol_leaderboard_cache
    WHERE period_type = p_period_type
      AND period_key = p_period_key
      AND sort_by = p_sort_by
      AND (region_filter = p_region_filter OR (region_filter IS NULL AND p_region_filter IS NULL));

    -- Inserer le nouveau classement
    WITH ranked_players AS (
        SELECT
            p.player_id,
            p.current_pseudo AS player_pseudo,
            t.name AS team_name,
            t.tag AS team_tag,
            COALESCE(MAX(r.total_lp), 0) AS total_lp,
            COALESCE(SUM(ds.games_played), 0) AS games,
            COALESCE(SUM(ds.wins), 0) AS wins,
            CASE
                WHEN SUM(ds.games_played) > 0
                THEN ROUND(SUM(ds.wins)::DECIMAL / SUM(ds.games_played) * 100, 2)
                ELSE 0
            END AS winrate,
            COALESCE(
                (SELECT ds2.lp FROM lol_daily_stats ds2
                 JOIN lol_accounts a2 ON ds2.puuid = a2.puuid
                 WHERE a2.player_id = p.player_id AND ds2.date <= p_period_end
                 ORDER BY ds2.date DESC LIMIT 1),
                0
            ) -
            COALESCE(
                (SELECT ds3.lp FROM lol_daily_stats ds3
                 JOIN lol_accounts a3 ON ds3.puuid = a3.puuid
                 WHERE a3.player_id = p.player_id AND ds3.date >= p_period_start
                 ORDER BY ds3.date ASC LIMIT 1),
                0
            ) AS lp_change,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE p_sort_by
                        WHEN 'lp' THEN COALESCE(MAX(r.total_lp), 0)
                        WHEN 'games' THEN COALESCE(SUM(ds.games_played), 0)
                        WHEN 'winrate' THEN CASE WHEN SUM(ds.games_played) >= 10 THEN ROUND(SUM(ds.wins)::DECIMAL / SUM(ds.games_played) * 100, 2) ELSE 0 END
                        WHEN 'lp_change' THEN 0  -- Calcule separement
                        ELSE 0
                    END DESC
            ) AS rank_position
        FROM players p
        LEFT JOIN player_contracts pc ON p.player_id = pc.player_id
            AND (pc.end_date IS NULL OR pc.end_date > CURRENT_DATE)
        LEFT JOIN teams t ON pc.team_id = t.team_id
        LEFT JOIN lol_accounts a ON p.player_id = a.player_id
        LEFT JOIN lol_current_ranks r ON a.puuid = r.puuid AND r.queue_type = 'RANKED_SOLO_5x5'
        LEFT JOIN lol_daily_stats ds ON a.puuid = ds.puuid
            AND ds.date BETWEEN p_period_start AND p_period_end
        WHERE
            -- Filtre region si specifie
            (p_region_filter IS NULL OR t.region IN (SELECT unnest(string_to_array(p_region_filter, ','))))
        GROUP BY p.player_id, p.current_pseudo, t.name, t.tag
        HAVING COALESCE(SUM(ds.games_played), 0) > 0 OR COALESCE(MAX(r.total_lp), 0) > 0
    )
    INSERT INTO lol_leaderboard_cache (
        period_type, period_key, sort_by, region_filter,
        rank_position, player_id, player_pseudo, team_name, team_tag,
        total_lp, games, wins, winrate, lp_change, calculated_at
    )
    SELECT
        p_period_type,
        p_period_key,
        p_sort_by,
        p_region_filter,
        rank_position,
        player_id,
        player_pseudo,
        team_name,
        team_tag,
        total_lp,
        games,
        wins,
        winrate,
        lp_change,
        NOW()
    FROM ranked_players
    WHERE rank_position <= p_limit
    ORDER BY rank_position;

    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 5. FONCTION UTILITAIRE: REFRESH ALL LEADERBOARDS
-- ============================================================================
-- Appelee par le worker pour rafraichir tous les leaderboards d'un coup

CREATE OR REPLACE FUNCTION refresh_all_leaderboards(
    p_today DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(leaderboard_key TEXT, rows_updated INTEGER) AS $$
DECLARE
    week_start DATE;
    month_start DATE;
    last7_start DATE;
BEGIN
    week_start := date_trunc('week', p_today)::DATE;
    month_start := date_trunc('month', p_today)::DATE;
    last7_start := p_today - INTERVAL '6 days';  -- 7 jours glissants (aujourd'hui inclus)

    -- ========================================
    -- PRIORITE 1: 7 DERNIERS JOURS (cas principal)
    -- ========================================

    -- Leaderboard 7 derniers jours par LP
    leaderboard_key := 'last7_lp';
    rows_updated := refresh_leaderboard_cache('last7', 'rolling', last7_start, p_today, 'lp', NULL);
    RETURN NEXT;

    -- Leaderboard 7 derniers jours par games
    leaderboard_key := 'last7_games';
    rows_updated := refresh_leaderboard_cache('last7', 'rolling', last7_start, p_today, 'games', NULL);
    RETURN NEXT;

    -- Leaderboard 7 derniers jours par winrate (min 10 games)
    leaderboard_key := 'last7_winrate';
    rows_updated := refresh_leaderboard_cache('last7', 'rolling', last7_start, p_today, 'winrate', NULL);
    RETURN NEXT;

    -- Leaderboard 7 derniers jours par LP change
    leaderboard_key := 'last7_lp_change';
    rows_updated := refresh_leaderboard_cache('last7', 'rolling', last7_start, p_today, 'lp_change', NULL);
    RETURN NEXT;

    -- ========================================
    -- PRIORITE 2: Jour (aujourd'hui)
    -- ========================================

    -- Leaderboard du jour par LP
    leaderboard_key := 'day_' || p_today || '_lp';
    rows_updated := refresh_leaderboard_cache('day', p_today::VARCHAR, p_today, p_today, 'lp', NULL);
    RETURN NEXT;

    -- Leaderboard du jour par games
    leaderboard_key := 'day_' || p_today || '_games';
    rows_updated := refresh_leaderboard_cache('day', p_today::VARCHAR, p_today, p_today, 'games', NULL);
    RETURN NEXT;

    -- ========================================
    -- PRIORITE 3: Semaine calendaire
    -- ========================================

    -- Leaderboard de la semaine par LP
    leaderboard_key := 'week_' || to_char(p_today, 'IYYY-IW') || '_lp';
    rows_updated := refresh_leaderboard_cache('week', to_char(p_today, 'IYYY-IW'), week_start, week_start + 6, 'lp', NULL);
    RETURN NEXT;

    -- Leaderboard de la semaine par games
    leaderboard_key := 'week_' || to_char(p_today, 'IYYY-IW') || '_games';
    rows_updated := refresh_leaderboard_cache('week', to_char(p_today, 'IYYY-IW'), week_start, week_start + 6, 'games', NULL);
    RETURN NEXT;

    -- ========================================
    -- PRIORITE 4: Mois
    -- ========================================

    -- Leaderboard du mois par LP
    leaderboard_key := 'month_' || to_char(p_today, 'YYYY-MM') || '_lp';
    rows_updated := refresh_leaderboard_cache('month', to_char(p_today, 'YYYY-MM'), month_start, (month_start + INTERVAL '1 month - 1 day')::DATE, 'lp', NULL);
    RETURN NEXT;

    -- Leaderboard du mois par games
    leaderboard_key := 'month_' || to_char(p_today, 'YYYY-MM') || '_games';
    rows_updated := refresh_leaderboard_cache('month', to_char(p_today, 'YYYY-MM'), month_start, (month_start + INTERVAL '1 month - 1 day')::DATE, 'games', NULL);
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 6. VUE POUR ACCES SIMPLIFIE AU LEADERBOARD ACTUEL
-- ============================================================================

CREATE OR REPLACE VIEW v_current_leaderboard AS
SELECT
    lc.*,
    CASE
        WHEN lc.period_type = 'last7' THEN '7 derniers jours'
        WHEN lc.period_type = 'day' THEN 'Aujourd''hui'
        WHEN lc.period_type = 'week' THEN 'Cette semaine'
        WHEN lc.period_type = 'month' THEN 'Ce mois'
        ELSE lc.period_type
    END AS period_label
FROM lol_leaderboard_cache lc
WHERE
    (lc.period_type = 'last7' AND lc.period_key = 'rolling')  -- Priorite: 7 derniers jours
    OR (lc.period_type = 'day' AND lc.period_key = CURRENT_DATE::VARCHAR)
    OR (lc.period_type = 'week' AND lc.period_key = to_char(CURRENT_DATE, 'IYYY-IW'))
    OR (lc.period_type = 'month' AND lc.period_key = to_char(CURRENT_DATE, 'YYYY-MM'));


-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE 'Migration 004 complete.';
    RAISE NOTICE 'Tables creees: lol_period_stats_cache, lol_leaderboard_cache';
    RAISE NOTICE 'Fonctions creees: refresh_player_period_stats, refresh_leaderboard_cache, refresh_all_leaderboards';
    RAISE NOTICE '';
    RAISE NOTICE 'IMPORTANT: Modifier le worker Python pour appeler refresh_all_leaderboards() apres chaque batch.';
    RAISE NOTICE 'Exemple en Python:';
    RAISE NOTICE '  await db.execute("SELECT * FROM refresh_all_leaderboards()")';
END $$;

COMMIT;


-- ============================================================================
-- ROLLBACK (executer manuellement si necessaire)
-- ============================================================================
/*
BEGIN;

DROP VIEW IF EXISTS v_current_leaderboard;
DROP FUNCTION IF EXISTS refresh_all_leaderboards(DATE);
DROP FUNCTION IF EXISTS refresh_leaderboard_cache(VARCHAR, VARCHAR, DATE, DATE, VARCHAR, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS refresh_player_period_stats(VARCHAR, VARCHAR, DATE, DATE);
DROP TABLE IF EXISTS lol_leaderboard_cache;
DROP TABLE IF EXISTS lol_period_stats_cache;

COMMIT;
*/
