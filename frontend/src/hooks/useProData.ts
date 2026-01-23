'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api, ApiError } from '@/lib/api'
import type {
  ProTournamentsResponse,
  ProTournamentDetail,
  ProMatchesResponse,
  ProMatchDetail,
  ProGameDetail,
  ProTeamStatsResponse,
  ProPlayerStatsResponse,
  ProChampionStatsResponse,
  ProHeadToHeadResponse,
} from '@/lib/proTypes'

// ============================================================================
// TOURNAMENTS
// ============================================================================

interface UseTournamentsParams {
  status?: 'upcoming' | 'ongoing' | 'completed'
  region?: string
  page?: number
  perPage?: number
}

export function useTournaments(params: UseTournamentsParams = {}) {
  const [data, setData] = useState<ProTournamentsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const requestIdRef = useRef(0)

  const { status, region, page = 1, perPage = 20 } = params

  useEffect(() => {
    const currentRequestId = ++requestIdRef.current

    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const queryParams: Record<string, string | number> = { page, perPage }
        if (status) queryParams.status = status
        if (region) queryParams.region = region

        const result = await api.get<ProTournamentsResponse>('/pro/tournaments', {
          params: queryParams,
        })

        if (currentRequestId === requestIdRef.current) {
          setData(result)
        }
      } catch (err) {
        if (currentRequestId === requestIdRef.current) {
          setError(err instanceof Error ? err : new Error('Failed to fetch tournaments'))
        }
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false)
        }
      }
    }

    fetchData()
  }, [status, region, page, perPage])

  return { data, isLoading, error }
}

export function useTournament(slug: string | null) {
  const [data, setData] = useState<ProTournamentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!slug) {
      setData(null)
      setIsLoading(false)
      return
    }

    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const result = await api.get<ProTournamentDetail>(`/pro/tournaments/${slug}`)
        setData(result)
      } catch (err) {
        if (err instanceof ApiError && err.isNotFound) {
          setError(new Error('Tournament not found'))
        } else {
          setError(err instanceof Error ? err : new Error('Failed to fetch tournament'))
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [slug])

  return { data, isLoading, error }
}

// ============================================================================
// MATCHES
// ============================================================================

interface UseMatchesParams {
  tournamentId?: number
  teamId?: number
  status?: 'upcoming' | 'live' | 'completed'
  page?: number
  perPage?: number
}

export function useMatches(params: UseMatchesParams = {}) {
  const [data, setData] = useState<ProMatchesResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const requestIdRef = useRef(0)

  const { tournamentId, teamId, status, page = 1, perPage = 20 } = params

  useEffect(() => {
    const currentRequestId = ++requestIdRef.current

    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const queryParams: Record<string, string | number> = { page, perPage }
        if (tournamentId) queryParams.tournamentId = tournamentId
        if (teamId) queryParams.teamId = teamId
        if (status) queryParams.status = status

        const result = await api.get<ProMatchesResponse>('/pro/matches', {
          params: queryParams,
        })

        if (currentRequestId === requestIdRef.current) {
          setData(result)
        }
      } catch (err) {
        if (currentRequestId === requestIdRef.current) {
          setError(err instanceof Error ? err : new Error('Failed to fetch matches'))
        }
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setIsLoading(false)
        }
      }
    }

    fetchData()
  }, [tournamentId, teamId, status, page, perPage])

  return { data, isLoading, error }
}

export function useLiveMatches() {
  const [data, setData] = useState<ProMatchesResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const result = await api.get<ProMatchesResponse>('/pro/matches/live')
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch live matches'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()

    // Poll every 30 seconds for live matches
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  return { data, isLoading, error }
}

export function useUpcomingMatches(limit: number = 10) {
  const [data, setData] = useState<ProMatchesResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const result = await api.get<ProMatchesResponse>('/pro/matches/upcoming', {
          params: { limit },
        })
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch upcoming matches'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [limit])

  return { data, isLoading, error }
}

