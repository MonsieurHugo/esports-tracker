'use client'

import { memo } from 'react'
import type { TeamLeaderboardEntry, PlayerLeaderboardEntry } from '@/lib/types'
import StatCard from './StatCard'

interface StatsCardsProps {
  viewMode: 'teams' | 'players'
  selectedTeams: TeamLeaderboardEntry[]
  selectedPlayers: PlayerLeaderboardEntry[]
  getTeamLpStats: (team: TeamLeaderboardEntry) => { totalLp: number; lpChange: number }
  getPlayerLpStats: (player: PlayerLeaderboardEntry) => { totalLp: number; lpChange: number }
}

function StatsCards({
  viewMode,
  selectedTeams,
  selectedPlayers,
  getTeamLpStats,
  getPlayerLpStats,
}: StatsCardsProps) {
  const entities = viewMode === 'teams' ? selectedTeams : selectedPlayers
  const getLpStats = (e: TeamLeaderboardEntry | PlayerLeaderboardEntry) =>
    viewMode === 'teams'
      ? getTeamLpStats(e as TeamLeaderboardEntry)
      : getPlayerLpStats(e as PlayerLeaderboardEntry)

  const cards = [
    {
      label: 'Games',
      changeUnit: '',
      getValue: (e: TeamLeaderboardEntry | PlayerLeaderboardEntry) => ({
        value: e.games === -1 ? '-' as const : e.games,
        change: e.games === -1 ? undefined : e.gamesChange,
      }),
    },
    {
      label: 'Winrate',
      changeUnit: '%',
      getValue: (e: TeamLeaderboardEntry | PlayerLeaderboardEntry) => ({
        value: e.winrate === -1 || e.games === 0 ? '-' as const : `${e.winrate.toFixed(1)}%`,
        change: e.winrate === -1 || e.games === 0 ? undefined : e.winrateChange,
      }),
    },
    {
      label: 'LP',
      changeUnit: ' LP',
      getValue: (e: TeamLeaderboardEntry | PlayerLeaderboardEntry) => {
        const lpStats = getLpStats(e)
        return {
          value: lpStats.totalLp.toLocaleString('fr-FR'),
          change: lpStats.lpChange,
        }
      },
    },
  ]

  if (entities.length === 0) {
    return (
      <>
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value="-" />
        ))}
      </>
    )
  }

  if (entities.length === 2) {
    return (
      <>
        {cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            changeUnit={card.changeUnit}
            teams={entities.map((e) => card.getValue(e))}
          />
        ))}
      </>
    )
  }

  const entity = entities[0]
  return (
    <>
      {cards.map((card) => {
        const { value, change } = card.getValue(entity)
        return (
          <StatCard
            key={card.label}
            label={card.label}
            value={value}
            change={change}
            changeUnit={card.changeUnit}
          />
        )
      })}
    </>
  )
}

export default memo(StatsCards)
