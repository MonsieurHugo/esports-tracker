'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'
import { getChampionIconUrl, getChampionName } from '@/lib/champions'

// TypeScript interfaces matching the API response
interface ChampionStat {
  championId: number
  picks: number
  bans: number
  fearlessBans: number
  wins: number
  totalGames: number
  blueSide: { picks: number; wins: number }
  redSide: { picks: number; wins: number }
  byRole: Record<string, { picks: number; wins: number }>
}

interface ChampionStatsResponse {
  totalGames: number
  filters: {
    leagueId: number | null
    tournamentIds: number[] | null
    startDate: string | null
    endDate: string | null
    patches: string[] | null
  }
  data: ChampionStat[]
}

interface ChampionStatsTableProps {
  leagueId: number | null
  tournamentId: number | null
  startDate: string
  endDate: string
  patches: string
  minGames: number
  role: string | null
}

// Enriched champion data with calculated winrate
interface EnrichedChampionStat extends ChampionStat {
  winRate: number
}

// Sortable columns
type SortColumn = 'picks' | 'bans' | 'fearlessBans' | 'wins' | 'totalGames' | 'winRate'
type SortDirection = 'asc' | 'desc'

export default function ChampionStatsTable({
  leagueId,
  tournamentId,
  startDate,
  endDate,
  patches,
  minGames,
  role,
}: ChampionStatsTableProps) {
  const [data, setData] = useState<ChampionStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sortColumn, setSortColumn] = useState<SortColumn>('picks')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      const params: Record<string, string | number> = {}

      if (leagueId) params.leagueId = leagueId
      if (tournamentId) params.tournamentIds = tournamentId
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      if (patches.trim()) params.patches = patches.trim()
      if (minGames > 1) params.minGames = minGames

      const response = await api.get<ChampionStatsResponse>(
        '/pro/monitoring/champions/stats',
        { params: Object.keys(params).length > 0 ? params : undefined }
      )
      setData(response)
    } catch (error) {
      logError('Failed to fetch champion stats', error)
    } finally {
      setIsLoading(false)
    }
  }, [leagueId, tournamentId, startDate, endDate, patches, minGames])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Enrich data with calculated winrate and filter by role
  const enrichedData = useMemo<EnrichedChampionStat[]>(() => {
    if (!data?.data) return []

    return data.data
      .map((champ) => {
        // If role is selected, use role-specific stats
        if (role && champ.byRole[role]) {
          const roleStats = champ.byRole[role]
          const winRate = roleStats.picks > 0 ? (roleStats.wins / roleStats.picks) * 100 : 0
          return {
            ...champ,
            picks: roleStats.picks,
            wins: roleStats.wins,
            winRate,
          }
        }
        // Otherwise use overall stats
        const winRate = champ.picks > 0 ? (champ.wins / champ.picks) * 100 : 0
        return { ...champ, winRate }
      })
      .filter((champ) => {
        // Filter out champions with 0 picks when role is selected
        if (role) return champ.picks > 0
        return true
      })
  }, [data, role])

  // Sort data
  const sortedData = useMemo(() => {
    return [...enrichedData].sort((a, b) => {
      const aVal = a[sortColumn] ?? 0
      const bVal = b[sortColumn] ?? 0
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal
    })
  }, [enrichedData, sortColumn, sortDirection])

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')
    } else {
      setSortColumn(column)
      setSortDirection('desc')
    }
  }

  const SortableHeader = ({
    column,
    label,
  }: {
    column: SortColumn
    label: string
  }) => (
    <th
      className="px-2 py-2 font-medium cursor-pointer hover:text-(--text-primary) transition-colors"
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-0.5">
        {label}
        {sortColumn === column && (
          <span className="text-[var(--accent)]">
            {sortDirection === 'desc' ? '↓' : '↑'}
          </span>
        )}
      </div>
    </th>
  )

  const getWinRateColor = (winRate: number, picks: number) => {
    if (picks === 0) return 'text-(--text-muted)'
    if (winRate >= 55) return 'text-green-400'
    if (winRate < 45) return 'text-red-400'
    return 'text-(--text-primary)'
  }

  if (isLoading) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="space-y-2">
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 text-center text-(--text-muted)">
        Failed to load champion data
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
      <div className="py-2 px-3 border-b border-[var(--border)] flex items-center justify-between">
        <h3 className="text-sm font-medium text-(--text-primary)">Champion Stats</h3>
        <span className="text-xs text-(--text-muted)">
          {enrichedData.length} champs &bull; {data.totalGames} games
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-(--text-muted) text-xs border-b border-[var(--border)]">
              <th className="px-2 py-2 font-medium">Champion</th>
              <SortableHeader column="picks" label="P" />
              <SortableHeader column="bans" label="B" />
              <SortableHeader column="fearlessBans" label="FL" />
              <SortableHeader column="wins" label="W" />
              <SortableHeader column="totalGames" label="Tot" />
              <SortableHeader column="winRate" label="WR" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {sortedData.map((champ) => (
              <tr
                key={champ.championId}
                className="hover:bg-[var(--bg-hover)] transition-colors text-xs"
              >
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <Image
                      src={getChampionIconUrl(champ.championId)}
                      alt={getChampionName(champ.championId)}
                      width={24}
                      height={24}
                      className="w-6 h-6 rounded"
                      unoptimized
                    />
                    <span className="font-medium text-(--text-primary)">
                      {getChampionName(champ.championId)}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {champ.picks}
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {champ.bans}
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {champ.fearlessBans}
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {champ.wins}
                </td>
                <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                  {champ.totalGames}
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className={`font-mono font-bold ${getWinRateColor(
                      champ.winRate,
                      champ.picks
                    )}`}
                  >
                    {champ.picks > 0 ? `${champ.winRate.toFixed(0)}%` : '-'}
                  </span>
                </td>
              </tr>
            ))}
            {enrichedData.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-(--text-muted)"
                >
                  No champion data found. Try adjusting filters or sync more data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
