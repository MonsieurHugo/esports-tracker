'use client'

import { Skeleton } from '@/components/ui/Skeleton'
import type { ProMatchesOverview, ProMatchOverviewItem } from '@/lib/types'

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function formatTimeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `il y a ${hours}h`
  if (minutes > 0) return `il y a ${minutes}m`
  return 'a l\'instant'
}

function formatTimeUntil(dateStr: string): string {
  const diffMs = new Date(dateStr).getTime() - Date.now()
  if (diffMs <= 0) return 'maintenant'
  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `dans ${days}j ${hours % 24}h`
  if (hours > 0) return `dans ${hours}h${minutes % 60 > 0 ? ` ${minutes % 60}m` : ''}`
  return `dans ${minutes}m`
}

function formatDuration(startedAt: string): string {
  const diffMs = Date.now() - new Date(startedAt).getTime()
  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}

function MatchRow({ match, variant }: { match: ProMatchOverviewItem; variant: 'live' | 'recent' | 'upcoming' }) {
  const leagueTag = match.leagueShortName || match.tournamentName?.split(' ')[0] || ''
  const dateStr = match.startedAt || match.scheduledAt

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-[var(--bg-hover)] rounded transition-colors text-xs">
      {/* Date */}
      {dateStr && (
        <span className="text-[9px] font-mono text-(--text-muted) shrink-0 w-10">
          {formatDate(dateStr)}
        </span>
      )}

      {/* League tag */}
      {leagueTag && (
        <span className="text-[9px] font-mono text-(--text-muted) w-8 shrink-0 truncate" title={match.tournamentName || ''}>
          {leagueTag}
        </span>
      )}

      {/* Teams & Score */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className="text-(--text-primary) truncate font-medium" title={match.team1Name}>
          {match.team1Tag}
        </span>
        <span className="font-mono text-(--text-secondary) shrink-0">
          {match.team1Score}-{match.team2Score}
        </span>
        <span className="text-(--text-primary) truncate font-medium" title={match.team2Name}>
          {match.team2Tag}
        </span>
      </div>

      {/* Format */}
      <span className="text-[9px] font-mono text-(--text-muted) shrink-0 uppercase">
        {match.format}
      </span>

      {/* Time info */}
      <span className="text-[9px] text-(--text-muted) shrink-0 w-16 text-right">
        {variant === 'live' && match.startedAt && formatDuration(match.startedAt)}
        {variant === 'recent' && (match.endedAt ? formatTimeAgo(match.endedAt) : match.startedAt ? formatTimeAgo(match.startedAt) : '')}
        {variant === 'upcoming' && match.scheduledAt && formatTimeUntil(match.scheduledAt)}
      </span>
    </div>
  )
}

function SectionHeader({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className="px-3 py-2 border-b border-[var(--border)] flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className={`text-[11px] font-semibold ${color.includes('red') ? 'text-red-400' : color.includes('green') ? 'text-green-400' : 'text-blue-400'}`}>
        {label}
      </span>
      <span className="text-[9px] font-mono text-(--text-muted)">{count}</span>
    </div>
  )
}

interface ProMatchOverviewProps {
  data: ProMatchesOverview | null
  isLoading: boolean
}

export default function ProMatchOverview({ data, isLoading }: ProMatchOverviewProps) {
  if (isLoading) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3 mt-4">
        <Skeleton className="h-4 w-40 mb-3" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden mt-4">
      {/* Live */}
      <div>
        <SectionHeader color="bg-red-500 animate-pulse" label="En cours" count={data.live.length} />
        <div className="px-1 py-1">
          {data.live.length > 0 ? (
            data.live.map((m) => <MatchRow key={m.id} match={m} variant="live" />)
          ) : (
            <div className="py-2 text-center text-[10px] text-(--text-muted)">Aucun match live</div>
          )}
        </div>
      </div>

      {/* Recent */}
      <div>
        <SectionHeader color="bg-green-500" label="Recemment traites" count={data.recent.length} />
        <div className="px-1 py-1">
          {data.recent.length > 0 ? (
            data.recent.map((m) => <MatchRow key={m.id} match={m} variant="recent" />)
          ) : (
            <div className="py-2 text-center text-[10px] text-(--text-muted)">Aucun match recent</div>
          )}
        </div>
      </div>

      {/* Upcoming */}
      <div>
        <SectionHeader color="bg-blue-500" label="A venir" count={data.upcoming.length} />
        <div className="px-1 py-1">
          {data.upcoming.length > 0 ? (
            data.upcoming.map((m) => <MatchRow key={m.id} match={m} variant="upcoming" />)
          ) : (
            <div className="py-2 text-center text-[10px] text-(--text-muted)">Aucun match programme</div>
          )}
        </div>
      </div>
    </div>
  )
}
