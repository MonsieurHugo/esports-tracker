'use client'

import { useEffect, useState, useMemo } from 'react'
import Image from 'next/image'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'
import { getChampionIconUrl, getChampionName } from '@/lib/champions'
import type { ProStatsFilters } from '../hooks/useProStatsFilters'

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
  data: ChampionStat[]
}

interface ChampionMetaSectionProps {
  filters: ProStatsFilters
}

type SortColumn = 'picks' | 'bans' | 'winRate' | 'presence'
type SortDirection = 'asc' | 'desc'

export default function ChampionMetaSection({ filters }: ChampionMetaSectionProps) {
  const [data, setData] = useState<ChampionStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sortColumn, setSortColumn] = useState<SortColumn>('picks')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const buildParams = filters.buildParams

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      try {
        setIsLoading(true)
        const params: Record<string, string | number> = {
          ...buildParams(),
        }

        const response = await api.get<ChampionStatsResponse>(
          '/pro/stats/champion-stats',
          { params, signal: controller.signal }
        )
        if (!controller.signal.aborted) setData(response)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        logError('Failed to fetch champion stats', error)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }
    run()
    return () => controller.abort()
  }, [buildParams])

  const enrichedData = useMemo(() => {
    if (!data?.data) return []
    const totalGames = data.totalGames || 1
    const role = filters.role

    return data.data
      .map((champ) => {
        if (role && champ.byRole[role]) {
          const roleStats = champ.byRole[role]
          return {
            ...champ,
            picks: roleStats.picks,
            wins: roleStats.wins,
            winRate: roleStats.picks > 0 ? (roleStats.wins / roleStats.picks) * 100 : 0,
            presence: ((roleStats.picks + champ.bans) / totalGames) * 100,
          }
        }
        const winRate = champ.picks > 0 ? (champ.wins / champ.picks) * 100 : 0
        const presence = ((champ.picks + champ.bans) / totalGames) * 100
        return { ...champ, winRate, presence }
      })
      .filter((champ) => (role ? champ.picks > 0 : true))
  }, [data, filters.role])

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

  const SortableHeader = ({ column, label }: { column: SortColumn; label: string }) => (
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

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
        <div className="py-2 px-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-sm font-medium text-(--text-primary)">Champion Meta</h3>
          <span className="text-xs text-(--text-muted)">
            {enrichedData.length} champs &bull; {data?.totalGames || 0} games
          </span>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-(--text-muted) text-xs border-b border-[var(--border)]">
                  <th className="px-2 py-2 font-medium">Champion</th>
                  <SortableHeader column="picks" label="Picks" />
                  <SortableHeader column="bans" label="Bans" />
                  <SortableHeader column="presence" label="Presence" />
                  <SortableHeader column="winRate" label="WR" />
                  <th className="px-2 py-2 font-medium">Blue WR</th>
                  <th className="px-2 py-2 font-medium">Red WR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {sortedData.map((champ) => {
                  const blueWr = champ.blueSide.picks > 0
                    ? ((champ.blueSide.wins / champ.blueSide.picks) * 100).toFixed(0)
                    : '-'
                  const redWr = champ.redSide.picks > 0
                    ? ((champ.redSide.wins / champ.redSide.picks) * 100).toFixed(0)
                    : '-'

                  return (
                    <tr key={champ.championId} className="hover:bg-[var(--bg-hover)] transition-colors text-xs">
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
                        {champ.presence.toFixed(0)}%
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`font-mono font-bold ${getWinRateColor(champ.winRate, champ.picks)}`}>
                          {champ.picks > 0 ? `${champ.winRate.toFixed(0)}%` : '-'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-(--text-muted)">
                        {blueWr}{blueWr !== '-' ? '%' : ''}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-(--text-muted)">
                        {redWr}{redWr !== '-' ? '%' : ''}
                      </td>
                    </tr>
                  )
                })}
                {enrichedData.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-(--text-muted)">
                      Aucune donnee champion trouvee.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
