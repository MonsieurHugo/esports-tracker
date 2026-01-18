import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_accounts'

  async up() {
    // Step 1: Drop primary key on puuid FIRST
    this.schema.raw(`
      ALTER TABLE ${this.tableName} DROP CONSTRAINT lol_accounts_pkey
    `)

    // Step 2: Add account_id column as SERIAL with PRIMARY KEY
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD COLUMN account_id SERIAL PRIMARY KEY
    `)

    // Step 3: Make puuid nullable
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ALTER COLUMN puuid DROP NOT NULL
    `)

    // Step 4: Add unique constraint on puuid (allows NULL values)
    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['puuid'])
    })
  }

  async down() {
    // Step 1: Remove unique constraint on puuid
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['puuid'])
    })

    // Step 2: Delete any rows with NULL puuid (required for rollback)
    this.schema.raw(`
      DELETE FROM ${this.tableName} WHERE puuid IS NULL
    `)

    // Step 3: Make puuid NOT NULL again
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ALTER COLUMN puuid SET NOT NULL
    `)

    // Step 4: Drop primary key on account_id
    this.schema.raw(`
      ALTER TABLE ${this.tableName} DROP CONSTRAINT lol_accounts_pkey
    `)

    // Step 5: Add primary key back on puuid
    this.schema.raw(`
      ALTER TABLE ${this.tableName} ADD PRIMARY KEY (puuid)
    `)

    // Step 6: Drop account_id column
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('account_id')
    })
  }
}
