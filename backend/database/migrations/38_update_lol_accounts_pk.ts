import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'lol_accounts'

  async up() {
    // Step 1: Drop all foreign key constraints that reference lol_accounts
    this.schema.raw(`ALTER TABLE lol_daily_stats DROP CONSTRAINT IF EXISTS lol_daily_stats_puuid_foreign`)
    this.schema.raw(`ALTER TABLE lol_current_ranks DROP CONSTRAINT IF EXISTS lol_current_ranks_puuid_foreign`)
    this.schema.raw(`ALTER TABLE lol_streaks DROP CONSTRAINT IF EXISTS lol_streaks_puuid_foreign`)
    this.schema.raw(`ALTER TABLE lol_champion_stats DROP CONSTRAINT IF EXISTS lol_champion_stats_puuid_foreign`)
    this.schema.raw(`ALTER TABLE lol_player_synergy DROP CONSTRAINT IF EXISTS lol_player_synergy_puuid_foreign`)

    // Step 2: Drop primary key on puuid
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP CONSTRAINT lol_accounts_pkey`)

    // Step 3: Add account_id column as SERIAL with PRIMARY KEY
    this.schema.raw(`ALTER TABLE ${this.tableName} ADD COLUMN account_id SERIAL PRIMARY KEY`)

    // Step 4: Make puuid nullable
    this.schema.raw(`ALTER TABLE ${this.tableName} ALTER COLUMN puuid DROP NOT NULL`)

    // Step 5: Add unique constraint on puuid (allows NULL values)
    this.schema.alterTable(this.tableName, (table) => {
      table.unique(['puuid'])
    })

    // Step 6: Re-add foreign key constraints (now referencing unique puuid, not PK)
    this.schema.raw(`ALTER TABLE lol_daily_stats ADD CONSTRAINT lol_daily_stats_puuid_foreign FOREIGN KEY (puuid) REFERENCES lol_accounts(puuid) ON DELETE CASCADE`)
    this.schema.raw(`ALTER TABLE lol_current_ranks ADD CONSTRAINT lol_current_ranks_puuid_foreign FOREIGN KEY (puuid) REFERENCES lol_accounts(puuid) ON DELETE CASCADE`)
    this.schema.raw(`ALTER TABLE lol_streaks ADD CONSTRAINT lol_streaks_puuid_foreign FOREIGN KEY (puuid) REFERENCES lol_accounts(puuid) ON DELETE CASCADE`)
    this.schema.raw(`ALTER TABLE lol_champion_stats ADD CONSTRAINT lol_champion_stats_puuid_foreign FOREIGN KEY (puuid) REFERENCES lol_accounts(puuid) ON DELETE CASCADE`)
    this.schema.raw(`ALTER TABLE lol_player_synergy ADD CONSTRAINT lol_player_synergy_puuid_foreign FOREIGN KEY (puuid) REFERENCES lol_accounts(puuid) ON DELETE CASCADE`)
  }

  async down() {
    // Step 1: Drop FK constraints
    this.schema.raw(`ALTER TABLE lol_daily_stats DROP CONSTRAINT IF EXISTS lol_daily_stats_puuid_foreign`)
    this.schema.raw(`ALTER TABLE lol_current_ranks DROP CONSTRAINT IF EXISTS lol_current_ranks_puuid_foreign`)
    this.schema.raw(`ALTER TABLE lol_streaks DROP CONSTRAINT IF EXISTS lol_streaks_puuid_foreign`)
    this.schema.raw(`ALTER TABLE lol_champion_stats DROP CONSTRAINT IF EXISTS lol_champion_stats_puuid_foreign`)
    this.schema.raw(`ALTER TABLE lol_player_synergy DROP CONSTRAINT IF EXISTS lol_player_synergy_puuid_foreign`)

    // Step 2: Remove unique constraint on puuid
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['puuid'])
    })

    // Step 3: Delete any rows with NULL puuid (required for rollback)
    this.schema.raw(`DELETE FROM ${this.tableName} WHERE puuid IS NULL`)

    // Step 4: Make puuid NOT NULL again
    this.schema.raw(`ALTER TABLE ${this.tableName} ALTER COLUMN puuid SET NOT NULL`)

    // Step 5: Drop primary key on account_id
    this.schema.raw(`ALTER TABLE ${this.tableName} DROP CONSTRAINT lol_accounts_pkey`)

    // Step 6: Add primary key back on puuid
    this.schema.raw(`ALTER TABLE ${this.tableName} ADD PRIMARY KEY (puuid)`)

    // Step 7: Drop account_id column
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('account_id')
    })

    // Step 8: Re-add FK constraints referencing puuid as PK
    this.schema.raw(`ALTER TABLE lol_daily_stats ADD CONSTRAINT lol_daily_stats_puuid_foreign FOREIGN KEY (puuid) REFERENCES lol_accounts(puuid) ON DELETE CASCADE`)
    this.schema.raw(`ALTER TABLE lol_current_ranks ADD CONSTRAINT lol_current_ranks_puuid_foreign FOREIGN KEY (puuid) REFERENCES lol_accounts(puuid) ON DELETE CASCADE`)
    this.schema.raw(`ALTER TABLE lol_streaks ADD CONSTRAINT lol_streaks_puuid_foreign FOREIGN KEY (puuid) REFERENCES lol_accounts(puuid) ON DELETE CASCADE`)
    this.schema.raw(`ALTER TABLE lol_champion_stats ADD CONSTRAINT lol_champion_stats_puuid_foreign FOREIGN KEY (puuid) REFERENCES lol_accounts(puuid) ON DELETE CASCADE`)
    this.schema.raw(`ALTER TABLE lol_player_synergy ADD CONSTRAINT lol_player_synergy_puuid_foreign FOREIGN KEY (puuid) REFERENCES lol_accounts(puuid) ON DELETE CASCADE`)
  }
}
