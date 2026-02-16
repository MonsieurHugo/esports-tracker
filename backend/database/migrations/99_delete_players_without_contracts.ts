import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Delete players without any contract in player_contracts.
 * These are orphan entries (e.g. "(Adam", "(Alexandre") imported without proper contract data.
 */
export default class extends BaseSchema {
  async up() {
    const result = await this.db.rawQuery(`
      DELETE FROM players
      WHERE NOT EXISTS (
        SELECT 1 FROM player_contracts pc WHERE pc.player_id = players.player_id
      )
    `)
    console.log(`Deleted ${result.rowCount} players without contracts`)
  }

  async down() {
    // Cannot restore deleted players
  }
}
