import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Player from '#models/player'
import Team from '#models/team'
import PlayerContract from '#models/player_contract'
import { DateTime } from 'luxon'
import {
  adminPlayersQueryValidator,
  updatePlayerValidator,
  upsertContractValidator,
} from '#validators/admin_validators'

// Type definitions for raw query results
interface PlayerContractRow {
  team_id: number
  player_id: number
  slug: string
  current_pseudo: string
  role: string | null
}

interface AccountRow {
  player_id: number
  puuid: string
  game_name: string | null
  tag_line: string | null
  region: string
  is_primary: boolean
}

interface AccountInfo {
  puuid: string
  gameName: string | null
  tagLine: string | null
  region: string
  isPrimary?: boolean
}

export default class AdminController {
  /**
   * GET /api/v1/admin/teams-accounts
   * Get all teams with their players and LoL accounts
   */
  async teamsAccounts(ctx: HttpContext) {
    const { league, search } = ctx.request.qs()

    const query = db
      .from('teams as t')
      .join('organizations as o', 't.org_id', 'o.org_id')
      .where('t.is_active', true)
      .orderBy('t.region')
      .orderBy('t.current_name')

    if (league) {
      query.where('t.region', league)
    }

    if (search) {
      query.where((q) => {
        q.whereILike('t.current_name', `%${search}%`).orWhereILike('t.short_name', `%${search}%`)
      })
    }

    const teams = await query.select(
      't.team_id',
      't.slug',
      't.current_name',
      't.short_name',
      't.region',
      'o.logo_url'
    )

    // Get players and accounts for each team
    const teamIds = teams.map((t) => t.team_id)

    const players = await db
      .from('player_contracts as pc')
      .join('players as p', 'pc.player_id', 'p.player_id')
      .whereIn('pc.team_id', teamIds)
      .whereNull('pc.end_date')
      .select('pc.team_id', 'p.player_id', 'p.slug', 'p.current_pseudo', 'pc.role')

    const playerIds = players.map((p) => p.player_id)

    const accounts = await db
      .from('lol_accounts')
      .whereIn('player_id', playerIds)
      .select('player_id', 'puuid', 'game_name', 'tag_line', 'region', 'is_primary')

    // Group players by team
    const playersByTeam = (players as PlayerContractRow[]).reduce(
      (acc, p) => {
        if (!acc[p.team_id]) acc[p.team_id] = []
        acc[p.team_id].push(p)
        return acc
      },
      {} as Record<number, PlayerContractRow[]>
    )

    // Group accounts by player
    const accountsByPlayer = (accounts as AccountRow[]).reduce(
      (acc, a) => {
        if (!acc[a.player_id]) acc[a.player_id] = []
        acc[a.player_id].push({
          puuid: a.puuid,
          gameName: a.game_name,
          tagLine: a.tag_line,
          region: a.region,
          isPrimary: a.is_primary,
        })
        return acc
      },
      {} as Record<number, AccountInfo[]>
    )

    const data = teams.map((team) => ({
      teamId: team.team_id,
      slug: team.slug,
      currentName: team.current_name,
      shortName: team.short_name,
      region: team.region,
      logoUrl: team.logo_url,
      players: (playersByTeam[team.team_id] || []).map((player) => ({
        playerId: player.player_id,
        slug: player.slug,
        pseudo: player.current_pseudo,
        role: player.role,
        accounts: accountsByPlayer[player.player_id] || [],
      })),
    }))

    return ctx.response.ok({ data })
  }

