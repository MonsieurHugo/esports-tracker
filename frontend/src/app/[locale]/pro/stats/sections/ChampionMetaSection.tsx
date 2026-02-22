'use client'

import { useEffect, useState, useMemo } from 'react'
import Image from 'next/image'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'
import { getChampionIconUrl, getChampionName } from '@/lib/champions'
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
  byGameNumber: Record<string, { picks: number; wins: number }>
}

interface ChampionStatsResponse {
  totalGames: number
  data: ChampionStat[]
}

type SortColumn = 'picks' | 'winRate' | 'g1wr' | 'g2wr' | 'g3wr' | 'g4wr' | 'g5wr'
type SortDirection = 'asc' | 'desc'

const GAME_NUMBERS = ['1', '2', '3', '4', '5'] as const

const DEFAULT_PARAMS: Record<string, string> = { years: '2026' }

export default function ChampionMetaSection() {
  const [data, setData] = useState<ChampionStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sortColumn, setSortColumn] = useState<SortColumn>('picks')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      try {
        setIsLoading(true)
        const params: Record<string, string | number> = {
          ...DEFAULT_PARAMS,
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
  }, [])

  const enrichedData = useMemo(() => {
    if (!data?.data) return []

    return data.data
      .map((champ) => {
        const winRate = champ.picks > 0 ? (champ.wins / champ.picks) * 100 : 0
        const gnWr: Record<string, number> = {}
        for (const gn of GAME_NUMBERS) {
          const g = champ.byGameNumber?.[gn]
          gnWr[`g${gn}wr`] = g && g.picks > 0 ? (g.wins / g.picks) * 100 : -1
        }
        return { ...champ, winRate, ...gnWr }
      })
  }, [data])

  const sortedData = useMemo(() => {
    return [...enrichedData].sort((a, b) => {
      const aVal = (a as Record<string, number>)[sortColumn] ?? 0
      const bVal = (b as Record<string, number>)[sortColumn] ?? 0
      // Push -1 (no data) to the bottom regardless of sort direction
      if (aVal === -1 && bVal !== -1) return 1
      if (bVal === -1 && aVal !== -1) return -1
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

  const SortableHeader = ({ column, label, className }: { column: SortColumn; label: string; className?: string }) => (
    <th
      className={`px-2 py-2 font-medium cursor-pointer hover:text-(--text-primary) transition-colors ${className ?? ''}`}
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

  const renderGameCell = (champ: ChampionStat, gn: string) => {
    const g = champ.byGameNumber?.[gn]
    if (!g || g.picks === 0) return <span className="text-(--text-muted)">-</span>
    const wr = (g.wins / g.picks) * 100
    return (
      <div className="flex flex-col items-start leading-tight">
        <span className="text-(--text-secondary)">{g.picks}</span>
        <span className={`text-[10px] font-bold ${getWinRateColor(wr, g.picks)}`}>
          {wr.toFixed(0)}%
        </span>
      </div>
    )
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
                  <th className="px-2 py-2 font-medium sticky left-0 bg-[var(--bg-card)] z-10">Champion</th>
                  <SortableHeader column="picks" label="Games" />
                  <SortableHeader column="winRate" label="WR" />
                  <SortableHeader column="g1wr" label="G1" />
                  <SortableHeader column="g2wr" label="G2" />
                  <SortableHeader column="g3wr" label="G3" />
                  <SortableHeader column="g4wr" label="G4" />
                  <SortableHeader column="g5wr" label="G5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {sortedData.map((champ) => (
                  <tr key={champ.championId} className="hover:bg-[var(--bg-hover)] transition-colors text-xs">
                    <td className="px-2 py-1.5 sticky left-0 bg-[var(--bg-card)] z-10">
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
                    <td className="px-2 py-1.5">
                      <span className={`font-mono font-bold ${getWinRateColor(champ.winRate, champ.picks)}`}>
                        {champ.picks > 0 ? `${champ.winRate.toFixed(0)}%` : '-'}
                      </span>
                    </td>
                    {GAME_NUMBERS.map((gn) => (
                      <td key={gn} className="px-2 py-1.5 font-mono">
                        {renderGameCell(champ, gn)}
                      </td>
                    ))}
                  </tr>
                ))}
                {enrichedData.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-(--text-muted)">
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
