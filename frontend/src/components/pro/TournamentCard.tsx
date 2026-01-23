'use client'

import type { ProTournament } from '@/lib/proTypes'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface TournamentCardProps {
  tournament: ProTournament
  className?: string
}

export function TournamentCard({ tournament, className }: TournamentCardProps) {
  const statusColors = {
    upcoming: 'bg-blue-500/10 text-blue-500',
    ongoing: 'bg-green-500/10 text-green-500',
    completed: 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]',
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '--'
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <Link href={`/pro/tournaments/${tournament.slug}`}>
      <div
        className={cn(
          'bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[var(--text-primary)] truncate">
              {tournament.name}
            </h3>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              {tournament.region || 'International'}
            </p>
          </div>
          <span
            className={cn(
              'px-2 py-0.5 rounded text-xs font-medium capitalize',
              statusColors[tournament.status]
            )}
          >
            {tournament.status}
          </span>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-[var(--text-muted)]">Season:</span>
            <span className="ml-1 text-[var(--text-primary)]">
              {tournament.season || '--'} {tournament.split || ''}
            </span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Tier:</span>
            <span className="ml-1 text-[var(--text-primary)]">
              {tournament.tier === 1 ? 'Major' : tournament.tier === 2 ? 'Minor' : 'Qualifier'}
            </span>
          </div>
        </div>

        {/* Dates */}
        <div className="mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--text-muted)]">
          {formatDate(tournament.startDate)}
          {tournament.endDate && ` - ${formatDate(tournament.endDate)}`}
        </div>
      </div>
    </Link>
  )
}
