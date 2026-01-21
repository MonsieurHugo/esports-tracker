import { memo } from 'react'
import type { StreakEntry } from '@/lib/types'
import { getRankTextClass } from '@/lib/utils'
import TeamLogo from '@/components/ui/TeamLogo'
import SortIcon from '@/components/ui/SortIcon'

interface StreakListProps {
  entries: StreakEntry[]
  type: 'wins' | 'losses'
  isLoading?: boolean
  sortDirection: 'asc' | 'desc'
  onSortChange: (direction: 'asc' | 'desc') => void
}

function StreakList({ entries, type, isLoading, sortDirection, onSortChange }: StreakListProps) {
  const isWins = type === 'wins'
  const title = isWins ? 'Win Streaks' : 'Loss Streaks'
  const sortLabel = isWins ? 'Wins' : 'Losses'
  const colorClass = isWins ? 'text-(--positive)' : 'text-(--negative)'
  const prefix = isWins ? '+' : '-'

  const toggleSort = () => {
    onSortChange(sortDirection === 'desc' ? 'asc' : 'desc')
  }

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-(--border) flex items-center justify-between">
        <span className="text-xs font-semibold">{title}</span>
        <button
          onClick={toggleSort}
          className="flex items-center gap-1 text-[10px] text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          {sortLabel}
          <SortIcon direction={sortDirection} />
        </button>
      </div>

      {isLoading ? (
        <div className="p-4 text-center text-(--text-muted) text-sm">Chargement...</div>
      ) : (
        <>
          {entries.map((entry) => (
            <div
              key={entry.rank}
              className="flex items-center px-2 sm:px-3 py-1.5 border-b border-(--border) last:border-b-0 hover:bg-(--bg-hover)"
            >
              <span className={`font-mono font-semibold text-[10px] sm:text-[11px] w-6 sm:w-7 ${getRankTextClass(entry.rank)}`}>
                {entry.rank}
              </span>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                <TeamLogo slug={entry.team.slug} shortName={entry.team.shortName} />
                <span className="font-medium text-[11px] sm:text-xs truncate">
                  {entry.player.pseudo}
                </span>
              </div>
              <span className={`font-mono font-semibold text-[10px] sm:text-[11px] w-10 text-right ${colorClass}`}>
                {prefix}{entry.streak}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default memo(StreakList)
