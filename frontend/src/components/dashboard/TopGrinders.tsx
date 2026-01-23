import { memo } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { GrinderEntry } from '@/lib/types'
import { getRankTextClass } from '@/lib/utils'
import TeamLogo from '@/components/ui/TeamLogo'

interface TopGrindersProps {
  entries: GrinderEntry[]
  isLoading?: boolean
}

function TopGrinders({ entries, isLoading }: TopGrindersProps) {
  const t = useTranslations()

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-(--border) flex items-center justify-between">
        <span className="text-xs font-semibold text-(--text-secondary)">{t('leaderboard.topGrinders')}</span>
        <span className="text-[10px] text-(--text-muted)">{t('dashboard.games')}</span>
      </div>

      {isLoading ? (
        <div className="p-4 text-center text-(--text-muted) text-sm">{t('common.loading')}</div>
      ) : (
        <>
          {/* Display entries or placeholder rows */}
          {Array.from({ length: 5 }).map((_, index) => {
            const entry = entries.filter((e) => e.entity)[index]
            if (entry) {
              return (
                <div
                  key={`${entry.entityType}-${entry.entity.id}`}
                  className="flex items-center px-2 sm:px-3 py-1.5 border-b border-(--border) last:border-b-0 hover:bg-(--bg-hover)"
                >
                  <span className={`font-mono font-semibold text-[10px] sm:text-[11px] w-6 sm:w-7 ${getRankTextClass(entry.rank)}`}>
                    {entry.rank}
                  </span>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                    {entry.entityType === 'team' ? (
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
                        <span className="font-medium text-[11px] sm:text-xs truncate">
                          {entry.entity.name}
                        </span>
                      </>
                    )}
                  </div>
                  <span className="font-mono font-semibold text-[10px] sm:text-[11px] w-10 text-right">
                    {entry.games}
                  </span>
                </div>
              )
            }
            // Placeholder row
            return (
              <div
                key={`placeholder-${index}`}
                className="flex items-center px-2 sm:px-3 py-1.5 border-b border-(--border) last:border-b-0"
              >
                <span className="font-mono font-semibold text-[10px] sm:text-[11px] w-6 sm:w-7 text-(--text-muted)">
                  {index + 1}
                </span>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                  <div className="w-5 h-5 rounded bg-(--bg-hover)" />
                  <span className="font-medium text-[11px] sm:text-xs text-(--text-muted)">
                    ---
                  </span>
                </div>
                <span className="font-mono font-semibold text-[10px] sm:text-[11px] w-10 text-right text-(--text-muted)">
                  -
                </span>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

export default memo(TopGrinders)
