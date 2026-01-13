import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatToDateString,
  getTodayString,
  isTodayInRange,
  formatDateRange,
  navigateDate,
  getDateRangeForPeriod,
  getRelativeTime,
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
    it('formats day period correctly', () => {
      const result = formatDateRange('day', '2024-06-15', '2024-06-15')
      expect(result).toContain('2024')
      expect(result).toContain('15')
    })

    it('formats month period correctly', () => {
      const result = formatDateRange('month', '2024-06-01', '2024-06-30')
      expect(result.toLowerCase()).toContain('juin')
      expect(result).toContain('2024')
    })

    it('formats year period correctly', () => {
      const result = formatDateRange('year', '2024-01-01', '2024-12-31')
      expect(result).toBe('2024')
    })

    it('formats custom period correctly', () => {
      const result = formatDateRange('custom', '2024-06-10', '2024-06-20')
      expect(result).toContain('10')
      expect(result).toContain('20')
    })
  })

  describe('navigateDate', () => {
    it('navigates day period by 7 days forward', () => {
      const result = navigateDate('day', '2024-06-15', 'next')
      expect(result).toBe('2024-06-22')
    })

    it('navigates day period by 7 days backward', () => {
      const result = navigateDate('day', '2024-06-15', 'prev')
      expect(result).toBe('2024-06-08')
    })

    it('navigates month period forward', () => {
      const result = navigateDate('month', '2024-06-15', 'next')
      expect(result).toBe('2024-07-15')
    })

    it('navigates month period backward', () => {
      const result = navigateDate('month', '2024-06-15', 'prev')
      expect(result).toBe('2024-05-15')
    })

    it('navigates year period forward', () => {
      const result = navigateDate('year', '2024-06-15', 'next')
      expect(result).toBe('2025-06-15')
    })

    it('navigates year period backward', () => {
      const result = navigateDate('year', '2024-06-15', 'prev')
      expect(result).toBe('2023-06-15')
    })
  })

  describe('getDateRangeForPeriod', () => {
    it('returns 7 day range for day period', () => {
      const refDate = new Date('2024-06-20')
      const { startDate, endDate } = getDateRangeForPeriod('day', refDate)
      expect(startDate).toBe('2024-06-14')
      expect(endDate).toBe('2024-06-20')
    })

    it('returns month range for month period', () => {
      const refDate = new Date('2024-06-15')
      const { startDate, endDate } = getDateRangeForPeriod('month', refDate)
      expect(startDate).toBe('2024-06-01')
      expect(endDate).toBe('2024-06-30')
    })

    it('returns year range for year period', () => {
      const refDate = new Date('2024-06-15')
      const { startDate, endDate } = getDateRangeForPeriod('year', refDate)
      expect(startDate).toBe('2024-01-01')
      expect(endDate).toBe('2024-12-31')
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
