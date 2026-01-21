/**
 * Validation helpers for request parameters
 */

interface PaginationParams {
  page: number
  perPage: number
}

/**
 * Sanitize input for use in SQL LIKE queries.
 * Escapes wildcard characters (%, _) and backslashes to prevent injection.
 */
export function sanitizeLikeInput(input: string, maxLength: number = 100): string {
  // Trim and limit length
  let sanitized = input.trim().slice(0, maxLength)
  // Escape backslashes first, then LIKE wildcards
  sanitized = sanitized.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  return sanitized
}

/**
 * Validate and sanitize pagination parameters
 * - page: must be >= 1, defaults to 1
 * - perPage: must be between 1 and maxPerPage, defaults to defaultPerPage
 */
export function validatePagination(
  page: unknown,
  perPage: unknown,
  options?: { defaultPerPage?: number; maxPerPage?: number }
): PaginationParams {
  const { defaultPerPage = 25, maxPerPage = 100 } = options || {}

  const parsedPage = Math.max(1, Math.floor(Number(page) || 1))
  const parsedPerPage = Math.min(maxPerPage, Math.max(1, Math.floor(Number(perPage) || defaultPerPage)))

  return { page: parsedPage, perPage: parsedPerPage }
}

/**
 * Validate and sanitize a limit parameter (for top-N queries)
 * - limit: must be between 1 and maxLimit, defaults to defaultLimit
 */
export function validateLimit(
  limit: unknown,
  options?: { defaultLimit?: number; maxLimit?: number }
): number {
  const { defaultLimit = 5, maxLimit = 10 } = options || {}
  return Math.min(maxLimit, Math.max(1, Math.floor(Number(limit) || defaultLimit)))
}

interface ParseEntityIdsOptions {
  maxCount?: number
  allowEmpty?: boolean
}

/**
 * Parse and validate an array of positive integer IDs
 * @param input - Raw value (string, string[], number, number[])
 * @param options - Configuration options
 * @param options.maxCount - Maximum number of IDs allowed (default: 100)
 * @param options.allowEmpty - Whether to allow empty result (default: false)
 * @returns Array of validated positive integers (deduplicated)
 * @throws Error if no valid IDs and allowEmpty is false, or if too many IDs
 */
export function parseEntityIds(
  input: unknown,
  options?: ParseEntityIdsOptions
): number[] {
  const { maxCount = 100, allowEmpty = false } = options || {}

  // Normalize input to array
  let rawValues: unknown[]
  if (Array.isArray(input)) {
    rawValues = input
  } else if (typeof input === 'string') {
    rawValues = input.split(',').map((s) => s.trim())
  } else if (typeof input === 'number') {
    rawValues = [input]
  } else {
    rawValues = []
  }

  // Parse and filter valid positive integers
  const validIds: number[] = []
  for (const val of rawValues) {
    const num = typeof val === 'number' ? val : Number(val)
    // Must be a positive integer (> 0, not NaN, not decimal)
    if (!Number.isNaN(num) && Number.isFinite(num) && num > 0 && Number.isInteger(num)) {
      validIds.push(num)
    }
  }

  // Deduplicate
  const uniqueIds = [...new Set(validIds)]

  // Check count limit
  if (uniqueIds.length > maxCount) {
    throw new Error(`Too many entity IDs. Maximum allowed: ${maxCount}, received: ${uniqueIds.length}`)
  }

  // Check for empty result
  if (uniqueIds.length === 0 && !allowEmpty) {
    throw new Error('No valid entity IDs provided')
  }

  return uniqueIds
}
