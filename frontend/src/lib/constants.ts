/**
 * Liste des ligues disponibles
 * Source unique de vérité pour toute l'application
 */
export const ALL_LEAGUES = ['LEC', 'LFL', 'LCK', 'LCS', 'LPL', 'LCKCL', 'LCP', 'CBLOL'] as const

export type League = (typeof ALL_LEAGUES)[number]

/**
 * Liste des rôles valides (normalisés)
 */
export const VALID_ROLES = ['TOP', 'JGL', 'MID', 'ADC', 'SUP'] as const

export type Role = (typeof VALID_ROLES)[number]

/**
 * Mapping des différentes variations de noms de rôles vers les noms normalisés
 */
export const ROLE_MAP: Record<string, string> = {
  'TOP': 'TOP',
  'JUNGLE': 'JGL',
  'JGL': 'JGL',
  'JNG': 'JGL',
  'JUNGLER': 'JGL',
  'MID': 'MID',
  'MIDDLE': 'MID',
  'ADC': 'ADC',
  'BOT': 'ADC',
  'BOTTOM': 'ADC',
  'SUP': 'SUP',
  'SUPPORT': 'SUP',
  'UTILITY': 'SUP',
}

/**
 * Configuration des couleurs pour chaque ligue (utilise les CSS variables)
 */
export const LEAGUE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  'LEC': { bg: 'bg-(--league-lec)/20', text: 'text-(--league-lec)', border: 'border-(--league-lec)/30', dot: 'bg-(--league-lec)' },
  'LFL': { bg: 'bg-(--league-lfl)/20', text: 'text-(--league-lfl)', border: 'border-(--league-lfl)/30', dot: 'bg-(--league-lfl)' },
  'LCK': { bg: 'bg-(--league-lck)/20', text: 'text-(--league-lck)', border: 'border-(--league-lck)/30', dot: 'bg-(--league-lck)' },
  'LCS': { bg: 'bg-(--league-lcs)/20', text: 'text-(--league-lcs)', border: 'border-(--league-lcs)/30', dot: 'bg-(--league-lcs)' },
  'LPL': { bg: 'bg-(--league-lpl)/20', text: 'text-(--league-lpl)', border: 'border-(--league-lpl)/30', dot: 'bg-(--league-lpl)' },
  'LCKCL': { bg: 'bg-(--league-lckcl)/20', text: 'text-(--league-lckcl)', border: 'border-(--league-lckcl)/30', dot: 'bg-(--league-lckcl)' },
  'LCP': { bg: 'bg-(--league-lcp)/20', text: 'text-(--league-lcp)', border: 'border-(--league-lcp)/30', dot: 'bg-(--league-lcp)' },
  'CBLOL': { bg: 'bg-(--league-cblol)/20', text: 'text-(--league-cblol)', border: 'border-(--league-cblol)/30', dot: 'bg-(--league-cblol)' },
}
