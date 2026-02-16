'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'

interface Match {
  id: number
  externalId: string
  team1Name: string
  team2Name: string
  team1Score: number
  team2Score: number
  status: string
  startTime: string | null
  tournamentName: string | null
  gameCount: number
}

interface Game {
  id: number
  gameNumber: number
  duration: number
  patch: string | null
  status: string
  winnerTeamSide: string | null
  blueTowers: number
  redTowers: number
  blueDragons: number
  redDragons: number
  blueBarons: number
  redBarons: number
}

interface League {
  id: number
  name: string
  shortName: string | null
}

interface MatchListProps {
  tournamentId: number | null
  onSelectMatch: (matchId: number) => void
  onSelectGame: (gameId: number) => void
}

export default function MatchList({ tournamentId, onSelectMatch, onSelectGame }: MatchListProps) {
  const [matches, setMatches] = useState<Match[]>([])
  const [games, setGames] = useState<Record<number, Game[]>>({})
  const [leagues, setLeagues] = useState<League[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedMatchId, setExpandedMatchId] = useState<number | null>(null)
  const [gamesLoading, setGamesLoading] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [leagueFilter, setLeagueFilter] = useState<string>('')
  const [teamSearch, setTeamSearch] = useState('')
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ total: 0, lastPage: 1 })

  const fetchLeagues = useCallback(async () => {
    try {
      const data = await api.get<{ data: League[] }>('/pro/monitoring/leagues')
      setLeagues(data.data)
    } catch (error) {
      logError('Failed to fetch leagues', error)
    }
  }, [])

  const fetchMatches = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {
        page: String(page),
        perPage: '20',
      }
      if (statusFilter !== 'all') params.status = statusFilter
      if (tournamentId) params.tournamentId = String(tournamentId)
      if (leagueFilter) params.leagueId = leagueFilter
      if (teamSearch.trim().length >= 2) params.teamSearch = teamSearch.trim()

      const data = await api.get<{ data: Match[]; meta: { total: number; lastPage: number } }>(
        '/pro/monitoring/matches',
        { params }
      )
      setMatches(data.data)
      setMeta({ total: data.meta.total, lastPage: data.meta.lastPage })
    } catch (error) {
      logError('Failed to fetch matches', error)
    } finally {
      setIsLoading(false)
    }
  }, [page, statusFilter, tournamentId, leagueFilter, teamSearch])

  useEffect(() => {
    fetchLeagues()
  }, [fetchLeagues])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMatches()
    }, teamSearch ? 300 : 0)

    return () => clearTimeout(timer)
  }, [fetchMatches, teamSearch])

  const fetchGames = async (matchId: number) => {
    if (games[matchId]) return

    setGamesLoading(matchId)
    try {
      const data = await api.get<{ data: Game[] }>(`/pro/monitoring/games-by-match/${matchId}`)
      setGames((prev) => ({ ...prev, [matchId]: data.data }))
    } catch (error) {
      logError('Failed to fetch games', error)
    } finally {
      setGamesLoading(null)
    }
  }

  const handleMatchClick = (match: Match) => {
    if (expandedMatchId === match.id) {
      setExpandedMatchId(null)
    } else {
      setExpandedMatchId(match.id)
      fetchGames(match.id)
    }
    onSelectMatch(match.id)
  }

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-[var(--positive)]/20 text-[var(--positive)]',
      live: 'bg-[var(--warning)]/20 text-[var(--warning)]',
      upcoming: 'bg-[var(--text-muted)]/20 text-(--text-muted)',
    }
    return styles[status] || styles.upcoming
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
      {/* Header with filters */}
      <div className="py-2 px-3 border-b border-[var(--border)]">
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={leagueFilter}
            onChange={(e) => {
              setLeagueFilter(e.target.value)
              setPage(1)
            }}
            className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary)"
          >
            <option value="">All Leagues</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.shortName || l.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary)"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="live">Live</option>
            <option value="upcoming">Upcoming</option>
          </select>
          <input
            type="text"
            placeholder="Search teams..."
            value={teamSearch}
            onChange={(e) => {
              setTeamSearch(e.target.value)
              setPage(1)
            }}
            className="flex-1 px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary) placeholder:text-(--text-muted)"
          />
        </div>
        {tournamentId && (
          <div className="mt-1 text-xs text-(--text-muted)">
            Tournament: {tournamentId}
          </div>
        )}
      </div>

      {/* Matches list */}
      <div className="divide-y divide-[var(--border)]">
        {isLoading ? (
          [...Array(8)].map((_, i) => (
            <div key={i} className="py-2 px-3">
              <Skeleton className="h-5 w-full" />
            </div>
          ))
        ) : matches.length === 0 ? (
          <div className="py-6 text-center text-(--text-muted) text-sm">No matches found</div>
        ) : (
          matches.map((match) => (
            <div key={match.id}>
              <div
                onClick={() => handleMatchClick(match)}
                className="py-2 px-3 hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-sm text-(--text-primary) font-medium truncate">{match.team1Name}</span>
                    <span className="font-mono text-sm font-bold text-(--text-primary) shrink-0">
                      {match.team1Score}-{match.team2Score}
                    </span>
                    <span className="text-sm text-(--text-primary) font-medium truncate">{match.team2Name}</span>
                    <span className="text-xs text-(--text-muted) shrink-0 hidden sm:inline">
                      {match.tournamentName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-(--text-muted) hidden sm:inline">{formatTime(match.startTime)}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-medium ${getStatusBadge(match.status)}`}
                    >
                      {match.status}
                    </span>
                    <span className="text-xs text-(--text-muted)">{match.gameCount}g</span>
                    <span className="text-(--text-muted) text-xs">
                      {expandedMatchId === match.id ? '\u25BC' : '\u25B6'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded games */}
              {expandedMatchId === match.id && (
                <div className="bg-[var(--bg-secondary)] border-t border-[var(--border)]">
                  {gamesLoading === match.id ? (
                    <div className="py-2 px-3">
                      <Skeleton className="h-5 w-full" />
                    </div>
                  ) : games[match.id]?.length === 0 ? (
                    <div className="py-2 px-3 text-xs text-(--text-muted)">No games found</div>
                  ) : (
                    <div className="divide-y divide-[var(--border)]">
                      {games[match.id]?.map((game) => (
                        <div
                          key={game.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectGame(game.id)
                          }}
                          className="py-1.5 px-3 pl-6 hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-3">
                              <span className="font-medium text-(--text-primary)">G{game.gameNumber}</span>
                              <span className={game.winnerTeamSide === 'blue' ? 'text-blue-400' : game.winnerTeamSide === 'red' ? 'text-red-400' : 'text-(--text-muted)'}>
                                {game.winnerTeamSide === 'blue' ? 'Blue' : game.winnerTeamSide === 'red' ? 'Red' : '-'}
                              </span>
                              <span className="text-(--text-muted)">{formatDuration(game.duration)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-(--text-muted)">
                              <span>T {game.blueTowers}/{game.redTowers}</span>
                              <span>D {game.blueDragons}/{game.redDragons}</span>
                              <span>B {game.blueBarons}/{game.redBarons}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {meta.lastPage > 1 && (
        <div className="py-2 px-3 border-t border-[var(--border)] flex items-center justify-between">
          <span className="text-xs text-(--text-muted)">{meta.total} matches</span>
          <div className="flex gap-1.5 items-center">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-0.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded disabled:opacity-50"
            >
              ‹
            </button>
            <span className="text-xs text-(--text-muted)">
              {page}/{meta.lastPage}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(meta.lastPage, p + 1))}
              disabled={page === meta.lastPage}
              className="px-2 py-0.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded disabled:opacity-50"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
