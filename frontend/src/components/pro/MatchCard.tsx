'use client'

import type { ProMatch } from '@/lib/proTypes'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface MatchCardProps {
  match: ProMatch
  className?: string
}

export function MatchCard({ match, className }: MatchCardProps) {
  const isLive = match.status === 'live'
  const isCompleted = match.status === 'completed'

  // Format scheduled time
  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '--:--'
    const date = new Date(dateStr)
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
    })
  }

  return (
    <Link href={`/pro/matches/${match.matchId}`}>
      <div
        className={cn(
          'bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer',
          isLive && 'border-red-500/50',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-[var(--text-muted)] truncate max-w-[60%]">
            {match.tournamentName}
          </span>
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="flex items-center gap-1 text-xs text-red-500">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                LIVE
              </span>
            )}
            {!isLive && !isCompleted && (
              <span className="text-xs text-[var(--text-muted)]">
                {formatDate(match.scheduledAt)} {formatTime(match.scheduledAt)}
              </span>
            )}
            <span className="text-xs text-[var(--text-muted)] uppercase">
              {match.format}
            </span>
          </div>
        </div>

        {/* Teams */}
        <div className="space-y-2">
          {/* Team 1 */}
          <div
            className={cn(
              'flex items-center justify-between',
              isCompleted && match.winnerTeamId === match.team1.teamId && 'text-[var(--positive)]',
              isCompleted && match.winnerTeamId !== match.team1.teamId && 'text-[var(--text-muted)]'
            )}
          >
            <span className="font-medium truncate">
              {match.team1.shortName || match.team1.name || 'TBD'}
            </span>
            <span className="font-mono font-bold text-lg">
              {match.team1Score}
            </span>
          </div>

          {/* Team 2 */}
          <div
            className={cn(
              'flex items-center justify-between',
              isCompleted && match.winnerTeamId === match.team2.teamId && 'text-[var(--positive)]',
              isCompleted && match.winnerTeamId !== match.team2.teamId && 'text-[var(--text-muted)]'
            )}
          >
            <span className="font-medium truncate">
              {match.team2.shortName || match.team2.name || 'TBD'}
            </span>
            <span className="font-mono font-bold text-lg">
              {match.team2Score}
            </span>
          </div>
        </div>

        {/* Stream link for live matches */}
        {isLive && match.streamUrl && (
          <div className="mt-3 pt-3 border-t border-[var(--border)]">
            <span className="text-xs text-[var(--accent)]">
              Watch live
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}
