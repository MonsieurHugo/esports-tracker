import { type ReactNode } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { GrinderEntry, LpChangeEntry } from '@/lib/types'
import { getRankTextClass } from '@/lib/utils'
import TeamLogo from '@/components/ui/TeamLogo'

interface TopEntryListProps {
  titleKey: string
  headerValueKey: string
  entries: (GrinderEntry | LpChangeEntry)[]
  renderValue: (entry: GrinderEntry | LpChangeEntry) => ReactNode
  valueColumnWidth: string
  isLoading?: boolean
}

function TopEntryList({ titleKey, headerValueKey, entries, renderValue, valueColumnWidth, isLoading }: TopEntryListProps) {
  const t = useTranslations()
  const validEntries = entries.filter((e) => e.entity)
  const placeholderCount = Math.max(0, 5 - validEntries.length)

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-(--border) flex items-center justify-between">
        <span className="text-xs font-semibold text-(--text-secondary)">{t(titleKey)}</span>
        <span className="text-[10px] text-(--text-muted)">{t(headerValueKey)}</span>
      </div>

      {isLoading ? (
        <div className="p-4 text-center text-(--text-muted) text-sm">{t('common.loading')}</div>
      ) : (
        <div>
          {validEntries.map((entry) => (
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
              <span className={`font-mono font-semibold text-[10px] sm:text-[11px] ${valueColumnWidth} text-right`}>
                {renderValue(entry)}
              </span>
            </div>
          ))}
          {Array.from({ length: placeholderCount }).map((_, i) => {
            const placeholderRank = validEntries.length + i + 1
            return (
              <div
                key={`placeholder-${i}`}
                className="flex items-center px-2 sm:px-3 py-1.5 border-b border-(--border) last:border-b-0"
              >
                <span className="font-mono font-semibold text-[10px] sm:text-[11px] w-6 sm:w-7 text-(--text-muted)">
                  {placeholderRank}
                </span>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
                  <div className="w-5 h-5 rounded bg-(--bg-hover)" />
                  <span className="font-medium text-[11px] sm:text-xs text-(--text-muted)">
                    ---
                  </span>
                </div>
                <span className={`font-mono font-semibold text-[10px] sm:text-[11px] ${valueColumnWidth} text-right text-(--text-muted)`}>
                  -
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default TopEntryList
