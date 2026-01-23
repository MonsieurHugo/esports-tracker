import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_drafts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('draft_id').primary()
      table
        .integer('game_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('game_id')
        .inTable('pro_games')
        .onDelete('CASCADE')

      // Blue team picks (in pick order)
      table.integer('blue_pick_1')
      table.integer('blue_pick_2')
      table.integer('blue_pick_3')
      table.integer('blue_pick_4')
      table.integer('blue_pick_5')

      // Red team picks (in pick order)
      table.integer('red_pick_1')
      table.integer('red_pick_2')
      table.integer('red_pick_3')
      table.integer('red_pick_4')
      table.integer('red_pick_5')

      // Blue team bans (in ban order)
      table.integer('blue_ban_1')
      table.integer('blue_ban_2')
      table.integer('blue_ban_3')
      table.integer('blue_ban_4')
      table.integer('blue_ban_5')

      // Red team bans (in ban order)
      table.integer('red_ban_1')
      table.integer('red_ban_2')
      table.integer('red_ban_3')
      table.integer('red_ban_4')
      table.integer('red_ban_5')

      table.timestamp('created_at').notNullable().defaultTo(this.now())
      table.timestamp('updated_at').notNullable().defaultTo(this.now())

      table.index(['game_id'])
    })

    // Detailed draft actions table for analysis
    this.schema.createTable('pro_draft_actions', (table) => {
      table.increments('action_id').primary()
      table
        .integer('game_id')
        .unsigned()
        .notNullable()
        .references('game_id')
        .inTable('pro_games')
        .onDelete('CASCADE')
      table.integer('action_order').notNullable() // 1-20 for standard draft
      table.string('action_type', 10).notNullable() // 'ban' or 'pick'
      table.string('team_side', 10).notNullable() // 'blue' or 'red'
      table.integer('champion_id').notNullable()
      table
        .integer('player_id')
        .unsigned()
        .references('player_id')
        .inTable('players')
        .onDelete('SET NULL')
      table.timestamp('created_at').notNullable().defaultTo(this.now())

      table.unique(['game_id', 'action_order'])
      table.index(['game_id'])
      table.index(['champion_id'])
      table.index(['player_id'])
    })
  }

  async down() {
    this.schema.dropTable('pro_draft_actions')
    this.schema.dropTable(this.tableName)
  }
}
