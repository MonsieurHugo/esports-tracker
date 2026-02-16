import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('pro_tournaments', (table) => {
      table.dropColumn('status')
      table.integer('year').unsigned()
      table.index(['year'])
    })

    // Extraire l'année du nom du tournoi pour les existants
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE pro_tournaments
        SET year = CAST(
          SUBSTRING(name FROM '(20[0-9]{2})') AS INTEGER
        )
        WHERE name ~ '20[0-9]{2}'
      `)
    })
  }

  async down() {
    this.schema.alterTable('pro_tournaments', (table) => {
      table.dropIndex(['year'])
      table.dropColumn('year')
      table.string('status', 50)
    })
  }
}
