'use client'

import { memo } from 'react'
import type { LeaderboardView } from '@/stores/dashboardStore'

interface LeaderboardHeaderProps {
  view: LeaderboardView
  onViewChange: (view: LeaderboardView) => void
  leagueFilter?: React.ReactNode
  roleFilter?: React.ReactNode
  gamesFilter?: React.ReactNode
}

function LeaderboardHeader({ view, onViewChange, leagueFilter, roleFilter, gamesFilter }: LeaderboardHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-(--border)">
      {/* Left: Title + View Toggle */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-(--text-secondary)">Leaderboard</span>
        <div className="relative flex bg-(--bg-card) p-[3px] rounded-md border border-(--border)">
          {/* Sliding indicator */}
          <div
            className={`absolute top-[3px] bottom-[3px] left-[3px] w-[calc(50%-3px)] bg-(--accent) rounded transition-transform duration-200 ease-out ${
              view === 'players' ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          <button
            onClick={() => onViewChange('teams')}
            className={`
              relative z-10 px-3 py-[5px] border-none rounded text-[11px] font-medium transition-colors duration-150
              ${view === 'teams'
                ? 'text-(--text-on-accent)'
                : 'bg-transparent text-(--text-muted) hover:text-(--text-secondary)'
              }
            `}
          >
            Équipes
          </button>
          <button
            onClick={() => onViewChange('players')}
            className={`
              relative z-10 px-3 py-[5px] border-none rounded text-[11px] font-medium transition-colors duration-150
              ${view === 'players'
                ? 'text-(--text-on-accent)'
                : 'bg-transparent text-(--text-muted) hover:text-(--text-secondary)'
              }
            `}
          >
            Joueurs
          </button>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Role Filter - hidden on mobile, always rendered on desktop to maintain consistent height */}
      <div className={`hidden sm:block transition-opacity duration-150 ${view === 'players' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {roleFilter}
      </div>

      {/* Right: Games + League Filters - hidden on mobile (available in MobileFiltersSheet) */}
      <div className="hidden sm:flex items-center gap-2">
        {gamesFilter}
        {leagueFilter}
      </div>
    </div>
  )
}

export default memo(LeaderboardHeader)
