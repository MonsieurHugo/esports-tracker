import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Idempotent migration: rename columns and update values
    this.schema.raw(`
      DO $$
      BEGIN
        -- Rename pro_drafts columns from blue/red to team1/team2
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pro_drafts' AND column_name = 'blue_pick_1') THEN
          ALTER TABLE pro_drafts RENAME COLUMN blue_pick_1 TO team1_pick_1;
          ALTER TABLE pro_drafts RENAME COLUMN blue_pick_2 TO team1_pick_2;
          ALTER TABLE pro_drafts RENAME COLUMN blue_pick_3 TO team1_pick_3;
          ALTER TABLE pro_drafts RENAME COLUMN blue_pick_4 TO team1_pick_4;
          ALTER TABLE pro_drafts RENAME COLUMN blue_pick_5 TO team1_pick_5;
          ALTER TABLE pro_drafts RENAME COLUMN red_pick_1 TO team2_pick_1;
          ALTER TABLE pro_drafts RENAME COLUMN red_pick_2 TO team2_pick_2;
          ALTER TABLE pro_drafts RENAME COLUMN red_pick_3 TO team2_pick_3;
          ALTER TABLE pro_drafts RENAME COLUMN red_pick_4 TO team2_pick_4;
          ALTER TABLE pro_drafts RENAME COLUMN red_pick_5 TO team2_pick_5;
          ALTER TABLE pro_drafts RENAME COLUMN blue_ban_1 TO team1_ban_1;
          ALTER TABLE pro_drafts RENAME COLUMN blue_ban_2 TO team1_ban_2;
          ALTER TABLE pro_drafts RENAME COLUMN blue_ban_3 TO team1_ban_3;
          ALTER TABLE pro_drafts RENAME COLUMN blue_ban_4 TO team1_ban_4;
          ALTER TABLE pro_drafts RENAME COLUMN blue_ban_5 TO team1_ban_5;
          ALTER TABLE pro_drafts RENAME COLUMN red_ban_1 TO team2_ban_1;
          ALTER TABLE pro_drafts RENAME COLUMN red_ban_2 TO team2_ban_2;
          ALTER TABLE pro_drafts RENAME COLUMN red_ban_3 TO team2_ban_3;
          ALTER TABLE pro_drafts RENAME COLUMN red_ban_4 TO team2_ban_4;
          ALTER TABLE pro_drafts RENAME COLUMN red_ban_5 TO team2_ban_5;
        END IF;

        -- Update pro_draft_actions.team_side values from blue/red to team1/team2
        UPDATE pro_draft_actions
        SET team_side = CASE
          WHEN team_side = 'blue' THEN 'team1'
          WHEN team_side = 'red' THEN 'team2'
          ELSE team_side
        END
        WHERE team_side IN ('blue', 'red');

        -- Add first_pick_team_id to pro_games if not exists
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pro_games' AND column_name = 'first_pick_team_id') THEN
          ALTER TABLE pro_games ADD COLUMN first_pick_team_id VARCHAR(100);
        END IF;
      END $$;
    `)
  }

  async down() {
    // Remove first_pick_team_id from pro_games
    this.schema.alterTable('pro_games', (table) => {
      table.dropColumn('first_pick_team_id')
    })

    // Revert pro_draft_actions.team_side values
    this.schema.raw(`
      UPDATE pro_draft_actions
      SET team_side = CASE
        WHEN team_side = 'team1' THEN 'blue'
        WHEN team_side = 'team2' THEN 'red'
        ELSE team_side
      END
    `)

    // Revert pro_drafts column names
    this.schema.alterTable('pro_drafts', (table) => {
      table.renameColumn('team1_pick_1', 'blue_pick_1')
      table.renameColumn('team1_pick_2', 'blue_pick_2')
      table.renameColumn('team1_pick_3', 'blue_pick_3')
      table.renameColumn('team1_pick_4', 'blue_pick_4')
      table.renameColumn('team1_pick_5', 'blue_pick_5')
      table.renameColumn('team2_pick_1', 'red_pick_1')
      table.renameColumn('team2_pick_2', 'red_pick_2')
      table.renameColumn('team2_pick_3', 'red_pick_3')
      table.renameColumn('team2_pick_4', 'red_pick_4')
      table.renameColumn('team2_pick_5', 'red_pick_5')

      table.renameColumn('team1_ban_1', 'blue_ban_1')
      table.renameColumn('team1_ban_2', 'blue_ban_2')
      table.renameColumn('team1_ban_3', 'blue_ban_3')
      table.renameColumn('team1_ban_4', 'blue_ban_4')
      table.renameColumn('team1_ban_5', 'blue_ban_5')
      table.renameColumn('team2_ban_1', 'red_ban_1')
      table.renameColumn('team2_ban_2', 'red_ban_2')
      table.renameColumn('team2_ban_3', 'red_ban_3')
      table.renameColumn('team2_ban_4', 'red_ban_4')
      table.renameColumn('team2_ban_5', 'red_ban_5')
    })
  }
}
