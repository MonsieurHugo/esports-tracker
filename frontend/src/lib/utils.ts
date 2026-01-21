import { clsx, type ClassValue } from 'clsx'
import { ROLE_MAP, LEAGUE_COLORS, VALID_ROLES } from './constants'
import { VALID_PERIODS, VALID_SORT_OPTIONS, type DashboardPeriod, type SortOption } from './types'

// Re-export from constants for backward compatibility
export { LEAGUE_COLORS, VALID_ROLES }

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('fr-FR').format(num)
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export function calculateKDA(kills: number, deaths: number, assists: number): string {
  if (deaths === 0) {
    return 'Perfect'
  }
  return ((kills + assists) / deaths).toFixed(2)
}

export function calculateWinrate(wins: number, total: number): number {
  if (total === 0) return 0
  return (wins / total) * 100
}

export function getRelativeTime(date: Date | string): string {
  const now = new Date()
  const past = new Date(date)
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000)

  if (diffInSeconds < 60) return 'A l\'instant'
  if (diffInSeconds < 3600) return `Il y a ${Math.floor(diffInSeconds / 60)} min`
  if (diffInSeconds < 86400) return `Il y a ${Math.floor(diffInSeconds / 3600)} h`
  if (diffInSeconds < 604800) return `Il y a ${Math.floor(diffInSeconds / 86400)} j`

  return past.toLocaleDateString('fr-FR')
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/**
 * Retourne la classe CSS pour la couleur de texte d'un rang (1er, 2ème, 3ème, etc.)
 */
export function getRankTextClass(rank: number): string {
  switch (rank) {
    case 1:
      return 'text-(--rank-gold)'
    case 2:
      return 'text-(--rank-silver)'
    case 3:
      return 'text-(--rank-bronze)'
    default:
      return 'text-(--text-muted)'
  }
}

/**
 * Retourne la classe CSS pour un badge de rang avec gradient (1er, 2ème, 3ème, etc.)
 */
export function getRankBadgeClass(rank: number): string {
  switch (rank) {
    case 1:
      return 'bg-linear-to-br from-(--rank-gold) to-(--rank-bronze) text-(--bg-primary)'
    case 2:
      return 'bg-linear-to-br from-(--rank-silver) to-(--text-muted) text-(--bg-primary)'
    case 3:
      return 'bg-linear-to-br from-(--rank-bronze) to-(--rank-bronze)/70 text-(--text-primary)'
    default:
      return 'bg-(--bg-secondary) text-(--text-muted)'
  }
}

/**
 * Retourne la classe CSS pour la couleur d'un tier LoL (Master+)
 */
export function getTierColor(tier: string | null): string {
  if (!tier) return 'text-(--text-muted)'
  switch (tier.toUpperCase()) {
    case 'CHALLENGER':
      return 'text-(--tier-challenger)'
    case 'GRANDMASTER':
      return 'text-(--tier-grandmaster)'
    case 'MASTER':
      return 'text-(--tier-master)'
    default:
      return 'text-(--text-muted)'
  }
}

/**
 * Retourne les classes CSS pour un badge de rang LoL (tier + background)
 */
export function getRankBadgeClasses(tier: string | null): string {
  if (!tier) return 'bg-(--bg-secondary) text-(--text-muted)'
  switch (tier.toUpperCase()) {
    case 'CHALLENGER':
      return 'bg-(--tier-challenger)/20 text-(--tier-challenger) border border-(--tier-challenger)/30'
    case 'GRANDMASTER':
      return 'bg-(--tier-grandmaster)/20 text-(--tier-grandmaster) border border-(--tier-grandmaster)/30'
    case 'MASTER':
      return 'bg-(--tier-master)/20 text-(--tier-master) border border-(--tier-master)/30'
    case 'DIAMOND':
      return 'bg-(--tier-diamond)/20 text-(--tier-diamond) border border-(--tier-diamond)/30'
    case 'EMERALD':
      return 'bg-(--tier-emerald)/20 text-(--tier-emerald) border border-(--tier-emerald)/30'
    case 'PLATINUM':
      return 'bg-(--tier-platinum)/20 text-(--tier-platinum) border border-(--tier-platinum)/30'
    case 'GOLD':
      return 'bg-(--tier-gold)/20 text-(--tier-gold) border border-(--tier-gold)/30'
    default:
      return 'bg-(--bg-secondary) text-(--text-muted)'
  }
}


/**
 * Retourne les classes CSS pour un tag de ligue
 */
export function getLeagueTagClasses(league: string): string {
  const normalizedLeague = league.toUpperCase()
  const colors = LEAGUE_COLORS[normalizedLeague]
  if (colors) {
    return `${colors.bg} ${colors.text} border ${colors.border}`
  }
  return 'bg-(--bg-secondary) text-(--text-muted)'
}

/**
 * Retourne les couleurs pour une ligue (utilise LEAGUE_COLORS)
 */
export function getLeagueColor(league: string): { bg: string; text: string; border: string; dot: string } {
  const normalizedLeague = league.toUpperCase()
  const colors = LEAGUE_COLORS[normalizedLeague]
  if (colors) {
    return colors
  }
  // Couleur par défaut pour les ligues inconnues
  return { bg: 'bg-(--bg-secondary)', text: 'text-(--text-muted)', border: 'border-(--border)', dot: 'bg-(--text-muted)' }
}

/**
 * Sanitize and validate a color value to prevent XSS injection.
 * Only allows valid hex color formats: #RGB or #RRGGBB
 */
export function sanitizeColorValue(color: string | null | undefined): string | null {
  if (!color) return null
  // Validate hex color format: #RGB or #RRGGBB
  const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/
  if (hexPattern.test(color)) {
    return color
  }
  return null
}

