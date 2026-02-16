import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Create table for important game events (kills, objectives, structures)
    this.schema.raw(`
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS pro_game_events (
          id SERIAL PRIMARY KEY,
          game_id INTEGER NOT NULL REFERENCES pro_games(game_id) ON DELETE CASCADE,
          event_type VARCHAR(50) NOT NULL,
          game_time INTEGER NOT NULL,
          actor_player_name VARCHAR(100),
          target_player_name VARCHAR(100),
          position_x INTEGER,
          position_y INTEGER,
          event_data JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      END $$;

      -- Unique index with COALESCE for nullable columns
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pro_game_events_unique
        ON pro_game_events(game_id, event_type, game_time, COALESCE(actor_player_name, ''), COALESCE(target_player_name, ''));

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_pro_game_events_game_id ON pro_game_events(game_id);
      CREATE INDEX IF NOT EXISTS idx_pro_game_events_event_type ON pro_game_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_pro_game_events_game_time ON pro_game_events(game_time);
      CREATE INDEX IF NOT EXISTS idx_pro_game_events_actor ON pro_game_events(actor_player_name);
    `)
  }

  async down() {
    this.schema.dropTable('pro_game_events')
  }
}
