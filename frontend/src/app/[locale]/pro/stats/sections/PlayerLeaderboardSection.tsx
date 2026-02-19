'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import Image from 'next/image'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'
import TeamLogo from '@/components/ui/TeamLogo'
import { ExportImageButton } from '@/components/ui/ExportImageButton'
import { getRoleImagePath, sanitizeSlug } from '@/lib/utils'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { ProPlayerLeaderboardEntry, PaginatedResponse } from '@/lib/types'
import type { ProStatsFilters } from '../hooks/useProStatsFilters'

interface PlayerLeaderboardSectionProps {
  filters: ProStatsFilters
}

type SortField =
  | 'games' | 'winRate'
  | 'avgKills' | 'avgDeaths' | 'avgAssists' | 'kda'
  | 'kills' | 'deaths' | 'assists'
  | 'csPerMin' | 'goldPerMin' | 'goldShare' | 'goldDiffAt15'
  | 'damagePerMin' | 'dpmPost15' | 'damageShare'
  | 'csDiffAt15' | 'xpDiffAt15'
  | 'visionScore'
  | 'killParticipation' | 'firstBloodParticipations'
  | 'doubleKills' | 'tripleKills' | 'quadraKills' | 'pentaKills'
  | 'uniqueChampions'
  | 'proximityTop' | 'proximityJungle' | 'proximityMid' | 'proximityAdc' | 'proximitySupport'
  | 'isolation'
  | 'botlane2v2Kills' | 'botlane2v2Deaths' | 'goldAt15' | 'xpAt15' | 'csAt15' | 'killsAt15' | 'kpAt15' | 'teamKillsAt15' | 'deathsAt15'
  | 'soloKills' | 'vspm' | 'plates'

const ROLES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'] as const

type StatTab = 'general' | 'kda' | 'early' | 'economy' | 'damage' | 'combat' | 'proximity'

const STAT_TABS: { key: StatTab; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'kda', label: 'KDA' },
  { key: 'early', label: 'Early' },
  { key: 'economy', label: 'Economy' },
  { key: 'damage', label: 'Damage' },
  { key: 'combat', label: 'Combat' },
  { key: 'proximity', label: 'Proximity' },
]

const TAB_DEFAULT_SORT: Record<StatTab, SortField> = {
  general: 'games',
  kda: 'kda',
  early: 'goldDiffAt15',
  economy: 'csPerMin',
  damage: 'damagePerMin',
  combat: 'visionScore',
  proximity: 'isolation',
}

const TAB_SORT_FIELDS: Record<StatTab, SortField[]> = {
  general: ['kda', 'killParticipation', 'damagePerMin', 'damageShare', 'goldPerMin', 'goldShare', 'vspm', 'goldDiffAt15', 'soloKills'],
  kda: ['avgKills', 'avgDeaths', 'avgAssists', 'kda', 'kills', 'deaths', 'assists', 'uniqueChampions'],
  early: ['botlane2v2Kills', 'botlane2v2Deaths', 'goldDiffAt15', 'csDiffAt15', 'xpDiffAt15', 'plates', 'killsAt15', 'kpAt15', 'teamKillsAt15', 'deathsAt15'],
  economy: ['csPerMin', 'goldPerMin', 'goldShare', 'goldDiffAt15', 'csDiffAt15', 'xpDiffAt15'],
  damage: ['damagePerMin', 'dpmPost15', 'damageShare', 'killParticipation'],
  combat: ['visionScore', 'firstBloodParticipations', 'doubleKills', 'tripleKills', 'quadraKills', 'pentaKills'],
  proximity: ['proximityTop', 'proximityJungle', 'proximityMid', 'proximityAdc', 'proximitySupport', 'isolation'],
}

type ProxMetricKey = 'avgProximityTop' | 'avgProximityJungle' | 'avgProximityMid' | 'avgProximityAdc' | 'avgProximitySupport' | 'avgIsolation'

const PROX_METRICS: { key: ProxMetricKey; label: string; forRole: string | null }[] = [
  { key: 'avgProximityTop', label: 'Top', forRole: 'Top' },
  { key: 'avgProximityJungle', label: 'JG', forRole: 'Jungle' },
  { key: 'avgProximityMid', label: 'Mid', forRole: 'Mid' },
  { key: 'avgProximityAdc', label: 'ADC', forRole: 'ADC' },
  { key: 'avgProximitySupport', label: 'SUP', forRole: 'Support' },
  { key: 'avgIsolation', label: 'Iso', forRole: null },
]

