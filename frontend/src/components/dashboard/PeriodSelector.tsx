'use client'

import { memo } from 'react'
import type { DashboardPeriod } from '@/lib/types'

interface PeriodSelectorProps {
  value: DashboardPeriod
  onChange: (period: DashboardPeriod) => void
  customStartDate?: Date | null
  customEndDate?: Date | null
  onCustomDateChange?: (startDate: Date, endDate: Date) => void
}

const periods: { value: DashboardPeriod; label: string }[] = [
  { value: 'day', label: '7 jours' },
  { value: 'month', label: 'Mois' },
  { value: 'year', label: 'Année' },
]

function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex gap-0.5 bg-(--bg-card) p-[3px] rounded-md border border-(--border) w-full">
      {periods.map((period) => (
        <button
          key={period.value}
          onClick={() => onChange(period.value)}
          className={`
            flex-1 px-3 py-[5px] border-none rounded text-[11px] font-medium cursor-pointer transition-all duration-150
            ${
              value === period.value
                ? 'bg-(--accent) text-(--bg-primary)'
                : 'bg-transparent text-(--text-muted) hover:text-(--text-secondary)'
            }
          `}
        >
          {period.label}
        </button>
      ))}
    </div>
  )
}

export default memo(PeriodSelector)
