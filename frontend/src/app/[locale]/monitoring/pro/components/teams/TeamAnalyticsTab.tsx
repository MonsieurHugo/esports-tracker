'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'
import TeamRankingsTable from './TeamRankingsTable'

interface Tournament {
  id: number
  name: string
}

interface TournamentsResponse {
  data: Array<{
    id: number
    name: string
  }>
}

export default function TeamAnalyticsTab() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTournament, setSelectedTournament] = useState<number | null>(null)
  const [minGames, setMinGames] = useState(3)
  const [isLoadingTournaments, setIsLoadingTournaments] = useState(true)

  const fetchTournaments = useCallback(async () => {
    try {
      const response = await api.get<TournamentsResponse>('/pro/monitoring/tournaments')
      setTournaments(response.data)
    } catch (error) {
      logError('Failed to fetch tournaments', error)
    } finally {
      setIsLoadingTournaments(false)
    }
  }, [])

  useEffect(() => {
    fetchTournaments()
  }, [fetchTournaments])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Tournament Filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-(--text-muted)">Tournament:</label>
            {isLoadingTournaments ? (
              <Skeleton className="h-8 w-40" />
            ) : (
              <select
                value={selectedTournament || ''}
                onChange={(e) => setSelectedTournament(e.target.value ? Number(e.target.value) : null)}
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-(--text-secondary) focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">All Tournaments</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Min Games Filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-(--text-muted)">Min Games:</label>
            <select
              value={minGames}
              onChange={(e) => setMinGames(Number(e.target.value))}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-(--text-secondary) focus:outline-none focus:border-[var(--accent)]"
            >
              <option value={1}>1+</option>
              <option value={3}>3+</option>
              <option value={5}>5+</option>
              <option value={10}>10+</option>
            </select>
          </div>
        </div>
      </div>

      {/* Team Rankings Table */}
      <TeamRankingsTable
        tournamentId={selectedTournament}
        minGames={minGames}
      />
    </div>
  )
}