export default function PlayerLeaderboardSection({ filters }: PlayerLeaderboardSectionProps) {
  const [data, setData] = useState<ProPlayerLeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortField>('games')
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ total: 0, lastPage: 1, currentPage: 1 })
  const [minGames, setMinGames] = useState(5)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statTab, setStatTab] = useState<StatTab>('general')
  const [proxRole, setProxRole] = useState<string>('Top')
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  const buildParams = filters.buildParams

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

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
        if (statTab === 'proximity') {
          params.role = proxRole
        }
        if (debouncedSearch) params.search = debouncedSearch
        if (startDate) params.startDate = startDate
        if (endDate) params.endDate = endDate

        const response = await api.get<PaginatedResponse<ProPlayerLeaderboardEntry>>(
          '/pro/stats/player-leaderboards',
          { params, signal: controller.signal }
        )
        if (!controller.signal.aborted) {
          setData(response.data)
          setMeta(response.meta)
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        logError('Failed to fetch player leaderboards', error)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }
    run()
    return () => controller.abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildParams, sortBy, page, minGames, debouncedSearch, startDate, endDate, statTab, proxRole])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildParams, sortBy, minGames, debouncedSearch, startDate, endDate, statTab, proxRole])

  // Proximity: table metrics for selected role (exclude self-role)
  const proxTableMetrics = useMemo(() => {
    if (statTab !== 'proximity') return []
    return PROX_METRICS.filter((m) => m.forRole !== proxRole)
  }, [statTab, proxRole])

  // Proximity: extremes for table cell coloring
  const proxExtremes = useMemo(() => {
    if (statTab !== 'proximity' || data.length === 0) return {} as Record<string, { min: number; max: number }>
    const extremes: Record<string, { min: number; max: number }> = {}
    for (const m of proxTableMetrics) {
      let min = Infinity
      let max = -Infinity
      for (const p of data) {
        const val = p[m.key]
        if (val < min) min = val
        if (val > max) max = val
      }
      extremes[m.key] = { min, max }
    }
    return extremes
  }, [data, statTab, proxTableMetrics])

  const proxCellColor = (key: string, val: number) => {
    const e = proxExtremes[key]
    if (!e || e.min === e.max) return 'text-(--text-secondary)'
    if (val === e.max) return 'text-green-400 font-bold'
    if (val === e.min) return 'text-red-400 font-bold'
    return 'text-(--text-secondary)'
  }

  // Proximity: prepare chart data for the selected role sub-tab
  const proxCharts = useMemo(() => {
    if (statTab !== 'proximity' || data.length === 0) return []

    const metrics = PROX_METRICS.filter((m) => m.forRole !== proxRole)
    const uniqueTeams = new Set(data.map((p) => p.teamShortName).filter(Boolean)).size
    const showLogos = uniqueTeams >= 3

    return metrics.map((metric) => {
      const sorted = [...data].sort((a, b) => b[metric.key] - a[metric.key])
      return {
        title: metric.label === 'Iso' ? 'Isolation' : `Proximity ${metric.label}`,
        metricKey: metric.key,
        showLogos,
        data: sorted.map((p, i) => ({
          id: String(i),
          playerId: p.playerId,
          name: p.playerName || `P${p.playerId}`,
          teamShortName: p.teamShortName || '',
          value: Number(p[metric.key].toFixed(1)),
        })),
      }
    })
  }, [data, statTab, proxRole])

  // Early: prepare chart data for GD@15, CSD@15, XPD@15
  const EARLY_DIFF_METRICS = [
    { key: 'avgGoldDiffAt15' as const, label: 'GD@15', unit: '' },
    { key: 'avgCsDiffAt15' as const, label: 'CSD@15', unit: '' },
    { key: 'avgXpDiffAt15' as const, label: 'XPD@15', unit: '' },
  ]

  const earlyCharts = useMemo(() => {
    if (statTab !== 'early' || data.length === 0) return []

    const uniqueTeams = new Set(data.map((p) => p.teamShortName).filter(Boolean)).size
    const showLogos = uniqueTeams >= 3

    return EARLY_DIFF_METRICS.map((metric) => {
      const sorted = [...data].sort((a, b) => (b[metric.key] ?? 0) - (a[metric.key] ?? 0))
      return {
        title: metric.label,
        metricKey: metric.key,
        showLogos,
        data: sorted.map((p, i) => ({
          id: String(i),
          playerId: p.playerId,
          name: p.playerName || `P${p.playerId}`,
          teamShortName: p.teamShortName || '',
          value: Number((p[metric.key] ?? 0).toFixed(1)),
        })),
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, statTab])

  const handleSort = (field: SortField) => {
    setSortBy(field)
  }

  const handleTabChange = (tab: StatTab) => {
    setStatTab(tab)
    // Reset sort if current sort field is not in the new tab (and not a general field)
    const generalFields: SortField[] = ['games', 'winRate']
    if (!generalFields.includes(sortBy) && !TAB_SORT_FIELDS[tab].includes(sortBy)) {
      setSortBy(TAB_DEFAULT_SORT[tab])
    }
  }

  const SortableHeader = ({ field, label, className = '', title }: { field: SortField; label: string; className?: string; title?: string }) => (
    <th
      className={`px-1.5 py-2 font-medium cursor-pointer hover:text-(--text-primary) transition-colors whitespace-nowrap ${className}`}
      onClick={() => handleSort(field)}
      title={title || label}
    >
      <div className="flex items-center gap-0.5">
        {label}
        {sortBy === field && (
          <span className="text-[var(--accent)]">&#8595;</span>
        )}
      </div>
    </th>
  )

  // Color coding helpers
  const wrColor = (wr: number) =>
    wr >= 60 ? 'text-green-400' : wr < 50 ? 'text-red-400' : 'text-(--text-primary)'

  const kdaColor = (kda: number) =>
    kda >= 4 ? 'text-green-400' : kda < 2.5 ? 'text-red-400' : 'text-(--text-primary)'

  const diffColor = (v: number) =>
    v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-(--text-secondary)'

  const kpColor = (kp: number) =>
    kp >= 70 ? 'text-green-400' : kp < 50 ? 'text-red-400' : 'text-(--text-secondary)'

  const stickyBase = 'sticky z-10 bg-[var(--bg-card)]'
  const stickyHeaderBase = 'sticky z-20 bg-[var(--bg-card)]'

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un joueur..."
          className="px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-xs text-(--text-primary) placeholder:text-(--text-muted) font-mono focus:outline-none focus:border-[var(--accent)] transition-colors w-48"
        />

        {/* Min games */}
        <div className="flex items-center gap-2 text-xs text-(--text-muted)">
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

        {/* Date range */}
        <div className="flex items-center gap-2 text-xs text-(--text-muted)">
          <span>Du</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs text-(--text-secondary) font-mono focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          <span>au</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2 py-1 bg-[var(--bg-card)] border border-[var(--border)] rounded text-xs text-(--text-secondary) font-mono focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(''); setEndDate('') }}
              className="px-1.5 py-0.5 text-[10px] bg-[var(--bg-hover)] border border-[var(--border)] rounded hover:border-[var(--accent)] text-(--text-muted) hover:text-(--text-primary) transition-colors"
              title="Effacer les dates"
            >
              &times;
            </button>
          )}
        </div>

      </div>

      {/* Stat tabs */}
      <div className="flex gap-1">
        {STAT_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              statTab === tab.key
                ? 'bg-[var(--accent)] text-black'
                : 'bg-[var(--bg-card)] text-(--text-secondary) hover:bg-[var(--bg-hover)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Proximity: role sub-tabs + per-player charts */}
      {statTab === 'proximity' && (
        <div className="space-y-4">
          {/* Role sub-tabs */}
          <div className="flex gap-1">
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setProxRole(r)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  proxRole === r
                    ? 'bg-[var(--accent)] text-black'
                    : 'bg-[var(--bg-card)] text-(--text-secondary) hover:bg-[var(--bg-hover)]'
                }`}
              >
                <Image
                  src={getRoleImagePath(r)}
                  alt={r}
                  width={14}
                  height={14}
                  className={`w-3.5 h-3.5 object-contain ${proxRole === r ? 'brightness-0' : 'opacity-70'}`}
                />
                {r}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-[200px] w-full rounded-xl" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-[300px] w-full rounded-xl" />
                ))}
              </div>
            </div>
          ) : data.length === 0 ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-8 text-center text-xs text-(--text-muted)">
              Aucun joueur trouve. Essayez d&apos;ajuster les filtres.
            </div>
          ) : (
            <>
              {/* Proximity table */}
              <div ref={tableRef} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
                <div className="py-2 px-3 border-b border-[var(--border)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Image
                      src={getRoleImagePath(proxRole)}
                      alt={proxRole}
                      width={16}
                      height={16}
                      className="w-4 h-4 object-contain opacity-70"
                    />
                    <h4 className="text-sm font-medium text-(--text-primary)">{proxRole}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-(--text-muted)">{meta.total} joueurs</span>
                    <ExportImageButton tableRef={tableRef} filename={`player-leaderboard-proximity-${proxRole.toLowerCase()}`} />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-max min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-(--text-muted) border-b border-[var(--border)]">
                        <th className="px-1.5 py-2 font-medium w-6">#</th>
                        <th className="px-1.5 py-2 font-medium">Eq.</th>
                        <th className="px-1.5 py-2 font-medium border-r border-[var(--border)]">Joueur</th>
                        <SortableHeader field="games" label="G" title="Games Played" />
                        <th className="w-px bg-[var(--border)]" />
                        {proxTableMetrics.map((m) => (
                          <th
                            key={m.key}
                            className="px-1.5 py-2 font-medium cursor-pointer hover:text-(--text-primary) transition-colors whitespace-nowrap"
                            onClick={() => handleSort(m.label === 'Iso' ? 'isolation' as SortField : `proximity${m.label === 'JG' ? 'Jungle' : m.label === 'SUP' ? 'Support' : m.label}` as SortField)}
                          >
                            <div className="flex items-center gap-0.5">
                              {m.label}%
                              {sortBy === (m.label === 'Iso' ? 'isolation' : `proximity${m.label === 'JG' ? 'Jungle' : m.label === 'SUP' ? 'Support' : m.label}`) && (
                                <span className="text-[var(--accent)]">&#8595;</span>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {data.map((p, index) => {
                        const isSelected = selectedPlayerId === p.playerId
                        return (
                        <tr
                          key={`${p.playerId}-${p.role}`}
                          onClick={() => setSelectedPlayerId(isSelected ? null : p.playerId)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--bg-hover)]'
                          }`}
                        >
                          <td className="px-1.5 py-1.5 font-mono text-(--text-muted)">{(page - 1) * 25 + index + 1}</td>
                          <td className="px-1.5 py-1.5">
                            {p.teamShortName ? (
                              <TeamLogo slug={p.teamShortName.toLowerCase()} shortName={p.teamShortName} name={p.teamName} size={16} />
                            ) : <span className="text-(--text-muted)">&mdash;</span>}
                          </td>
                          <td className={`px-1.5 py-1.5 font-medium border-r border-[var(--border)] ${
                            isSelected ? 'text-[var(--accent)]' : 'text-(--text-primary)'
                          }`}>
                            {p.playerName || `P${p.playerId}`}
                          </td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.gamesPlayed}</td>
                          <td className="w-px bg-[var(--border)]" />
                          {proxTableMetrics.map((m) => (
                            <td key={m.key} className={`px-1.5 py-1.5 font-mono ${proxCellColor(m.key, p[m.key])}`}>
                              {p[m.key].toFixed(1)}%
                            </td>
                          ))}
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Proximity charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {proxCharts.map((chart) => (
                  <div key={chart.metricKey} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
                    <div className="py-2 px-3 border-b border-[var(--border)]">
                      <h4 className="text-xs font-medium text-(--text-primary)">{chart.title}</h4>
                    </div>
                    <div className="p-2 h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chart.data} margin={{ top: 20, right: 5, left: -15, bottom: 5 }}>
                          <XAxis
                            dataKey="id"
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            height={chart.showLogos ? 55 : 35}
                            tick={(props: { x: number; y: number; payload: { value: string } }) => {
                              const { x, y, payload } = props
                              const entry = chart.data[Number(payload.value)]
                              if (!entry) return <g />
                              const logoSlug = chart.showLogos && entry.teamShortName ? sanitizeSlug(entry.teamShortName) : null
                              return (
                                <g transform={`translate(${x},${y})`}>
                                  <text
                                    x={0}
                                    y={4}
                                    textAnchor="middle"
                                    dominantBaseline="hanging"
                                    fill="var(--text-muted)"
                                    fontSize={9}
                                    fontFamily="var(--font-mono)"
                                  >
                                    {entry.name}
                                  </text>
                                  {logoSlug && (
                                    <image
                                      href={`/images/teams/${logoSlug}.png`}
                                      x={-8}
                                      y={18}
                                      width={16}
                                      height={16}
                                    />
                                  )}
                                </g>
                              )
                            }}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'var(--text-muted)', fontSize: 9 }}
                            tickFormatter={(v) => `${v}%`}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload || payload.length === 0) return null
                              const point = payload[0]?.payload as { name: string; teamShortName: string; value: number } | undefined
                              if (!point) return null
                              return (
                                <div className="bg-[var(--bg-hover)] border border-[var(--border)] rounded p-2 text-[10px]">
                                  <div className="font-medium text-(--text-primary) mb-1">
                                    {point.teamShortName ? `${point.teamShortName} ` : ''}{point.name}
                                  </div>
                                  <div className="text-(--text-muted)">
                                    {chart.title}: <span className="font-mono text-[var(--accent)]">{point.value}%</span>
                                  </div>
                                </div>
                              )
                            }}
                          />
                          <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                            {chart.data.map((entry) => (
                              <Cell
                                key={entry.id}
                                fill={selectedPlayerId !== null && entry.playerId === selectedPlayerId ? 'var(--lol)' : 'var(--accent)'}
                              />
                            ))}
                            <LabelList
                              dataKey="value"
                              position="top"
                              fill="var(--text-secondary)"
                              fontSize={8}
                              fontFamily="var(--font-mono)"
                              formatter={(v: number) => `${v}%`}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Pagination */}
          {!isLoading && meta.lastPage > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-(--text-muted)">
                Page {meta.currentPage} / {meta.lastPage} ({meta.total} joueurs)
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
        </div>
      )}

      {/* Normal table (non-proximity tabs) */}
      {statTab !== 'proximity' && (
      <div className={statTab === 'early' ? 'flex flex-col lg:flex-row gap-4' : ''}>
      <div ref={tableRef} className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-xl ${statTab === 'early' ? 'lg:flex-1 min-w-0' : ''}`}>
        <div className="py-2 px-3 border-b border-[var(--border)] flex items-center justify-between">
          <h3 className="text-sm font-medium text-(--text-primary)">Player Leaderboard</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-(--text-muted)">{meta.total} joueurs</span>
            <ExportImageButton tableRef={tableRef} filename={`player-leaderboard-${statTab}`} />
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-max min-w-full text-xs">
                <thead>
                  <tr className="text-left text-(--text-muted) border-b border-[var(--border)]">
                    {/* Sticky columns */}
                    <th className={`${stickyHeaderBase} left-0 px-1.5 py-2 font-medium w-8`}>#</th>
                    <th className={`${stickyHeaderBase} left-8 px-1.5 py-2 font-medium`}>Equipe</th>
                    <th className={`${stickyHeaderBase} left-[68px] px-1.5 py-2 font-medium`}>Role</th>
                    <th className={`${stickyHeaderBase} left-[108px] px-1.5 py-2 font-medium border-r border-[var(--border)]`}>Joueur</th>

                    {/* General (always visible) */}
                    <SortableHeader field="games" label="G" title="Games Played" />
                    {statTab !== 'early' && (
                      <>
                        <SortableHeader field="winRate" label="W" title="Wins" />
                        <th className="px-1.5 py-2 font-medium" title="Win Rate">WR%</th>
                      </>
                    )}

                    {/* Separator */}
                    <th className="w-px bg-[var(--border)]" />

                    {/* Tab-specific headers */}
                    {statTab === 'general' && (
                      <>
                        <SortableHeader field="kda" label="KDA" title="KDA Ratio" />
                        <SortableHeader field="killParticipation" label="KP%" title="Kill Participation %" />
                        <th className="w-px bg-[var(--border)]" />
                        <SortableHeader field="damagePerMin" label="DPM" title="Damage per Minute" />
                        <SortableHeader field="damageShare" label="DMG%" title="Damage Share %" />
                        <th className="w-px bg-[var(--border)]" />
                        <SortableHeader field="goldPerMin" label="GPM" title="Gold per Minute" />
                        <SortableHeader field="goldShare" label="GOLD%" title="Gold Share %" />
                        <th className="w-px bg-[var(--border)]" />
                        <SortableHeader field="vspm" label="VSPM" title="Vision Score per Minute" />
                        <SortableHeader field="goldDiffAt15" label="GD@15" title="Gold Diff at 15min" />
                        <SortableHeader field="soloKills" label="Solo K" title="Avg Solo Kills per Game" />
                      </>
                    )}
                    {statTab === 'kda' && (
                      <>
                        <SortableHeader field="avgKills" label="K" title="Avg Kills/Game" />
                        <SortableHeader field="avgDeaths" label="D" title="Avg Deaths/Game" />
                        <SortableHeader field="avgAssists" label="A" title="Avg Assists/Game" />
                        <SortableHeader field="kda" label="KDA" title="KDA Ratio" />
                        <th className="w-px bg-[var(--border)]" />
                        <SortableHeader field="kills" label="Tot K" title="Total Kills" />
                        <SortableHeader field="deaths" label="Tot D" title="Total Deaths" />
                        <SortableHeader field="assists" label="Tot A" title="Total Assists" />
                        <th className="w-px bg-[var(--border)]" />
                        <SortableHeader field="uniqueChampions" label="Champs" title="Unique Champions Played" />
                      </>
                    )}
                    {statTab === 'early' && (
                      <>
                        <SortableHeader field="botlane2v2Kills" label="2v2 K" title="Botlane 2v2 Kills" />
                        <SortableHeader field="botlane2v2Deaths" label="2v2 D" title="Botlane 2v2 Deaths" />
                        <th className="w-px bg-[var(--border)]" />
                        <SortableHeader field="goldDiffAt15" label="GD@15" title="Gold Diff at 15min" />
                        <SortableHeader field="csDiffAt15" label="CSD@15" title="CS Diff at 15min" />
                        <SortableHeader field="xpDiffAt15" label="XPD@15" title="XP Diff at 15min" />
                        <SortableHeader field="plates" label="Plates" title="Avg Plates Destroyed" />
                        <th className="w-px bg-[var(--border)]" />
                        <SortableHeader field="killsAt15" label="K@15" title="Kills at 15min" />
                        <SortableHeader field="kpAt15" label="KP@15" title="Kill Participation at 15min" />
                        <SortableHeader field="teamKillsAt15" label="TK@15" title="Team Kills at 15min" />
                        <SortableHeader field="deathsAt15" label="D@15" title="Deaths at 15min" />
                      </>
                    )}
                    {statTab === 'economy' && (
                      <>
                        <SortableHeader field="csPerMin" label="CS/m" title="CS per Minute" />
                        <SortableHeader field="goldPerMin" label="Gold/m" title="Gold per Minute" />
                        <SortableHeader field="goldShare" label="Gold%" title="Gold Share %" />
                        <SortableHeader field="goldDiffAt15" label="GD@15" title="Gold Diff at 15min" />
                        <th className="w-px bg-[var(--border)]" />
                        <SortableHeader field="csDiffAt15" label="CSD@15" title="CS Diff at 15min" />
                        <SortableHeader field="xpDiffAt15" label="XPD@15" title="XP Diff at 15min" />
                      </>
                    )}
                    {statTab === 'damage' && (
                      <>
                        <SortableHeader field="damagePerMin" label="DPM" title="Damage per Minute" />
                        <SortableHeader field="dpmPost15" label="DPM P15" title="Damage per Minute Post 15min" />
                        <SortableHeader field="damageShare" label="DMG%" title="Damage Share %" />
                        <SortableHeader field="killParticipation" label="KP%" title="Kill Participation %" />
                      </>
                    )}
                    {statTab === 'combat' && (
                      <>
                        <SortableHeader field="visionScore" label="VS" title="Vision Score" />
                        <SortableHeader field="firstBloodParticipations" label="FB" title="First Blood Participations" />
                        <th className="px-1.5 py-2 font-medium whitespace-nowrap" title="First Blood Victims">FBV</th>
                        <th className="w-px bg-[var(--border)]" />
                        <SortableHeader field="doubleKills" label="2K" title="Double Kills" />
                        <SortableHeader field="tripleKills" label="3K" title="Triple Kills" />
                        <SortableHeader field="quadraKills" label="4K" title="Quadra Kills" />
                        <SortableHeader field="pentaKills" label="5K" title="Penta Kills" />
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.map((p, index) => {
                    const isEarlySelected = statTab === 'early' && selectedPlayerId === p.playerId
                    return (
                    <tr
                      key={`${p.playerId}-${p.role}`}
                      onClick={statTab === 'early' ? () => setSelectedPlayerId(isEarlySelected ? null : p.playerId) : undefined}
                      className={`transition-colors group ${
                        statTab === 'early' ? 'cursor-pointer' : ''
                      } ${
                        isEarlySelected ? 'bg-[var(--accent)]/10' : 'hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      {/* Sticky columns */}
                      <td className={`${stickyBase} left-0 px-1.5 py-1.5 font-mono text-(--text-muted) group-hover:bg-[var(--bg-hover)]`}>
                        {(page - 1) * 25 + index + 1}
                      </td>
                      <td className={`${stickyBase} left-8 px-1.5 py-1.5 group-hover:bg-[var(--bg-hover)]`}>
                        {p.teamShortName ? (
                          <TeamLogo slug={p.teamShortName.toLowerCase()} shortName={p.teamShortName} name={p.teamName} size={18} />
                        ) : <span className="text-(--text-muted)">&mdash;</span>}
                      </td>
                      <td className={`${stickyBase} left-[68px] px-1.5 py-1.5 group-hover:bg-[var(--bg-hover)]`}>
                        {p.role ? (
                          <Image
                            src={getRoleImagePath(p.role)}
                            alt={p.role}
                            width={16}
                            height={16}
                            className="w-4 h-4 object-contain opacity-70"
                          />
                        ) : null}
                      </td>
                      <td className={`${stickyBase} left-[108px] px-1.5 py-1.5 font-medium border-r border-[var(--border)] group-hover:bg-[var(--bg-hover)] ${
                        isEarlySelected ? 'text-[var(--accent)]' : 'text-(--text-primary)'
                      }`}>
                        {p.playerName || `P${p.playerId}`}
                      </td>

                      {/* General (always visible) */}
                      <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.gamesPlayed}</td>
                      {statTab !== 'early' && (
                        <>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.gamesWon}</td>
                          <td className="px-1.5 py-1.5">
                            <span className={`font-mono font-bold ${wrColor(p.winRate)}`}>
                              {p.winRate.toFixed(0)}%
                            </span>
                          </td>
                        </>
                      )}

                      {/* Separator */}
                      <td className="w-px bg-[var(--border)]" />

                      {/* Tab-specific cells */}
                      {statTab === 'general' && (
                        <>
                          <td className="px-1.5 py-1.5">
                            <span className={`font-mono font-bold ${kdaColor(p.avgKda)}`}>
                              {p.avgKda.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5">
                            <span className={`font-mono ${kpColor(p.avgKillParticipation)}`}>
                              {p.avgKillParticipation.toFixed(0)}%
                            </span>
                          </td>
                          <td className="w-px bg-[var(--border)]" />
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgDamagePerMin}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgDamageShare.toFixed(1)}%</td>
                          <td className="w-px bg-[var(--border)]" />
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgGoldPerMin}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgGoldShare.toFixed(1)}%</td>
                          <td className="w-px bg-[var(--border)]" />
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{(p.avgVspm ?? 0).toFixed(2)}</td>
                          <td className="px-1.5 py-1.5">
                            <span className={`font-mono ${diffColor(p.avgGoldDiffAt15)}`}>
                              {p.avgGoldDiffAt15 > 0 ? '+' : ''}{p.avgGoldDiffAt15}
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{(p.avgSoloKills ?? 0).toFixed(2)}</td>
                        </>
                      )}
                      {statTab === 'kda' && (
                        <>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgKills.toFixed(1)}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgDeaths.toFixed(1)}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgAssists.toFixed(1)}</td>
                          <td className="px-1.5 py-1.5">
                            <span className={`font-mono font-bold ${kdaColor(p.avgKda)}`}>
                              {p.avgKda.toFixed(2)}
                            </span>
                          </td>
                          <td className="w-px bg-[var(--border)]" />
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.totalKills}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.totalDeaths}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.totalAssists}</td>
                          <td className="w-px bg-[var(--border)]" />
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.uniqueChampionsPlayed}</td>
                        </>
                      )}
                      {statTab === 'early' && (
                        <>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.total2v2Kills ?? 0}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.total2v2Deaths ?? 0}</td>
                          <td className="w-px bg-[var(--border)]" />
                          <td className="px-1.5 py-1.5">
                            <span className={`font-mono ${diffColor(p.avgGoldDiffAt15)}`}>
                              {p.avgGoldDiffAt15 > 0 ? '+' : ''}{p.avgGoldDiffAt15}
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5">
                            <span className={`font-mono ${diffColor(p.avgCsDiffAt15)}`}>
                              {p.avgCsDiffAt15 > 0 ? '+' : ''}{p.avgCsDiffAt15.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5">
                            <span className={`font-mono ${diffColor(p.avgXpDiffAt15)}`}>
                              {p.avgXpDiffAt15 > 0 ? '+' : ''}{p.avgXpDiffAt15}
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{(p.avgPlates ?? 0).toFixed(2)}</td>
                          <td className="w-px bg-[var(--border)]" />
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{(p.avgKillsAt15 ?? 0).toFixed(2)}</td>
                          <td className="px-1.5 py-1.5">
                            <span className={`font-mono ${kpColor(p.avgKpAt15 ?? 0)}`}>
                              {(p.avgKpAt15 ?? 0).toFixed(0)}%
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-muted)">{(p.avgTeamKillsAt15 ?? 0).toFixed(1)}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{(p.avgDeathsAt15 ?? 0).toFixed(2)}</td>
                        </>
                      )}
                      {statTab === 'economy' && (
                        <>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgCsPerMin.toFixed(1)}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgGoldPerMin}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgGoldShare.toFixed(1)}%</td>
                          <td className="px-1.5 py-1.5">
                            <span className={`font-mono ${diffColor(p.avgGoldDiffAt15)}`}>
                              {p.avgGoldDiffAt15 > 0 ? '+' : ''}{p.avgGoldDiffAt15}
                            </span>
                          </td>
                          <td className="w-px bg-[var(--border)]" />
                          <td className="px-1.5 py-1.5">
                            <span className={`font-mono ${diffColor(p.avgCsDiffAt15)}`}>
                              {p.avgCsDiffAt15 > 0 ? '+' : ''}{p.avgCsDiffAt15.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5">
                            <span className={`font-mono ${diffColor(p.avgXpDiffAt15)}`}>
                              {p.avgXpDiffAt15 > 0 ? '+' : ''}{p.avgXpDiffAt15}
                            </span>
                          </td>
                        </>
                      )}
                      {statTab === 'damage' && (
                        <>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgDamagePerMin}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgDpmPost15 ?? 0}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgDamageShare.toFixed(1)}%</td>
                          <td className="px-1.5 py-1.5">
                            <span className={`font-mono ${kpColor(p.avgKillParticipation)}`}>
                              {p.avgKillParticipation.toFixed(0)}%
                            </span>
                          </td>
                        </>
                      )}
                      {statTab === 'combat' && (
                        <>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.avgVisionScore.toFixed(1)}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.firstBloodParticipations}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.firstBloodVictims}</td>
                          <td className="w-px bg-[var(--border)]" />
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.doubleKills}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.tripleKills}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.quadraKills}</td>
                          <td className="px-1.5 py-1.5 font-mono text-(--text-secondary)">{p.pentaKills}</td>
                        </>
                      )}
                    </tr>
                    )
                  })}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={20} className="px-4 py-8 text-center text-(--text-muted)">
                        Aucun joueur trouve. Essayez d&apos;ajuster les filtres.
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

      {/* Early: diff charts (GD@15, CSD@15, XPD@15) — stacked vertically on the right */}
      {statTab === 'early' && !isLoading && earlyCharts.length > 0 && (
        <div className="flex flex-col gap-4 lg:w-[420px] lg:shrink-0">
          {earlyCharts.map((chart) => (
            <div key={chart.metricKey} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
              <div className="py-2 px-3 border-b border-[var(--border)]">
                <h4 className="text-xs font-medium text-(--text-primary)">{chart.title}</h4>
              </div>
              <div className="p-2 h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart.data} margin={{ top: 20, right: 5, left: -15, bottom: 5 }}>
                    <XAxis
                      dataKey="id"
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      height={chart.showLogos ? 55 : 35}
                      tick={(props: { x: number; y: number; payload: { value: string } }) => {
                        const { x, y, payload } = props
                        const entry = chart.data[Number(payload.value)]
                        if (!entry) return <g />
                        const logoSlug = chart.showLogos && entry.teamShortName ? sanitizeSlug(entry.teamShortName) : null
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text
                              x={0}
                              y={4}
                              textAnchor="middle"
                              dominantBaseline="hanging"
                              fill="var(--text-muted)"
                              fontSize={9}
                              fontFamily="var(--font-mono)"
                            >
                              {entry.name}
                            </text>
                            {logoSlug && (
                              <image
                                href={`/images/teams/${logoSlug}.png`}
                                x={-8}
                                y={18}
                                width={16}
                                height={16}
                              />
                            )}
                          </g>
                        )
                      }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: 'var(--text-muted)', fontSize: 9 }}
                    />
                    <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null
                        const point = payload[0]?.payload as { name: string; teamShortName: string; value: number } | undefined
                        if (!point) return null
                        return (
                          <div className="bg-[var(--bg-hover)] border border-[var(--border)] rounded p-2 text-[10px]">
                            <div className="font-medium text-(--text-primary) mb-1">
                              {point.teamShortName ? `${point.teamShortName} ` : ''}{point.name}
                            </div>
                            <div className="text-(--text-muted)">
                              {chart.title}: <span className={`font-mono ${point.value >= 0 ? 'text-green-400' : 'text-red-400'}`}>{point.value > 0 ? '+' : ''}{point.value}</span>
                            </div>
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                      {chart.data.map((entry) => (
                        <Cell
                          key={entry.id}
                          fill={
                            selectedPlayerId !== null && entry.playerId === selectedPlayerId
                              ? 'var(--lol)'
                              : entry.value >= 0 ? 'var(--positive)' : 'var(--negative)'
                          }
                        />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="top"
                        fill="var(--text-secondary)"
                        fontSize={8}
                        fontFamily="var(--font-mono)"
                        formatter={(v: number) => `${v > 0 ? '+' : ''}${v}`}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
      )}
    </div>
  )
}
