import type { DashboardPeriod } from './types'

/**
 * Represents a week bucket for aggregation
 */
export interface WeekBucket {
  weekKey: string      // "2024-W03" ISO week format
  startDate: string    // YYYY-MM-DD (Monday of the week or start of period)
  endDate: string      // YYYY-MM-DD (Sunday of the week or end of period)
  label: string        // Simple label for X-axis: "6 jan."
  rangeLabel: string   // Full range for tooltip: "6-12 jan."
  isPartial: boolean   // true if < 7 days
  dayCount: number     // number of days in the bucket
}

/**
 * Get ISO week number and year for a date
 * ISO weeks start on Monday and week 1 is the week containing Jan 4th
 */
export function getISOWeekNumber(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  // Get first day of year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  // Calculate full weeks to nearest Thursday
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { week: weekNum, year: d.getUTCFullYear() }
}

/**
 * Get the Monday (start) of the week for a given date
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  // day: 0=Sunday, 1=Monday, ..., 6=Saturday
  // We want Monday to be day 0
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Get the Sunday (end) of the week for a given date
 */
export function getWeekEnd(date: Date): Date {
  const monday = getWeekStart(date)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return sunday
}

/**
 * Format a week label in French - simple format like Google Finance
 * Shows only the start date: "6 jan.", "13 jan.", "20 jan."
 */
export function formatWeekLabel(start: Date, _end: Date): string {
  const months = ['jan.', 'fev.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.']

  const startDay = start.getDate()
  const startMonth = months[start.getMonth()]

  return `${startDay} ${startMonth}`
}

/**
 * Format a week range for tooltip - full format
 * Examples: "6-12 jan.", "30 dec. - 5 jan."
 */
export function formatWeekRangeLabel(start: Date, end: Date): string {
  const months = ['jan.', 'fev.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.']

  const startDay = start.getDate()
  const startMonth = months[start.getMonth()]
  const endDay = end.getDate()
  const endMonth = months[end.getMonth()]

  // Same month: "6-12 jan."
  if (start.getMonth() === end.getMonth()) {
    return `${startDay}-${endDay} ${endMonth}`
  }

  // Different months: "30 dec. - 5 jan."
  return `${startDay} ${startMonth} - ${endDay} ${endMonth}`
}

/**
 * Format date to YYYY-MM-DD string
 */
function formatDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Generate week buckets for a date range
 * Handles partial weeks at the start and end of the range
 */
export function generateWeekBuckets(startDateStr: string, endDateStr: string): WeekBucket[] {
  const buckets: WeekBucket[] = []
  const periodStart = new Date(startDateStr + 'T00:00:00')
  const periodEnd = new Date(endDateStr + 'T00:00:00')

  let currentDate = new Date(periodStart)

  while (currentDate <= periodEnd) {
    const weekMonday = getWeekStart(currentDate)
    const weekSunday = getWeekEnd(currentDate)

    // Clamp to period bounds
    const bucketStart = weekMonday < periodStart ? periodStart : weekMonday
    const bucketEnd = weekSunday > periodEnd ? periodEnd : weekSunday

    // Calculate day count
    const dayCount = Math.round((bucketEnd.getTime() - bucketStart.getTime()) / 86400000) + 1
    const isPartial = dayCount < 7

    // Generate week key (ISO format)
    const { week, year } = getISOWeekNumber(bucketStart)
    const weekKey = `${year}-W${String(week).padStart(2, '0')}`

    buckets.push({
      weekKey,
      startDate: formatDateString(bucketStart),
      endDate: formatDateString(bucketEnd),
      label: formatWeekLabel(bucketStart, bucketEnd),
      rangeLabel: formatWeekRangeLabel(bucketStart, bucketEnd),
      isPartial,
      dayCount,
    })

    // Move to next week (Monday after current week's Sunday)
    currentDate = new Date(weekSunday)
    currentDate.setDate(currentDate.getDate() + 1)
  }

  return buckets
}

/**
 * Determine if weekly aggregation should be used for a period
 * Returns true for 30d and 90d periods
 */
export function shouldAggregateByWeek(period: DashboardPeriod | string): boolean {
  return period === '30d' || period === '90d'
}

/**
 * Aggregate LP data by week
 * Takes the last LP value of each week (end-of-week snapshot)
 */
export function aggregateLpDataByWeek(
  dailyData: { date: string; totalLp: number }[],
  weekBuckets: WeekBucket[]
): { weekKey: string; label: string; totalLp: number; isPartial: boolean; dayCount: number }[] {
  // Create a map of date -> LP for quick lookup
  const lpByDate = new Map<string, number>()
  dailyData.forEach(d => {
    if (d.totalLp !== undefined && d.totalLp !== null) {
      lpByDate.set(d.date, d.totalLp)
    }
  })

  return weekBuckets.map(bucket => {
    // Find the last LP value in this week's date range
    let lastLp = 0
    let lastDate = ''

    // Iterate through dates in the bucket to find the latest LP value
    const bucketStart = new Date(bucket.startDate + 'T00:00:00')
    const bucketEnd = new Date(bucket.endDate + 'T00:00:00')

    for (let d = new Date(bucketStart); d <= bucketEnd; d.setDate(d.getDate() + 1)) {
      const dateStr = formatDateString(d)
      const lp = lpByDate.get(dateStr)
      if (lp !== undefined && dateStr >= lastDate) {
        lastLp = lp
        lastDate = dateStr
      }
    }

    // If no data found for this week, try to propagate from previous weeks
    // This will be handled by the chart component

    return {
      weekKey: bucket.weekKey,
      label: bucket.label,
      totalLp: lastLp,
      isPartial: bucket.isPartial,
      dayCount: bucket.dayCount,
    }
  })
}

/**
 * Aggregate winrate data by week
 * Sums games and wins, then calculates winrate from totals
 */
export function aggregateWinrateDataByWeek(
  dailyData: { date: string; games: number; wins: number; winrate: number }[],
  weekBuckets: WeekBucket[]
): { weekKey: string; label: string; games: number; wins: number; winrate: number | null; isPartial: boolean; dayCount: number }[] {
  // Create a map of date -> data for quick lookup
  const dataByDate = new Map<string, { games: number; wins: number }>()
  dailyData.forEach(d => {
    dataByDate.set(d.date, { games: d.games || 0, wins: d.wins || 0 })
  })

  return weekBuckets.map(bucket => {
    let totalGames = 0
    let totalWins = 0

    // Sum all games and wins in this week's date range
    const bucketStart = new Date(bucket.startDate + 'T00:00:00')
    const bucketEnd = new Date(bucket.endDate + 'T00:00:00')

    for (let d = new Date(bucketStart); d <= bucketEnd; d.setDate(d.getDate() + 1)) {
      const dateStr = formatDateString(d)
      const data = dataByDate.get(dateStr)
      if (data) {
        totalGames += data.games
        totalWins += data.wins
      }
    }

    // Calculate winrate from totals (not average of daily winrates)
    const winrate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : null

    return {
      weekKey: bucket.weekKey,
      label: bucket.label,
      games: totalGames,
      wins: totalWins,
      winrate,
      isPartial: bucket.isPartial,
      dayCount: bucket.dayCount,
    }
  })
}
