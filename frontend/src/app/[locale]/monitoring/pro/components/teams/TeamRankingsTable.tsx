'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'

interface TeamRanking {
  teamId: number
  teamName: string
  shortName: string | null
  tournamentName: string | null
  matchesPlayed: number
  matchesWon: number
  gamesPlayed: number
  gamesWon: number
  matchWinRate: number
  gameWinRate: number
  firstBloodRate: number | null
  firstTowerRate: number | null
  firstDragonRate: number | null
  firstHeraldRate: number | null
  avgGameDuration: number
  avgKills: number
  avgTowers: number
  avgDragons: number
  avgBarons: number
  blueSideGames: number
  blueSideWins: number
  redSideGames: number
  redSideWins: number
}

interface TeamRankingsResponse {
  data: TeamRanking[]
}

interface TeamRankingsTableProps {
  tournamentId: number | null
  minGames: number
}

type SortField = 'gameWinRate' | 'gamesPlayed' | 'firstBloodRate' | 'firstTowerRate' | 'firstDragonRate' | 'avgKills'
type SortOrder = 'asc' | 'desc'

export default function TeamRankingsTable({ tournamentId, minGames }: TeamRankingsTableProps) {
  const [data, setData] = useState<TeamRanking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>('gameWinRate')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      const params: Record<string, string | number> = { minGames }
      if (tournamentId) params.tournamentId = tournamentId

      const response = await api.get<TeamRankingsResponse>('/pro/monitoring/teams/rankings', { params })
      setData(response.data)
    } catch (error) {
      logError('Failed to fetch team rankings', error)
    } finally {
      setIsLoading(false)
    }
  }, [tournamentId, minGames])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const sortedData = [...data].sort((a, b) => {
    const aVal = a[sortField] ?? 0
    const bVal = b[sortField] ?? 0
    return sortOrder === 'desc' ? bVal - aVal : aVal - bVal
  })

  const formatPercent = (value: number | null) => {
    if (value === null) return '-'
    return `${value.toFixed(1)}%`
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getSideWinRate = (wins: number, games: number) => {
    if (games === 0) return '-'
    return `${((wins / games) * 100).toFixed(0)}%`
  }

  const SortableHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th
      className="px-2 py-2 font-medium cursor-pointer hover:text-(--text-primary) transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-0.5">
        {label}
        {sortField === field && (
          <span className="text-[var(--accent)]">{sortOrder === 'desc' ? '↓' : '↑'}</span>
        )}
      </div>
    </th>
  )

  if (isLoading) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
      <div className="py-2 px-3 border-b border-[var(--border)] flex items-center justify-between">
        <h3 className="text-sm font-medium text-(--text-primary)">Team Rankings</h3>
        <span className="text-xs text-(--text-muted)">{data.length} teams</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-(--text-muted) text-xs border-b border-[var(--border)]">
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Team</th>
              <th className="px-2 py-2 font-medium">Tournament</th>
              <SortableHeader field="gamesPlayed" label="W-L" />
              <SortableHeader field="gameWinRate" label="WR" />
              <SortableHeader field="firstBloodRate" label="FB" />
              <SortableHeader field="firstTowerRate" label="FT" />
              <SortableHeader field="firstDragonRate" label="FD" />
              <SortableHeader field="avgKills" label="K" />
              <th className="px-2 py-2 font-medium">Dur</th>
              <th className="px-2 py-2 font-medium">B</th>
              <th className="px-2 py-2 font-medium">R</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {sortedData.map((team, index) => (
              <tr key={`${team.teamId}-${team.tournamentName}`} className="hover:bg-[var(--bg-hover)] transition-colors text-xs">
                <td className="px-2 py-1.5 font-mono text-(--text-muted)">
                  {index + 1}
                </td>
                <td className="px-2 py-1.5">
                  <span className="font-medium text-(--text-primary)">{team.shortName || team.teamName}</span>
                </td>
                <td className="px-2 py-1.5 text-(--text-muted) max-w-[120px] truncate">
                  {team.tournamentName || '-'}
                </td>
                <td className="px-2 py-1.5 font-mono">
                  <span className="text-(--text-primary)">{team.gamesWon}</span>
                  <span className="text-(--text-muted)">-</span>
                  <span className="text-(--text-primary)">{team.gamesPlayed - team.gamesWon}</span>
                </td>
                <td className="px-2 py-1.5">
                  <span className={`font-mono font-bold ${
                    team.gameWinRate >= 60 ? 'text-green-400' :
                    team.gameWinRate >= 50 ? 'text-(--text-primary)' :
                    'text-red-400'
                  }`}>
                    {team.gameWinRate.toFixed(0)}%
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {formatPercent(team.firstBloodRate)}
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {formatPercent(team.firstTowerRate)}
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {formatPercent(team.firstDragonRate)}
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {team.avgKills.toFixed(1)}
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-muted)">
                  {formatDuration(team.avgGameDuration)}
                </td>
                <td className="px-2 py-1.5 text-blue-400 font-mono">
                  {getSideWinRate(team.blueSideWins, team.blueSideGames)}
                </td>
                <td className="px-2 py-1.5 text-red-400 font-mono">
                  {getSideWinRate(team.redSideWins, team.redSideGames)}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-(--text-muted)">
                  No team data found. Try adjusting filters or sync more data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
