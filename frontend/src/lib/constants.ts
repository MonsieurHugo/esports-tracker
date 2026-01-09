/**
 * Liste des ligues disponibles
 * Source unique de vérité pour toute l'application
 */
export const ALL_LEAGUES = ['LEC', 'LFL', 'LCK', 'LCS'] as const

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
  'JUNGLER': 'JGL',
  'MID': 'MID',
  'MIDDLE': 'MID',
  'ADC': 'ADC',
  'BOT': 'ADC',
  'BOTTOM': 'ADC',
  'SUP': 'SUP',
  'SUPPORT': 'SUP',
}

/**
 * Configuration des couleurs pour chaque ligue
 */
export const LEAGUE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  'LEC': { bg: 'bg-[#00e5bf]/20', text: 'text-[#00e5bf]', border: 'border-[#00e5bf]/30', dot: 'bg-[#00e5bf]' },
  'LFL': { bg: 'bg-[#ff7b57]/20', text: 'text-[#ff7b57]', border: 'border-[#ff7b57]/30', dot: 'bg-[#ff7b57]' },
  'LCK': { bg: 'bg-[#f5e6d3]/20', text: 'text-[#f5e6d3]', border: 'border-[#f5e6d3]/30', dot: 'bg-[#f5e6d3]' },
  'LCS': { bg: 'bg-[#0a7cff]/20', text: 'text-[#0a7cff]', border: 'border-[#0a7cff]/30', dot: 'bg-[#0a7cff]' },
}
