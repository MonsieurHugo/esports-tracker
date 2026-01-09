import type { DashboardPeriod } from './types'

/**
 * Formate une date en chaîne ISO (YYYY-MM-DD)
 */
export function formatToDateString(date: Date): string {
  return date.toISOString().split('T')[0]
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

  switch (period) {
    case 'day':
      return start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    case 'month':
      return start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    case 'year':
      return start.getFullYear().toString()
    case 'custom':
      return `${start.toLocaleDateString('fr-FR', options)} - ${end.toLocaleDateString('fr-FR', optionsWithYear)}`
    default:
      return ''
  }
}

/**
 * Navigue vers la date précédente ou suivante selon la période
 */
export function navigateDate(
  period: DashboardPeriod,
  currentDate: string,
  direction: 'prev' | 'next'
): string {
  const date = new Date(currentDate)
  const delta = direction === 'prev' ? -1 : 1

  switch (period) {
    case 'day':
      date.setDate(date.getDate() + delta * 7) // Navigate by 7 days for '7 jours' view
      break
    case 'month':
      date.setMonth(date.getMonth() + delta)
      break
    case 'year':
      date.setFullYear(date.getFullYear() + delta)
      break
    case 'custom':
      // Custom period navigation is handled by the store
      date.setDate(date.getDate() + delta)
      break
  }

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

  switch (period) {
    case 'day':
      // 7 derniers jours
      startDate.setDate(startDate.getDate() - 6)
      break
    case 'month':
      // Mois courant
      startDate.setDate(1)
      endDate.setMonth(endDate.getMonth() + 1)
      endDate.setDate(0) // Dernier jour du mois
      break
    case 'year':
      // Année courante
      startDate.setMonth(0, 1)
      endDate.setMonth(11, 31)
      break
    case 'custom':
      // Custom period - dates are set externally, default to 7 days
      startDate.setDate(startDate.getDate() - 6)
      break
  }

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
