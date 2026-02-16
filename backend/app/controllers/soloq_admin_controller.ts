import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { timingSafeEqual } from 'node:crypto'
import { DateTime } from 'luxon'
import env from '#start/env'
import Player from '#models/player'
import Team from '#models/team'
import Organization from '#models/organization'
import PlayerContract from '#models/player_contract'
import LolAccount from '#models/lol_account'
import League from '#models/league'
import {
  createPlayerValidator,
  createFullPlayerValidator,
  updatePlayerValidator,
  upsertContractValidator,
  addAccountValidator,
  createTeamValidator,
  updateTeamValidator,
  createOrganizationValidator,
  updateOrganizationValidator,
} from '#validators/soloq_admin_validators'

export default class SoloqAdminController {
  /**
   * Verify admin password
   * POST /soloq/admin/verify-password
   */
  async verifyPassword({ request, response }: HttpContext) {
    const { password } = request.body()
    const expected = env.get('SOLOQ_ADMIN_PASSWORD')

    if (!expected) {
      return response.serviceUnavailable({ error: 'Password not configured' })
    }

    if (!password || typeof password !== 'string') {
      return response.forbidden({ valid: false })
    }

    const isValid =
      password.length === expected.length &&
      timingSafeEqual(Buffer.from(password), Buffer.from(expected))

    if (!isValid) {
      return response.forbidden({ valid: false })
    }

    return response.ok({ valid: true })
  }

  /**
   * List all players with contracts and accounts
   * GET /soloq/admin/players?search=&page=&perPage=
   */
  async listPlayers({ request, response }: HttpContext) {
    const search = request.input('search', '')
    const page = request.input('page', 1)
    const perPage = Math.min(request.input('perPage', 20), 100)

    let query = Player.query()
      .preload('contracts', (q) => {
        q.whereNull('endDate').preload('team')
      })
      .preload('lolAccounts')

    if (search) {
      query = query.where((q) => {
        q.whereILike('currentPseudo', `%${search}%`).orWhereILike('slug', `%${search}%`)
      })
    }

    const players = await query.orderBy('playerId', 'desc').paginate(page, perPage)

    const teams = await Team.query()
      .where('gameId', 1)
      .where('isActive', true)
      .orderBy('currentName')

    return response.ok({
      data: players.all().map((p) => ({
        playerId: p.playerId,
        slug: p.slug,
        currentPseudo: p.currentPseudo,
        firstName: p.firstName,
        lastName: p.lastName,
        nationality: p.nationality,
        twitter: p.twitter,
        twitch: p.twitch,
        contract: p.contracts[0]
          ? {
              contractId: p.contracts[0].contractId,
              teamId: p.contracts[0].teamId,
              teamName: p.contracts[0].team.currentName,
              teamShortName: p.contracts[0].team.shortName,
              teamRegion: p.contracts[0].team.region,
              role: p.contracts[0].role,
              isStarter: p.contracts[0].isStarter,
              startDate: p.contracts[0].startDate?.toISODate() ?? null,
              endDate: p.contracts[0].endDate?.toISODate() ?? null,
            }
          : null,
        accounts: p.lolAccounts.map((a) => ({
          accountId: a.accountId,
          puuid: a.puuid,
          gameName: a.gameName,
          tagLine: a.tagLine,
          region: a.region,
          isPrimary: a.isPrimary,
        })),
      })),
      teams: teams.map((t) => ({
        teamId: t.teamId,
        slug: t.slug,
        currentName: t.currentName,
        shortName: t.shortName,
        region: t.region,
        league: t.league,
      })),
      meta: {
        total: players.total,
        perPage: players.perPage,
        currentPage: players.currentPage,
        lastPage: players.lastPage,
      },
    })
  }

