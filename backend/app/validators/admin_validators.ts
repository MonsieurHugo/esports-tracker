import vine from '@vinejs/vine'

/**
 * Validator for admin players list query parameters
 */
export const adminPlayersQueryValidator = vine.compile(
  vine.object({
    page: vine.number().min(1).optional(),
    perPage: vine.number().min(1).max(100).optional(),
    search: vine.string().maxLength(100).optional(),
    teamId: vine.number().min(1).optional(),
  })
)

/**
 * Validator for updating player information
 */
export const updatePlayerValidator = vine.compile(
  vine.object({
    currentPseudo: vine.string().maxLength(50).optional(),
    firstName: vine.string().maxLength(100).nullable().optional(),
    lastName: vine.string().maxLength(100).nullable().optional(),
    nationality: vine.string().maxLength(3).nullable().optional(),
    twitter: vine.string().maxLength(100).nullable().optional(),
    twitch: vine.string().maxLength(100).nullable().optional(),
  })
)

/**
 * Validator for upserting a player contract
 */
export const upsertContractValidator = vine.compile(
  vine.object({
    teamId: vine.number().min(1),
    role: vine.string().maxLength(20).nullable().optional(),
    isStarter: vine.boolean(),
    startDate: vine.string().nullable().optional(),
    endDate: vine.string().nullable().optional(),
  })
)
