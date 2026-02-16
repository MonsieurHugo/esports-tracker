import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Parse parenthesized Leaguepedia player names
 *
 * Leaguepedia disambiguates players sharing the same pseudo by appending
 * their real name in parentheses: "Cabo (Oscar Munoz)", "Knight (Zhuo Ding)".
 *
 * This migration:
 * 1. Extracts the clean pseudo from current_pseudo (before the parentheses)
 * 2. Extracts first_name and last_name from the parenthesized part
 * 3. Adds the clean pseudo as a player alias for search
 * 4. Slugs are NOT changed (they keep disambiguation to avoid FK collisions)
 */
export default class extends BaseSchema {
  async up() {
    // 1. Add current parenthesized names as aliases (preserve full form for search)
    this.schema.raw(`
      INSERT INTO player_aliases (player_id, alias, source)
      SELECT player_id, current_pseudo, 'leaguepedia'
      FROM players
      WHERE current_pseudo ~ '.+\\s*\\(.+\\)\\s*$'
      ON CONFLICT (player_id, alias) DO NOTHING
    `)

    // 2. Add clean pseudo (without parentheses) as alias
    this.schema.raw(`
      INSERT INTO player_aliases (player_id, alias, source)
      SELECT player_id,
             TRIM(REGEXP_REPLACE(current_pseudo, '\\s*\\([^)]+\\)\\s*$', '')),
             'leaguepedia'
      FROM players
      WHERE current_pseudo ~ '.+\\s*\\(.+\\)\\s*$'
      ON CONFLICT (player_id, alias) DO NOTHING
    `)

    // 3. Extract first_name and last_name from parenthesized part
    //    Only update if currently NULL (COALESCE preserves existing data from GRID)
    this.schema.raw(`
      UPDATE players
      SET
        first_name = COALESCE(
          first_name,
          SPLIT_PART(TRIM(SUBSTRING(current_pseudo FROM '\\((.+)\\)')), ' ', 1)
        ),
        last_name = COALESCE(
          last_name,
          NULLIF(
            TRIM(SUBSTRING(
              TRIM(SUBSTRING(current_pseudo FROM '\\((.+)\\)'))
              FROM POSITION(' ' IN TRIM(SUBSTRING(current_pseudo FROM '\\((.+)\\)')))
            )),
            ''
          )
        )
      WHERE current_pseudo ~ '.+\\s*\\(.+\\)\\s*$'
    `)

    // 4. Update current_pseudo to the clean pseudo (without parentheses)
    this.schema.raw(`
      UPDATE players
      SET current_pseudo = TRIM(REGEXP_REPLACE(current_pseudo, '\\s*\\([^)]+\\)\\s*$', ''))
      WHERE current_pseudo ~ '.+\\s*\\(.+\\)\\s*$'
    `)
  }

  async down() {
    // Not reversible – the original parenthesized names are preserved as aliases
  }
}
