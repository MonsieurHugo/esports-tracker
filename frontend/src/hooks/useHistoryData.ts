'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
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
  customStartDate?: string
  customEndDate?: string
}

interface UseHistoryResult {
  gamesData: TeamGamesData[]
  lpData: TeamLpData[]
  isLoading: boolean
}

export function useTeamHistory({
  selectedTeams,
  period,
  refDate,
  customStartDate,
  customEndDate,
}: UseTeamHistoryParams): UseHistoryResult {
  const [gamesData, setGamesData] = useState<TeamGamesData[]>([])
  const [lpData, setLpData] = useState<TeamLpData[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (selectedTeams.length === 0) {
      setGamesData([])
      setLpData([])
      return
    }

    const abortController = new AbortController()

    const fetchTeamHistory = async () => {
      setIsLoading(true)
      try {
        const results = await Promise.all(
          selectedTeams.map(async (team) => {
            const params: Record<string, string | number | undefined> = {
              period,
              date: refDate,
              teamId: team.team.teamId,
            }
            if (period === 'custom' && customStartDate && customEndDate) {
              params.startDate = customStartDate
              params.endDate = customEndDate
            }
            const res = await api.get<{ data: TeamHistoryData[] }>('/lol/dashboard/team-history', {
              params,
              signal: abortController.signal,
            })
            return {
              teamName: team.team.currentName,
              data: res.data || [],
            }
          })
        )

        if (abortController.signal.aborted) return

        setGamesData(results.map((r) => ({
          teamName: r.teamName,
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
          data: r.data.map((d) => ({
            date: d.date,
            label: d.label,
            totalLp: d.totalLp,
          })),
        })))
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        setGamesData([])
        setLpData([])
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchTeamHistory()

    return () => {
      abortController.abort()
    }
  }, [selectedTeams, period, refDate, customStartDate, customEndDate])

  return { gamesData, lpData, isLoading }
}

interface UsePlayerHistoryParams {
  selectedPlayers: PlayerLeaderboardEntry[]
  period: string
  refDate: string
  customStartDate?: string
  customEndDate?: string
}

export function usePlayerHistory({
  selectedPlayers,
  period,
  refDate,
  customStartDate,
  customEndDate,
}: UsePlayerHistoryParams): UseHistoryResult {
  const [gamesData, setGamesData] = useState<TeamGamesData[]>([])
  const [lpData, setLpData] = useState<TeamLpData[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (selectedPlayers.length === 0) {
      setGamesData([])
      setLpData([])
      return
    }

    const abortController = new AbortController()

    const fetchPlayerHistory = async () => {
      setIsLoading(true)
      try {
        const results = await Promise.all(
          selectedPlayers.map(async (player) => {
            const params: Record<string, string | number | undefined> = {
              period,
              date: refDate,
              playerId: player.player.playerId,
            }
            if (period === 'custom' && customStartDate && customEndDate) {
              params.startDate = customStartDate
              params.endDate = customEndDate
            }
            const res = await api.get<{ data: TeamHistoryData[] }>('/lol/dashboard/player-history', {
              params,
              signal: abortController.signal,
            })
            return {
              playerName: player.player.pseudo,
              data: res.data || [],
            }
          })
        )

        if (abortController.signal.aborted) return

        setGamesData(results.map((r) => ({
          teamName: r.playerName,
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
          data: r.data.map((d) => ({
            date: d.date,
            label: d.label,
            totalLp: d.totalLp,
          })),
        })))
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        setGamesData([])
        setLpData([])
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchPlayerHistory()

    return () => {
      abortController.abort()
    }
  }, [selectedPlayers, period, refDate, customStartDate, customEndDate])

  return { gamesData, lpData, isLoading }
}
