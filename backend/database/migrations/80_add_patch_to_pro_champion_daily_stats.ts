import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_champion_daily_stats'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('patch', 20).nullable()
      table.index(['patch'])
    })

    // Update unique constraint to include patch
    this.schema.raw(`
      ALTER TABLE pro_champion_daily_stats
      DROP CONSTRAINT IF EXISTS pro_champion_daily_stats_champion_id_date_tournament_id_unique;

      ALTER TABLE pro_champion_daily_stats
      ADD CONSTRAINT pro_champion_daily_stats_champion_date_tournament_patch_unique
      UNIQUE (champion_id, date, tournament_id, patch);
    `)
  }

  async down() {
    this.schema.raw(`
      ALTER TABLE pro_champion_daily_stats
      DROP CONSTRAINT IF EXISTS pro_champion_daily_stats_champion_date_tournament_patch_unique;

      ALTER TABLE pro_champion_daily_stats
      ADD CONSTRAINT pro_champion_daily_stats_champion_id_date_tournament_id_unique
      UNIQUE (champion_id, date, tournament_id);
    `)

    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['patch'])
      table.dropColumn('patch')
    })
  }
}
