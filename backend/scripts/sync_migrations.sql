-- Script to sync adonis_schema with existing database state
-- Run this to mark migrations 1-21 as completed since tables were created via SQL scripts

-- Create the adonis_schema table if it doesn't exist
CREATE TABLE IF NOT EXISTS adonis_schema (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  batch INTEGER NOT NULL,
  migration_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Create the adonis_schema_versions table if it doesn't exist
CREATE TABLE IF NOT EXISTS adonis_schema_versions (
  version INTEGER NOT NULL
);

-- Insert version if not exists
INSERT INTO adonis_schema_versions (version)
SELECT 2 WHERE NOT EXISTS (SELECT 1 FROM adonis_schema_versions);

-- Insert existing migrations as batch 1 (only if not already present)
INSERT INTO adonis_schema (name, batch)
SELECT name, 1 FROM (VALUES
  ('database/migrations/1_create_organizations_table'),
  ('database/migrations/2_create_teams_table'),
  ('database/migrations/3_create_players_table'),
  ('database/migrations/4_create_player_contracts_table'),
  ('database/migrations/5_create_lol_accounts_table'),
  ('database/migrations/6_create_lol_matches_table'),
  ('database/migrations/7_create_lol_match_stats_table'),
  ('database/migrations/8_create_lol_daily_stats_table'),
  ('database/migrations/9_create_lol_current_ranks_table'),
  ('database/migrations/10_create_lol_streaks_table'),
  ('database/migrations/11_create_lol_champion_stats_table'),
  ('database/migrations/12_create_splits_table'),
  ('database/migrations/13_create_leagues_table'),
  ('database/migrations/14_create_worker_status_table'),
  ('database/migrations/15_create_worker_metrics_hourly_table'),
  ('database/migrations/16_create_worker_logs_table'),
  ('database/migrations/17_add_auth_fields_to_users_table'),
  ('database/migrations/18_create_password_reset_tokens_table'),
  ('database/migrations/19_create_email_verification_tokens_table'),
  ('database/migrations/20_create_oauth_accounts_table'),
  ('database/migrations/21_create_auth_audit_logs_table'),
  ('database/migrations/1768047971800_create_users_table')
) AS existing(name)
WHERE NOT EXISTS (
  SELECT 1 FROM adonis_schema WHERE adonis_schema.name = existing.name
);

-- Show what we inserted
SELECT * FROM adonis_schema ORDER BY id;
