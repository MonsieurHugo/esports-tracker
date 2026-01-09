-- ============================================
-- Esports Tracker - Database Schema
-- PostgreSQL 16
-- ============================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Pour la recherche fuzzy

-- ============================================
-- GAMES (LoL, Valorant, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS games (
    game_id SERIAL PRIMARY KEY,
    slug VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed games
INSERT INTO games (slug, display_name) VALUES 
    ('lol', 'League of Legends'),
    ('valorant', 'Valorant')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- ORGANIZATIONS (Karmine Corp, G2, T1, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
    org_id SERIAL PRIMARY KEY,
    slug VARCHAR(100) UNIQUE NOT NULL,
    current_name VARCHAR(200) NOT NULL,
    current_short_name VARCHAR(20),
    logo_url VARCHAR(500),
    country VARCHAR(50),
    twitter VARCHAR(100),
    website VARCHAR(200),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TEAMS (équipe d'une org pour un jeu spécifique)
-- ============================================
CREATE TABLE IF NOT EXISTS teams (
    team_id SERIAL PRIMARY KEY,
    org_id INTEGER REFERENCES organizations(org_id) ON DELETE SET NULL,
    game_id INTEGER REFERENCES games(game_id) ON DELETE CASCADE,
    slug VARCHAR(100) UNIQUE NOT NULL,
    current_name VARCHAR(200) NOT NULL,
    short_name VARCHAR(20) NOT NULL,
    region VARCHAR(20), -- LEC, LCK, LFL, etc.
    division VARCHAR(50), -- Div1, Div2, etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_teams_region ON teams(region);
CREATE INDEX idx_teams_game ON teams(game_id);
CREATE INDEX idx_teams_active ON teams(is_active);

-- ============================================
-- PLAYERS
-- ============================================
CREATE TABLE IF NOT EXISTS players (
    player_id SERIAL PRIMARY KEY,
    slug VARCHAR(100) UNIQUE NOT NULL,
    current_pseudo VARCHAR(100) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    nationality VARCHAR(50),
    twitter VARCHAR(100),
    twitch VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_players_pseudo ON players(current_pseudo);
CREATE INDEX idx_players_slug ON players(slug);

-- ============================================
-- PLAYER CONTRACTS (liens joueur <-> équipe)
-- ============================================
CREATE TABLE IF NOT EXISTS player_contracts (
    contract_id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    role VARCHAR(20), -- TOP, JGL, MID, ADC, SUP
    is_starter BOOLEAN DEFAULT true,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Un joueur ne peut avoir qu'un contrat actif par équipe
    UNIQUE(player_id, team_id, end_date)
);

CREATE INDEX idx_contracts_player ON player_contracts(player_id);
CREATE INDEX idx_contracts_team ON player_contracts(team_id);
CREATE INDEX idx_contracts_active ON player_contracts(end_date) WHERE end_date IS NULL;

-- ============================================
-- LOL ACCOUNTS (comptes Riot des joueurs)
-- ============================================
CREATE TABLE IF NOT EXISTS lol_accounts (
    puuid VARCHAR(100) PRIMARY KEY,
    player_id INTEGER REFERENCES players(player_id) ON DELETE SET NULL,
    game_name VARCHAR(50),
    tag_line VARCHAR(10),
    summoner_id VARCHAR(100),
    region VARCHAR(10) NOT NULL, -- EUW1, KR, NA1, etc.
    is_primary BOOLEAN DEFAULT false,
    last_fetched_at TIMESTAMPTZ,
    last_match_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lol_accounts_player ON lol_accounts(player_id);
CREATE INDEX idx_lol_accounts_region ON lol_accounts(region);
CREATE INDEX idx_lol_accounts_last_fetched ON lol_accounts(last_fetched_at);

-- ============================================
-- LOL CURRENT RANKS
-- ============================================
CREATE TABLE IF NOT EXISTS lol_current_ranks (
    id SERIAL PRIMARY KEY,
    puuid VARCHAR(100) NOT NULL REFERENCES lol_accounts(puuid) ON DELETE CASCADE,
    queue_type VARCHAR(30) NOT NULL, -- RANKED_SOLO_5x5, RANKED_FLEX_SR
    tier VARCHAR(20), -- IRON, BRONZE, ..., CHALLENGER
    rank VARCHAR(5), -- I, II, III, IV
    league_points INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(puuid, queue_type)
);

CREATE INDEX idx_ranks_puuid ON lol_current_ranks(puuid);
CREATE INDEX idx_ranks_tier ON lol_current_ranks(tier);

-- ============================================
-- LOL MATCHES
-- ============================================
CREATE TABLE IF NOT EXISTS lol_matches (
    match_id VARCHAR(50) PRIMARY KEY,
    game_start TIMESTAMPTZ NOT NULL,
    game_duration INTEGER NOT NULL, -- en secondes
    queue_id INTEGER,
    game_version VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_matches_game_start ON lol_matches(game_start DESC);
CREATE INDEX idx_matches_queue ON lol_matches(queue_id);

-- ============================================
-- LOL MATCH STATS (stats d'un joueur dans un match)
-- ============================================
CREATE TABLE IF NOT EXISTS lol_match_stats (
    id SERIAL PRIMARY KEY,
    match_id VARCHAR(50) NOT NULL REFERENCES lol_matches(match_id) ON DELETE CASCADE,
    puuid VARCHAR(100) NOT NULL REFERENCES lol_accounts(puuid) ON DELETE CASCADE,
    champion_id INTEGER NOT NULL,
    win BOOLEAN NOT NULL,
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    cs INTEGER DEFAULT 0,
    vision_score INTEGER DEFAULT 0,
    damage_dealt INTEGER DEFAULT 0,
    gold_earned INTEGER DEFAULT 0,
    role VARCHAR(20),
    
    UNIQUE(match_id, puuid)
);

CREATE INDEX idx_match_stats_puuid ON lol_match_stats(puuid);
CREATE INDEX idx_match_stats_champion ON lol_match_stats(champion_id);

-- ============================================
-- LOL DAILY STATS (stats agrégées par jour)
-- ============================================
CREATE TABLE IF NOT EXISTS lol_daily_stats (
    id SERIAL PRIMARY KEY,
    puuid VARCHAR(100) NOT NULL REFERENCES lol_accounts(puuid) ON DELETE CASCADE,
    date DATE NOT NULL,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    soloq_games INTEGER DEFAULT 0,
    flex_games INTEGER DEFAULT 0,
    total_kills INTEGER DEFAULT 0,
    total_deaths INTEGER DEFAULT 0,
    total_assists INTEGER DEFAULT 0,
    total_cs INTEGER DEFAULT 0,
    total_damage INTEGER DEFAULT 0,
    total_game_duration INTEGER DEFAULT 0, -- en secondes
    lp_start INTEGER, -- LP au début de la journée
    lp_end INTEGER, -- LP à la fin de la journée
    tier_start VARCHAR(20),
    tier_end VARCHAR(20),
    
    UNIQUE(puuid, date)
);

CREATE INDEX idx_daily_stats_puuid ON lol_daily_stats(puuid);
CREATE INDEX idx_daily_stats_date ON lol_daily_stats(date DESC);
CREATE INDEX idx_daily_stats_puuid_date ON lol_daily_stats(puuid, date DESC);

-- ============================================
-- LOL STREAKS
-- ============================================
CREATE TABLE IF NOT EXISTS lol_streaks (
    puuid VARCHAR(100) PRIMARY KEY REFERENCES lol_accounts(puuid) ON DELETE CASCADE,
    current_streak INTEGER DEFAULT 0, -- positif = wins, négatif = losses
    current_streak_start TIMESTAMPTZ,
    best_win_streak INTEGER DEFAULT 0,
    best_win_streak_start TIMESTAMPTZ,
    best_win_streak_end TIMESTAMPTZ,
    worst_loss_streak INTEGER DEFAULT 0,
    worst_loss_streak_start TIMESTAMPTZ,
    worst_loss_streak_end TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LOL CHAMPION STATS (stats par champion)
-- ============================================
CREATE TABLE IF NOT EXISTS lol_champion_stats (
    id SERIAL PRIMARY KEY,
    puuid VARCHAR(100) NOT NULL REFERENCES lol_accounts(puuid) ON DELETE CASCADE,
    champion_id INTEGER NOT NULL,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    total_kills INTEGER DEFAULT 0,
    total_deaths INTEGER DEFAULT 0,
    total_assists INTEGER DEFAULT 0,
    total_cs INTEGER DEFAULT 0,
    total_damage INTEGER DEFAULT 0,
    best_kda DECIMAL(5,2),
    best_kda_match_id VARCHAR(50),
    last_played TIMESTAMPTZ,
    
    UNIQUE(puuid, champion_id)
);

CREATE INDEX idx_champion_stats_puuid ON lol_champion_stats(puuid);

-- ============================================
-- LOL RECORDS (records personnels)
-- ============================================
CREATE TABLE IF NOT EXISTS lol_records (
    id SERIAL PRIMARY KEY,
    puuid VARCHAR(100) NOT NULL REFERENCES lol_accounts(puuid) ON DELETE CASCADE,
    match_id VARCHAR(50) REFERENCES lol_matches(match_id) ON DELETE SET NULL,
    record_type VARCHAR(50) NOT NULL, -- most_kills, most_cs, longest_game, etc.
    value INTEGER NOT NULL,
    achieved_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(puuid, record_type)
);

-- ============================================
-- SPLITS / SEASONS
-- ============================================
CREATE TABLE IF NOT EXISTS splits (
    split_id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games(game_id),
    season INTEGER NOT NULL,
    split_number INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    UNIQUE(game_id, season, split_number)
);

-- ============================================
-- WORKER STATUS (pour le monitoring)
-- ============================================
CREATE TABLE IF NOT EXISTS worker_status (
    id INTEGER PRIMARY KEY DEFAULT 1,
    is_running BOOLEAN DEFAULT false,
    started_at TIMESTAMPTZ,
    session_lol_matches INTEGER DEFAULT 0,
    session_valorant_matches INTEGER DEFAULT 0,
    session_lol_accounts INTEGER DEFAULT 0,
    session_valorant_accounts INTEGER DEFAULT 0,
    session_errors INTEGER DEFAULT 0,
    session_api_requests INTEGER DEFAULT 0,
    current_account_name VARCHAR(100),
    current_account_region VARCHAR(20),
    last_activity_at TIMESTAMPTZ,
    last_error_at TIMESTAMPTZ,
    last_error_message TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT single_row CHECK (id = 1)
);

-- Initialize worker status
INSERT INTO worker_status (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============================================
-- WORKER LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS worker_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    log_type VARCHAR(20) NOT NULL, -- lol, valorant, error, info
    severity VARCHAR(20) DEFAULT 'info', -- info, warning, error
    message TEXT NOT NULL,
    account_name VARCHAR(100),
    account_puuid VARCHAR(100),
    details JSONB
);

CREATE INDEX idx_worker_logs_timestamp ON worker_logs(timestamp DESC);
CREATE INDEX idx_worker_logs_type ON worker_logs(log_type);
CREATE INDEX idx_worker_logs_severity ON worker_logs(severity);

-- ============================================
-- WORKER METRICS (métriques horaires)
-- ============================================
CREATE TABLE IF NOT EXISTS worker_metrics_hourly (
    id SERIAL PRIMARY KEY,
    hour TIMESTAMPTZ NOT NULL UNIQUE,
    lol_matches_added INTEGER DEFAULT 0,
    valorant_matches_added INTEGER DEFAULT 0,
    lol_accounts_processed INTEGER DEFAULT 0,
    valorant_accounts_processed INTEGER DEFAULT 0,
    api_requests_made INTEGER DEFAULT 0,
    api_errors INTEGER DEFAULT 0
);

CREATE INDEX idx_worker_metrics_hour ON worker_metrics_hourly(hour DESC);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Fonction pour calculer le totalLp à partir du tier/rank/lp
CREATE OR REPLACE FUNCTION calculate_total_lp(tier VARCHAR, rank VARCHAR, lp INTEGER)
RETURNS INTEGER AS $$
DECLARE
    tier_base INTEGER;
    rank_value INTEGER;
BEGIN
    -- Valeurs de base par tier
    tier_base := CASE tier
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
    
    -- Valeur du rank (IV=0, III=100, II=200, I=300)
    rank_value := CASE rank
        WHEN 'IV' THEN 0
        WHEN 'III' THEN 100
        WHEN 'II' THEN 200
        WHEN 'I' THEN 300
        ELSE 0
    END;
    
    -- Pour Master+, on ajoute juste les LP
    IF tier IN ('MASTER', 'GRANDMASTER', 'CHALLENGER') THEN
        RETURN tier_base + COALESCE(lp, 0);
    END IF;
    
    RETURN tier_base + rank_value + COALESCE(lp, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- VIEWS
-- ============================================

-- Vue pour les stats actuelles des joueurs
CREATE OR REPLACE VIEW player_current_stats AS
SELECT 
    p.player_id,
    p.slug,
    p.current_pseudo,
    pc.role,
    pc.team_id,
    t.short_name as team_short_name,
    t.region,
    la.puuid,
    la.game_name,
    la.tag_line,
    lr.tier,
    lr.rank,
    lr.league_points as lp,
    calculate_total_lp(lr.tier, lr.rank, lr.league_points) as total_lp,
    lr.wins,
    lr.losses
FROM players p
LEFT JOIN player_contracts pc ON p.player_id = pc.player_id AND pc.end_date IS NULL
LEFT JOIN teams t ON pc.team_id = t.team_id
LEFT JOIN lol_accounts la ON p.player_id = la.player_id
LEFT JOIN lol_current_ranks lr ON la.puuid = lr.puuid AND lr.queue_type = 'RANKED_SOLO_5x5';

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_players_updated_at
    BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_lol_accounts_updated_at
    BEFORE UPDATE ON lol_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- CLEANUP OLD DATA (optional, pour cron)
-- ============================================

-- Supprimer les logs de plus de 30 jours
-- DELETE FROM worker_logs WHERE timestamp < NOW() - INTERVAL '30 days';

-- Supprimer les métriques de plus de 90 jours
-- DELETE FROM worker_metrics_hourly WHERE hour < NOW() - INTERVAL '90 days';
