'use client'

import { memo } from 'react'
import { useUIStore } from '@/stores/uiStore'
import type { DashboardPeriod } from '@/lib/types'

interface MobileControlBarProps {
  period: DashboardPeriod
  onPeriodChange: (period: DashboardPeriod) => void
  periodLabel: string
  onNavigatePeriod: (direction: 'prev' | 'next') => void
  canGoNext: boolean
  canGoPrev: boolean
  activeFiltersCount: number
}

const periods: { value: DashboardPeriod; label: string }[] = [
  { value: '7d', label: '7J' },
  { value: '14d', label: '14J' },
  { value: '30d', label: '30J' },
  { value: '90d', label: '90J' },
]

function MobileControlBar({
  period,
  onPeriodChange,
  periodLabel,
  onNavigatePeriod,
  canGoNext,
  canGoPrev,
  activeFiltersCount,
}: MobileControlBarProps) {
  const { openChartsModal, openMobileFilters } = useUIStore()

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
      {/* Background with blur */}
      <div className="bg-(--bg-card)/95 backdrop-blur-md border-t border-(--border) shadow-lg">
        <div className="flex items-center gap-2 px-3 py-2.5 max-w-[1600px] mx-auto">
          {/* Period Selector - Compact */}
          <div className="flex gap-0.5 bg-(--bg-secondary) p-[2px] rounded-md border border-(--border)">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => onPeriodChange(p.value)}
                className={`
                  px-2 py-1 rounded text-[10px] font-medium transition-all duration-150
                  ${
                    period === p.value
                      ? 'bg-(--accent) text-(--bg-primary)'
                      : 'bg-transparent text-(--text-muted) hover:text-(--text-secondary)'
                  }
                `}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Period Navigator - Compact */}
          <div className="flex items-center gap-0.5 bg-(--bg-secondary) px-1 py-[2px] rounded-md border border-(--border) flex-1 min-w-0">
            <button
              onClick={() => onNavigatePeriod('prev')}
              disabled={!canGoPrev}
              className={`
                w-6 h-6 flex items-center justify-center rounded text-xs transition-all
                ${canGoPrev
                  ? 'text-(--text-muted) hover:bg-(--bg-hover) hover:text-(--text-primary)'
                  : 'text-(--text-muted) opacity-30'}
              `}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span className="text-[10px] font-medium text-(--text-primary) flex-1 text-center truncate px-1">
              {periodLabel}
            </span>
            <button
              onClick={() => onNavigatePeriod('next')}
              disabled={!canGoNext}
              className={`
                w-6 h-6 flex items-center justify-center rounded text-xs transition-all
                ${canGoNext
                  ? 'text-(--text-muted) hover:bg-(--bg-hover) hover:text-(--text-primary)'
                  : 'text-(--text-muted) opacity-30'}
              `}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          {/* Filters Button */}
          <button
            onClick={openMobileFilters}
            className="relative flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-(--bg-secondary) border border-(--border) rounded-md text-(--text-secondary) hover:text-(--text-primary) hover:border-(--text-muted) transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span className="text-[10px] font-medium">Filtres</span>
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center bg-(--accent) text-(--bg-primary) text-[9px] font-bold rounded-full px-1">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {/* Charts Button */}
          <button
            onClick={openChartsModal}
            className="flex items-center justify-center p-2 bg-(--bg-secondary) border border-(--border) rounded-md text-(--text-secondary) hover:text-(--text-primary) hover:border-(--text-muted) transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(MobileControlBar)
