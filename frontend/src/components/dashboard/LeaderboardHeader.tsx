'use client'

import { memo } from 'react'
import type { LeaderboardView } from '@/stores/dashboardStore'

interface LeaderboardHeaderProps {
  view: LeaderboardView
  onViewChange: (view: LeaderboardView) => void
  leagueFilter?: React.ReactNode
}

function LeaderboardHeader({ view, onViewChange, leagueFilter }: LeaderboardHeaderProps) {
  return (
    <div className="flex justify-between items-center px-3.5 py-2.5 border-b border-[var(--border)]">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">Leaderboard</span>
        <div className="flex items-center">
          <button
            onClick={() => onViewChange('teams')}
            className={`
              px-2 py-0.5 text-xs font-semibold rounded-l-md border transition-colors
              ${view === 'teams'
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-transparent text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)]'
              }
            `}
          >
            Équipes
          </button>
          <button
            onClick={() => onViewChange('players')}
            className={`
              px-2 py-0.5 text-xs font-semibold rounded-r-md border-t border-r border-b -ml-px transition-colors
              ${view === 'players'
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-transparent text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)]'
              }
            `}
          >
            Joueurs
          </button>
        </div>
      </div>
      {leagueFilter}
    </div>
  )
}

export default memo(LeaderboardHeader)
