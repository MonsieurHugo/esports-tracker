import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Create entity mappings and proposals tables
 *
 * pro_entity_mappings: Stores external IDs (GRID, Leaguepedia) for each entity (team/tournament/league).
 * pro_mapping_proposals: Stores proposed merges for admin review before applying.
 *
 * Also backfills existing external_id values from pro_teams, pro_tournaments, pro_leagues.
 */
export default class extends BaseSchema {
  async up() {
    // 1. Create pro_entity_mappings table
    this.schema.createTable('pro_entity_mappings', (table) => {
      table.increments('id').primary()
      table.string('entity_type', 20).notNullable() // 'team' | 'tournament' | 'league'
      table.integer('entity_id').notNullable()
      table.string('source', 20).notNullable() // 'grid' | 'leaguepedia' | 'manual'
      table.string('source_id', 200).notNullable()
      table.timestamp('created_at').defaultTo(this.now())

      table.unique(['entity_type', 'source', 'source_id'])
      table.index(['entity_type', 'entity_id'], 'idx_pem_lookup')
      table.index(['source_id'], 'idx_pem_source')
    })

    // 2. Create pro_mapping_proposals table
    this.schema.createTable('pro_mapping_proposals', (table) => {
      table.increments('id').primary()
      table.string('entity_type', 20).notNullable() // 'team' | 'tournament' | 'league'
      table.integer('source_entity_id').notNullable() // entity to merge (will be deleted)
      table.integer('target_entity_id').notNullable() // entity to keep
      table.float('confidence').notNullable().defaultTo(0)
      table.string('match_reason', 100).nullable()
      table.string('status', 20).defaultTo('pending') // 'pending' | 'approved' | 'rejected' | 'applied'
      table.timestamp('reviewed_at').nullable()
      table.timestamp('applied_at').nullable()
      table.text('notes').nullable()
      table.timestamp('created_at').defaultTo(this.now())

      table.unique(['entity_type', 'source_entity_id', 'target_entity_id'])
      table.index(['entity_type', 'status'], 'idx_pmp_status')
    })

    // 3. Backfill pro_entity_mappings from existing external_id columns

    // Teams: determine source from 'lp:' prefix
    this.defer(async (db) => {
      // Teams with lp: prefix → leaguepedia
      await db.rawQuery(`
        INSERT INTO pro_entity_mappings (entity_type, entity_id, source, source_id, created_at)
        SELECT 'team', team_id, 'leaguepedia', external_id, NOW()
        FROM pro_teams
        WHERE external_id LIKE 'lp:%'
        ON CONFLICT (entity_type, source, source_id) DO NOTHING
      `)

      // Teams without lp: prefix → grid
      await db.rawQuery(`
        INSERT INTO pro_entity_mappings (entity_type, entity_id, source, source_id, created_at)
        SELECT 'team', team_id, 'grid', external_id, NOW()
        FROM pro_teams
        WHERE external_id IS NOT NULL
          AND external_id NOT LIKE 'lp:%'
        ON CONFLICT (entity_type, source, source_id) DO NOTHING
      `)

      // Tournaments with lp: prefix → leaguepedia
      await db.rawQuery(`
        INSERT INTO pro_entity_mappings (entity_type, entity_id, source, source_id, created_at)
        SELECT 'tournament', tournament_id, 'leaguepedia', external_id, NOW()
        FROM pro_tournaments
        WHERE external_id LIKE 'lp:%'
        ON CONFLICT (entity_type, source, source_id) DO NOTHING
      `)

      // Tournaments without lp: prefix → grid
      await db.rawQuery(`
        INSERT INTO pro_entity_mappings (entity_type, entity_id, source, source_id, created_at)
        SELECT 'tournament', tournament_id, 'grid', external_id, NOW()
        FROM pro_tournaments
        WHERE external_id IS NOT NULL
          AND external_id NOT LIKE 'lp:%'
        ON CONFLICT (entity_type, source, source_id) DO NOTHING
      `)

      // Leagues with lp: prefix → leaguepedia
      await db.rawQuery(`
        INSERT INTO pro_entity_mappings (entity_type, entity_id, source, source_id, created_at)
        SELECT 'league', league_id, 'leaguepedia', external_id, NOW()
        FROM pro_leagues
        WHERE external_id LIKE 'lp:%'
        ON CONFLICT (entity_type, source, source_id) DO NOTHING
      `)

      // Leagues without lp: prefix → grid
      await db.rawQuery(`
        INSERT INTO pro_entity_mappings (entity_type, entity_id, source, source_id, created_at)
        SELECT 'league', league_id, 'grid', external_id, NOW()
        FROM pro_leagues
        WHERE external_id IS NOT NULL
          AND external_id NOT LIKE 'lp:%'
        ON CONFLICT (entity_type, source, source_id) DO NOTHING
      `)
    })
  }

  async down() {
    this.schema.dropTableIfExists('pro_mapping_proposals')
    this.schema.dropTableIfExists('pro_entity_mappings')
  }
}
