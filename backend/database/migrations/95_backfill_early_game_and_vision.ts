import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration: Backfill early game objectives, total gold, and vision stats
 * from existing pro_games.objectives_timeline and pro_player_stats data.
 */
export default class extends BaseSchema {
  async up() {
    // 1. Dragons at 15 (dragons taken before 900 seconds)
    await this.db.rawQuery(`
      UPDATE pro_team_stats ts
      SET dragons_at_15 = COALESCE(dc.cnt, 0)
      FROM (
        SELECT g.game_id, d.team, COUNT(*) as cnt
        FROM pro_games g,
        LATERAL jsonb_to_recordset(g.objectives_timeline->'dragons')
          AS d(type text, team text, time_s int)
        WHERE g.objectives_timeline IS NOT NULL
          AND g.objectives_timeline->'dragons' IS NOT NULL
          AND jsonb_array_length(g.objectives_timeline->'dragons') > 0
          AND d.time_s < 900
        GROUP BY g.game_id, d.team
      ) dc
      WHERE ts.game_id = dc.game_id AND ts.side = dc.team
    `)

    // 2. Towers at 15 (towers destroyed before 900 seconds)
    await this.db.rawQuery(`
      UPDATE pro_team_stats ts
      SET towers_at_15 = COALESCE(tc.cnt, 0)
      FROM (
        SELECT g.game_id, t.team, COUNT(*) as cnt
        FROM pro_games g,
        LATERAL jsonb_to_recordset(g.objectives_timeline->'towers')
          AS t(team text, lane text, tier text, time_s int)
        WHERE g.objectives_timeline IS NOT NULL
          AND g.objectives_timeline->'towers' IS NOT NULL
          AND jsonb_array_length(g.objectives_timeline->'towers') > 0
          AND t.time_s < 900
        GROUP BY g.game_id, t.team
      ) tc
      WHERE ts.game_id = tc.game_id AND ts.side = tc.team
    `)

    // 3. Total gold (sum of all players' gold_earned per team per game)
    await this.db.rawQuery(`
      UPDATE pro_team_stats ts
      SET total_gold = COALESCE(pg.total, 0)
      FROM (
        SELECT ps.game_id, ps.team_side, SUM(ps.gold_earned) as total
        FROM pro_player_stats ps
        WHERE ps.gold_earned > 0
        GROUP BY ps.game_id, ps.team_side
      ) pg
      WHERE ts.game_id = pg.game_id AND ts.side = pg.team_side
    `)

    // 4. Vision stats (sum of player vision JSONB fields per team per game)
    await this.db.rawQuery(`
      UPDATE pro_team_stats ts
      SET
        vision_score = COALESCE(v.total_score, 0),
        wards_placed = COALESCE(v.total_wards_placed, 0),
        wards_destroyed = COALESCE(v.total_wards_destroyed, 0),
        control_wards = COALESCE(v.total_control_wards, 0)
      FROM (
        SELECT
          ps.game_id,
          ps.team_side,
          SUM(COALESCE((ps.vision->>'score')::int, 0)) as total_score,
          SUM(COALESCE((ps.vision->>'wards_placed')::int, 0)) as total_wards_placed,
          SUM(COALESCE((ps.vision->>'wards_destroyed')::int, 0)) as total_wards_destroyed,
          SUM(COALESCE((ps.vision->>'control_wards')::int, 0)) as total_control_wards
        FROM pro_player_stats ps
        WHERE ps.vision IS NOT NULL
        GROUP BY ps.game_id, ps.team_side
      ) v
      WHERE ts.game_id = v.game_id AND ts.side = v.team_side
    `)
  }

  async down() {
    await this.db.rawQuery(`
      UPDATE pro_team_stats
      SET
        dragons_at_15 = 0,
        towers_at_15 = 0,
        total_gold = 0,
        wards_placed = 0,
        wards_destroyed = 0,
        control_wards = 0,
        vision_score = 0
    `)
  }
}
