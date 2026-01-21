import vine from '@vinejs/vine'

/**
 * Valid player roles for filtering
 * Note: These are the API-facing values. The database uses uppercase versions (TOP, JGL, MID, ADC, SUP).
 * The controller is responsible for transforming these values if needed.
 */
export const VALID_ROLES = ['top', 'jungle', 'mid', 'adc', 'support'] as const
export type ValidRole = (typeof VALID_ROLES)[number]

/**
 * Valid sort options for leaderboards
 */
export const VALID_SORT_OPTIONS = ['games', 'winrate', 'lp'] as const
export type ValidSortOption = (typeof VALID_SORT_OPTIONS)[number]

/**
 * Valid view modes
 */
export const VALID_VIEW_MODES = ['players', 'teams'] as const
export type ValidViewMode = (typeof VALID_VIEW_MODES)[number]

/**
 * Validator for team and player leaderboard query parameters
 * Used by GET /teams and GET /players endpoints
 */
export const leaderboardQueryValidator = vine.compile(
  vine.object({
    // Date range
    startDate: vine.string().optional(),
    endDate: vine.string().optional(),
    date: vine.string().optional(),
    period: vine.enum(['7d', '14d', '30d', '90d']).optional(),

    // Filters
    leagues: vine
      .array(vine.string().trim().minLength(1).maxLength(50))
      .optional(),
    roles: vine
      .array(vine.enum(VALID_ROLES))
      .optional(),

    // Pagination
    page: vine.number().min(1).optional(),
    perPage: vine.number().min(1).max(100).optional(),

    // Sorting
    sort: vine.enum(VALID_SORT_OPTIONS).optional(),

    // Search
    search: vine.string().maxLength(100).optional(),

    // Minimum games filter
    minGames: vine.number().min(0).optional(),

    // Include players without Master+ rank (all players with active contracts)
    includeUnranked: vine.boolean().optional(),
  })
)

/**
 * Validator for batch endpoint query parameters
 * Used by GET /batch endpoint
 */
export const batchQueryValidator = vine.compile(
  vine.object({
    // Date range
    startDate: vine.string().optional(),
    endDate: vine.string().optional(),
    date: vine.string().optional(),
    period: vine.enum(['7d', '14d', '30d', '90d']).optional(),

    // Filters
    leagues: vine
      .array(vine.string().trim().minLength(1).maxLength(50))
      .optional(),
    roles: vine
      .array(vine.enum(VALID_ROLES))
      .optional(),

    // Limit
    limit: vine.number().min(1).max(100).optional(),

    // Minimum games filter
    minGames: vine.number().min(0).optional(),

    // View mode
    viewMode: vine.enum(VALID_VIEW_MODES).optional(),
  })
)

/**
 * Validator for history batch endpoint query parameters
 * Used by GET /team-history-batch and GET /player-history-batch
 */
export const historyBatchQueryValidator = vine.compile(
  vine.object({
    // Date range
    startDate: vine.string().optional(),
    endDate: vine.string().optional(),
    date: vine.string().optional(),
    period: vine.enum(['7d', '14d', '30d', '90d']).optional(),

    // Entity IDs (required for history)
    // Accepts comma-separated string, transforms to array of valid positive integers
    entityIds: vine
      .string()
      .transform((value) => {
        // Handle empty or whitespace-only strings
        if (!value || value.trim() === '') {
          throw new Error('entityIds is required')
        }

        // Split by comma and parse each value
        const ids = value
          .split(',')
          .map((s) => {
            const trimmed = s.trim()
            // Skip empty strings from multiple commas or trailing commas
            if (trimmed === '') return null

            const num = parseInt(trimmed, 10)

            // Validate: must be integer, positive, not too large, and no decimal part
            if (
              Number.isInteger(num) &&
              num > 0 &&
              num <= 2147483647 && // PostgreSQL INT max value
              trimmed === String(num) // Ensures no decimal point or leading zeros
            ) {
              return num
            }

            return null
          })
          .filter((n): n is number => n !== null)

        // Check if we have any valid IDs
        if (ids.length === 0) {
          throw new Error('No valid entity IDs provided. IDs must be positive integers.')
        }

        // Check maximum count
        if (ids.length > 50) {
          throw new Error('Maximum 50 entity IDs allowed')
        }

        // Deduplicate
        return [...new Set(ids)]
      }),
  })
)

/**
 * Role mapping from API values to database values
 * Use this in the controller to transform validated roles
 */
export const ROLE_API_TO_DB: Record<ValidRole, string> = {
  top: 'TOP',
  jungle: 'JGL',
  mid: 'MID',
  adc: 'ADC',
  support: 'SUP',
}

/**
 * Helper to transform API roles to database roles
 */
export function transformRolesToDb(roles: ValidRole[] | null | undefined): string[] | null {
  if (!roles || roles.length === 0) return null
  return roles.map((role) => ROLE_API_TO_DB[role])
}
