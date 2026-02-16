'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'
import type { ProTeamLeaderboardEntry, PaginatedResponse } from '@/lib/types'
import type { ProStatsFilters } from '../hooks/useProStatsFilters'

interface TeamLeaderboardSectionProps {
  filters: ProStatsFilters
}

type SortField =
  | 'winRate' | 'games' | 'avgKills' | 'avgDeaths' | 'avgDuration'
  | 'avgTowers' | 'avgDragons' | 'avgBarons'
  | 'firstBloodRate' | 'firstTowerRate' | 'firstDragonRate' | 'firstHeraldRate' | 'firstGrubsRate' | 'firstBaronRate'
  | 'avgGoldAt15' | 'avgGoldDiffAt15' | 'avgDragonsAt15' | 'avgTowersAt15'
  | 'dragonSoulRate' | 'avgHeralds' | 'avgGrubs' | 'avgPlates' | 'avgElderDragons'
  | 'avgTotalGold' | 'avgVisionScore' | 'avgWardsPlaced'

type Category = 'general' | 'objectives' | 'firstObj' | 'earlyGame' | 'vision' | 'side'

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'objectives', label: 'Objectifs' },
  { key: 'firstObj', label: 'First Obj.' },
  { key: 'earlyGame', label: 'Early Game' },
  { key: 'vision', label: 'Vision' },
  { key: 'side', label: 'Side' },
]

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatTime(seconds: number | null): string {
  if (seconds == null) return '-'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatGold(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(Math.round(value))
}

function wrColor(wr: number): string {
  if (wr >= 60) return 'text-green-400'
  if (wr >= 50) return 'text-(--text-primary)'
  return 'text-red-400'
}

function diffColor(val: number): string {
  if (val > 0) return 'text-green-400'
  if (val < 0) return 'text-red-400'
  return 'text-(--text-secondary)'
}

export default function TeamLeaderboardSection({ filters }: TeamLeaderboardSectionProps) {
  const [data, setData] = useState<ProTeamLeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortField>('winRate')
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ total: 0, lastPage: 1, currentPage: 1 })
  const [minGames, setMinGames] = useState(3)
  const [category, setCategory] = useState<Category>('general')

  const buildParams = filters.buildParams

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      try {
        setIsLoading(true)
        const params: Record<string, string | number> = {
          ...buildParams(),
          sortBy,
          page,
          perPage: 25,
          minGames,
        }

        const response = await api.get<PaginatedResponse<ProTeamLeaderboardEntry>>(
          '/pro/stats/team-leaderboards',
          { params, signal: controller.signal }
        )
        if (!controller.signal.aborted) {
          setData(response.data)
          setMeta(response.meta)
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        logError('Failed to fetch team leaderboards', error)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }
    run()
    return () => controller.abort()
  }, [buildParams, sortBy, page, minGames])

  useEffect(() => {
    setPage(1)
  }, [buildParams, sortBy, minGames])

  const handleSort = (field: SortField) => {
    setSortBy(field)
  }

  const SortableHeader = ({ field, label, title }: { field: SortField; label: string; title?: string }) => (
    <th
      className="px-2 py-2 font-medium cursor-pointer hover:text-(--text-primary) transition-colors whitespace-nowrap"
      onClick={() => handleSort(field)}
      title={title}
    >
      <div className="flex items-center gap-0.5">
        {label}
        {sortBy === field && (
          <span className="text-[var(--accent)]">↓</span>
        )}
      </div>
    </th>
  )

  const StaticHeader = ({ label, title }: { label: string; title?: string }) => (
    <th className="px-2 py-2 font-medium whitespace-nowrap" title={title}>{label}</th>
  )

  const renderCategoryHeaders = () => {
    switch (category) {
      case 'general':
        return (
          <>
            <SortableHeader field="games" label="G" title="Games played" />
            <SortableHeader field="winRate" label="WR%" title="Game win rate" />
            <StaticHeader label="MW%" title="Match win rate" />
            <SortableHeader field="avgDuration" label="Dur" title="Average duration" />
            <SortableHeader field="avgKills" label="K/g" title="Kills per game" />
            <SortableHeader field="avgDeaths" label="D/g" title="Deaths per game" />
            <SortableHeader field="firstBloodRate" label="FB%" title="First Blood rate" />
            <SortableHeader field="firstTowerRate" label="FT%" title="First Tower rate" />
          </>
        )
      case 'objectives':
        return (
          <>
            <SortableHeader field="games" label="G" title="Games played" />
            <SortableHeader field="avgTowers" label="Twr/g" title="Towers per game" />
            <SortableHeader field="avgDragons" label="Drk/g" title="Dragons per game" />
            <SortableHeader field="avgBarons" label="Bar/g" title="Barons per game" />
            <SortableHeader field="avgHeralds" label="Her/g" title="Heralds per game" />
            <SortableHeader field="avgGrubs" label="Grub/g" title="Grubs per game" />
            <SortableHeader field="avgPlates" label="Plt/g" title="Plates per game" />
            <SortableHeader field="avgElderDragons" label="Eld/g" title="Elder Dragons per game" />
            <SortableHeader field="dragonSoulRate" label="Soul%" title="Dragon Soul rate" />
          </>
        )
      case 'firstObj':
        return (
          <>
            <SortableHeader field="games" label="G" title="Games played" />
            <SortableHeader field="firstBloodRate" label="FB%" title="First Blood rate" />
            <SortableHeader field="firstTowerRate" label="FT%" title="First Tower rate" />
            <SortableHeader field="firstDragonRate" label="FDrk%" title="First Dragon rate" />
            <SortableHeader field="firstHeraldRate" label="FHer%" title="First Herald rate" />
            <SortableHeader field="firstGrubsRate" label="FGrub%" title="First Grubs rate" />
            <SortableHeader field="firstBaronRate" label="FBar%" title="First Baron rate" />
            <StaticHeader label="FB T" title="Avg First Blood time" />
            <StaticHeader label="FT T" title="Avg First Tower time" />
            <StaticHeader label="FDrk T" title="Avg First Dragon time" />
            <StaticHeader label="FHer T" title="Avg First Herald time" />
          </>
        )
      case 'earlyGame':
        return (
          <>
            <SortableHeader field="games" label="G" title="Games played" />
            <SortableHeader field="avgGoldAt15" label="G@15" title="Average gold at 15 min" />
            <SortableHeader field="avgGoldDiffAt15" label="GD@15" title="Average gold diff at 15 min" />
            <SortableHeader field="avgDragonsAt15" label="Drk@15" title="Dragons at 15 min" />
            <SortableHeader field="avgTowersAt15" label="Twr@15" title="Towers at 15 min" />
            <SortableHeader field="avgPlates" label="Plt/g" title="Plates per game" />
            <SortableHeader field="firstBloodRate" label="FB%" title="First Blood rate" />
          </>
        )
      case 'vision':
        return (
          <>
            <SortableHeader field="games" label="G" title="Games played" />
            <SortableHeader field="avgVisionScore" label="VS/g" title="Vision Score per game" />
            <SortableHeader field="avgWardsPlaced" label="WP/g" title="Wards Placed per game" />
            <StaticHeader label="WD/g" title="Wards Destroyed per game" />
            <StaticHeader label="CW/g" title="Control Wards per game" />
            <SortableHeader field="avgTotalGold" label="Gold/g" title="Total Gold per game" />
          </>
        )
      case 'side':
        return (
          <>
            <SortableHeader field="games" label="G" title="Games played" />
            <SortableHeader field="winRate" label="WR%" title="Overall win rate" />
            <StaticHeader label="Blue G" title="Blue side games" />
            <StaticHeader label="Blue WR" title="Blue side win rate" />
            <StaticHeader label="Red G" title="Red side games" />
            <StaticHeader label="Red WR" title="Red side win rate" />
          </>
        )
    }
  }

  const renderCategoryCells = (team: ProTeamLeaderboardEntry) => {
    const blueWr = team.blueGames > 0 ? (team.blueWins / team.blueGames) * 100 : null
    const redWr = team.redGames > 0 ? (team.redWins / team.redGames) * 100 : null
    const matchWr = team.matchesPlayed > 0 ? (team.matchesWon / team.matchesPlayed) * 100 : null

    const Cell = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
      <td className={`px-2 py-1.5 font-mono ${className}`}>{children}</td>
    )

    switch (category) {
      case 'general':
        return (
          <>
            <Cell className="text-(--text-secondary)">{team.gamesPlayed}</Cell>
            <Cell className={`font-bold ${wrColor(team.gameWinRate)}`}>{team.gameWinRate.toFixed(0)}%</Cell>
            <Cell className={matchWr != null ? wrColor(matchWr) : 'text-(--text-muted)'}>
              {matchWr != null ? `${matchWr.toFixed(0)}%` : '-'}
            </Cell>
            <Cell className="text-(--text-secondary)">{formatDuration(team.avgDuration)}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgKills.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgDeaths.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.firstBloodRate}%</Cell>
            <Cell className="text-(--text-secondary)">{team.firstTowerRate}%</Cell>
          </>
        )
      case 'objectives':
        return (
          <>
            <Cell className="text-(--text-secondary)">{team.gamesPlayed}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgTowers.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgDragons.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgBarons.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgHeralds.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgGrubs.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgPlates.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgElderDragons.toFixed(2)}</Cell>
            <Cell className="text-(--text-secondary)">{team.dragonSoulRate}%</Cell>
          </>
        )
      case 'firstObj':
        return (
          <>
            <Cell className="text-(--text-secondary)">{team.gamesPlayed}</Cell>
            <Cell className="text-(--text-secondary)">{team.firstBloodRate}%</Cell>
            <Cell className="text-(--text-secondary)">{team.firstTowerRate}%</Cell>
            <Cell className="text-(--text-secondary)">{team.firstDragonRate}%</Cell>
            <Cell className="text-(--text-secondary)">{team.firstHeraldRate}%</Cell>
            <Cell className="text-(--text-secondary)">{team.firstGrubsRate}%</Cell>
            <Cell className="text-(--text-secondary)">{team.firstBaronRate}%</Cell>
            <Cell className="text-(--text-muted)">{formatTime(team.avgFirstBloodTime)}</Cell>
            <Cell className="text-(--text-muted)">{formatTime(team.avgFirstTowerTime)}</Cell>
            <Cell className="text-(--text-muted)">{formatTime(team.avgFirstDragonTime)}</Cell>
            <Cell className="text-(--text-muted)">{formatTime(team.avgFirstHeraldTime)}</Cell>
          </>
        )
      case 'earlyGame':
        return (
          <>
            <Cell className="text-(--text-secondary)">{team.gamesPlayed}</Cell>
            <Cell className="text-(--text-secondary)">{formatGold(team.avgGoldAt15)}</Cell>
            <Cell className={diffColor(team.avgGoldDiffAt15)}>
              {team.avgGoldDiffAt15 > 0 ? '+' : ''}{formatGold(team.avgGoldDiffAt15)}
            </Cell>
            <Cell className="text-(--text-secondary)">{team.avgDragonsAt15.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgTowersAt15.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgPlates.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.firstBloodRate}%</Cell>
          </>
        )
      case 'vision':
        return (
          <>
            <Cell className="text-(--text-secondary)">{team.gamesPlayed}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgVisionScore.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgWardsPlaced.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgWardsDestroyed.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{team.avgControlWards.toFixed(1)}</Cell>
            <Cell className="text-(--text-secondary)">{formatGold(team.avgTotalGold)}</Cell>
          </>
        )
      case 'side':
        return (
          <>
            <Cell className="text-(--text-secondary)">{team.gamesPlayed}</Cell>
            <Cell className={`font-bold ${wrColor(team.gameWinRate)}`}>{team.gameWinRate.toFixed(0)}%</Cell>
            <Cell className="text-(--text-muted)">{team.blueGames}</Cell>
            <Cell className={blueWr != null ? wrColor(blueWr) : 'text-(--text-muted)'}>
              {blueWr != null ? `${blueWr.toFixed(0)}%` : '-'}
            </Cell>
            <Cell className="text-(--text-muted)">{team.redGames}</Cell>
            <Cell className={redWr != null ? wrColor(redWr) : 'text-(--text-muted)'}>
              {redWr != null ? `${redWr.toFixed(0)}%` : '-'}
            </Cell>
          </>
        )
    }
  }

  const colCount = {
    general: 10,
    objectives: 11,
    firstObj: 13,
    earlyGame: 9,
    vision: 8,
    side: 8,
  }[category]

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Category tabs */}
        <div className="flex gap-1">
          {CATEGORIES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setCategory(key)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                category === key
                  ? 'bg-[var(--accent)] text-black font-medium'
                  : 'bg-[var(--bg-card)] border border-[var(--border)] text-(--text-secondary) hover:bg-[var(--bg-hover)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Min games filter */}
        <div className="flex items-center gap-2 text-xs text-(--text-muted) ml-auto">
          <span>Min</span>
          <select
            value={minGames}
            onChange={(e) => setMinGames(Number(e.target.value))}
            className="px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs text-(--text-secondary)"
          >
            {[1, 3, 5, 10, 20].map((n) => (
              <option key={n} value={n}>{n} games</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
        <div className="py-2 px-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-sm font-medium text-(--text-primary)">Team Leaderboard</h3>
          <span className="text-xs text-(--text-muted)">{meta.total} equipes</span>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-(--text-muted) text-xs border-b border-[var(--border)]">
                    <th className="px-2 py-2 font-medium sticky left-0 bg-[var(--bg-card)] z-10">#</th>
                    <th className="px-2 py-2 font-medium sticky left-8 bg-[var(--bg-card)] z-10">Team</th>
                    {renderCategoryHeaders()}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.map((team, index) => (
                    <tr key={team.teamId} className="hover:bg-[var(--bg-hover)] transition-colors text-xs">
                      <td className="px-2 py-1.5 font-mono text-(--text-muted) sticky left-0 bg-[var(--bg-card)] group-hover:bg-[var(--bg-hover)]">
                        {(page - 1) * 25 + index + 1}
                      </td>
                      <td className="px-2 py-1.5 font-medium text-(--text-primary) sticky left-8 bg-[var(--bg-card)] whitespace-nowrap">
                        {team.shortName || team.teamName || `T${team.teamId}`}
                      </td>
                      {renderCategoryCells(team)}
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={colCount} className="px-4 py-8 text-center text-(--text-muted)">
                        Aucune equipe trouvee. Essayez d&apos;ajuster les filtres.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {meta.lastPage > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--border)]">
                <span className="text-xs text-(--text-muted)">
                  Page {meta.currentPage} / {meta.lastPage}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-(--text-secondary)"
                  >
                    Prec
                  </button>
                  <button
                    onClick={() => setPage(Math.min(meta.lastPage, page + 1))}
                    disabled={page >= meta.lastPage}
                    className="px-3 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-(--text-secondary)"
                  >
                    Suiv
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
