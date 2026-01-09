'use client'

import { useState, useRef, useEffect } from 'react'
import { LEAGUE_COLORS } from '@/lib/utils'
import { ALL_LEAGUES } from '@/lib/constants'

interface LeagueDropdownProps {
  selected: string[]
  onToggle: (league: string) => void
  onSelectAll: () => void
}

export default function LeagueDropdown({
  selected,
  onToggle,
  onSelectAll,
}: LeagueDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isAllSelected = selected.length === 0 || selected.length === ALL_LEAGUES.length

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getButtonLabel = () => {
    if (isAllSelected) return 'Toutes les ligues'
    if (selected.length === 1) return selected[0]
    return `${selected.length} ligues`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-full flex items-center justify-between gap-2 px-3 py-[8px] bg-[var(--bg-card)] border border-[var(--border)] rounded-md text-[11px] font-medium hover:border-[var(--text-muted)] transition-colors min-w-[160px]"
      >
        <span>{getButtonLabel()}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg z-50 min-w-[160px] py-1">
          <button
            onClick={() => {
              onSelectAll()
            }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-[var(--bg-hover)] transition-colors ${
              isAllSelected ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
              isAllSelected
                ? 'bg-[var(--accent)] border-[var(--accent)]'
                : 'border-[var(--border)]'
            }`}>
              {isAllSelected && (
                <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </span>
            Toutes
          </button>

          <div className="h-px bg-[var(--border)] my-1" />

          {ALL_LEAGUES.map((league) => {
            const isSelected = selected.includes(league) && !isAllSelected
            const colors = LEAGUE_COLORS[league]
            return (
              <button
                key={league}
                onClick={() => onToggle(league)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-[var(--bg-hover)] transition-colors ${
                  isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                  isSelected
                    ? 'bg-[var(--accent)] border-[var(--accent)]'
                    : 'border-[var(--border)]'
                }`}>
                  {isSelected && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                <span className={`w-2 h-2 rounded-full ${colors?.dot}`} />
                {league}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
