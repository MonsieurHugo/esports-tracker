import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.raw(`
      CREATE INDEX idx_pro_matches_duplicate_detection
      ON pro_matches (tournament_id, team1_external_id, team2_external_id, started_at, format, status)
      WHERE started_at IS NOT NULL
    `)
  }

  async down() {
    this.schema.raw('DROP INDEX IF EXISTS idx_pro_matches_duplicate_detection')
  }
}
