/**
 * Chart utilities for tick calculation and formatting
 * Centralized logic for consistent chart axes across all components
 */

// Nice intervals by strategy type
export const NICE_INTERVALS = {
  // LP values: base 10 regular intervals
  lp: [100, 200, 500, 1000, 2000, 5000, 10000],
  // Game counts: integer-friendly intervals
  count: [1, 2, 5, 10, 20, 50, 100, 200, 500],
  // Generic values
  default: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000],
}

export type TickStrategy = 'lp' | 'count' | 'symmetric' | 'percentage'

export interface TickOptions {
  min: number
  max: number
  strategy: TickStrategy
  targetCount?: number // default: 5
  maxTicks?: number // default: 8
  minAbsValue?: number // minimum absolute value for symmetric strategy
  forceSymmetric?: boolean // for symmetric strategy: force equal +/- range
  paddingPercent?: number // default: 10 (adds 10% padding)
}

/**
 * Calculate nice tick values for a chart axis
 * Returns an array of tick values that are visually pleasing and appropriate for the data
 */
export function calculateNiceTicks(options: TickOptions): number[] {
  const {
    min,
    max,
    strategy,
    targetCount = 5,
    maxTicks = 8,
    minAbsValue = 0,
    forceSymmetric = true,
    paddingPercent = 10,
  } = options

  // Handle percentage strategy (fixed ticks)
  if (strategy === 'percentage') {
    return [0, 25, 50, 75, 100]
  }

  // Handle invalid or empty data
  if (!isFinite(min) || !isFinite(max) || min > max) {
    return getDefaultTicks(strategy)
  }

  // Handle symmetric strategy (for LP change charts)
  if (strategy === 'symmetric') {
    return calculateSymmetricTicks({
      min,
      max,
      targetCount,
      maxTicks,
      minAbsValue,
      forceSymmetric,
    })
  }

  // Get appropriate intervals for strategy
  const intervals = NICE_INTERVALS[strategy] || NICE_INTERVALS.default

  // Add padding to the range
  const range = max - min
  const padding = Math.max(range * (paddingPercent / 100), getMinPadding(strategy))
  const paddedMin = Math.max(0, min - padding)
  const paddedMax = max + padding
  const paddedRange = paddedMax - paddedMin

  // Find the best interval
  const idealInterval = paddedRange / targetCount
  let selectedInterval = findBestInterval(idealInterval, intervals)

  // Adjust if too many ticks
  let tickCount = Math.ceil(paddedRange / selectedInterval) + 1
  while (tickCount > maxTicks && selectedInterval < intervals[intervals.length - 1]) {
    const currentIndex = intervals.indexOf(selectedInterval)
    if (currentIndex < intervals.length - 1) {
      selectedInterval = intervals[currentIndex + 1]
      tickCount = Math.ceil(paddedRange / selectedInterval) + 1
    } else {
      break
    }
  }

  // Generate nice tick values
  const niceMin = Math.floor(paddedMin / selectedInterval) * selectedInterval
  const niceMax = Math.ceil(paddedMax / selectedInterval) * selectedInterval

  const ticks: number[] = []
  for (let tick = niceMin; tick <= niceMax; tick += selectedInterval) {
    ticks.push(tick)
    if (ticks.length > maxTicks + 2) break // Safety limit
  }

  return ticks.length >= 2 ? ticks : getDefaultTicks(strategy)
}

/**
 * Calculate symmetric ticks centered around zero
 * Used for LP change charts where positive/negative values need balanced display
 */
function calculateSymmetricTicks(options: {
  min: number
  max: number
  targetCount: number
  maxTicks: number
  minAbsValue: number
  forceSymmetric: boolean
}): number[] {
  const { min, max, targetCount, maxTicks, minAbsValue, forceSymmetric } = options

  const intervals = NICE_INTERVALS.default

  if (forceSymmetric) {
    // Force symmetric range: use the larger absolute value
    const absMax = Math.max(Math.abs(min), Math.abs(max), minAbsValue)

    const idealInterval = absMax / (targetCount / 2)
    const selectedInterval = findBestInterval(idealInterval, intervals)

    const niceMax = Math.ceil(absMax / selectedInterval) * selectedInterval

    const ticks: number[] = []
    for (let tick = -niceMax; tick <= niceMax; tick += selectedInterval) {
      ticks.push(tick)
      if (ticks.length > maxTicks + 2) break
    }
    return ticks
  } else {
    // Asymmetric: calculate separately for positive and negative
    const absMin = Math.max(Math.abs(min), minAbsValue / 2)
    const absMax = Math.max(Math.abs(max), minAbsValue / 2)

    // Calculate separate intervals for each side
    const totalRange = absMin + absMax
    const idealInterval = totalRange / targetCount
    const selectedInterval = findBestInterval(idealInterval, intervals)

    const niceMin = -Math.ceil(absMin / selectedInterval) * selectedInterval
    const niceMax = Math.ceil(absMax / selectedInterval) * selectedInterval

    const ticks: number[] = []
    for (let tick = niceMin; tick <= niceMax; tick += selectedInterval) {
      ticks.push(tick)
      if (ticks.length > maxTicks + 2) break
    }

    // Ensure 0 is included
    if (!ticks.includes(0)) {
      ticks.push(0)
      ticks.sort((a, b) => a - b)
    }

    return ticks
  }
}