export function useMatch(matchId: number | null) {
  const [data, setData] = useState<ProMatchDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!matchId) {
      setData(null)
      setIsLoading(false)
      return
    }

    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const result = await api.get<ProMatchDetail>(`/pro/matches/${matchId}`)
        setData(result)
      } catch (err) {
        if (err instanceof ApiError && err.isNotFound) {
          setError(new Error('Match not found'))
        } else {
          setError(err instanceof Error ? err : new Error('Failed to fetch match'))
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()

    // Poll if match is live
    // (would need to check status from data, simplified here)
  }, [matchId])

  return { data, isLoading, error }
}

// ============================================================================
// GAMES
// ============================================================================

export function useGame(gameId: number | null) {
  const [data, setData] = useState<ProGameDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!gameId) {
      setData(null)
      setIsLoading(false)
      return
    }

    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const result = await api.get<ProGameDetail>(`/pro/games/${gameId}`)
        setData(result)
      } catch (err) {
        if (err instanceof ApiError && err.isNotFound) {
          setError(new Error('Game not found'))
        } else {
          setError(err instanceof Error ? err : new Error('Failed to fetch game'))
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [gameId])

  return { data, isLoading, error }
}

// ============================================================================
// TEAM STATS
// ============================================================================

export function useTeamProStats(teamSlug: string | null, tournamentId?: number) {
  const [data, setData] = useState<ProTeamStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!teamSlug) {
      setData(null)
      setIsLoading(false)
      return
    }

    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const params: Record<string, number> = {}
        if (tournamentId) params.tournamentId = tournamentId

        const result = await api.get<ProTeamStatsResponse>(`/pro/teams/${teamSlug}/stats`, {
          params,
        })
        setData(result)
      } catch (err) {
        if (err instanceof ApiError && err.isNotFound) {
          setError(new Error('Team not found'))
        } else {
          setError(err instanceof Error ? err : new Error('Failed to fetch team stats'))
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [teamSlug, tournamentId])

  return { data, isLoading, error }
}

// ============================================================================
// PLAYER STATS
// ============================================================================

export function usePlayerProStats(playerSlug: string | null, tournamentId?: number) {
  const [data, setData] = useState<ProPlayerStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!playerSlug) {
      setData(null)
      setIsLoading(false)
      return
    }

    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const params: Record<string, number> = {}
        if (tournamentId) params.tournamentId = tournamentId

        const result = await api.get<ProPlayerStatsResponse>(`/pro/players/${playerSlug}/stats`, {
          params,
        })
        setData(result)
      } catch (err) {
        if (err instanceof ApiError && err.isNotFound) {
          setError(new Error('Player not found'))
        } else {
          setError(err instanceof Error ? err : new Error('Failed to fetch player stats'))
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [playerSlug, tournamentId])

  return { data, isLoading, error }
}

// ============================================================================
// DRAFTS ANALYSIS
// ============================================================================

export function useChampionStats(tournamentId: number | null) {
  const [data, setData] = useState<ProChampionStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!tournamentId) {
      setData(null)
      setIsLoading(false)
      return
    }

    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const result = await api.get<ProChampionStatsResponse>('/pro/drafts/analysis', {
          params: { tournamentId },
        })
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch champion stats'))
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [tournamentId])

  return { data, isLoading, error }
}

// ============================================================================
// HEAD TO HEAD
// ============================================================================

export function useHeadToHead(team1Slug: string | null, team2Slug: string | null) {
  const [data, setData] = useState<ProHeadToHeadResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!team1Slug || !team2Slug) {
      setData(null)
      setIsLoading(false)
      return
    }

    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const result = await api.get<ProHeadToHeadResponse>('/pro/head-to-head', {
          params: { team1: team1Slug, team2: team2Slug },
        })
        setData(result)
      } catch (err) {
        if (err instanceof ApiError && err.isNotFound) {
          setError(new Error('One or both teams not found'))
        } else {
          setError(err instanceof Error ? err : new Error('Failed to fetch head to head'))
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [team1Slug, team2Slug])

  return { data, isLoading, error }
}
