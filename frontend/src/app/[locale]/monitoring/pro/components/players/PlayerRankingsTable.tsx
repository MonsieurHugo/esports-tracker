'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'

interface PlayerRanking {
  playerId: number
  playerName: string | null
  role: string | null
  teamName: string | null
  teamShortName: string | null
  tournamentName: string | null
  gamesPlayed: number
  gamesWon: number
  winRate: number
  avgKills: number
  avgDeaths: number
  avgAssists: number
  avgKda: number
  avgCsPerMin: number
  avgGoldPerMin: number
  avgDamagePerMin: number
  avgVisionScore: number
  avgKillParticipation: number
  avgGoldShare: number
  avgDamageShare: number
  avgCsDiffAt15: number
  avgGoldDiffAt15: number
  uniqueChampionsPlayed: number
  doubleKills: number
  tripleKills: number
  quadraKills: number
  pentaKills: number
}

interface PlayerRankingsResponse {
  data: PlayerRanking[]
}

interface PlayerRankingsTableProps {
  tournamentId: number | null
  role: string | null
  minGames: number
}

type SortField = 'avgKda' | 'gamesPlayed' | 'winRate' | 'avgCsPerMin' | 'avgGoldPerMin' | 'avgDamagePerMin' | 'avgKillParticipation' | 'avgGoldDiffAt15'
type SortOrder = 'asc' | 'desc'

const ROLE_COLORS: Record<string, string> = {
  Top: 'text-amber-400',
  Jungle: 'text-green-400',
  Mid: 'text-blue-400',
  ADC: 'text-red-400',
  Support: 'text-purple-400',
}

export default function PlayerRankingsTable({ tournamentId, role, minGames }: PlayerRankingsTableProps) {
  const [data, setData] = useState<PlayerRanking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>('avgKda')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      const params: Record<string, string | number> = { minGames }
      if (tournamentId) params.tournamentId = tournamentId
      if (role) params.role = role

      const response = await api.get<PlayerRankingsResponse>('/pro/monitoring/players/rankings', { params })
      setData(response.data)
    } catch (error) {
      logError('Failed to fetch player rankings', error)
    } finally {
      setIsLoading(false)
    }
  }, [tournamentId, role, minGames])

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

  const SortableHeader = ({ field, label, className = '' }: { field: SortField; label: string; className?: string }) => (
    <th
      className={`px-2 py-2 font-medium cursor-pointer hover:text-(--text-primary) transition-colors ${className}`}
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
        <h3 className="text-sm font-medium text-(--text-primary)">Player Rankings</h3>
        <span className="text-xs text-(--text-muted)">{data.length} players</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-(--text-muted) text-xs border-b border-[var(--border)]">
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Player</th>
              <th className="px-2 py-2 font-medium">Team</th>
              <th className="px-2 py-2 font-medium">R</th>
              <SortableHeader field="gamesPlayed" label="G" />
              <SortableHeader field="winRate" label="WR" />
              <SortableHeader field="avgKda" label="KDA" />
              <SortableHeader field="avgCsPerMin" label="CS" />
              <SortableHeader field="avgGoldPerMin" label="G/m" />
              <SortableHeader field="avgDamagePerMin" label="D/m" />
              <SortableHeader field="avgKillParticipation" label="KP" />
              <SortableHeader field="avgGoldDiffAt15" label="GD15" />
              <th className="px-2 py-2 font-medium">C</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {sortedData.map((player, index) => (
              <tr key={`${player.playerId}-${player.tournamentName}`} className="hover:bg-[var(--bg-hover)] transition-colors text-xs">
                <td className="px-2 py-1.5 font-mono text-(--text-muted)">
                  {index + 1}
                </td>
                <td className="px-2 py-1.5 font-medium text-(--text-primary)">
                  {player.playerName || `P${player.playerId}`}
                </td>
                <td className="px-2 py-1.5 text-(--text-muted)">
                  {player.teamShortName || player.teamName || '-'}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`font-medium ${ROLE_COLORS[player.role || ''] || 'text-(--text-secondary)'}`}>
                    {player.role?.charAt(0) || '-'}
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {player.gamesPlayed}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`font-mono font-bold ${
                    player.winRate >= 60 ? 'text-green-400' :
                    player.winRate >= 50 ? 'text-(--text-primary)' :
                    'text-red-400'
                  }`}>
                    {player.winRate.toFixed(0)}%
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono">
                  <span className={`font-bold ${
                    player.avgKda >= 5 ? 'text-[var(--accent)]' :
                    player.avgKda >= 3 ? 'text-(--text-primary)' :
                    'text-(--text-secondary)'
                  }`}>
                    {player.avgKda.toFixed(1)}
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {player.avgCsPerMin.toFixed(1)}
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {player.avgGoldPerMin.toFixed(0)}
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {player.avgDamagePerMin.toFixed(0)}
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {player.avgKillParticipation.toFixed(0)}%
                </td>
                <td className="px-2 py-1.5">
                  <span className={`font-mono ${
                    player.avgGoldDiffAt15 > 0 ? 'text-green-400' :
                    player.avgGoldDiffAt15 < 0 ? 'text-red-400' :
                    'text-(--text-muted)'
                  }`}>
                    {player.avgGoldDiffAt15 > 0 ? '+' : ''}{player.avgGoldDiffAt15.toFixed(0)}
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-muted)">
                  {player.uniqueChampionsPlayed}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-(--text-muted)">
                  No player data found. Try adjusting filters or sync more data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
