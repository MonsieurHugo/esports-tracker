import { clsx, type ClassValue } from 'clsx'
import { ROLE_MAP, LEAGUE_COLORS, VALID_ROLES } from './constants'

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
      return 'text-yellow-400'
    case 2:
      return 'text-gray-400'
    case 3:
      return 'text-amber-600'
    default:
      return 'text-[var(--text-muted)]'
  }
}

/**
 * Retourne la classe CSS pour un badge de rang avec gradient (1er, 2ème, 3ème, etc.)
 */
export function getRankBadgeClass(rank: number): string {
  switch (rank) {
    case 1:
      return 'bg-gradient-to-br from-yellow-400 to-amber-600 text-black'
    case 2:
      return 'bg-gradient-to-br from-gray-300 to-gray-400 text-black'
    case 3:
      return 'bg-gradient-to-br from-amber-600 to-amber-800 text-white'
    default:
      return 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
  }
}

/**
 * Retourne la classe CSS pour la couleur d'un tier LoL (Master+)
 */
export function getTierColor(tier: string | null): string {
  if (!tier) return 'text-[var(--text-muted)]'
  switch (tier.toUpperCase()) {
    case 'CHALLENGER':
      return 'text-cyan-400'
    case 'GRANDMASTER':
      return 'text-red-400'
    case 'MASTER':
      return 'text-purple-400'
    default:
      return 'text-[var(--text-muted)]'
  }
}

/**
 * Retourne les classes CSS pour un badge de rang LoL (tier + background)
 */
export function getRankBadgeClasses(tier: string | null): string {
  if (!tier) return 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
  switch (tier.toUpperCase()) {
    case 'CHALLENGER':
      return 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
    case 'GRANDMASTER':
      return 'bg-red-500/20 text-red-400 border border-red-500/30'
    case 'MASTER':
      return 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
    case 'DIAMOND':
      return 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
    case 'EMERALD':
      return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
    case 'PLATINUM':
      return 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
    case 'GOLD':
      return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
    default:
      return 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
  }
}


/**
 * Retourne les classes CSS pour un tag de ligue
 */
export function getLeagueTagClasses(league: string): string {
  const colors = LEAGUE_COLORS[league]
  if (colors) {
    return `${colors.bg} ${colors.text} border ${colors.border}`
  }
  return 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
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

