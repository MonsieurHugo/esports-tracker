import { PERIOD_DAYS, type DashboardPeriod } from './types'

// Re-export weekly aggregation utilities
export { shouldAggregateByWeek, generateWeekBuckets } from './weekAggregation'
export type { WeekBucket } from './weekAggregation'

/**
 * Formate une date en chaîne ISO (YYYY-MM-DD) en heure locale
 */
export function formatToDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Retourne la date d'aujourd'hui au format YYYY-MM-DD
 */
export function getTodayString(): string {
  return formatToDateString(new Date())
}

/**
 * Vérifie si aujourd'hui est dans la plage de dates
 */
export function isTodayInRange(startDate: string, endDate: string): boolean {
  const today = getTodayString()
  return today >= startDate && today <= endDate
}

/**
 * Formate une plage de dates selon la période sélectionnée
 */
export function formatDateRange(
  period: DashboardPeriod,
  startDate: string,
  endDate: string
): string {
  const start = new Date(startDate)
  const end = new Date(endDate)

  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const optionsWithYear: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

  // All periods are sliding windows, show full date range
  return `${start.toLocaleDateString('fr-FR', options)} - ${end.toLocaleDateString('fr-FR', optionsWithYear)}`
}

/**
 * Navigue vers la date précédente ou suivante selon la période
 * Shifting is done by the period's number of days
 */
export function navigateDate(
  period: DashboardPeriod,
  currentDate: string,
  direction: 'prev' | 'next'
): string {
  const date = new Date(currentDate)
  const days = PERIOD_DAYS[period]
  const delta = direction === 'prev' ? -days : days

  date.setDate(date.getDate() + delta)

  return formatToDateString(date)
}

/**
 * Calcule les dates de début et fin pour une période donnée
 */
export function getDateRangeForPeriod(
  period: DashboardPeriod,
  referenceDate: Date = new Date()
): { startDate: string; endDate: string } {
  const endDate = new Date(referenceDate)
  const startDate = new Date(referenceDate)
  const days = PERIOD_DAYS[period]

  // All periods are sliding windows: startDate = refDate - (days - 1)
  startDate.setDate(startDate.getDate() - (days - 1))

  return {
    startDate: formatToDateString(startDate),
    endDate: formatToDateString(endDate),
  }
}

/**
 * Formate le temps relatif (ex: "Il y a 5 min", "Il y a 2 h")
 */
export function getRelativeTime(date: Date | string): string {
  const now = new Date()
  const past = new Date(date)
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000)

  if (diffInSeconds < 60) return "A l'instant"
  if (diffInSeconds < 3600) return `Il y a ${Math.floor(diffInSeconds / 60)} min`
  if (diffInSeconds < 86400) return `Il y a ${Math.floor(diffInSeconds / 3600)} h`
  if (diffInSeconds < 604800) return `Il y a ${Math.floor(diffInSeconds / 86400)} j`

  return past.toLocaleDateString('fr-FR')
}

export interface DateRangeConfig {
  period: DashboardPeriod
  refDate: string          // YYYY-MM-DD
}

/**
 * Génère une plage complète de dates avec labels formatés selon la période.
 * Utilisé pour forcer l'affichage de tous les jours même sans données.
 * Toutes les périodes sont des fenêtres glissantes de N jours.
 */
export function generateCompleteDateRange(config: DateRangeConfig): { date: string; label: string }[] {
  const { period, refDate } = config
  const ref = new Date(refDate + 'T00:00:00')
  const days = PERIOD_DAYS[period]
  const results: { date: string; label: string }[] = []

  // All periods: generate `days` entries from (refDate - days + 1) to refDate
  const start = new Date(ref)
  start.setDate(start.getDate() - days + 1)

  for (let i = 0; i < days; i++) {
    const current = new Date(start)
    current.setDate(start.getDate() + i)
    results.push({
      date: formatToDateString(current),
      label: current.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
    })
  }

  return results
}
