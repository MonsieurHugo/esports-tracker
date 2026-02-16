'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'
import ChampionStatsTable from './ChampionStatsTable'

interface League {
  id: number
  name: string
  shortName: string | null
}

interface Tournament {
  id: number
  name: string
  leagueId: number | null
}

interface LeaguesResponse {
  data: League[]
}

interface TournamentsResponse {
  data: Tournament[]
}

const ROLES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'] as const
type Role = (typeof ROLES)[number]

export default function ChampionAnalyticsTab() {
  // Filter states
  const [leagueId, setLeagueId] = useState<number | null>(null)
  const [tournamentId, setTournamentId] = useState<number | null>(null)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [patches, setPatches] = useState<string>('')
  const [minGames, setMinGames] = useState<number>(0)
  const [role, setRole] = useState<Role | null>(null)

  // Data states
  const [leagues, setLeagues] = useState<League[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [isLoadingLeagues, setIsLoadingLeagues] = useState(true)
  const [isLoadingTournaments, setIsLoadingTournaments] = useState(true)

  // Fetch leagues
  const fetchLeagues = useCallback(async () => {
    try {
      const response = await api.get<LeaguesResponse>('/pro/monitoring/leagues')
      setLeagues(response.data)
    } catch (error) {
      logError('Failed to fetch leagues', error)
    } finally {
      setIsLoadingLeagues(false)
    }
  }, [])

  // Fetch tournaments
  const fetchTournaments = useCallback(async () => {
    try {
      setIsLoadingTournaments(true)
      const response = await api.get<TournamentsResponse>(
        '/pro/monitoring/tournaments',
        { params: leagueId ? { leagueId } : undefined }
      )
      setTournaments(response.data)
    } catch (error) {
      logError('Failed to fetch tournaments', error)
    } finally {
      setIsLoadingTournaments(false)
    }
  }, [leagueId])

  useEffect(() => {
    fetchLeagues()
  }, [fetchLeagues])

  useEffect(() => {
    fetchTournaments()
    // Reset tournament selection when league changes
    setTournamentId(null)
  }, [fetchTournaments])

  // Filter tournaments by selected league
  const filteredTournaments = leagueId
    ? tournaments.filter((t) => t.leagueId === leagueId)
    : tournaments

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* League Dropdown */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-(--text-muted)">League</label>
            {isLoadingLeagues ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <select
                value={leagueId || ''}
                onChange={(e) =>
                  setLeagueId(e.target.value ? Number(e.target.value) : null)
                }
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-(--text-secondary) focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">All Leagues</option>
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.shortName || l.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Tournament Dropdown */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-(--text-muted)">Tournament</label>
            {isLoadingTournaments ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <select
                value={tournamentId || ''}
                onChange={(e) =>
                  setTournamentId(e.target.value ? Number(e.target.value) : null)
                }
                className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-(--text-secondary) focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">All Tournaments</option>
                {filteredTournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Start Date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-(--text-muted)">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-(--text-secondary) focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* End Date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-(--text-muted)">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-(--text-secondary) focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Patches */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-(--text-muted)">Patches</label>
            <input
              type="text"
              value={patches}
              onChange={(e) => setPatches(e.target.value)}
              placeholder="e.g., 16.1, 16.2"
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-(--text-secondary) focus:outline-none focus:border-[var(--accent)] placeholder:text-(--text-muted)"
            />
          </div>

          {/* Min Games */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-(--text-muted)">Min Games</label>
            <select
              value={minGames}
              onChange={(e) => setMinGames(Number(e.target.value))}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-(--text-secondary) focus:outline-none focus:border-[var(--accent)]"
            >
              <option value={0}>All</option>
              <option value={1}>1+</option>
              <option value={5}>5+</option>
              <option value={10}>10+</option>
              <option value={20}>20+</option>
            </select>
          </div>

          {/* Role Filter */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-(--text-muted)">Role</label>
            <select
              value={role || ''}
              onChange={(e) => setRole(e.target.value ? (e.target.value as Role) : null)}
              className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-(--text-secondary) focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">All Roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <ChampionStatsTable
        leagueId={leagueId}
        tournamentId={tournamentId}
        startDate={startDate}
        endDate={endDate}
        patches={patches}
        minGames={minGames}
        role={role}
      />
    </div>
  )
}
