import { memo } from 'react'
import Link from 'next/link'
import type { LpChangeEntry } from '@/lib/types'
import { getRankTextClass } from '@/lib/utils'
import TeamLogo from '@/components/ui/TeamLogo'
import SortIcon from '@/components/ui/SortIcon'

interface TopLpLosersProps {
  entries: LpChangeEntry[]
  isLoading?: boolean
  sortDirection: 'asc' | 'desc'
  onSortChange: (direction: 'asc' | 'desc') => void
  viewMode: 'teams' | 'players'
}

function TopLpLosers({ entries, isLoading, sortDirection, onSortChange, viewMode }: TopLpLosersProps) {
  const toggleSort = () => {
    onSortChange(sortDirection === 'desc' ? 'asc' : 'desc')
  }

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-(--border) flex items-center justify-between">
        <span className="text-xs font-semibold text-(--text-secondary)">Top LP-</span>
        <button
          onClick={toggleSort}
          className="flex items-center gap-1 text-[10px] text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          LP
          <SortIcon direction={sortDirection} />
        </button>
      </div>

      {isLoading ? (
        <div className="p-4 text-center text-(--text-muted) text-sm">Chargement...</div>
      ) : entries.length === 0 ? (
        <div className="p-4 text-center text-(--text-muted) text-sm">Aucune donnée</div>
      ) : (
        <>
          {entries.map((entry) => (
            <div
              key={`${entry.entityType}-${entry.entity.id}`}
              className="flex items-center px-2 sm:px-3 py-1.5 border-b border-(--border) last:border-b-0 hover:bg-(--bg-hover)"
            >
              <span className={`font-mono font-semibold text-[10px] sm:text-[11px] w-6 sm:w-7 ${getRankTextClass(entry.rank)}`}>
                {entry.rank}
              </span>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                {viewMode === 'teams' ? (
                  <>
                    <TeamLogo slug={entry.entity.slug} shortName={entry.entity.shortName || entry.entity.name} size={20} />
                    <Link
                      href={`/lol/team/${entry.entity.slug}`}
                      className="font-medium text-[11px] sm:text-xs truncate hover:text-(--accent) hover:underline transition-colors"
                    >
                      {entry.entity.shortName || entry.entity.name}
                    </Link>
                  </>
                ) : (
                  <>
                    {entry.team && (
                      <TeamLogo slug={entry.team.slug} shortName={entry.team.shortName} size={20} />
                    )}
                    <Link
                      href={`/lol/player/${entry.entity.slug}`}
                      className="font-medium text-[11px] sm:text-xs truncate hover:text-(--accent) hover:underline transition-colors"
                    >
                      {entry.entity.name}
                    </Link>
                  </>
                )}
              </div>
              <span className="font-mono font-semibold text-[10px] sm:text-[11px] w-14 text-right text-(--negative)">
                {entry.lpChange.toLocaleString('fr-FR')}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default memo(TopLpLosers)