/**
 * Find the best interval from a list of nice intervals
 */
function findBestInterval(idealInterval: number, intervals: number[]): number {
  for (const interval of intervals) {
    if (interval >= idealInterval) {
      return interval
    }
  }
  return intervals[intervals.length - 1]
}

/**
 * Get minimum padding for each strategy
 */
function getMinPadding(strategy: TickStrategy): number {
  switch (strategy) {
    case 'lp':
      return 50 // Minimum 50 LP padding
    case 'count':
      return 1 // Minimum 1 game padding
    default:
      return 10
  }
}

/**
 * Get default ticks when data is invalid or empty
 */
function getDefaultTicks(strategy: TickStrategy): number[] {
  switch (strategy) {
    case 'lp':
      return [0, 1000, 2000, 3000, 4000, 5000]
    case 'count':
      return [0, 5, 10, 15, 20]
    case 'symmetric':
      return [-200, -100, 0, 100, 200]
    case 'percentage':
      return [0, 25, 50, 75, 100]
    default:
      return [0, 20, 40, 60, 80, 100]
  }
}

// ============================================================================
// Formatters
// ============================================================================

/**
 * Format LP values for axis display
 * Examples: 234 → "234", 2350 → "2.4k", 15000 → "15k"
 */
export function formatLp(value: number): string {
  if (value >= 10000) return `${(value / 1000).toFixed(0)}k`
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return value.toString()
}

/**
 * Format percentage values
 */
export function formatPercent(value: number): string {
  return `${value}%`
}

/**
 * Format signed numbers (with + prefix for positive)
 */
export function formatSigned(value: number): string {
  if (value > 0) return `+${value}`
  return value.toString()
}

/**
 * Format signed LP values
 */
