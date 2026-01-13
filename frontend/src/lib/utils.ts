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
  const colors = LEAGUE_COLORS[league]
  if (colors) {
    return `${colors.bg} ${colors.text} border ${colors.border}`
  }
  return 'bg-(--bg-secondary) text-(--text-muted)'
}

/**
 * Génère des couleurs pour les ligues non définies dans LEAGUE_COLORS
 * Utilise une couleur par défaut pour les ligues inconnues
 */
export function getLeagueColor(league: string): { bg: string; text: string; border: string; dot: string } {
  // Couleurs prédéfinies pour les nouvelles ligues courantes
  const additionalColors: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    'LPL': { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-400' },
    'LCKCL': { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-400' },
    'LCP': { bg: 'bg-pink-500/20', text: 'text-pink-400', border: 'border-pink-500/30', dot: 'bg-pink-400' },
    'LTAS': { bg: 'bg-teal-500/20', text: 'text-teal-400', border: 'border-teal-500/30', dot: 'bg-teal-400' },
    'LTAN': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', dot: 'bg-cyan-400' },
    'VCS': { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', dot: 'bg-orange-400' },
    'PCS': { bg: 'bg-lime-500/20', text: 'text-lime-400', border: 'border-lime-500/30', dot: 'bg-lime-400' },
    'CBLOL': { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', dot: 'bg-green-400' },
    'LLA': { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-400' },
    'LJL': { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30', dot: 'bg-indigo-400' },
  }

  if (additionalColors[league]) {
    return additionalColors[league]
  }

  // Couleur par défaut pour les ligues inconnues
  return { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500/30', dot: 'bg-gray-400' }
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

