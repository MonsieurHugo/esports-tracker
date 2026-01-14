import { BaseCommand, args } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import db from '@adonisjs/lucid/services/db'

export default class DiagnoseTeam extends BaseCommand {
  static commandName = 'diagnose:team'
  static description = 'Diagnose why a team is not appearing in the leaderboard'

  static options: CommandOptions = {
    startApp: true,
  }

  @args.string({ description: 'Team name to search for (partial match)' })
  declare teamName: string

  async run() {
    const search = `%${this.teamName}%`

    this.logger.info(`Diagnosing team: ${this.teamName}`)
    this.logger.info('='.repeat(60))

    // 1. Check if team exists
    this.logger.info('\n1. ÉQUIPE')
    const teams = await db.from('teams as t')
      .select('t.team_id', 't.current_name', 't.short_name', 't.league', 't.is_active', 't.org_id')
      .whereILike('t.current_name', search)
      .orWhereILike('t.short_name', search)

    if (teams.length === 0) {
      this.logger.error(`   ❌ Aucune équipe trouvée avec "${this.teamName}"`)
      return
    }

    for (const team of teams) {
      this.logger.info(`   Team ID: ${team.team_id}`)
      this.logger.info(`   Nom: ${team.current_name} (${team.short_name})`)
      this.logger.info(`   League: ${team.league || 'NON DÉFINIE'}`)
      this.logger.info(`   Active: ${team.is_active ? '✅ Oui' : '❌ Non'}`)
      this.logger.info(`   Org ID: ${team.org_id || '❌ AUCUNE'}`)
    }

    for (const team of teams) {
      this.logger.info('\n' + '='.repeat(60))
      this.logger.info(`Diagnostic pour: ${team.current_name}`)
      this.logger.info('='.repeat(60))

      // 2. Check organization
      this.logger.info('\n2. ORGANISATION')
      if (!team.org_id) {
        this.logger.error('   ❌ PROBLÈME: Pas d\'org_id défini')
      } else {
        const org = await db.from('organizations').where('org_id', team.org_id).first()
        if (org) {
          this.logger.success(`   ✅ Organisation: ${org.name}`)
        } else {
          this.logger.error(`   ❌ PROBLÈME: org_id ${team.org_id} n'existe pas dans organizations`)
        }
      }

      // 3. Check active contracts
      this.logger.info('\n3. CONTRATS ACTIFS')
      const contracts = await db.from('player_contracts as pc')
        .join('players as p', 'pc.player_id', 'p.player_id')
        .select('p.player_id', 'p.current_pseudo', 'pc.role', 'pc.start_date', 'pc.end_date')
        .where('pc.team_id', team.team_id)
        .orderByRaw('pc.end_date NULLS FIRST')

      const activeContracts = contracts.filter(c => c.end_date === null)
      const inactiveContracts = contracts.filter(c => c.end_date !== null)

      if (activeContracts.length === 0) {
        this.logger.error('   ❌ PROBLÈME: Aucun contrat actif (end_date IS NULL)')
        if (inactiveContracts.length > 0) {
          this.logger.warning(`   ⚠️  ${inactiveContracts.length} contrat(s) terminé(s):`)
          for (const c of inactiveContracts.slice(0, 5)) {
            this.logger.info(`      - ${c.current_pseudo} (${c.role}) terminé le ${c.end_date}`)
          }
        }
      } else {
        this.logger.success(`   ✅ ${activeContracts.length} contrat(s) actif(s):`)
        for (const c of activeContracts) {
          this.logger.info(`      - ${c.current_pseudo} (${c.role})`)
        }
      }

      // 4. Check LoL accounts
      this.logger.info('\n4. COMPTES LOL')
      if (activeContracts.length > 0) {
        for (const contract of activeContracts) {
          const accounts = await db.from('lol_accounts')
            .select('puuid', 'game_name', 'tag_line', 'region')
            .where('player_id', contract.player_id)

          if (accounts.length === 0) {
            this.logger.error(`   ❌ ${contract.current_pseudo}: Aucun compte LoL`)
          } else {
            this.logger.success(`   ✅ ${contract.current_pseudo}: ${accounts.length} compte(s)`)
            for (const acc of accounts) {
              this.logger.info(`      - ${acc.game_name}#${acc.tag_line} (${acc.region})`)
            }
          }
        }
      }

      // 5. Check daily stats (last 30 days)
      this.logger.info('\n5. STATS QUOTIDIENNES (30 derniers jours)')
      if (activeContracts.length > 0) {
        for (const contract of activeContracts) {
          const stats = await db.from('lol_accounts as a')
            .join('lol_daily_stats as ds', 'ds.puuid', 'a.puuid')
            .select(
              'a.game_name',
              db.raw('COUNT(ds.date) as nb_jours'),
              db.raw('MAX(ds.date) as derniere_stat'),
              db.raw('COALESCE(SUM(ds.games_played), 0) as total_games')
            )
            .where('a.player_id', contract.player_id)
            .whereRaw("ds.date >= CURRENT_DATE - INTERVAL '30 days'")
            .groupBy('a.game_name', 'a.puuid')

          if (stats.length === 0) {
            this.logger.error(`   ❌ ${contract.current_pseudo}: Aucune stat récente`)
          } else {
            for (const s of stats) {
              this.logger.success(`   ✅ ${s.game_name}: ${s.nb_jours} jours, ${s.total_games} games (dernière: ${s.derniere_stat})`)
            }
          }
        }
      }

      // 6. Simulate leaderboard query
      this.logger.info('\n6. TEST REQUÊTE LEADERBOARD')
      const leaderboardTest = await db.from('teams as t')
        .join('organizations as o', 't.org_id', 'o.org_id')
        .join('player_contracts as pc', (q) => {
          q.on('pc.team_id', 't.team_id').andOnNull('pc.end_date')
        })
        .join('lol_accounts as a', 'pc.player_id', 'a.player_id')
        .join('lol_daily_stats as ds', 'ds.puuid', 'a.puuid')
        .where('t.team_id', team.team_id)
        .whereRaw("ds.date >= CURRENT_DATE - INTERVAL '30 days'")
        .where('t.is_active', true)
        .select(db.raw('COUNT(DISTINCT ds.date) as jours'), db.raw('COALESCE(SUM(ds.games_played), 0) as games'))
        .first()

      if (leaderboardTest && Number(leaderboardTest.jours) > 0) {
        this.logger.success(`   ✅ DEVRAIT APPARAÎTRE: ${leaderboardTest.jours} jours, ${leaderboardTest.games} games`)
      } else {
        this.logger.error('   ❌ N\'APPARAÎTRA PAS: Un des JOINs échoue (voir erreurs ci-dessus)')
      }
    }

    this.logger.info('\n' + '='.repeat(60))
    this.logger.info('Diagnostic terminé')
  }
}
