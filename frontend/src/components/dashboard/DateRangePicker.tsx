'use client'

import { useState, useRef, useEffect, memo } from 'react'
import { formatToDateString } from '@/lib/dateUtils'

interface DateRangePickerProps {
  startDate: Date | null
  endDate: Date | null
  onApply: (startDate: Date, endDate: Date) => void
  isActive: boolean
  onToggle: () => void
}

function DateRangePicker({ startDate, endDate, onApply, isActive, onToggle }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [tempStartDate, setTempStartDate] = useState<string>('')
  const [tempEndDate, setTempEndDate] = useState<string>('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Initialize temp dates when opening or when props change
  useEffect(() => {
    if (isOpen) {
      setTempStartDate(startDate ? formatToDateString(startDate) : formatToDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)))
      setTempEndDate(endDate ? formatToDateString(endDate) : formatToDateString(new Date()))
    }
  }, [isOpen, startDate, endDate])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleApply = () => {
    if (tempStartDate && tempEndDate) {
      const start = new Date(tempStartDate)
      const end = new Date(tempEndDate)

      // Ensure start is before end
      if (start <= end) {
        onApply(start, end)
        setIsOpen(false)
      }
    }
  }

  const handleButtonClick = () => {
    if (isActive) {
      setIsOpen(!isOpen)
    } else {
      onToggle()
      setIsOpen(true)
    }
  }

  // Get today's date for max attribute
  const today = formatToDateString(new Date())

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleButtonClick}
        className={`
          px-3 py-[5px] border-none rounded text-[11px] font-medium cursor-pointer transition-all duration-150
          ${
            isActive
              ? 'bg-[var(--accent)] text-white'
              : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }
        `}
      >
        Personnalisé
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg p-4 min-w-[280px]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                Date de début
              </label>
              <input
                type="date"
                value={tempStartDate}
                onChange={(e) => setTempStartDate(e.target.value)}
                max={tempEndDate || today}
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                Date de fin
              </label>
              <input
                type="date"
                value={tempEndDate}
                onChange={(e) => setTempEndDate(e.target.value)}
                min={tempStartDate}
                max={today}
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 px-3 py-2 text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-md hover:bg-[var(--bg-hover)] transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleApply}
                disabled={!tempStartDate || !tempEndDate || new Date(tempStartDate) > new Date(tempEndDate)}
                className="flex-1 px-3 py-2 text-xs font-medium text-white bg-[var(--accent)] rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Appliquer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(DateRangePicker)
