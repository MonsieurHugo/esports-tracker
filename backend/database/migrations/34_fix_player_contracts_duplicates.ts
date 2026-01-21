import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'player_contracts'

  async up() {
    // 1. Supprimer les doublons en gardant le contrat le plus récent (par contract_id)
    // Pour chaque joueur avec plusieurs contrats actifs, on garde celui avec le plus grand contract_id
    await this.db.rawQuery(`
      DELETE FROM player_contracts
      WHERE contract_id NOT IN (
        SELECT MAX(contract_id)
        FROM player_contracts
        WHERE end_date IS NULL
        GROUP BY player_id
      )
      AND end_date IS NULL
      AND EXISTS (
        SELECT 1 FROM player_contracts pc2
        WHERE pc2.player_id = player_contracts.player_id
        AND pc2.end_date IS NULL
        AND pc2.contract_id > player_contracts.contract_id
      )
    `)

    // 2. Ajouter une contrainte UNIQUE partielle : un seul contrat actif par joueur
    // Using raw SQL for PostgreSQL partial unique index
    await this.db.rawQuery(`
      CREATE UNIQUE INDEX IF NOT EXISTS player_contracts_unique_active_contract
      ON player_contracts (player_id)
      WHERE end_date IS NULL
    `)
  }

  async down() {
    await this.db.rawQuery(`
      DROP INDEX IF EXISTS player_contracts_unique_active_contract
    `)
  }
}