export function formatSignedLp(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${formatLp(Math.abs(value))}`
}

// ============================================================================
// X-Axis utilities
// ============================================================================

/**
 * Calculate the interval for X-axis labels to prevent overlap
 * Returns a recharts-compatible interval value
 */
export function calculateXAxisInterval(
  dataLength: number,
  chartWidth: number,
  minLabelSpacing: number = 45
): number {
  if (dataLength <= 1 || chartWidth <= 0) return 0

  const maxLabels = Math.floor(chartWidth / minLabelSpacing)
  if (maxLabels >= dataLength) return 0 // Show all labels

  // Calculate interval to skip labels
  const interval = Math.ceil(dataLength / maxLabels) - 1
  return Math.max(0, interval)
}

// ============================================================================
// Date range filling utilities for charts
// ============================================================================

export interface DateLabel {
  date: string
  label: string
}

/**
 * Fill missing dates in chart data with the complete date range.
 * Ensures all days of the period are displayed even if there's no data.
 *
 * @param completeDateRange - Array of all dates in the period with labels
 * @param teamsData - Array of team data with date/label properties
 * @param fillValuesFn - Function to create fill values for missing dates
 * @returns Merged data with all dates from the range
 */
export function fillMissingDates<T extends { date: string; label: string }>(
  completeDateRange: DateLabel[],
  teamsData: { data: T[] }[],
  fillValuesFn: (date: string, label: string, teamCount: number) => Record<string, string | number | null>
): Record<string, string | number | null>[] {
  if (completeDateRange.length === 0 || teamsData.length === 0) return []

  // Create a map from existing data for quick lookup
  const existingDataMap = new Map<string, Map<number, T>>()
  teamsData.forEach((team, teamIndex) => {
    team.data.forEach(d => {
      if (!existingDataMap.has(d.date)) {
        existingDataMap.set(d.date, new Map())
      }
      existingDataMap.get(d.date)!.set(teamIndex, d)
    })
  })

  // Build result using complete date range as the base
  return completeDateRange.map(({ date, label }) => {
    const teamDataForDate = existingDataMap.get(date)

    if (teamDataForDate && teamDataForDate.size > 0) {
      // We have data for this date - merge with any missing teams
      const result: Record<string, string | number | null> = { date, label }

      teamsData.forEach((_, teamIndex) => {
        const point = teamDataForDate.get(teamIndex)
        if (point) {
          // Copy all properties from the point except date/label
          Object.entries(point).forEach(([key, value]) => {
            if (key !== 'date' && key !== 'label') {
              result[key] = value as string | number | null
            }
          })
        }
      })

      return result
    } else {
      // No data for this date - use fill values
      return fillValuesFn(date, label, teamsData.length)
    }
  })
}

/**
 * Fill values factory for LP charts (carry forward strategy)
 */
export function createLpFillValues(lastKnownLp: number[]): (date: string, label: string, teamCount: number) => Record<string, string | number | null> {
  return (date, label, teamCount) => {
    const result: Record<string, string | number | null> = { date, label }
    for (let i = 0; i < teamCount; i++) {
      result[`team${i}Lp`] = lastKnownLp[i] || 0
    }
    return result
  }
}

/**
 * Fill values factory for Games charts (0 games for missing days)
 */
export function createGamesFillValues(): (date: string, label: string, teamCount: number) => Record<string, string | number | null> {
  return (date, label, teamCount) => {
    const result: Record<string, string | number | null> = { date, label }
    for (let i = 0; i < teamCount; i++) {
      result[`team${i}Games`] = 0
      result[`team${i}Winrate`] = 0
    }
    return result
  }
}

/**
 * Fill values factory for Winrate charts (null for days without games)
 */
export function createWinrateFillValues(): (date: string, label: string, teamCount: number) => Record<string, string | number | null> {
  return (date, label, teamCount) => {
    const result: Record<string, string | number | null> = { date, label }
    for (let i = 0; i < teamCount; i++) {
      result[`team${i}Winrate`] = null
      result[`team${i}Games`] = 0
    }
    return result
  }
}

/**
 * Fill values factory for LP Change charts (0 change for missing days)
 */
export function createLpChangeFillValues(): (date: string, label: string, teamCount: number) => Record<string, string | number | null> {
  return (date, label, teamCount) => {
    const result: Record<string, string | number | null> = { date, label }
    for (let i = 0; i < teamCount; i++) {
      result[`team${i}Change`] = 0
    }
    return result
  }
}

// ============================================================================
// Bar label sizing utilities
// ============================================================================

/**
 * Calcule la largeur approximative d'une barre dans un BarChart
 * Basé sur la logique de layout de Recharts
 */
export function calculateBarWidth(
  chartWidth: number,
  dataPointCount: number,
  barCount: number = 1,
  barCategoryGapPercent: number = 5,
  barGap: number = 2
): number {
  if (dataPointCount <= 0 || chartWidth <= 0) return 0

  // Largeur disponible pour le contenu (sans marges axes)
  const contentWidth = chartWidth - 30 // ~marge gauche/droite approximative

  // Largeur par catégorie (point de données)
  const categoryWidth = contentWidth / dataPointCount

  // Espace entre catégories
  const categoryGap = categoryWidth * (barCategoryGapPercent / 100)

  // Largeur disponible pour les barres dans une catégorie
  const availableForBars = categoryWidth - categoryGap

  // Si plusieurs barres par catégorie, soustraire les gaps entre barres
  const totalBarGaps = (barCount - 1) * barGap

  // Largeur par barre
  return Math.max(0, (availableForBars - totalBarGaps) / barCount)
}

/**
 * Calcule la taille de police adaptée pour les labels de barres
 * La taille est basée sur la largeur de la barre pour que le texte (1-3 chiffres) tienne
 * Approximation: un label de 2 chiffres en fontSize X fait environ X * 1.3 pixels de large
 *
 * @param barWidth - Largeur de la barre en pixels
 * @param barCount - Nombre de barres par catégorie (pour éviter chevauchement entre barres adjacentes)
 */
export function calculateBarLabelFontSize(barWidth: number, barCount: number = 1): number {
  // Avec plusieurs barres, on laisse une marge supplémentaire pour éviter le chevauchement
  const effectiveWidth = barCount > 1 ? barWidth * 0.85 : barWidth

  // Le label doit tenir dans la largeur de la barre
  // Pour 2-3 chiffres, fontSize ≈ barWidth / 1.5
  const maxFontSize = Math.floor(effectiveWidth / 1.5)

  // Limiter entre 0 et 11px
  if (maxFontSize < 6) return 0   // Trop petit pour être lisible
  if (maxFontSize > 11) return 11 // Cap à 11px

  return maxFontSize
}