/**
 * Génère un objet style inline pour un tag de ligue à partir d'une couleur hexa
 * Utilisé quand la couleur vient de l'API (BDD)
 */
export function getLeagueStyleFromColor(color: string | null): React.CSSProperties {
  const sanitizedColor = sanitizeColorValue(color)
  if (!sanitizedColor) {
    return {
      backgroundColor: 'var(--bg-secondary)',
      color: 'var(--text-muted)',
      borderColor: 'var(--border)',
    }
  }
  return {
    backgroundColor: `${sanitizedColor}20`, // 20 = 12% opacity en hexa
    color: sanitizedColor,
    borderColor: `${sanitizedColor}4D`, // 4D = 30% opacity en hexa
  }
}

/**
 * Retourne les classes CSS pour un tag de région/serveur
 */
export function getRegionTagClasses(region: string): string {
  const regionUpper = region.toUpperCase()

  // Couleurs par région
  const regionColors: Record<string, string> = {
    // Europe
    'EUW1': 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    'EUW': 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    'EUN1': 'bg-sky-500/20 text-sky-400 border border-sky-500/30',
    'EUNE': 'bg-sky-500/20 text-sky-400 border border-sky-500/30',

    // Amérique du Nord
    'NA1': 'bg-red-500/20 text-red-400 border border-red-500/30',
    'NA': 'bg-red-500/20 text-red-400 border border-red-500/30',

    // Corée
    'KR': 'bg-purple-500/20 text-purple-400 border border-purple-500/30',

    // Japon
    'JP1': 'bg-pink-500/20 text-pink-400 border border-pink-500/30',
    'JP': 'bg-pink-500/20 text-pink-400 border border-pink-500/30',

    // Brésil
    'BR1': 'bg-green-500/20 text-green-400 border border-green-500/30',
    'BR': 'bg-green-500/20 text-green-400 border border-green-500/30',

    // Amérique Latine
    'LA1': 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    'LAN': 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    'LA2': 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    'LAS': 'bg-orange-500/20 text-orange-400 border border-orange-500/30',

    // Océanie
    'OC1': 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',
    'OCE': 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30',

    // Turquie
    'TR1': 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
    'TR': 'bg-rose-500/20 text-rose-400 border border-rose-500/30',

    // Russie
    'RU': 'bg-slate-500/20 text-slate-400 border border-slate-500/30',

    // Asie du Sud-Est
    'SG2': 'bg-teal-500/20 text-teal-400 border border-teal-500/30',
    'SEA': 'bg-teal-500/20 text-teal-400 border border-teal-500/30',

    // Chine (différents serveurs)
    'CN': 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',

    // Taiwan/Hong Kong
    'TW2': 'bg-lime-500/20 text-lime-400 border border-lime-500/30',
    'TW': 'bg-lime-500/20 text-lime-400 border border-lime-500/30',
  }

  return regionColors[regionUpper] || 'bg-(--bg-secondary) text-(--text-muted)'
}

/**
 * Formate les LP pour affichage (uniquement Master+)
 */
export function formatLp(tier: string | null, lp: number): string {
  if (!tier) return '-'
  if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier.toUpperCase())) {
    return lp.toLocaleString()
  }
  return '-'
}

/**
 * Retourne le chemin de l'image du rang LoL
 */
export function getRankImagePath(tier: string | null): string | null {
  if (!tier) return null
  const tierLower = tier.toLowerCase()
  if (tierLower === 'challenger') {
    return '/images/ranks/challenger.webp'
  }
  const validTiers = ['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster']
  if (validTiers.includes(tierLower)) {
    return `/images/ranks/${tierLower}.png`
  }
  return null
}

/**
 * Retourne le chemin de l'image du rôle normalisé
 */
export function getRoleImagePath(role: string): string {
  const roleUpper = role.toUpperCase()
  const normalizedRole = ROLE_MAP[roleUpper] || roleUpper
  return `/images/roles/${normalizedRole}.png`
}

/**
 * Sanitize a slug for safe use in file paths.
 * Only allows alphanumeric characters and hyphens to prevent path traversal attacks.
 */
export function sanitizeSlug(slug: string | null | undefined): string {
  if (!slug) return 'unknown'
  const sanitized = slug.toLowerCase().replace(/[^a-z0-9-]/g, '')
  return sanitized || 'unknown'
}

/**
 * Validate and sanitize a period parameter for API calls.
 * Returns a safe default if the value is invalid.
 */
export function validatePeriod(period: string): DashboardPeriod {
  if (VALID_PERIODS.includes(period as DashboardPeriod)) {
    return period as DashboardPeriod
  }
  return '7d'  // Valid default (was 'week' which is invalid)
}

/**
 * Validate and sanitize a sort option parameter for API calls.
 * Returns a safe default if the value is invalid.
 */
export function validateSortOption(sort: string): SortOption {
  if (VALID_SORT_OPTIONS.includes(sort as SortOption)) {
    return sort as SortOption
  }
  return 'lp'
}

/**
 * Sanitize a search query by removing potentially dangerous characters.
 * Prevents XSS and SQL injection when passed to APIs.
 */
export function sanitizeSearchQuery(query: string, maxLength = 100): string {
  if (!query) return ''
  // Truncate to max length
  const truncated = query.slice(0, maxLength)
  // Remove dangerous characters
  return truncated.replace(/[<>\"'%;()&+\\]/g, '')
}

/**
 * Validate a URL slug parameter.
 * Returns true if the slug is valid (alphanumeric and hyphens only).
 */
export function isValidSlug(slug: string | null | undefined): boolean {
  if (!slug) return false
  // Must be non-empty and only contain valid characters
  return /^[a-z0-9-]+$/.test(slug.toLowerCase()) && slug.length > 0 && slug.length <= 100
}

