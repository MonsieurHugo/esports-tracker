import { memo } from 'react'
import Link from 'next/link'
import type { TopGrinderEntry } from '@/lib/types'
import { getRankTextClass } from '@/lib/utils'
import TeamLogo from '@/components/ui/TeamLogo'
import SortIcon from '@/components/ui/SortIcon'

interface TopGrindersProps {
  entries: TopGrinderEntry[]
  isLoading?: boolean
  sortDirection: 'asc' | 'desc'
  onSortChange: (direction: 'asc' | 'desc') => void
}

function TopGrinders({ entries, isLoading, sortDirection, onSortChange }: TopGrindersProps) {
  const toggleSort = () => {
    onSortChange(sortDirection === 'desc' ? 'asc' : 'desc')
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[var(--border)] flex items-center justify-between">
        <span className="text-xs font-semibold">Top Grinders</span>
        <button
          onClick={toggleSort}
          className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          Games
          <SortIcon direction={sortDirection} />
        </button>
      </div>

      {isLoading ? (
        <div className="p-4 text-center text-[var(--text-muted)] text-sm">Chargement...</div>
      ) : (
        <>
          {entries.map((entry) => (
            <div
              key={entry.rank}
              className="flex items-center px-2 sm:px-3 py-1.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-hover)]"
            >
              <span className={`font-mono font-semibold text-[10px] sm:text-[11px] w-6 sm:w-7 ${getRankTextClass(entry.rank)}`}>
                {entry.rank}
              </span>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                <TeamLogo slug={entry.team.slug} shortName={entry.team.shortName} size={20} />
                <Link
                  href={`/lol/player/${entry.player.slug}`}
                  className="font-medium text-[11px] sm:text-xs truncate hover:text-[var(--accent)] hover:underline transition-colors"
                >
                  {entry.player.pseudo}
                </Link>
              </div>
              <span className="font-mono font-semibold text-[10px] sm:text-[11px] w-10 text-right">
                {entry.games}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default memo(TopGrinders)
