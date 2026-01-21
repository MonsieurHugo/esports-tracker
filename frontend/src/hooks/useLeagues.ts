'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import type { LeagueInfo } from '@/lib/types'

interface UseLeaguesResult {
  leagues: LeagueInfo[]
  isLoading: boolean
}

export function useLeagues(): UseLeaguesResult {
  const [leagues, setLeagues] = useState<LeagueInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchLeagues = async () => {
      try {
        const res = await api.get<{ data: LeagueInfo[] }>('/lol/dashboard/leagues')
        setLeagues(res.data || [])
      } catch (error) {
        logError('Failed to fetch leagues', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchLeagues()
  }, [])

  return { leagues, isLoading }
}
