import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'leagues'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('color', 7).nullable() // Format: #RRGGBB
    })

    // Seed les couleurs pour les ligues existantes
    this.defer(async (db) => {
      const colors: Record<string, string> = {
        'LEC': '#00e5bf',
        'LFL': '#ff7b57',
        'LCK': '#f5e6d3',
        'LCS': '#0a7cff',
        'LPL': '#de2910',
        'LCKCL': '#a855f7',
        'LCP': '#22c55e',
        'CBLOL': '#10b981',
        'LTAS': '#14b8a6',
        'LTAN': '#06b6d4',
      }

      for (const [shortName, color] of Object.entries(colors)) {
        await db.from(this.tableName)
          .where('short_name', shortName)
          .update({ color })
      }
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('color')
    })
  }
}
