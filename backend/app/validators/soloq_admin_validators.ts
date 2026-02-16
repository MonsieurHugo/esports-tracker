import vine from '@vinejs/vine'

/**
 * Valid player roles for contracts
 */
export const VALID_CONTRACT_ROLES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'] as const
export type ValidContractRole = (typeof VALID_CONTRACT_ROLES)[number]

/**
 * Validator for creating a new player
 * Used by POST /players
 */
export const createPlayerValidator = vine.compile(
  vine.object({
    currentPseudo: vine.string().trim().minLength(1).maxLength(50),
    slug: vine.string().trim().maxLength(100).optional(),
    firstName: vine.string().trim().maxLength(50).optional(),
    lastName: vine.string().trim().maxLength(50).optional(),
    nationality: vine.string().trim().maxLength(50).optional(),
  })
)

/**
 * Validator for creating a player with full details (contract + accounts)
 * Used by POST /players/full
 */
export const createFullPlayerValidator = vine.compile(
  vine.object({
    player: vine.object({
      currentPseudo: vine.string().trim().minLength(1).maxLength(50),
      slug: vine.string().trim().maxLength(100).optional(),
      firstName: vine.string().trim().maxLength(50).optional(),
      lastName: vine.string().trim().maxLength(50).optional(),
      nationality: vine.string().trim().maxLength(50).optional(),
    }),
    contract: vine
      .object({
        teamId: vine.number(),
        role: vine.enum(VALID_CONTRACT_ROLES).optional(),
        isStarter: vine.boolean().optional(),
      })
      .optional(),
    accounts: vine
      .array(
        vine.object({
          gameName: vine.string().trim().maxLength(50),
          tagLine: vine.string().trim().maxLength(10),
          region: vine.string().trim().maxLength(10).optional(),
        })
      )
      .optional(),
  })
)

/**
 * Validator for updating a player
 * Used by PATCH /players/:id
 */
export const updatePlayerValidator = vine.compile(
  vine.object({
    currentPseudo: vine.string().trim().minLength(1).maxLength(50).optional(),
    slug: vine.string().trim().maxLength(100).optional(),
    firstName: vine.string().trim().maxLength(50).nullable().optional(),
    lastName: vine.string().trim().maxLength(50).nullable().optional(),
    nationality: vine.string().trim().maxLength(50).nullable().optional(),
  })
)

/**
 * Validator for creating or updating a player contract
 * Used by POST /players/:id/contract
 */
export const upsertContractValidator = vine.compile(
  vine.object({
    teamId: vine.number(),
    role: vine.enum(VALID_CONTRACT_ROLES).optional(),
    isStarter: vine.boolean().optional(),
  })
)

/**
 * Validator for adding a LoL account to a player
 * Used by POST /players/:id/accounts
 */
export const addAccountValidator = vine.compile(
  vine.object({
    gameName: vine.string().trim().maxLength(50),
    tagLine: vine.string().trim().maxLength(10),
    region: vine.string().trim().maxLength(10).optional(),
    isPrimary: vine.boolean().optional(),
  })
)

/**
 * Validator for creating a new team
 * Used by POST /teams
 */
export const createTeamValidator = vine.compile(
  vine.object({
    currentName: vine.string().trim().maxLength(100),
    shortName: vine.string().trim().maxLength(20),
    slug: vine.string().trim().maxLength(100).optional(),
    orgId: vine.number().optional(),
    region: vine.string().trim().maxLength(50).optional(),
    league: vine.string().trim().maxLength(50).optional(),
  })
)

/**
 * Validator for updating a team
 * Used by PATCH /teams/:id
 */
export const updateTeamValidator = vine.compile(
  vine.object({
    currentName: vine.string().trim().maxLength(100).optional(),
    shortName: vine.string().trim().maxLength(20).optional(),
    slug: vine.string().trim().maxLength(100).optional(),
    orgId: vine.number().nullable().optional(),
    region: vine.string().trim().maxLength(50).nullable().optional(),
    league: vine.string().trim().maxLength(50).nullable().optional(),
    isActive: vine.boolean().optional(),
  })
)

/**
 * Validator for creating a new organization
 * Used by POST /organizations
 */
export const createOrganizationValidator = vine.compile(
  vine.object({
    currentName: vine.string().trim().maxLength(100),
    slug: vine.string().trim().maxLength(100).optional(),
    currentShortName: vine.string().trim().maxLength(20).optional(),
    logoUrl: vine.string().trim().maxLength(500).optional(),
    country: vine.string().trim().maxLength(50).optional(),
  })
)

/**
 * Validator for updating an organization
 * Used by PATCH /organizations/:id
 */
export const updateOrganizationValidator = vine.compile(
  vine.object({
    currentName: vine.string().trim().maxLength(100).optional(),
    slug: vine.string().trim().maxLength(100).optional(),
    currentShortName: vine.string().trim().maxLength(20).nullable().optional(),
    logoUrl: vine.string().trim().maxLength(500).nullable().optional(),
    country: vine.string().trim().maxLength(50).nullable().optional(),
  })
)
