'use client'

import { useEffect, useState, useMemo } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'
import type { ProStatsFilters } from '../hooks/useProStatsFilters'

interface LeagueStat {
  leagueId: number
  name: string
  shortName: string
  region: string
  tier: number
  matchCount: number
  gameCount: number
  blueWins: number
  redWins: number
  avgDuration: number
}

interface LeagueStatsSectionProps {
  filters: ProStatsFilters
}

type SortColumn = 'matchCount' | 'gameCount' | 'name' | 'tier' | 'blueWr' | 'redWr' | 'avgDuration'
type SortDirection = 'asc' | 'desc'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function getWrColor(wr: number): string {
  if (wr >= 55) return 'text-green-400'
  if (wr < 45) return 'text-red-400'
  return 'text-(--text-primary)'
}

export default function LeagueStatsSection({ filters }: LeagueStatsSectionProps) {
  const [data, setData] = useState<LeagueStat[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sortColumn, setSortColumn] = useState<SortColumn>('gameCount')
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

        const response = await api.get<LeagueStat[]>(
          '/pro/stats/league-stats',
          { params, signal: controller.signal }
        )
        if (!controller.signal.aborted) setData(response)
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        logError('Failed to fetch league stats', error)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }
    run()
    return () => controller.abort()
  }, [buildParams])

  const enrichedData = useMemo(() => {
    return data.map((league) => {
      const blueWr = league.gameCount > 0 ? (league.blueWins / league.gameCount) * 100 : 0
      const redWr = league.gameCount > 0 ? (league.redWins / league.gameCount) * 100 : 0
      return { ...league, blueWr, redWr }
    })
  }, [data])

  const sortedData = useMemo(() => {
    return [...enrichedData].sort((a, b) => {
      if (sortColumn === 'name') {
        const aVal = a.name.toLowerCase()
        const bVal = b.name.toLowerCase()
        return sortDirection === 'desc'
          ? bVal.localeCompare(aVal)
          : aVal.localeCompare(bVal)
      }

      const aVal = a[sortColumn]
      const bVal = b[sortColumn]
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal
    })
  }, [enrichedData, sortColumn, sortDirection])

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')
    } else {
      setSortColumn(column)
      setSortDirection(column === 'name' ? 'asc' : 'desc')
    }
  }

  const SortableHeader = ({ column, label, align }: { column: SortColumn; label: string; align?: string }) => (
    <th
      className={`px-2 py-2 font-medium cursor-pointer hover:text-(--text-primary) transition-colors ${align || ''}`}
      onClick={() => handleSort(column)}
    >
      <div className={`flex items-center gap-0.5 ${align === 'text-right' ? 'justify-end' : ''}`}>
        {label}
        {sortColumn === column && (
          <span className="text-[var(--accent)]">
            {sortDirection === 'desc' ? '\u2193' : '\u2191'}
          </span>
        )}
      </div>
    </th>
  )

  const totalMatches = data.reduce((sum, l) => sum + l.matchCount, 0)
  const totalGames = data.reduce((sum, l) => sum + l.gameCount, 0)

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
        <div className="py-2 px-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-sm font-medium text-(--text-primary)">League Stats</h3>
          <span className="text-xs text-(--text-muted)">
            {data.length} leagues &bull; {totalMatches} matches &bull; {totalGames} games
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
                  <th className="px-2 py-2 font-medium w-10">#</th>
                  <SortableHeader column="name" label="League" />
                  <th className="px-2 py-2 font-medium">Region</th>
                  <SortableHeader column="tier" label="Tier" />
                  <SortableHeader column="matchCount" label="Matches" align="text-right" />
                  <SortableHeader column="gameCount" label="Games" align="text-right" />
                  <SortableHeader column="blueWr" label="Blue WR" align="text-right" />
                  <SortableHeader column="redWr" label="Red WR" align="text-right" />
                  <SortableHeader column="avgDuration" label="Avg Duration" align="text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {sortedData.map((league, index) => (
                  <tr key={league.leagueId} className="hover:bg-[var(--bg-hover)] transition-colors text-xs">
                    <td className="px-2 py-1.5 font-mono text-(--text-muted)">
                      {index + 1}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-(--text-primary)">{league.name}</span>
                        <span className="text-(--text-muted)">({league.shortName})</span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-(--text-secondary)">
                      {league.region}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-(--text-secondary)">
                      {league.tier}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-(--text-secondary) text-right">
                      {league.matchCount.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-(--text-primary) font-bold text-right">
                      {league.gameCount.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-right">
                      <span className={getWrColor(league.blueWr)}>
                        {league.gameCount > 0 ? `${league.blueWr.toFixed(1)}%` : '-'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-right">
                      <span className={getWrColor(league.redWr)}>
                        {league.gameCount > 0 ? `${league.redWr.toFixed(1)}%` : '-'}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-(--text-secondary) text-right">
                      {league.avgDuration > 0 ? formatDuration(league.avgDuration) : '-'}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-(--text-muted)">
                      Aucune donnee de ligue trouvee.
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