  /**
   * GET /api/v1/admin/players
   * Get paginated list of players with their active contracts and accounts
   */
  async players(ctx: HttpContext) {
    const validated = await adminPlayersQueryValidator.validate(ctx.request.qs())
    const page = validated.page || 1
    const perPage = validated.perPage || 25
    const search = validated.search
    const teamId = validated.teamId

    // Build players query
    const playersQuery = db
      .from('players as p')
      .leftJoin('player_contracts as pc', function () {
        this.on('p.player_id', '=', 'pc.player_id').andOnNull('pc.end_date')
      })
      .leftJoin('teams as t', 'pc.team_id', '=', 't.team_id')
      .orderBy('p.current_pseudo', 'asc')

    // Apply search filter
    if (search) {
      playersQuery.where((q) => {
        q.whereILike('p.current_pseudo', `%${search}%`)
          .orWhereILike('p.first_name', `%${search}%`)
          .orWhereILike('p.last_name', `%${search}%`)
      })
    }

    // Apply team filter
    if (teamId) {
      playersQuery.where('pc.team_id', teamId)
    }

    // Get total count for pagination
    const countQuery = playersQuery.clone().count('* as total')
    const [{ total }] = await countQuery

    // Get paginated players
    const players = await playersQuery
      .select(
        'p.player_id',
        'p.slug',
        'p.current_pseudo',
        'p.first_name',
        'p.last_name',
        'p.nationality',
        'p.twitter',
        'p.twitch',
        'pc.contract_id',
        'pc.team_id',
        't.current_name as team_name',
        't.short_name as team_short_name',
        't.region as team_region',
        'pc.role',
        'pc.is_starter',
        'pc.start_date',
        'pc.end_date'
      )
      .limit(perPage)
      .offset((page - 1) * perPage)

    // Get player IDs
    const playerIds = players.map((p) => p.player_id)

    // Get all accounts for these players
    const accounts = await db
      .from('lol_accounts')
      .whereIn('player_id', playerIds)
      .select('player_id', 'puuid', 'game_name', 'tag_line', 'region')
      .orderBy('is_primary', 'desc')

    // Group accounts by player
    const accountsByPlayer = (accounts as AccountRow[]).reduce(
      (acc, a) => {
        if (!acc[a.player_id]) acc[a.player_id] = []
        acc[a.player_id].push({
          puuid: a.puuid,
          gameName: a.game_name,
          tagLine: a.tag_line,
          region: a.region,
        })
        return acc
      },
      {} as Record<number, Omit<AccountInfo, 'isPrimary'>[]>
    )

    // Get all teams for the dropdown filter
    const teams = await db
      .from('teams')
      .where('is_active', true)
      .select('team_id', 'current_name', 'short_name', 'region')
      .orderBy('current_name', 'asc')

    // Transform data to match frontend interface
    const data = players.map((player) => ({
      playerId: player.player_id,
      slug: player.slug,
      currentPseudo: player.current_pseudo,
      firstName: player.first_name,
      lastName: player.last_name,
      nationality: player.nationality,
      twitter: player.twitter,
      twitch: player.twitch,
      contract: player.contract_id
        ? {
            contractId: player.contract_id,
            teamId: player.team_id,
            teamName: player.team_name,
            teamShortName: player.team_short_name,
            teamRegion: player.team_region,
            role: player.role,
            isStarter: player.is_starter,
            startDate: player.start_date,
            endDate: player.end_date,
          }
        : null,
      accounts: accountsByPlayer[player.player_id] || [],
    }))

    return ctx.response.ok({
      data,
      teams: teams.map((t) => ({
        teamId: t.team_id,
        currentName: t.current_name,
        shortName: t.short_name,
        region: t.region,
      })),
      meta: {
        total: Number(total),
        perPage,
        currentPage: page,
        lastPage: Math.ceil(Number(total) / perPage),
      },
    })
  }

  /**
   * PATCH /api/v1/admin/players/:id
   * Update player information
   */
  async updatePlayer(ctx: HttpContext) {
    const { id } = ctx.params
    const payload = await updatePlayerValidator.validate(ctx.request.body())

    const player = await Player.findOrFail(id)

    // Update only provided fields
    if (payload.currentPseudo !== undefined) {
      player.currentPseudo = payload.currentPseudo
    }
    if (payload.firstName !== undefined) {
      player.firstName = payload.firstName
    }
    if (payload.lastName !== undefined) {
      player.lastName = payload.lastName
    }
    if (payload.nationality !== undefined) {
      player.nationality = payload.nationality
    }
    if (payload.twitter !== undefined) {
      player.twitter = payload.twitter
    }
    if (payload.twitch !== undefined) {
      player.twitch = payload.twitch
    }

    await player.save()

    return ctx.response.ok({
      message: 'Player updated successfully',
      data: player,
    })
  }

  /**
   * POST /api/v1/admin/players/:id/contract
   * Create or update player contract
   */
  async upsertContract(ctx: HttpContext) {
    const { id } = ctx.params
    const payload = await upsertContractValidator.validate(ctx.request.body())

    // Verify player exists
    const player = await Player.findOrFail(id)

    // Verify team exists
    const team = await Team.findOrFail(payload.teamId)

    // Check if player has an active contract
    const activeContract = await PlayerContract.query()
      .where('player_id', player.playerId)
      .whereNull('end_date')
      .first()

    // If there's an active contract with a different team, end it
    if (activeContract && activeContract.teamId !== payload.teamId) {
      activeContract.endDate = DateTime.now()
      await activeContract.save()
    }

    // If there's an active contract with the same team, update it
    if (activeContract && activeContract.teamId === payload.teamId) {
      activeContract.role = payload.role || null
      activeContract.isStarter = payload.isStarter
      if (payload.startDate !== undefined) {
        activeContract.startDate = payload.startDate ? DateTime.fromISO(payload.startDate) : null
      }
      if (payload.endDate !== undefined) {
        activeContract.endDate = payload.endDate ? DateTime.fromISO(payload.endDate) : null
      }
      await activeContract.save()

      return ctx.response.ok({
        message: 'Contract updated successfully',
        data: activeContract,
      })
    }

    // Create new contract
    const newContract = await PlayerContract.create({
      playerId: player.playerId,
      teamId: team.teamId,
      role: payload.role || null,
      isStarter: payload.isStarter,
      startDate: payload.startDate ? DateTime.fromISO(payload.startDate) : null,
      endDate: payload.endDate ? DateTime.fromISO(payload.endDate) : null,
    })

    return ctx.response.created({
      message: 'Contract created successfully',
      data: newContract,
    })
  }

  /**
   * DELETE /api/v1/admin/players/:id/contract
   * End active player contract
   */
  async endContract(ctx: HttpContext) {
    const { id } = ctx.params

    // Verify player exists
    const player = await Player.findOrFail(id)

    // Find active contract
    const activeContract = await PlayerContract.query()
      .where('player_id', player.playerId)
      .whereNull('end_date')
      .first()

    if (!activeContract) {
      return ctx.response.notFound({
        message: 'No active contract found for this player',
      })
    }

    // End the contract
    activeContract.endDate = DateTime.now()
    await activeContract.save()

    return ctx.response.ok({
      message: 'Contract ended successfully',
      data: activeContract,
    })
  }
}
