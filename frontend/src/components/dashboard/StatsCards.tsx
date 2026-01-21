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
  if (viewMode === 'teams') {
    // Teams stats
    if (selectedTeams.length === 2) {
      return (
        <>
          <StatCard
            label="Games"
            changeUnit=""
            teams={selectedTeams.map((t) => ({
              value: t.games === -1 ? '-' : t.games,
              change: t.games === -1 ? undefined : t.gamesChange,
            }))}
          />
          <StatCard
            label="Winrate"
            changeUnit="%"
            teams={selectedTeams.map((t) => ({
              value: t.winrate === -1 || t.games === 0 ? '-' : `${t.winrate.toFixed(1)}%`,
              change: t.winrate === -1 || t.games === 0 ? undefined : t.winrateChange,
            }))}
          />
          <StatCard
            label="LP"
            changeUnit=" LP"
            teams={selectedTeams.map((t) => {
              const lpStats = getTeamLpStats(t)
              return {
                value: lpStats.totalLp.toLocaleString('fr-FR'),
                change: lpStats.lpChange,
              }
            })}
          />
        </>
      )
    }

    if (selectedTeams.length === 1) {
      const team = selectedTeams[0]
      const lpStats = getTeamLpStats(team)
      return (
        <>
          <StatCard
            label="Games"
            value={team.games === -1 ? '-' : team.games}
            change={team.games === -1 ? undefined : team.gamesChange}
            changeUnit=""
          />
          <StatCard
            label="Winrate"
            value={team.winrate === -1 || team.games === 0 ? '-' : `${team.winrate.toFixed(1)}%`}
            change={team.winrate === -1 || team.games === 0 ? undefined : team.winrateChange}
            changeUnit="%"
          />
          <StatCard
            label="LP"
            value={lpStats.totalLp.toLocaleString('fr-FR')}
            change={lpStats.lpChange}
            changeUnit=" LP"
          />
        </>
      )
    }

    // No team selected
    return (
      <>
        <StatCard label="Games" value="-" />
        <StatCard label="Winrate" value="-" />
        <StatCard label="LP" value="-" />
      </>
    )
  }

  // Players stats
  if (selectedPlayers.length === 2) {
    return (
      <>
        <StatCard
          label="Games"
          changeUnit=""
          teams={selectedPlayers.map((p) => ({
            value: p.games === -1 ? '-' : p.games,
            change: p.games === -1 ? undefined : p.gamesChange,
          }))}
        />
        <StatCard
          label="Winrate"
          changeUnit="%"
          teams={selectedPlayers.map((p) => ({
            value: p.winrate === -1 || p.games === 0 ? '-' : `${p.winrate.toFixed(1)}%`,
            change: p.winrate === -1 || p.games === 0 ? undefined : p.winrateChange,
          }))}
        />
        <StatCard
          label="LP"
          changeUnit=" LP"
          teams={selectedPlayers.map((p) => {
            const lpStats = getPlayerLpStats(p)
            return {
              value: lpStats.totalLp.toLocaleString('fr-FR'),
              change: lpStats.lpChange,
            }
          })}
        />
      </>
    )
  }

  if (selectedPlayers.length === 1) {
    const player = selectedPlayers[0]
    const lpStats = getPlayerLpStats(player)
    return (
      <>
        <StatCard
          label="Games"
          value={player.games === -1 ? '-' : player.games}
          change={player.games === -1 ? undefined : player.gamesChange}
          changeUnit=""
        />
        <StatCard
          label="Winrate"
          value={player.winrate === -1 || player.games === 0 ? '-' : `${player.winrate.toFixed(1)}%`}
          change={player.winrate === -1 || player.games === 0 ? undefined : player.winrateChange}
          changeUnit="%"
        />
        <StatCard
          label="LP"
          value={lpStats.totalLp.toLocaleString('fr-FR')}
          change={lpStats.lpChange}
          changeUnit=" LP"
        />
      </>
    )
  }

  // No player selected
  return (
    <>
      <StatCard label="Games" value="-" />
      <StatCard label="Winrate" value="-" />
      <StatCard label="LP" value="-" />
    </>
  )
}

export default memo(StatsCards)
