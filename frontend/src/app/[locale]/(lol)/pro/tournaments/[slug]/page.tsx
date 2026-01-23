'use client'

import { use } from 'react'
import { useTournament, useMatches, useChampionStats } from '@/hooks/useProData'
import { MatchCard } from '@/components/pro/MatchCard'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface TournamentPageProps {
  params: Promise<{ slug: string }>
}

export default function TournamentPage({ params }: TournamentPageProps) {
  const { slug } = use(params)
  const { data: tournament, isLoading, error } = useTournament(slug)
  const { data: matchesData } = useMatches({
    tournamentId: tournament?.tournament.tournamentId,
    perPage: 20,
  })
  const { data: championData } = useChampionStats(tournament?.tournament.tournamentId ?? null)

  if (isLoading) {
    return (
      <main className="p-3 sm:p-5 max-w-[1400px] mx-auto">
        <div className="animate-pulse">
          <div className="h-8 bg-[var(--bg-card)] rounded w-64 mb-4" />
          <div className="h-4 bg-[var(--bg-card)] rounded w-48 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-96 bg-[var(--bg-card)] rounded-xl" />
            <div className="h-96 bg-[var(--bg-card)] rounded-xl" />
          </div>
        </div>
      </main>
    )
  }

  if (error || !tournament) {
    return (
      <main className="p-3 sm:p-5 max-w-[1400px] mx-auto">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 text-center">
          <p className="text-[var(--negative)]">{error?.message || 'Tournament not found'}</p>
          <Link href="/pro/tournaments" className="text-[var(--accent)] mt-4 inline-block">
            Back to tournaments
          </Link>
        </div>
      </main>
    )
  }

  const { tournament: t, standings } = tournament

  return (
    <main className="p-3 sm:p-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/pro/tournaments" className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] mb-2 inline-block">
          &larr; Back to tournaments
        </Link>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          {t.name}
        </h1>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-sm text-[var(--text-muted)]">
            {t.region || 'International'}
          </span>
          <span className={cn(
            'px-2 py-0.5 rounded text-xs font-medium capitalize',
            t.status === 'ongoing' && 'bg-green-500/10 text-green-500',
            t.status === 'upcoming' && 'bg-blue-500/10 text-blue-500',
            t.status === 'completed' && 'bg-[var(--text-muted)]/10 text-[var(--text-muted)]'
          )}>
            {t.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Standings */}
        <div className="lg:col-span-2">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              Standings
            </h2>

            {standings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                      <th className="pb-2 pr-4">#</th>
                      <th className="pb-2 pr-4">Team</th>
                      <th className="pb-2 pr-4 text-center">W-L</th>
                      <th className="pb-2 pr-4 text-center">Win%</th>
                      <th className="pb-2 text-center">Games</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((team, index) => (
                      <tr key={team.teamId} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-3 pr-4 text-sm text-[var(--text-muted)]">
                          {index + 1}
                        </td>
                        <td className="py-3 pr-4">
                          <Link
                            href={`/pro/teams/${team.teamSlug}/stats`}
                            className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                          >
                            {team.shortName}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 text-center text-sm">
                          <span className="text-[var(--positive)]">{team.matchesWon}</span>
                          <span className="text-[var(--text-muted)]">-</span>
                          <span className="text-[var(--negative)]">{team.matchesPlayed - team.matchesWon}</span>
                        </td>
                        <td className="py-3 pr-4 text-center text-sm">
                          <span className={cn(
                            team.matchWinRate >= 50 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                          )}>
                            {team.matchWinRate.toFixed(0)}%
                          </span>
                        </td>
                        <td className="py-3 text-center text-sm text-[var(--text-muted)]">
                          {team.gamesWon}-{team.gamesPlayed - team.gamesWon}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[var(--text-muted)] text-center py-8">
                No standings available yet
              </p>
            )}
          </div>

          {/* Recent Matches */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mt-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              Recent Matches
            </h2>

            {matchesData?.data && matchesData.data.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {matchesData.data.slice(0, 6).map((match) => (
                  <MatchCard key={match.matchId} match={match} />
                ))}
              </div>
            ) : (
              <p className="text-[var(--text-muted)] text-center py-8">
                No matches available yet
              </p>
            )}
          </div>
        </div>

        {/* Champion Stats Sidebar */}
        <div>
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              Top Champions
            </h2>

            {championData?.data && championData.data.length > 0 ? (
              <div className="space-y-3">
                {championData.data.slice(0, 10).map((champion) => (
                  <div
                    key={champion.championId}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[var(--text-primary)]">
                        Champion {champion.championId}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[var(--text-muted)]">
                        {champion.presenceRate.toFixed(0)}%
                      </span>
                      <span className={cn(
                        'font-mono',
                        champion.winRate >= 50 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
                      )}>
                        {champion.winRate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[var(--text-muted)] text-center py-8 text-sm">
                No champion data available yet
              </p>
            )}

            <Link
              href={`/pro/drafts?tournamentId=${t.tournamentId}`}
              className="mt-4 block text-center text-sm text-[var(--accent)] hover:underline"
            >
              View full draft analysis
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
