'use client'

import { memo } from 'react'
import type { DashboardPeriod } from '@/lib/types'
import DateRangePicker from './DateRangePicker'

interface PeriodSelectorProps {
  value: DashboardPeriod
  onChange: (period: DashboardPeriod) => void
  customStartDate: Date | null
  customEndDate: Date | null
  onCustomDateChange: (startDate: Date, endDate: Date) => void
}

const periods: { value: DashboardPeriod; label: string }[] = [
  { value: 'day', label: '7 jours' },
  { value: 'month', label: 'Mois' },
  { value: 'year', label: 'Année' },
]

function PeriodSelector({ value, onChange, customStartDate, customEndDate, onCustomDateChange }: PeriodSelectorProps) {
  return (
    <div className="flex gap-0.5 bg-[var(--bg-card)] p-[3px] rounded-md border border-[var(--border)]">
      {periods.map((period) => (
        <button
          key={period.value}
          onClick={() => onChange(period.value)}
          className={`
            px-3 py-[5px] border-none rounded text-[11px] font-medium cursor-pointer transition-all duration-150
            ${
              value === period.value
                ? 'bg-[var(--accent)] text-white'
                : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }
          `}
        >
          {period.label}
        </button>
      ))}
      <DateRangePicker
        startDate={customStartDate}
        endDate={customEndDate}
        onApply={onCustomDateChange}
        isActive={value === 'custom'}
        onToggle={() => {
          // When toggling to custom mode, set default dates if none exist
          const end = new Date()
          const start = new Date()
          start.setDate(start.getDate() - 6)
          onCustomDateChange(start, end)
        }}
      />
    </div>
  )
}

export default memo(PeriodSelector)
