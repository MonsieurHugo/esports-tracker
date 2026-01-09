-- ============================================
-- Esports Tracker - Database Initialization
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PLAYERS
-- ============================================
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    riot_puuid VARCHAR(100) UNIQUE NOT NULL,
    summoner_name VARCHAR(50) NOT NULL,
    summoner_id VARCHAR(100),
    tag_line VARCHAR(10) DEFAULT 'EUW',
    region VARCHAR(10) DEFAULT 'EUW1',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_players_summoner_name ON players(summoner_name);
CREATE INDEX idx_players_region ON players(region);
CREATE INDEX idx_players_is_active ON players(is_active);

-- ============================================
-- PLAYER STATS
-- ============================================
CREATE TABLE IF NOT EXISTS player_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    queue_type VARCHAR(30) NOT NULL, -- RANKED_SOLO_5x5, RANKED_FLEX_SR
    tier VARCHAR(20), -- IRON, BRONZE, SILVER, GOLD, PLATINUM, EMERALD, DIAMOND, MASTER, GRANDMASTER, CHALLENGER
    rank VARCHAR(5), -- I, II, III, IV
    lp INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(player_id, queue_type)
);

CREATE INDEX idx_player_stats_player_id ON player_stats(player_id);
CREATE INDEX idx_player_stats_tier ON player_stats(tier);

-- ============================================
-- MATCHES
-- ============================================
CREATE TABLE IF NOT EXISTS matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    riot_match_id VARCHAR(50) UNIQUE NOT NULL,
    game_mode VARCHAR(30), -- CLASSIC, ARAM, etc.
    game_type VARCHAR(30), -- MATCHED_GAME, CUSTOM_GAME
    queue_id INTEGER,
    game_duration INTEGER, -- in seconds
    game_start_at TIMESTAMP WITH TIME ZONE,
    game_version VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_matches_game_start ON matches(game_start_at DESC);
CREATE INDEX idx_matches_game_mode ON matches(game_mode);

-- ============================================
-- MATCH PARTICIPANTS
-- ============================================
CREATE TABLE IF NOT EXISTS match_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    riot_puuid VARCHAR(100) NOT NULL,
    summoner_name VARCHAR(50),
    
    -- Team info
    team_id INTEGER, -- 100 (blue) or 200 (red)
    team_position VARCHAR(20), -- TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY
    
    -- Champion info
    champion_id INTEGER NOT NULL,
    champion_name VARCHAR(50),
    champion_level INTEGER,
    
    -- Performance
    kills INTEGER DEFAULT 0,
    deaths INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    
    -- Economy
    gold_earned INTEGER DEFAULT 0,
    gold_spent INTEGER DEFAULT 0,
    total_minions_killed INTEGER DEFAULT 0,
    
    -- Damage
    total_damage_dealt INTEGER DEFAULT 0,
    total_damage_dealt_to_champions INTEGER DEFAULT 0,
    total_damage_taken INTEGER DEFAULT 0,
    
    -- Vision
    vision_score INTEGER DEFAULT 0,
    wards_placed INTEGER DEFAULT 0,
    wards_killed INTEGER DEFAULT 0,
    
    -- Outcome
    win BOOLEAN DEFAULT false,
    
    -- Items (stored as JSON array)
    items JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_match_participants_match ON match_participants(match_id);
CREATE INDEX idx_match_participants_player ON match_participants(player_id);
CREATE INDEX idx_match_participants_champion ON match_participants(champion_id);

-- ============================================
-- VALORANT PLAYERS (for future)
-- ============================================
-- CREATE TABLE IF NOT EXISTS valorant_players (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     riot_puuid VARCHAR(100) UNIQUE NOT NULL,
--     game_name VARCHAR(50) NOT NULL,
--     tag_line VARCHAR(10) NOT NULL,
--     region VARCHAR(10) DEFAULT 'EU',
--     is_active BOOLEAN DEFAULT true,
--     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
--     updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_players_updated_at
    BEFORE UPDATE ON players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA (optional)
-- ============================================

-- Example: Add a test player
-- INSERT INTO players (riot_puuid, summoner_name, tag_line, region)
-- VALUES ('example-puuid-12345', 'TestPlayer', 'EUW', 'EUW1');
