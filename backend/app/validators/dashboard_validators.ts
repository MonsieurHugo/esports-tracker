import vine from '@vinejs/vine'

/**
 * Validator for dashboard period queries
 */
export const dashboardQueryValidator = vine.compile(
  vine.object({
    period: vine.enum(['day', 'month', 'year', 'custom']).optional(),
    startDate: vine.string().optional(),
    endDate: vine.string().optional(),
    offset: vine.number().min(0).optional(),
    leagues: vine.array(vine.string()).optional(),
    page: vine.number().min(1).optional(),
    perPage: vine.number().min(1).max(100).optional(),
    sort: vine.enum(['games', 'winrate', 'lp']).optional(),
    search: vine.string().maxLength(100).optional(),
  })
)

/**
 * Validator for player profile queries
 */
export const playerQueryValidator = vine.compile(
  vine.object({
    period: vine.enum(['day', 'month', 'year', 'custom']).optional(),
    startDate: vine.string().optional(),
    endDate: vine.string().optional(),
    offset: vine.number().min(0).optional(),
    groupBy: vine.enum(['hour', 'weekday-hour']).optional(),
    limit: vine.number().min(1).max(50).optional(),
  })
)

/**
 * Validator for worker logs query
 */
export const workerLogsValidator = vine.compile(
  vine.object({
    type: vine.enum(['all', 'lol', 'valorant', 'error', 'info']).optional(),
    severity: vine.enum(['info', 'warning', 'error']).optional(),
    limit: vine.number().min(1).max(200).optional(),
  })
)
