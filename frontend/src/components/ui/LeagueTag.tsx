'use client'

import { useEffect } from 'react'
import { useLeagueStore } from '@/stores/leagueStore'
import { getLeagueStyleFromColor } from '@/lib/utils'

interface LeagueTagProps {
  league: string
  className?: string
}

export default function LeagueTag({ league, className = '' }: LeagueTagProps) {
  const { fetchLeagues, getLeagueColor } = useLeagueStore()

  // Charger les ligues au premier rendu
  useEffect(() => {
    fetchLeagues()
  }, [fetchLeagues])

  const color = getLeagueColor(league)
  const style = getLeagueStyleFromColor(color)

  return (
    <span
      className={`text-[9px] px-1.5 py-0.5 rounded-sm border ${className}`}
      style={style}
    >
      {league}
    </span>
  )
}
