'use client'

import { useLiveMatches, useUpcomingMatches, useTournaments } from '@/hooks/useProData'
import { MatchCard } from '@/components/pro/MatchCard'
import { TournamentCard } from '@/components/pro/TournamentCard'
import Link from 'next/link'

export default function ProDashboard() {
  const { data: liveData, isLoading: liveLoading } = useLiveMatches()
  const { data: upcomingData, isLoading: upcomingLoading } = useUpcomingMatches(6)
  const { data: tournamentsData, isLoading: tournamentsLoading } = useTournaments({
    status: 'ongoing',
    perPage: 6,
  })

  return (
    <main className="p-3 sm:p-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Pro Stats
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Professional League of Legends match data and statistics
        </p>
      </div>

      {/* Live Matches Section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            Live Matches
          </h2>
          <Link
            href="/pro/matches?status=live"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            View all
          </Link>
        </div>

        {liveLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-[var(--bg-card)] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : liveData?.data && liveData.data.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveData.data.map((match) => (
              <MatchCard key={match.matchId} match={match} />
            ))}
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 text-center">
            <p className="text-[var(--text-muted)]">No live matches at the moment</p>
          </div>
        )}
      </section>

      {/* Upcoming Matches Section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Upcoming Matches
          </h2>
          <Link
            href="/pro/matches?status=upcoming"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            View all
          </Link>
        </div>

        {upcomingLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-32 bg-[var(--bg-card)] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : upcomingData?.data && upcomingData.data.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingData.data.map((match) => (
              <MatchCard key={match.matchId} match={match} />
            ))}
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 text-center">
            <p className="text-[var(--text-muted)]">No upcoming matches scheduled</p>
          </div>
        )}
      </section>

      {/* Active Tournaments Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Active Tournaments
          </h2>
          <Link
            href="/pro/tournaments"
            className="text-sm text-[var(--accent)] hover:underline"
          >
            View all
          </Link>
        </div>

        {tournamentsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-[var(--bg-card)] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : tournamentsData?.data && tournamentsData.data.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tournamentsData.data.map((tournament) => (
              <TournamentCard key={tournament.tournamentId} tournament={tournament} />
            ))}
          </div>
        ) : (
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 text-center">
            <p className="text-[var(--text-muted)]">No active tournaments</p>
          </div>
        )}
      </section>
    </main>
  )
}
