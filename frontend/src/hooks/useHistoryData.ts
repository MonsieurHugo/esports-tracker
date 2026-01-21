'use client'

import { useEffect, useState, useRef } from 'react'
import api, { ApiError } from '@/lib/api'
import { useToastStore } from '@/stores/toastStore'
import type {
  TeamLeaderboardEntry,
  PlayerLeaderboardEntry,
  TeamHistoryData,
} from '@/lib/types'
import type { TeamGamesData } from '@/components/dashboard/GamesChart'
import type { TeamLpData } from '@/components/dashboard/LpChart'

interface UseTeamHistoryParams {
  selectedTeams: TeamLeaderboardEntry[]
  period: string
  refDate: string
}

interface UseHistoryResult {
  gamesData: TeamGamesData[]
  lpData: TeamLpData[]
  isLoading: boolean
}

/**
 * Error Handling Pattern:
 * - AbortError: Silently ignored (request cancelled)
 * - 404: Warning toast (no data available)
 * - 5xx: Error toast (server error)
 * - Other: Logged + error state set
 */
export function useTeamHistory({
  selectedTeams,
  period,
  refDate,
}: UseTeamHistoryParams): UseHistoryResult {
  const addToast = useToastStore((s) => s.addToast)
  const [gamesData, setGamesData] = useState<TeamGamesData[]>([])
  const [lpData, setLpData] = useState<TeamLpData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (selectedTeams.length === 0) {
      setGamesData([])
      setLpData([])
      return
    }

    const abortController = new AbortController()
    const currentRequestId = ++requestIdRef.current

    const fetchTeamHistory = async () => {
      setIsLoading(true)
      try {
        // Use batch endpoint: 1 request instead of N
        const teamIds = selectedTeams.map((t) => t.team.teamId).join(',')
        const params: Record<string, string | undefined> = {
          period,
          date: refDate,
          teamIds,
        }

        const res = await api.get<{
          data: Array<{
            teamId: number
            teamName: string
            shortName: string
            data: TeamHistoryData[]
          }>
        }>('/lol/dashboard/team-history-batch', {
          params,
          signal: abortController.signal,
        })

        // Ignore if not the most recent request
        if (currentRequestId !== requestIdRef.current) return
        if (abortController.signal.aborted) return

        const results = res.data || []

        setGamesData(results.map((r) => ({
          teamName: r.teamName,
          shortName: r.shortName,
          data: r.data.map((d) => ({
            date: d.date,
            label: d.label,
            games: d.games,
            wins: d.wins,
            winrate: d.winrate,
          })),
        })))

        setLpData(results.map((r) => ({
          teamName: r.teamName,
          shortName: r.shortName,
          data: r.data.map((d) => ({
            date: d.date,
            label: d.label,
            totalLp: d.totalLp,
          })),
        })))
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        // Ignore errors from stale requests
        if (currentRequestId !== requestIdRef.current) return

        // Add toast for critical errors
        if (error instanceof ApiError) {
          if (error.status === 404) {
            addToast({ message: 'Aucune donnée disponible pour cette période', type: 'warning' })
          } else if (error.status >= 500) {
            addToast({ message: 'Erreur serveur, veuillez réessayer', type: 'error' })
          }
        }

        setGamesData([])
        setLpData([])
      } finally {
        // Only update loading if this is the current request
        if (currentRequestId === requestIdRef.current && !abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchTeamHistory()

    return () => {
      abortController.abort()
    }
  }, [selectedTeams, period, refDate])

  return { gamesData, lpData, isLoading }
}

interface UsePlayerHistoryParams {
  selectedPlayers: PlayerLeaderboardEntry[]
  period: string
  refDate: string
}

/**
 * Error Handling Pattern:
 * - AbortError: Silently ignored (request cancelled)
 * - 404: Warning toast (no data available)
 * - 5xx: Error toast (server error)
 * - Other: Logged + error state set
 */
export function usePlayerHistory({
  selectedPlayers,
  period,
  refDate,
}: UsePlayerHistoryParams): UseHistoryResult {
  const addToast = useToastStore((s) => s.addToast)
  const [gamesData, setGamesData] = useState<TeamGamesData[]>([])
  const [lpData, setLpData] = useState<TeamLpData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (selectedPlayers.length === 0) {
      setGamesData([])
      setLpData([])
      return
    }

    const abortController = new AbortController()
    const currentRequestId = ++requestIdRef.current

    const fetchPlayerHistory = async () => {
      setIsLoading(true)
      try {
        // Use batch endpoint: 1 request instead of N
        const playerIds = selectedPlayers.map((p) => p.player.playerId).join(',')
        const params: Record<string, string | undefined> = {
          period,
          date: refDate,
          playerIds,
        }

        const res = await api.get<{
          data: Array<{
            playerId: number
            playerName: string
            data: TeamHistoryData[]
          }>
        }>('/lol/dashboard/player-history-batch', {
          params,
          signal: abortController.signal,
        })

        // Ignore if not the most recent request
        if (currentRequestId !== requestIdRef.current) return
        if (abortController.signal.aborted) return

        const results = res.data || []

        setGamesData(results.map((r) => ({
          teamName: r.playerName,
          shortName: r.playerName,
          data: r.data.map((d) => ({
            date: d.date,
            label: d.label,
            games: d.games,
            wins: d.wins,
            winrate: d.winrate,
          })),
        })))

        setLpData(results.map((r) => ({
          teamName: r.playerName,
          shortName: r.playerName,
          data: r.data.map((d) => ({
            date: d.date,
            label: d.label,
            totalLp: d.totalLp,
          })),
        })))
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        // Ignore errors from stale requests
        if (currentRequestId !== requestIdRef.current) return

        // Add toast for critical errors
        if (error instanceof ApiError) {
          if (error.status === 404) {
            addToast({ message: 'Aucune donnée disponible pour cette période', type: 'warning' })
          } else if (error.status >= 500) {
            addToast({ message: 'Erreur serveur, veuillez réessayer', type: 'error' })
          }
        }

        setGamesData([])
        setLpData([])
      } finally {
        // Only update loading if this is the current request
        if (currentRequestId === requestIdRef.current && !abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchPlayerHistory()

    return () => {
      abortController.abort()
    }
  }, [selectedPlayers, period, refDate])

  return { gamesData, lpData, isLoading }
}
