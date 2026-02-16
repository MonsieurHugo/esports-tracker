import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Strip team tag prefixes from player pseudos
 *
 * GRID's riotId.displayName includes team tags (e.g. "BKR Boda", "LR Baus").
 * This migration strips the first word (team tag) from affected players and
 * adds the clean name as an alias for search.
 *
 * Only affects players where:
 * - current_pseudo contains a space
 * - First word is <= 4 chars (team tags like BKR, LR, KC, G2, etc.)
 */
export default class extends BaseSchema {
  async up() {
    // 1. Add old tagged names as aliases (source='grid') before updating
    this.schema.raw(`
      INSERT INTO player_aliases (player_id, alias, source)
      SELECT player_id, current_pseudo, 'grid'
      FROM players
      WHERE current_pseudo LIKE '% %'
        AND LENGTH(SPLIT_PART(current_pseudo, ' ', 1)) <= 4
      ON CONFLICT (player_id, alias) DO NOTHING
    `)

    // 2. Add clean names as aliases too
    this.schema.raw(`
      INSERT INTO player_aliases (player_id, alias, source)
      SELECT player_id, SPLIT_PART(current_pseudo, ' ', 2), 'grid'
      FROM players
      WHERE current_pseudo LIKE '% %'
        AND LENGTH(SPLIT_PART(current_pseudo, ' ', 1)) <= 4
      ON CONFLICT (player_id, alias) DO NOTHING
    `)

    // 3. Update current_pseudo and slug to the clean name
    //    Use a CTE to pick only one player per target slug (lowest player_id wins)
    //    and skip slugs that already exist for a different player.
    this.schema.raw(`
      WITH candidates AS (
        SELECT player_id,
               SPLIT_PART(current_pseudo, ' ', 2) as clean_name,
               LOWER(SPLIT_PART(current_pseudo, ' ', 2)) as clean_slug,
               ROW_NUMBER() OVER (
                 PARTITION BY LOWER(SPLIT_PART(current_pseudo, ' ', 2))
                 ORDER BY player_id
               ) as rn
        FROM players
        WHERE current_pseudo LIKE '% %'
          AND LENGTH(SPLIT_PART(current_pseudo, ' ', 1)) <= 4
      ),
      safe AS (
        SELECT c.player_id, c.clean_name, c.clean_slug
        FROM candidates c
        WHERE c.rn = 1
          AND NOT EXISTS (
            SELECT 1 FROM players p2
            WHERE p2.slug = c.clean_slug
              AND p2.player_id != c.player_id
          )
      )
      UPDATE players p
      SET current_pseudo = s.clean_name,
          slug = s.clean_slug
      FROM safe s
      WHERE p.player_id = s.player_id
    `)
  }

  async down() {
    // Not reversible – the old tagged names are preserved as aliases
  }
}
