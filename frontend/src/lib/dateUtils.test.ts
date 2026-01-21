import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatToDateString,
  getTodayString,
  isTodayInRange,
  formatDateRange,
  navigateDate,
  getDateRangeForPeriod,
  getRelativeTime,
  generateCompleteDateRange,
} from './dateUtils'

describe('dateUtils', () => {
  describe('formatToDateString', () => {
    it('formats a date to YYYY-MM-DD', () => {
      const date = new Date('2024-03-15T12:00:00Z')
      expect(formatToDateString(date)).toBe('2024-03-15')
    })

    it('handles single digit months and days', () => {
      const date = new Date('2024-01-05T12:00:00Z')
      expect(formatToDateString(date)).toBe('2024-01-05')
    })
  })

  describe('getTodayString', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns today date as string', () => {
      vi.setSystemTime(new Date('2024-06-20T10:00:00Z'))
      expect(getTodayString()).toBe('2024-06-20')
    })
  })

  describe('isTodayInRange', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T10:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns true when today is within range', () => {
      expect(isTodayInRange('2024-06-10', '2024-06-20')).toBe(true)
    })

    it('returns true when today is at start of range', () => {
      expect(isTodayInRange('2024-06-15', '2024-06-20')).toBe(true)
    })

    it('returns true when today is at end of range', () => {
      expect(isTodayInRange('2024-06-10', '2024-06-15')).toBe(true)
    })

    it('returns false when today is before range', () => {
      expect(isTodayInRange('2024-06-16', '2024-06-20')).toBe(false)
    })

    it('returns false when today is after range', () => {
      expect(isTodayInRange('2024-06-01', '2024-06-14')).toBe(false)
    })
  })

  describe('formatDateRange', () => {
    it('formats 7d period correctly', () => {
      const result = formatDateRange('7d', '2024-06-09', '2024-06-15')
      expect(result).toContain('2024')
      expect(result).toContain('9')
      expect(result).toContain('15')
    })

    it('formats 14d period correctly', () => {
      const result = formatDateRange('14d', '2024-06-02', '2024-06-15')
      expect(result).toContain('2')
      expect(result).toContain('15')
    })

    it('formats 30d period correctly', () => {
      const result = formatDateRange('30d', '2024-05-17', '2024-06-15')
      expect(result).toContain('17')
      expect(result).toContain('15')
    })

    it('formats 90d period correctly', () => {
      const result = formatDateRange('90d', '2024-03-18', '2024-06-15')
      expect(result).toContain('18')
      expect(result).toContain('15')
    })
  })

  describe('navigateDate', () => {
    it('navigates 7d period by 7 days forward', () => {
      const result = navigateDate('7d', '2024-06-15', 'next')
      expect(result).toBe('2024-06-22')
    })

    it('navigates 7d period by 7 days backward', () => {
      const result = navigateDate('7d', '2024-06-15', 'prev')
      expect(result).toBe('2024-06-08')
    })

    it('navigates 14d period by 14 days forward', () => {
      const result = navigateDate('14d', '2024-06-15', 'next')
      expect(result).toBe('2024-06-29')
    })

    it('navigates 14d period by 14 days backward', () => {
      const result = navigateDate('14d', '2024-06-15', 'prev')
      expect(result).toBe('2024-06-01')
    })

    it('navigates 30d period by 30 days forward', () => {
      const result = navigateDate('30d', '2024-06-15', 'next')
      expect(result).toBe('2024-07-15')
    })

    it('navigates 30d period by 30 days backward', () => {
      const result = navigateDate('30d', '2024-06-15', 'prev')
      expect(result).toBe('2024-05-16')
    })

    it('navigates 90d period by 90 days forward', () => {
      const result = navigateDate('90d', '2024-06-15', 'next')
      expect(result).toBe('2024-09-13')
    })

    it('navigates 90d period by 90 days backward', () => {
      const result = navigateDate('90d', '2024-06-15', 'prev')
      expect(result).toBe('2024-03-17')
    })
  })

  describe('getDateRangeForPeriod', () => {
    it('returns 7 day range for 7d period', () => {
      const refDate = new Date('2024-06-20')
      const { startDate, endDate } = getDateRangeForPeriod('7d', refDate)
      expect(startDate).toBe('2024-06-14')
      expect(endDate).toBe('2024-06-20')
    })

    it('returns 14 day range for 14d period', () => {
      const refDate = new Date('2024-06-20')
      const { startDate, endDate } = getDateRangeForPeriod('14d', refDate)
      expect(startDate).toBe('2024-06-07')
      expect(endDate).toBe('2024-06-20')
    })

    it('returns 30 day range for 30d period', () => {
      const refDate = new Date('2024-06-20')
      const { startDate, endDate } = getDateRangeForPeriod('30d', refDate)
      expect(startDate).toBe('2024-05-22')
      expect(endDate).toBe('2024-06-20')
    })

    it('returns 90 day range for 90d period', () => {
      const refDate = new Date('2024-06-20')
      const { startDate, endDate } = getDateRangeForPeriod('90d', refDate)
      expect(startDate).toBe('2024-03-23')
      expect(endDate).toBe('2024-06-20')
    })
  })

  describe('generateCompleteDateRange', () => {
    it('generates 7 entries for 7d period', () => {
      const result = generateCompleteDateRange({ period: '7d', refDate: '2024-06-20' })
      expect(result).toHaveLength(7)
      expect(result[0].date).toBe('2024-06-14')
      expect(result[6].date).toBe('2024-06-20')
    })

    it('generates 14 entries for 14d period', () => {
      const result = generateCompleteDateRange({ period: '14d', refDate: '2024-06-20' })
      expect(result).toHaveLength(14)
      expect(result[0].date).toBe('2024-06-07')
      expect(result[13].date).toBe('2024-06-20')
    })

    it('generates 30 entries for 30d period', () => {
      const result = generateCompleteDateRange({ period: '30d', refDate: '2024-06-20' })
      expect(result).toHaveLength(30)
      expect(result[0].date).toBe('2024-05-22')
      expect(result[29].date).toBe('2024-06-20')
    })

    it('generates 90 entries for 90d period', () => {
      const result = generateCompleteDateRange({ period: '90d', refDate: '2024-06-20' })
      expect(result).toHaveLength(90)
      expect(result[0].date).toBe('2024-03-23')
      expect(result[89].date).toBe('2024-06-20')
    })

    it('includes formatted labels', () => {
      const result = generateCompleteDateRange({ period: '7d', refDate: '2024-06-20' })
      expect(result[0].label).toBeDefined()
      expect(typeof result[0].label).toBe('string')
    })
  })

  describe('getRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-20T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns "A l\'instant" for very recent times', () => {
      const result = getRelativeTime(new Date('2024-06-20T11:59:30Z'))
      expect(result).toBe("A l'instant")
    })

    it('returns minutes for times within an hour', () => {
      const result = getRelativeTime(new Date('2024-06-20T11:45:00Z'))
      expect(result).toContain('15 min')
    })

    it('returns hours for times within a day', () => {
      const result = getRelativeTime(new Date('2024-06-20T08:00:00Z'))
      expect(result).toContain('4 h')
    })

    it('returns days for times within a week', () => {
      const result = getRelativeTime(new Date('2024-06-18T12:00:00Z'))
      expect(result).toContain('2 j')
    })

    it('returns formatted date for older times', () => {
      const result = getRelativeTime(new Date('2024-05-01T12:00:00Z'))
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    })
  })
})
