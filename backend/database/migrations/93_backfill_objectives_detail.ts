import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Backfill objectives detail in pro_team_stats from pro_games.objectives_timeline.
 *
 * The objectives_timeline JSONB structure:
 * {
 *   "dragons": [{"type": "fire"|"ocean"|..., "team": "blue"|"red", "time_s": 123}, ...],
 *   "elder_dragons": [{"team": "blue"|"red", "time_s": 123}, ...],
 *   "barons": [{"team": "blue"|"red", "time_s": 123}, ...],
 *   "heralds": [{"team": "blue"|"red", "time_s": 123}, ...],
 *   "grubs": [{"team": "blue"|"red", "time_s": 123, "count": 3}, ...],
 *   "towers": [{"team": "blue"|"red", "lane": "top"|"mid"|"bot", "tier": "outer"|..., "time_s": 123}, ...],
 *   "dragon_soul": {"team": "blue"|"red", "type": "fire"|"ocean"|...} | null,
 *   "first_tower": {"team": "blue"|"red", "lane": "...", "time_s": 123} | null
 * }
 */
export default class extends BaseSchema {
  async up() {
    // 1. Dragon type counts per team per game
    await this.db.rawQuery(`
      UPDATE pro_team_stats ts
      SET
        fire_dragons = COALESCE(dc.fire, 0),
        ocean_dragons = COALESCE(dc.ocean, 0),
        mountain_dragons = COALESCE(dc.mountain, 0),
        air_dragons = COALESCE(dc.air, 0),
        hextech_dragons = COALESCE(dc.hextech, 0),
        chemtech_dragons = COALESCE(dc.chemtech, 0)
      FROM (
        SELECT
          g.game_id,
          d.team,
          COUNT(*) FILTER (WHERE d.type = 'fire') as fire,
          COUNT(*) FILTER (WHERE d.type = 'ocean') as ocean,
          COUNT(*) FILTER (WHERE d.type = 'mountain') as mountain,
          COUNT(*) FILTER (WHERE d.type = 'air') as air,
          COUNT(*) FILTER (WHERE d.type = 'hextech') as hextech,
          COUNT(*) FILTER (WHERE d.type = 'chemtech') as chemtech
        FROM pro_games g,
        LATERAL jsonb_to_recordset(g.objectives_timeline->'dragons')
          AS d(type text, team text, time_s int)
        WHERE g.objectives_timeline IS NOT NULL
          AND g.objectives_timeline->'dragons' IS NOT NULL
          AND jsonb_array_length(g.objectives_timeline->'dragons') > 0
        GROUP BY g.game_id, d.team
      ) dc
      WHERE ts.game_id = dc.game_id AND ts.side = dc.team
    `)

    // 2. Elder dragon counts per team per game
    await this.db.rawQuery(`
      UPDATE pro_team_stats ts
      SET elder_dragons = COALESCE(ec.cnt, 0)
      FROM (
        SELECT g.game_id, e.team, COUNT(*) as cnt
        FROM pro_games g,
        LATERAL jsonb_to_recordset(g.objectives_timeline->'elder_dragons')
          AS e(team text, time_s int)
        WHERE g.objectives_timeline IS NOT NULL
          AND g.objectives_timeline->'elder_dragons' IS NOT NULL
          AND jsonb_array_length(g.objectives_timeline->'elder_dragons') > 0
        GROUP BY g.game_id, e.team
      ) ec
      WHERE ts.game_id = ec.game_id AND ts.side = ec.team
    `)

    // 3. Dragon soul
    await this.db.rawQuery(`
      UPDATE pro_team_stats ts
      SET
        dragon_soul = true,
        dragon_soul_type = g.objectives_timeline->'dragon_soul'->>'type'
      FROM pro_games g
      WHERE ts.game_id = g.game_id
        AND g.objectives_timeline IS NOT NULL
        AND g.objectives_timeline->'dragon_soul' IS NOT NULL
        AND g.objectives_timeline->'dragon_soul'->>'team' = ts.side
    `)

    // 4. First dragon time (first element in dragons array for this team)
    await this.db.rawQuery(`
      UPDATE pro_team_stats ts
      SET first_dragon_time = fd.time_s
      FROM (
        SELECT DISTINCT ON (g.game_id, d.team)
          g.game_id, d.team, d.time_s
        FROM pro_games g,
        LATERAL jsonb_to_recordset(g.objectives_timeline->'dragons')
          AS d(type text, team text, time_s int)
        WHERE g.objectives_timeline IS NOT NULL
          AND g.objectives_timeline->'dragons' IS NOT NULL
          AND jsonb_array_length(g.objectives_timeline->'dragons') > 0
        ORDER BY g.game_id, d.team, d.time_s
      ) fd
      WHERE ts.game_id = fd.game_id AND ts.side = fd.team AND ts.first_dragon = true
    `)

    // 5. First herald time
    await this.db.rawQuery(`
      UPDATE pro_team_stats ts
      SET first_herald_time = fh.time_s
      FROM (
        SELECT DISTINCT ON (g.game_id, h.team)
          g.game_id, h.team, h.time_s
        FROM pro_games g,
        LATERAL jsonb_to_recordset(g.objectives_timeline->'heralds')
          AS h(team text, time_s int)
        WHERE g.objectives_timeline IS NOT NULL
          AND g.objectives_timeline->'heralds' IS NOT NULL
          AND jsonb_array_length(g.objectives_timeline->'heralds') > 0
        ORDER BY g.game_id, h.team, h.time_s
      ) fh
      WHERE ts.game_id = fh.game_id AND ts.side = fh.team AND ts.first_herald = true
    `)

    // 6. First baron time
    await this.db.rawQuery(`
      UPDATE pro_team_stats ts
      SET first_baron_time = fb.time_s
      FROM (
        SELECT DISTINCT ON (g.game_id, b.team)
          g.game_id, b.team, b.time_s
        FROM pro_games g,
        LATERAL jsonb_to_recordset(g.objectives_timeline->'barons')
          AS b(team text, time_s int)
        WHERE g.objectives_timeline IS NOT NULL
          AND g.objectives_timeline->'barons' IS NOT NULL
          AND jsonb_array_length(g.objectives_timeline->'barons') > 0
        ORDER BY g.game_id, b.team, b.time_s
      ) fb
      WHERE ts.game_id = fb.game_id AND ts.side = fb.team AND ts.first_baron = true
    `)

    // 7. First grubs (first group in grubs array)
    await this.db.rawQuery(`
      UPDATE pro_team_stats ts
      SET
        first_grubs = true,
        first_grubs_time = fg.time_s
      FROM (
        SELECT DISTINCT ON (g.game_id)
          g.game_id, gr.team, gr.time_s
        FROM pro_games g,
        LATERAL jsonb_to_recordset(g.objectives_timeline->'grubs')
          AS gr(team text, time_s int, count int)
        WHERE g.objectives_timeline IS NOT NULL
          AND g.objectives_timeline->'grubs' IS NOT NULL
          AND jsonb_array_length(g.objectives_timeline->'grubs') > 0
        ORDER BY g.game_id, gr.time_s
      ) fg
      WHERE ts.game_id = fg.game_id AND ts.side = fg.team
    `)

    // 8. First tower time (from objectives_timeline.first_tower)
    await this.db.rawQuery(`
      UPDATE pro_team_stats ts
      SET first_tower_time = (g.objectives_timeline->'first_tower'->>'time_s')::int
      FROM pro_games g
      WHERE ts.game_id = g.game_id
        AND g.objectives_timeline IS NOT NULL
        AND g.objectives_timeline->'first_tower' IS NOT NULL
        AND g.objectives_timeline->'first_tower'->>'team' = ts.side
        AND ts.first_tower = true
    `)
  }

  async down() {
    // Reset all backfilled columns to defaults
    await this.db.rawQuery(`
      UPDATE pro_team_stats
      SET
        first_blood_time = NULL,
        first_tower_time = NULL,
        first_dragon_time = NULL,
        first_herald_time = NULL,
        first_baron_time = NULL,
        first_grubs_time = NULL,
        first_grubs = false,
        fire_dragons = 0,
        ocean_dragons = 0,
        mountain_dragons = 0,
        air_dragons = 0,
        hextech_dragons = 0,
        chemtech_dragons = 0,
        elder_dragons = 0,
        dragon_soul = false,
        dragon_soul_type = NULL
    `)
  }
}
