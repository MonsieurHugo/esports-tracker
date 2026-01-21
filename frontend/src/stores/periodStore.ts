import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { VALID_PERIODS, PERIOD_DAYS, type DashboardPeriod } from '@/lib/types'
import { formatToDateString, getTodayString } from '@/lib/dateUtils'
import { logError } from '@/lib/logger'

// Minimum date for data (no data before this date)
export const MIN_DATA_DATE = '2026-01-08'

// ============================================================================
// Types
// ============================================================================

interface PeriodState {
  // Hydration state
  _hasHydrated: boolean

  // State (all dates stored as ISO strings YYYY-MM-DD)
  period: DashboardPeriod
  referenceDate: string

  // Actions
  setPeriod: (period: DashboardPeriod) => void
  navigatePeriod: (direction: 'prev' | 'next') => void
  resetPeriod: () => void

  // Computed (kept for backward compatibility, prefer selectors)
  getDateRange: () => { startDate: string; endDate: string }
  getPeriodLabel: () => string
  getRefDateString: () => string
}

// ============================================================================
// Pure functions for date calculations
// ============================================================================

const MONTHS_SHORT = ['jan.', 'fev.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'aout', 'sept.', 'oct.', 'nov.', 'dec.']

function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

function getPeriodLabelImpl(period: DashboardPeriod, refDateStr: string): string {
  const ref = parseDate(refDateStr)
  const days = PERIOD_DAYS[period]

  const endDate = ref
  const startDate = new Date(ref)
  startDate.setDate(ref.getDate() - days + 1)

  if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
    return `${startDate.getDate()} - ${endDate.getDate()} ${MONTHS_SHORT[endDate.getMonth()]} ${endDate.getFullYear()}`
  }
  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${startDate.getDate()} ${MONTHS_SHORT[startDate.getMonth()]} - ${endDate.getDate()} ${MONTHS_SHORT[endDate.getMonth()]} ${endDate.getFullYear()}`
  }
  return `${startDate.getDate()} ${MONTHS_SHORT[startDate.getMonth()]} ${startDate.getFullYear()} - ${endDate.getDate()} ${MONTHS_SHORT[endDate.getMonth()]} ${endDate.getFullYear()}`
}

function getDateRangeImpl(period: DashboardPeriod, refDateStr: string): { startDate: string; endDate: string } {
  const ref = parseDate(refDateStr)
  const days = PERIOD_DAYS[period]

  const startDate = new Date(ref)
  startDate.setDate(ref.getDate() - days + 1)

  return {
    startDate: formatToDateString(startDate),
    endDate: refDateStr,
  }
}

// ============================================================================
// Selectors (use these for optimized re-renders)
// ============================================================================

type PeriodStateData = Pick<PeriodState, 'period' | 'referenceDate'>

export const selectDateRange = (state: PeriodStateData) =>
  getDateRangeImpl(state.period, state.referenceDate)

export const selectPeriodLabel = (state: PeriodStateData) =>
  getPeriodLabelImpl(state.period, state.referenceDate)

export const selectRefDateString = (state: PeriodStateData) => state.referenceDate

export const selectCanNavigateNext = (state: PeriodStateData) => {
  const today = getTodayString()
  return state.referenceDate < today
}

export const selectCanNavigatePrev = (state: PeriodStateData) => {
  // Calculate the start date if we navigate back one period
  const days = PERIOD_DAYS[state.period]
  const ref = new Date(state.referenceDate + 'T00:00:00')
  ref.setDate(ref.getDate() - days)
  const newStartDate = new Date(ref)
  newStartDate.setDate(ref.getDate() - days + 1)
  const newStartDateStr = formatToDateString(newStartDate)

  // Can navigate back if the new start date is >= MIN_DATA_DATE
  return newStartDateStr >= MIN_DATA_DATE
}

// ============================================================================
// Migration for old period values
// ============================================================================

const OLD_TO_NEW_PERIOD: Record<string, DashboardPeriod> = {
  'day': '7d',
  'week': '7d',
  'month': '30d',
  'year': '90d',
  'split': '30d',
  'custom': '7d',
}

function migratePeriod(period: unknown): DashboardPeriod {
  if (typeof period !== 'string') return '7d'

  // Already a valid new period
  if (VALID_PERIODS.includes(period as DashboardPeriod)) {
    return period as DashboardPeriod
  }

  // Migrate from old period
  if (period in OLD_TO_NEW_PERIOD) {
    return OLD_TO_NEW_PERIOD[period]
  }

  return '7d'
}

// ============================================================================
// Store
// ============================================================================

export const usePeriodStore = create<PeriodState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      period: '7d',
      referenceDate: getTodayString(),

      setPeriod: (period) => {
        const { referenceDate } = get()
        const today = getTodayString()
        // Use today if current referenceDate is in the future
        const newRefDate = referenceDate > today ? today : referenceDate
        set({ period, referenceDate: newRefDate })
      },

      navigatePeriod: (direction) => {
        const { period, referenceDate } = get()
        const days = PERIOD_DAYS[period]
        const ref = parseDate(referenceDate)

        if (direction === 'next') {
          ref.setDate(ref.getDate() + days)
          // Don't go past today
          const today = getTodayString()
          const newRefDate = formatToDateString(ref)
          set({ referenceDate: newRefDate > today ? today : newRefDate })
        } else {
          ref.setDate(ref.getDate() - days)
          const newRefDate = formatToDateString(ref)
          // Check if new start date would be before MIN_DATA_DATE
          const newStartDate = new Date(ref)
          newStartDate.setDate(ref.getDate() - days + 1)
          const newStartDateStr = formatToDateString(newStartDate)

          if (newStartDateStr >= MIN_DATA_DATE) {
            set({ referenceDate: newRefDate })
          }
          // If it would go before MIN_DATA_DATE, do nothing
        }
      },

      resetPeriod: () => set({
        period: '7d',
        referenceDate: getTodayString(),
      }),

      // Computed methods (backward compatibility - prefer selectors)
      getDateRange: () => {
        const state = get()
        return getDateRangeImpl(state.period, state.referenceDate)
      },

      getPeriodLabel: () => {
        const state = get()
        return getPeriodLabelImpl(state.period, state.referenceDate)
      },

      getRefDateString: () => {
        return get().referenceDate
      },
    }),
    {
      name: 'period-store',
      // Simple storage - dates are already strings, no custom serialization needed
      partialize: (state) => ({
        period: state.period,
        referenceDate: state.referenceDate,
      }),
      // Validate and migrate stored data on load
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          logError('Period store: hydration error', error)
          return
        }
        if (state) {
          // Mark as hydrated
          state._hasHydrated = true

          // Migrate period from old values
          state.period = migratePeriod(state.period)

          // Validate referenceDate format
          if (!/^\d{4}-\d{2}-\d{2}$/.test(state.referenceDate)) {
            state.referenceDate = getTodayString()
          }

          // Always reset referenceDate to today on page load
          // so the period ends at today's date
          state.referenceDate = getTodayString()
        }
      },
    }
  )
)