  /**
   * Create a new player
   * POST /soloq/admin/players
   */
  async createPlayer({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(createPlayerValidator)

      // Auto-generate slug if not provided
      if (!payload.slug) {
        payload.slug = payload.currentPseudo
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
      }

      const player = await Player.create(payload)

      return response.created({ data: player })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({ error: 'Validation failed', messages: error.messages })
      }
      throw error
    }
  }

  /**
   * Create a full player with contract and accounts
   * POST /soloq/admin/players/full
   */
  async createFullPlayer({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(createFullPlayerValidator)

      const result = await db.transaction(async (trx) => {
        const playerData = payload.player

        // Auto-generate slug if not provided
        const slug =
          playerData.slug ||
          playerData.currentPseudo
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')

        // Create player
        const player = await Player.create(
          {
            slug,
            currentPseudo: playerData.currentPseudo,
            firstName: playerData.firstName,
            lastName: playerData.lastName,
            nationality: playerData.nationality,
          },
          { client: trx }
        )

        // Create contract if provided
        if (payload.contract) {
          await PlayerContract.create(
            {
              playerId: player.playerId,
              teamId: payload.contract.teamId,
              role: payload.contract.role,
              isStarter: payload.contract.isStarter ?? true,
              startDate: DateTime.local(),
              endDate: null,
            },
            { client: trx }
          )
        }

        // Create accounts if provided
        if (payload.accounts && payload.accounts.length > 0) {
          for (let i = 0; i < payload.accounts.length; i++) {
            const account = payload.accounts[i]
            await LolAccount.create(
              {
                playerId: player.playerId,
                gameName: account.gameName,
                tagLine: account.tagLine,
                region: account.region ?? 'EUW',
                isPrimary: i === 0,
                puuid: null,
              },
              { client: trx }
            )
          }
        }

        return player
      })

      // Reload with relationships
      await result.load('contracts', (q) => {
        q.whereNull('endDate').preload('team')
      })
      await result.load('lolAccounts')

      return response.created({ data: result })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({ error: 'Validation failed', messages: error.messages })
      }
      throw error
    }
  }

  /**
   * Update a player
   * PATCH /soloq/admin/players/:id
   */
  async updatePlayer({ request, response, params }: HttpContext) {
    try {
      const payload = await request.validateUsing(updatePlayerValidator)

      const player = await Player.find(params.id)
      if (!player) {
        return response.notFound({ error: 'Player not found' })
      }

      player.merge(payload)
      await player.save()

      return response.ok({ data: player })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({ error: 'Validation failed', messages: error.messages })
      }
      throw error
    }
  }

  /**
   * Delete a player
   * DELETE /soloq/admin/players/:id
   */
  async deletePlayer({ response, params }: HttpContext) {
    const player = await Player.find(params.id)
    if (!player) {
      return response.notFound({ error: 'Player not found' })
    }

    await player.delete()

    return response.ok({ success: true })
  }

  /**
   * Add an account to a player
   * POST /soloq/admin/players/:id/accounts
   */
  async addAccount({ request, response, params }: HttpContext) {
    try {
      const payload = await request.validateUsing(addAccountValidator)

      const player = await Player.find(params.id)
      if (!player) {
        return response.notFound({ error: 'Player not found' })
      }

      const account = await LolAccount.create({
        playerId: player.playerId,
        gameName: payload.gameName,
        tagLine: payload.tagLine,
        region: payload.region ?? 'EUW',
        isPrimary: payload.isPrimary ?? false,
        puuid: null,
      })

      return response.created({ data: account })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({ error: 'Validation failed', messages: error.messages })
      }
      throw error
    }
  }

  /**
   * Delete an account
   * DELETE /soloq/admin/players/:id/accounts/:accountId
   */
  async deleteAccount({ response, params }: HttpContext) {
    const account = await LolAccount.query()
      .where('accountId', params.accountId)
      .where('playerId', params.id)
      .first()

    if (!account) {
      return response.notFound({ error: 'Account not found' })
    }

    await account.delete()

    return response.ok({ success: true })
  }

  /**
   * Upsert a player contract
   * POST /soloq/admin/players/:id/contract
   */
  async upsertContract({ request, response, params }: HttpContext) {
    try {
      const payload = await request.validateUsing(upsertContractValidator)

      const player = await Player.find(params.id)
      if (!player) {
        return response.notFound({ error: 'Player not found' })
      }

      // Find and end active contract if exists
      const activeContract = await PlayerContract.query()
        .where('playerId', params.id)
        .whereNull('endDate')
        .first()

      if (activeContract) {
        activeContract.endDate = DateTime.local()
        await activeContract.save()
      }

      // Create new contract
      const newContract = await PlayerContract.create({
        playerId: player.playerId,
        teamId: payload.teamId,
        role: payload.role,
        isStarter: payload.isStarter ?? true,
        startDate: DateTime.local(),
        endDate: null,
      })

      await newContract.load('team')

      return response.created({ data: newContract })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({ error: 'Validation failed', messages: error.messages })
      }
      throw error
    }
  }

  /**
   * End a player's active contract
   * POST /soloq/admin/players/:id/contract/end
   */
  async endContract({ response, params }: HttpContext) {
    const activeContract = await PlayerContract.query()
      .where('playerId', params.id)
      .whereNull('endDate')
      .first()

    if (!activeContract) {
      return response.notFound({ error: 'No active contract' })
    }

    activeContract.endDate = DateTime.local()
    await activeContract.save()

    return response.ok({ success: true })
  }

  /**
   * List all organizations
   * GET /soloq/admin/organizations?search=
   */
  async listOrganizations({ request, response }: HttpContext) {
    const search = request.input('search', '')

    let query = Organization.query()

    if (search) {
      query = query.whereILike('currentName', `%${search}%`)
    }

    const organizations = await query.orderBy('currentName')

    return response.ok({ data: organizations })
  }

  /**
   * Create a new organization
   * POST /soloq/admin/organizations
   */
  async createOrganization({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(createOrganizationValidator)

      // Auto-generate slug if not provided
      if (!payload.slug) {
        payload.slug = payload.currentName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
      }

      const organization = await Organization.create(payload)

      return response.created({ data: organization })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({ error: 'Validation failed', messages: error.messages })
      }
      throw error
    }
  }

  /**
   * Update an organization
   * PATCH /soloq/admin/organizations/:id
   */
  async updateOrganization({ request, response, params }: HttpContext) {
    try {
      const payload = await request.validateUsing(updateOrganizationValidator)

      const organization = await Organization.find(params.id)
      if (!organization) {
        return response.notFound({ error: 'Organization not found' })
      }

      organization.merge(payload)
      await organization.save()

      return response.ok({ data: organization })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({ error: 'Validation failed', messages: error.messages })
      }
      throw error
    }
  }

  /**
   * Delete an organization
   * DELETE /soloq/admin/organizations/:id
   */
  async deleteOrganization({ response, params }: HttpContext) {
    const organization = await Organization.find(params.id)
    if (!organization) {
      return response.notFound({ error: 'Organization not found' })
    }

    await organization.delete()

    return response.ok({ success: true })
  }

  /**
   * List all teams for League of Legends
   * GET /soloq/admin/teams?search=
   */
  async listTeams({ request, response }: HttpContext) {
    const search = request.input('search', '')

    let query = Team.query().where('gameId', 1).preload('organization')

    if (search) {
      query = query.whereILike('currentName', `%${search}%`)
    }

    const teams = await query.orderBy('currentName')

    return response.ok({
      data: teams.map((t) => ({
        teamId: t.teamId,
        slug: t.slug,
        currentName: t.currentName,
        shortName: t.shortName,
        orgId: t.orgId,
        orgName: t.organization?.currentName ?? null,
        region: t.region,
        league: t.league,
        isActive: t.isActive,
      })),
    })
  }

  /**
   * Create a new team
   * POST /soloq/admin/teams
   */
  async createTeam({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(createTeamValidator)

      // Auto-generate slug if not provided
      if (!payload.slug) {
        payload.slug = payload.currentName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
      }

      const team = await Team.create({
        ...payload,
        gameId: 1, // League of Legends
        isActive: true,
      })

      return response.created({ data: team })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({ error: 'Validation failed', messages: error.messages })
      }
      throw error
    }
  }

  /**
   * Update a team
   * PATCH /soloq/admin/teams/:id
   */
  async updateTeam({ request, response, params }: HttpContext) {
    try {
      const payload = await request.validateUsing(updateTeamValidator)

      const team = await Team.find(params.id)
      if (!team) {
        return response.notFound({ error: 'Team not found' })
      }

      team.merge(payload)
      await team.save()

      return response.ok({ data: team })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({ error: 'Validation failed', messages: error.messages })
      }
      throw error
    }
  }

  /**
   * Delete a team
   * DELETE /soloq/admin/teams/:id
   */
  async deleteTeam({ response, params }: HttpContext) {
    const team = await Team.find(params.id)
    if (!team) {
      return response.notFound({ error: 'Team not found' })
    }

    // Check for active contracts
    const activeContract = await PlayerContract.query()
      .where('teamId', params.id)
      .whereNull('endDate')
      .first()

    if (activeContract) {
      return response.conflict({
        error: 'Team has active contracts. End contracts first.',
      })
    }

    await team.delete()

    return response.ok({ success: true })
  }

  /**
   * List all active leagues
   * GET /soloq/admin/leagues
   */
  async listLeagues({ response }: HttpContext) {
    const leagues = await League.query().where('isActive', true).orderBy('name')

    return response.ok({ data: leagues })
  }
}
