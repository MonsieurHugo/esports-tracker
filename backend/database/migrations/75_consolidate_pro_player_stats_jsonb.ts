import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pro_player_stats'

  async up() {
    // All in one deferred transaction for idempotency
    this.defer(async (db) => {
      // Step 1: Add new JSONB columns if they don't exist
      await db.rawQuery(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='vision') THEN
            ALTER TABLE pro_player_stats ADD COLUMN vision jsonb DEFAULT '{}';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='stats_at_15') THEN
            ALTER TABLE pro_player_stats ADD COLUMN stats_at_15 jsonb DEFAULT '{}';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='max_diffs') THEN
            ALTER TABLE pro_player_stats ADD COLUMN max_diffs jsonb DEFAULT '{}';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='multi_kills') THEN
            ALTER TABLE pro_player_stats ADD COLUMN multi_kills jsonb DEFAULT '{}';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='solo_stats') THEN
            ALTER TABLE pro_player_stats ADD COLUMN solo_stats jsonb DEFAULT '{}';
          END IF;
        END $$;
      `)

      // Step 2: Migrate existing data to new JSONB columns (only if old columns exist)
      await db.rawQuery(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='vision_score') THEN
            UPDATE pro_player_stats SET
              vision = jsonb_build_object(
                'score', COALESCE(vision_score, 0),
                'wards_placed', COALESCE(wards_placed, 0),
                'wards_destroyed', COALESCE(wards_destroyed, 0),
                'control_wards', COALESCE(control_wards_purchased, 0)
              )
            WHERE vision = '{}' OR vision IS NULL;
          END IF;
        END $$;
      `)

      await db.rawQuery(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='cs_at_15') THEN
            UPDATE pro_player_stats SET
              stats_at_15 = jsonb_build_object(
                'kills', COALESCE(kills_at_15, 0),
                'deaths', COALESCE(deaths_at_15, 0),
                'assists', COALESCE(assists_at_15, 0),
                'cs', COALESCE(cs_at_15, 0),
                'gold', COALESCE(gold_at_15, 0),
                'xp', COALESCE(xp_at_15, 0),
                'cs_diff', COALESCE(cs_diff_at_15, 0),
                'gold_diff', COALESCE(gold_diff_at_15, 0),
                'xp_diff', COALESCE(xp_diff_at_15, 0)
              )
            WHERE stats_at_15 = '{}' OR stats_at_15 IS NULL;
          END IF;
        END $$;
      `)

      await db.rawQuery(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='max_cs_diff') THEN
            UPDATE pro_player_stats SET
              max_diffs = jsonb_build_object(
                'cs', COALESCE(max_cs_diff, 0),
                'gold', COALESCE(max_gold_diff, 0),
                'xp', COALESCE(max_xp_diff, 0)
              )
            WHERE max_diffs = '{}' OR max_diffs IS NULL;
          END IF;
        END $$;
      `)

      await db.rawQuery(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='double_kills') THEN
            UPDATE pro_player_stats SET
              multi_kills = jsonb_build_object(
                'double', COALESCE(double_kills, 0),
                'triple', COALESCE(triple_kills, 0),
                'quadra', COALESCE(quadra_kills, 0),
                'penta', COALESCE(penta_kills, 0)
              )
            WHERE multi_kills = '{}' OR multi_kills IS NULL;
          END IF;
        END $$;
      `)

      await db.rawQuery(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='solo_kills') THEN
            UPDATE pro_player_stats SET
              solo_stats = jsonb_build_object(
                'solo_kills', COALESCE(solo_kills, 0),
                'solo_deaths', COALESCE(solo_deaths, 0),
                'iso_deaths', COALESCE(iso_deaths, 0)
              )
            WHERE solo_stats = '{}' OR solo_stats IS NULL;
          END IF;
        END $$;
      `)

      // Step 3: Drop old columns if they exist
      const columnsToDrop = [
        'vision_score', 'wards_placed', 'wards_destroyed', 'control_wards_purchased',
        'cs_at_15', 'gold_at_15', 'xp_at_15', 'kills_at_15', 'deaths_at_15', 'assists_at_15',
        'cs_diff_at_15', 'gold_diff_at_15', 'xp_diff_at_15', 'kill_participation_at_15',
        'max_cs_diff', 'max_gold_diff', 'max_xp_diff',
        'double_kills', 'triple_kills', 'quadra_kills', 'penta_kills',
        'solo_kills', 'solo_deaths', 'iso_deaths',
        'cs_per_min', 'gold_share', 'damage_share', 'kill_participation',
      ]

      for (const col of columnsToDrop) {
        await db.rawQuery(`
          DO $$
          BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pro_player_stats' AND column_name='${col}') THEN
              ALTER TABLE pro_player_stats DROP COLUMN ${col};
            END IF;
          END $$;
        `)
      }
    })
  }

  async down() {
    // Step 1: Re-add old columns
    this.schema.alterTable(this.tableName, (table) => {
      // Vision columns
      table.integer('vision_score').defaultTo(0)
      table.integer('wards_placed').defaultTo(0)
      table.integer('wards_destroyed').defaultTo(0)
      table.integer('control_wards_purchased').defaultTo(0)

      // Stats at 15 columns
      table.integer('cs_at_15').defaultTo(0)
      table.integer('gold_at_15').defaultTo(0)
      table.integer('xp_at_15').defaultTo(0)
      table.integer('kills_at_15').defaultTo(0)
      table.integer('deaths_at_15').defaultTo(0)
      table.integer('assists_at_15').defaultTo(0)
      table.integer('cs_diff_at_15').defaultTo(0)
      table.integer('gold_diff_at_15').defaultTo(0)
      table.integer('xp_diff_at_15').defaultTo(0)
      table.decimal('kill_participation_at_15', 5, 4).defaultTo(0)

      // Max diffs columns
      table.integer('max_cs_diff').defaultTo(0)
      table.integer('max_gold_diff').defaultTo(0)
      table.integer('max_xp_diff').defaultTo(0)

      // Multi-kills columns
      table.integer('double_kills').defaultTo(0)
      table.integer('triple_kills').defaultTo(0)
      table.integer('quadra_kills').defaultTo(0)
      table.integer('penta_kills').defaultTo(0)

      // Solo stats columns
      table.integer('solo_kills').defaultTo(0)
      table.integer('solo_deaths').defaultTo(0)
      table.integer('iso_deaths').defaultTo(0)

      // Computed columns
      table.decimal('cs_per_min', 5, 2).defaultTo(0)
      table.decimal('gold_share', 5, 4).defaultTo(0)
      table.decimal('damage_share', 5, 4).defaultTo(0)
      table.decimal('kill_participation', 5, 4).defaultTo(0)
    })

    // Step 2: Restore data from JSONB
    this.defer(async (db) => {
      await db.rawQuery(`
        UPDATE ${this.tableName} SET
          vision_score = (vision->>'score')::int,
          wards_placed = (vision->>'wards_placed')::int,
          wards_destroyed = (vision->>'wards_destroyed')::int,
          control_wards_purchased = (vision->>'control_wards')::int,
          cs_at_15 = (stats_at_15->>'cs')::int,
          gold_at_15 = (stats_at_15->>'gold')::int,
          xp_at_15 = (stats_at_15->>'xp')::int,
          kills_at_15 = (stats_at_15->>'kills')::int,
          deaths_at_15 = (stats_at_15->>'deaths')::int,
          assists_at_15 = (stats_at_15->>'assists')::int,
          cs_diff_at_15 = (stats_at_15->>'cs_diff')::int,
          gold_diff_at_15 = (stats_at_15->>'gold_diff')::int,
          xp_diff_at_15 = (stats_at_15->>'xp_diff')::int,
          max_cs_diff = (max_diffs->>'cs')::int,
          max_gold_diff = (max_diffs->>'gold')::int,
          max_xp_diff = (max_diffs->>'xp')::int,
          double_kills = (multi_kills->>'double')::int,
          triple_kills = (multi_kills->>'triple')::int,
          quadra_kills = (multi_kills->>'quadra')::int,
          penta_kills = (multi_kills->>'penta')::int,
          solo_kills = (solo_stats->>'solo_kills')::int,
          solo_deaths = (solo_stats->>'solo_deaths')::int,
          iso_deaths = (solo_stats->>'iso_deaths')::int
      `)
    })

    // Step 3: Drop JSONB columns
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('vision')
      table.dropColumn('stats_at_15')
      table.dropColumn('max_diffs')
      table.dropColumn('multi_kills')
      table.dropColumn('solo_stats')
    })
  }
}
