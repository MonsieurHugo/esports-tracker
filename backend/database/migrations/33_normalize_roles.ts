import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration to normalize role values across all tables.
 * Standard role codes: TOP, JGL, MID, ADC, SUP
 */
export default class extends BaseSchema {
  async up() {
    // Normalize roles in player_contracts table
    await this.db.rawQuery(`
      UPDATE player_contracts SET role = 'JGL' WHERE role IN ('JNG', 'JUNGLE', 'JUNGLER');
    `)
    await this.db.rawQuery(`
      UPDATE player_contracts SET role = 'ADC' WHERE role IN ('BOT', 'BOTTOM');
    `)
    await this.db.rawQuery(`
      UPDATE player_contracts SET role = 'SUP' WHERE role IN ('SUPPORT', 'UTILITY');
    `)
    await this.db.rawQuery(`
      UPDATE player_contracts SET role = 'MID' WHERE role IN ('MIDDLE');
    `)

    // Normalize roles in lol_match_stats table (from Riot API values)
    await this.db.rawQuery(`
      UPDATE lol_match_stats SET role = 'JGL' WHERE role IN ('JUNGLE', 'JNG', 'JUNGLER');
    `)
    await this.db.rawQuery(`
      UPDATE lol_match_stats SET role = 'ADC' WHERE role IN ('BOTTOM', 'BOT');
    `)
    await this.db.rawQuery(`
      UPDATE lol_match_stats SET role = 'SUP' WHERE role IN ('UTILITY', 'SUPPORT');
    `)
    await this.db.rawQuery(`
      UPDATE lol_match_stats SET role = 'MID' WHERE role IN ('MIDDLE');
    `)
  }

  async down() {
    // Revert to Riot API naming convention (cannot fully restore original values)
    await this.db.rawQuery(`
      UPDATE player_contracts SET role = 'JUNGLE' WHERE role = 'JGL';
    `)
    await this.db.rawQuery(`
      UPDATE player_contracts SET role = 'BOT' WHERE role = 'ADC';
    `)
    await this.db.rawQuery(`
      UPDATE player_contracts SET role = 'SUPPORT' WHERE role = 'SUP';
    `)

    await this.db.rawQuery(`
      UPDATE lol_match_stats SET role = 'JUNGLE' WHERE role = 'JGL';
    `)
    await this.db.rawQuery(`
      UPDATE lol_match_stats SET role = 'BOTTOM' WHERE role = 'ADC';
    `)
    await this.db.rawQuery(`
      UPDATE lol_match_stats SET role = 'UTILITY' WHERE role = 'SUP';
    `)
  }
}
