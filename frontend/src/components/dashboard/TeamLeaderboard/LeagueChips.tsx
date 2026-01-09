'use client'

import { ALL_LEAGUES } from '@/lib/constants'

interface LeagueChipsProps {
  leagues: string[]
  selected: string[]
  onToggle: (league: string) => void
  onSelectAll: () => void
}

export default function LeagueChips({
  selected,
  onToggle,
  onSelectAll,
}: LeagueChipsProps) {
  const isAllSelected = selected.length === 0 || selected.length === ALL_LEAGUES.length

  return (
    <div className="flex gap-1 flex-wrap">
      <button
        onClick={onSelectAll}
        className={`
          px-2 py-[3px] rounded text-[10px] font-medium cursor-pointer transition-all duration-150 border
          ${
            isAllSelected
              ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
              : 'bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }
        `}
      >
        Toutes
      </button>
      {ALL_LEAGUES.map((league) => (
        <button
          key={league}
          onClick={() => onToggle(league)}
          className={`
            px-2 py-[3px] rounded text-[10px] font-medium cursor-pointer transition-all duration-150 border
            ${
              selected.includes(league) && !isAllSelected
                ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                : 'bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }
          `}
        >
          {league}
        </button>
      ))}
    </div>
  )
}
