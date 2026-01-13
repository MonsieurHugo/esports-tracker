import { describe, it, expect } from 'vitest'
import {
  cn,
  getRankImagePath,
  getRoleImagePath,
  getLeagueTagClasses,
  formatPercent,
  formatLp,
  VALID_ROLES,
  LEAGUE_COLORS,
} from './utils'

describe('utils', () => {
  describe('cn (classnames)', () => {
    it('merges class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('handles conditional classes', () => {
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
    })

    it('handles undefined values', () => {
      expect(cn('foo', undefined, 'bar')).toBe('foo bar')
    })

    it('handles object syntax', () => {
      expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz')
    })

    it('handles arrays', () => {
      expect(cn(['foo', 'bar'])).toBe('foo bar')
    })

    it('concatenates tailwind classes', () => {
      // Note: cn uses clsx, not tailwind-merge, so classes are concatenated
      expect(cn('px-2 py-1', 'px-4')).toBe('px-2 py-1 px-4')
    })
  })

  describe('getRankImagePath', () => {
    it('returns correct path for challenger', () => {
      expect(getRankImagePath('CHALLENGER')).toBe('/images/ranks/challenger.webp')
    })

    it('returns correct path for other ranks', () => {
      expect(getRankImagePath('DIAMOND')).toBe('/images/ranks/diamond.png')
      expect(getRankImagePath('GOLD')).toBe('/images/ranks/gold.png')
      expect(getRankImagePath('IRON')).toBe('/images/ranks/iron.png')
    })

    it('returns null for null input', () => {
      expect(getRankImagePath(null)).toBeNull()
    })

    it('handles case insensitivity', () => {
      expect(getRankImagePath('Diamond')).toBe('/images/ranks/diamond.png')
      expect(getRankImagePath('CHALLENGER')).toBe('/images/ranks/challenger.webp')
    })
  })

  describe('getRoleImagePath', () => {
    it('returns correct path for standard roles', () => {
      expect(getRoleImagePath('TOP')).toBe('/images/roles/TOP.png')
      expect(getRoleImagePath('JUNGLE')).toBe('/images/roles/JGL.png')
      expect(getRoleImagePath('MIDDLE')).toBe('/images/roles/MID.png')
      expect(getRoleImagePath('BOTTOM')).toBe('/images/roles/ADC.png')
      expect(getRoleImagePath('SUPPORT')).toBe('/images/roles/SUP.png')
    })

    it('returns normalized path for short role names', () => {
      expect(getRoleImagePath('JGL')).toBe('/images/roles/JGL.png')
      expect(getRoleImagePath('MID')).toBe('/images/roles/MID.png')
      expect(getRoleImagePath('ADC')).toBe('/images/roles/ADC.png')
      expect(getRoleImagePath('SUP')).toBe('/images/roles/SUP.png')
    })

    it('returns uppercase path for unknown roles', () => {
      expect(getRoleImagePath('UNKNOWN')).toBe('/images/roles/UNKNOWN.png')
    })

    it('handles case insensitivity', () => {
      expect(getRoleImagePath('top')).toBe('/images/roles/TOP.png')
      expect(getRoleImagePath('Top')).toBe('/images/roles/TOP.png')
    })
  })

  describe('getLeagueTagClasses', () => {
    it('returns correct classes for LEC', () => {
      const result = getLeagueTagClasses('LEC')
      expect(result).toContain('bg-')
      expect(result).toContain('text-')
      expect(result).toContain('border')
    })

    it('returns correct classes for LCK', () => {
      const result = getLeagueTagClasses('LCK')
      expect(result).toBeDefined()
      expect(result).toContain('bg-')
    })

    it('returns default classes for unknown league', () => {
      const result = getLeagueTagClasses('UNKNOWN')
      expect(result).toBe('bg-(--bg-secondary) text-(--text-muted)')
    })

    it('is case sensitive - lowercase returns default', () => {
      // getLeagueTagClasses does not handle case insensitivity
      expect(getLeagueTagClasses('lec')).toBe('bg-(--bg-secondary) text-(--text-muted)')
    })
  })

  describe('formatPercent', () => {
    it('formats percent with default decimal places', () => {
      expect(formatPercent(55.555)).toBe('55.6%')
    })

    it('formats percent with custom decimal places', () => {
      // Note: toFixed doesn't always round as expected, 55.555 becomes 55.55
      expect(formatPercent(55.556, 2)).toBe('55.56%')
    })

    it('formats whole number percentages', () => {
      expect(formatPercent(50)).toBe('50.0%')
    })

    it('handles 100%', () => {
      expect(formatPercent(100)).toBe('100.0%')
    })

    it('handles 0%', () => {
      expect(formatPercent(0)).toBe('0.0%')
    })
  })

  describe('formatLp', () => {
    it('formats LP for Master tier', () => {
      // toLocaleString uses system locale, check result contains digits
      const result = formatLp('MASTER', 1500)
      expect(result).toMatch(/1.?500/)
    })

    it('formats LP for Grandmaster tier', () => {
      expect(formatLp('GRANDMASTER', 500)).toBe('500')
    })

    it('formats LP for Challenger tier', () => {
      const result = formatLp('CHALLENGER', 1234)
      expect(result).toMatch(/1.?234/)
    })

    it('returns dash for non-Master+ tiers', () => {
      expect(formatLp('DIAMOND', 100)).toBe('-')
      expect(formatLp('GOLD', 50)).toBe('-')
    })

    it('returns dash for null tier', () => {
      expect(formatLp(null, 100)).toBe('-')
    })

    it('handles case insensitivity for tier', () => {
      expect(formatLp('master', 500)).toBe('500')
    })
  })

  describe('VALID_ROLES', () => {
    it('contains all normalized roles', () => {
      expect(VALID_ROLES).toContain('TOP')
      expect(VALID_ROLES).toContain('JGL')
      expect(VALID_ROLES).toContain('MID')
      expect(VALID_ROLES).toContain('ADC')
      expect(VALID_ROLES).toContain('SUP')
    })

    it('has exactly 5 roles', () => {
      expect(VALID_ROLES).toHaveLength(5)
    })
  })

  describe('LEAGUE_COLORS', () => {
    it('contains available leagues', () => {
      expect(LEAGUE_COLORS).toHaveProperty('LEC')
      expect(LEAGUE_COLORS).toHaveProperty('LFL')
      expect(LEAGUE_COLORS).toHaveProperty('LCK')
      expect(LEAGUE_COLORS).toHaveProperty('LCS')
    })

    it('has correct color properties for each league', () => {
      expect(LEAGUE_COLORS.LEC).toHaveProperty('bg')
      expect(LEAGUE_COLORS.LEC).toHaveProperty('text')
      expect(LEAGUE_COLORS.LEC).toHaveProperty('border')
      expect(LEAGUE_COLORS.LEC).toHaveProperty('dot')
    })
  })
})
