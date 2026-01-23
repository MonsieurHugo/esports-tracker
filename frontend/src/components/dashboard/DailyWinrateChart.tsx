'use client'

import { useMemo, memo, useRef } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  ReferenceLine,
  LabelList,
} from 'recharts'
import { useTranslations, useFormatter } from 'next-intl'
import type { TeamGamesData } from './GamesChart'
import { calculateXAxisInterval } from '@/lib/chartUtils'
import { useChartWidth } from '@/hooks/useChartTicks'
import { useChartAnimation } from '@/hooks/useChartAnimation'
import { shouldAggregateByWeek, generateWeekBuckets } from '@/lib/dateUtils'
import type { DashboardPeriod } from '@/lib/types'
import { useChartColors } from '@/stores/themeStore'

interface DailyWinrateChartProps {
  teams: TeamGamesData[]
  isLoading?: boolean
  showLabels?: boolean
  /** Complete date range for the period - ensures all days are displayed */
  dateRange?: { date: string; label: string }[]
  /** Current period - used to hide labels in month view */
  period?: string
  /** View mode - determines empty state message */
  viewMode?: 'teams' | 'players'
}


const FADE_DURATION = 150
const DRAW_DURATION = 500

function DailyWinrateChart({ teams, showLabels = false, dateRange, period, viewMode = 'teams' }: DailyWinrateChartProps) {
  const t = useTranslations()
  const format = useFormatter()
  // Couleurs du thème pour les graphiques
  const { team1, team2, colors: chartColors } = useChartColors()

  // Show labels only if explicitly requested OR single team AND not in month view
  const shouldShowLabels = showLabels || (teams.length === 1 && period !== 'month')

  // Ref for measuring chart width
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartWidth = useChartWidth(chartContainerRef)

  // Determine if using weekly aggregation
  const useWeeklyAggregation = period && shouldAggregateByWeek(period as DashboardPeriod)

  // Calculate the number of data points (weekly buckets for 30d/90d, daily otherwise)
  const dataPointCount = useMemo(() => {
    if (!dateRange || dateRange.length === 0) return 0
    if (useWeeklyAggregation) {
      // Approximate: 30d = 4-5 weeks, 90d = 12-13 weeks
      return Math.ceil(dateRange.length / 7)
    }
    return dateRange.length
  }, [dateRange, useWeeklyAggregation])

  // Calculate X-axis interval - show fewer labels for cleaner display
  const xAxisInterval = useMemo(() => {
    if (showLabels) return 0 // Modal: show all labels
    if (useWeeklyAggregation) {
      // Weekly mode: show ~3-4 labels max (first, middle, last)
      // 30d = ~5 weeks -> interval 1 (show ~3)
      // 90d = ~13 weeks -> interval 3 (show ~4)
      return period === '90d' ? 3 : 1
    }
    return calculateXAxisInterval(dataPointCount, chartWidth, 45)
  }, [showLabels, useWeeklyAggregation, period, dataPointCount, chartWidth])

  // Fusionner les données des équipes en un seul tableau
  const mergedData = useMemo(() => {
    if (teams.length === 0) return []

    // Vérifier si une équipe a des labels dupliqués (cas de la vue année)
    const hasLabelDuplicates = teams.some((team) => {
      const labels = team.data.map((d) => d.label)
      return new Set(labels).size < labels.length
    })

    if (hasLabelDuplicates) {
      // Vue année: calculer le winrate moyen par mois
      const labelMap = new Map<string, { label: string; minDate: string; teamWins: number[]; teamGames: number[] }>()

      teams.forEach((team, teamIndex) => {
        team.data.forEach((d) => {
          if (!labelMap.has(d.label)) {
            labelMap.set(d.label, {
              label: d.label,
              minDate: d.date,
              teamWins: new Array(teams.length).fill(0),
              teamGames: new Array(teams.length).fill(0),
            })
          }
          const entry = labelMap.get(d.label)!
          entry.teamWins[teamIndex] = (entry.teamWins[teamIndex] || 0) + (d.wins || 0)
          entry.teamGames[teamIndex] = (entry.teamGames[teamIndex] || 0) + (d.games || 0)
          if (d.date < entry.minDate) entry.minDate = d.date
        })
      })

      // Pour la vue année, utiliser dateRange si fourni (12 mois)
      const baseLabels = dateRange && dateRange.length > 0
        ? dateRange.map(d => {
            const existing = labelMap.get(d.label)
            return {
              label: d.label,
              minDate: d.date,
              teamWins: existing?.teamWins || new Array(teams.length).fill(0),
              teamGames: existing?.teamGames || new Array(teams.length).fill(0),
            }
          })
        : Array.from(labelMap.values()).sort((a, b) => a.minDate.localeCompare(b.minDate))

      return baseLabels.map(({ label, minDate, teamWins, teamGames }) => {
        const result: Record<string, string | number | null> = { label, date: minDate }
        teamGames.forEach((games, index) => {
          const wins = teamWins[index]
          // null si pas de parties (crée des trous dans le graphique)
          result[`team${index}Winrate`] = games > 0 ? Math.round((wins / games) * 100) : null
          result[`team${index}Games`] = games
        })
        return result
      })
    }

    // Weekly aggregation for 30d and 90d periods
    if (useWeeklyAggregation && dateRange && dateRange.length > 0) {
      const startDate = dateRange[0].date
      const endDate = dateRange[dateRange.length - 1].date
      const weekBuckets = generateWeekBuckets(startDate, endDate)

      // Create winrate data index by date for each team
      const teamDataByDate: Map<number, Map<string, { games: number; wins: number }>> = new Map()
      teams.forEach((team, teamIndex) => {
        const dateMap = new Map<string, { games: number; wins: number }>()
        team.data.forEach(d => {
          dateMap.set(d.date, { games: d.games || 0, wins: d.wins || 0 })
        })
        teamDataByDate.set(teamIndex, dateMap)
      })

      return weekBuckets.map(bucket => {
        const result: Record<string, string | number | null | boolean> = {
          label: bucket.label,
          rangeLabel: bucket.rangeLabel,
          date: bucket.startDate,
          weekKey: bucket.weekKey,
          isPartial: bucket.isPartial,
          dayCount: bucket.dayCount,
        }

        teams.forEach((_, teamIndex) => {
          const dateMap = teamDataByDate.get(teamIndex)!

          // Sum all games and wins in this week
          let totalGames = 0
          let totalWins = 0
          const bucketStart = new Date(bucket.startDate + 'T00:00:00')
          const bucketEnd = new Date(bucket.endDate + 'T00:00:00')

          for (let d = new Date(bucketStart); d <= bucketEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0]
            const data = dateMap.get(dateStr)
            if (data) {
              totalGames += data.games
              totalWins += data.wins
            }
          }

          // Calculate winrate from totals (not average of daily winrates)
          const winrate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : null
          result[`team${teamIndex}Winrate`] = winrate
          result[`team${teamIndex}Games`] = totalGames
          result[`team${teamIndex}Wins`] = totalWins
        })

        return result
      })
    }

    // Vue jour/semaine/mois: utiliser dateRange comme base si fourni
    const baseDates = dateRange && dateRange.length > 0
      ? dateRange.map(d => ({ date: d.date, label: d.label }))
      : (() => {
          const dateMap = new Map<string, { date: string; label: string }>()
          teams.forEach((team) => {
            team.data.forEach((d) => {
              if (!dateMap.has(d.date)) {
                dateMap.set(d.date, { date: d.date, label: d.label })
              }
            })
          })
          return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))
        })()

    // Créer un index rapide des données par date et équipe
    const dataIndex = new Map<string, Map<number, { games: number; wins: number; winrate: number }>>()
    teams.forEach((team, teamIndex) => {
      team.data.forEach((d) => {
        if (!dataIndex.has(d.date)) {
          dataIndex.set(d.date, new Map())
        }
        dataIndex.get(d.date)!.set(teamIndex, { games: d.games, wins: d.wins, winrate: d.winrate })
      })
    })

    return baseDates.map(({ date, label }) => {
      const result: Record<string, string | number | null> = { label, date }

      teams.forEach((_, index) => {
        const data = dataIndex.get(date)?.get(index)
        const games = data?.games ?? 0
        // null si pas de parties (crée des trous dans le graphique)
        result[`team${index}Winrate`] = games > 0 ? (data?.winrate ?? null) : null
        result[`team${index}Games`] = games
      })

      return result
    })
  }, [teams, dateRange, useWeeklyAggregation])

  // Animation for smooth data transitions
  const { opacity, displayData: displayedData, animationKey } = useChartAnimation(mergedData, {
    fadeDuration: FADE_DURATION,
  })

  // Show chart if teams are selected AND have actual data
  const hasData = teams.length > 0 && teams.some((t) => t.data.length > 0)

  // Ticks fixes pour le winrate (0 à 100)
  const yAxisTicks = [0, 25, 50, 75, 100]

  if (!hasData) {
    return (
      <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-(--border) text-[11px] font-semibold text-(--text-secondary)">
          {t('charts.winratePerDay')}
        </div>
        <div className="p-3 h-[180px] flex items-center justify-center">
          <div className="text-(--text-muted) text-sm">
            {viewMode === 'players' ? t('charts.selectPlayer') : t('charts.selectTeam')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-(--border) flex items-center gap-3">
        <span className="text-[11px] font-semibold text-(--text-secondary) shrink-0">
          {useWeeklyAggregation ? t('charts.winratePerWeek') : t('charts.winratePerDay')}
        </span>
        {/* Légende des équipes */}
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          {teams.map((team, index) => (
            <div key={team.teamName} className="flex items-center gap-1 min-w-0">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: chartColors[index] || chartColors[0] }}
              />
              <span className="text-[9px] text-(--text-muted) truncate max-w-[80px]">
                {team.teamName}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div ref={chartContainerRef} className="p-3 h-[180px] relative">
        {/* Background watermark */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none">
          <span className="text-[56px] font-black text-(--text-muted) opacity-[0.07] tracking-wider">
            WR%
          </span>
        </div>
        <div
          style={{
            opacity,
            transition: `opacity ${FADE_DURATION}ms ease-out`,
            width: '100%',
            height: '100%',
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={displayedData} margin={{ top: 15, right: 5, left: -20, bottom: 0 }}>
              {/* Dégradés pour les areas */}
              <defs>
                <linearGradient id="wrGradient0" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={team1} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={team1} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="wrGradient1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={team2} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={team2} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="wrGradientGray" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="var(--text-muted)" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="var(--text-muted)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                padding={{ left: 10, right: 10 }}
                interval={xAxisInterval}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                domain={[0, 100]}
                allowDecimals={false}
                ticks={yAxisTicks}
                tickFormatter={(value) => `${value}%`}
              />
              <ReferenceLine y={50} stroke="var(--border)" strokeDasharray="3 3" />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null

                  // Get week info from payload if available
                  const dataPoint = payload[0]?.payload as Record<string, unknown> | undefined
                  const isWeekly = dataPoint?.weekKey !== undefined
                  const isPartialWeek = dataPoint?.isPartial === true
                  const dayCount = dataPoint?.dayCount as number | undefined
                  const weekRangeLabel = dataPoint?.rangeLabel as string | undefined
                  const dateStr = dataPoint?.date as string | undefined

                  // Format date for display
                  const formattedDate = dateStr && !isWeekly
                    ? format.dateTime(new Date(dateStr + 'T00:00:00'), {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : null

                  const seenIndices = new Set<number>()
                  const teamValues = payload
                    .filter(p => typeof p.dataKey === 'string' && (p.dataKey as string).endsWith('Winrate'))
                    .map(p => {
                      const index = parseInt((p.dataKey as string).replace('team', '').replace('Winrate', ''), 10)
                      const value = p.value as number | null
                      const games = dataPoint?.[`team${index}Games`] as number | undefined
                      return {
                        index,
                        shortName: teams[index]?.shortName || teams[index]?.teamName || `${t('dashboard.team')} ${index + 1}`,
                        value,
                        games,
                        color: chartColors[index] || chartColors[0],
                      }
                    })
                    .filter(tv => {
                      // Filtrer les valeurs null (pas de parties)
                      if (tv.value === null) return false
                      if (seenIndices.has(tv.index)) return false
                      seenIndices.add(tv.index)
                      return true
                    })

                  // Ne pas afficher le tooltip si aucune équipe n'a joué ce jour/semaine
                  if (teamValues.length === 0) return null

                  return (
                    <div className="bg-(--bg-hover) border border-(--border) rounded p-2">
                      {isWeekly && weekRangeLabel && (
                        <div className="text-[9px] text-(--text-muted) mb-1 border-b border-(--border) pb-1">
                          {weekRangeLabel}
                          {isPartialWeek && dayCount && (
                            <span className="ml-1">({dayCount}j)</span>
                          )}
                        </div>
                      )}
                      {!isWeekly && formattedDate && (
                        <div className="text-[9px] text-(--text-muted) mb-1 border-b border-(--border) pb-1">
                          {formattedDate}
                        </div>
                      )}
                      {teamValues.map((tv, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: tv.color }}
                          />
                          <span className="text-[10px]">
                            {tv.shortName}: <span className="font-mono">{tv.value}%</span>
                            {isWeekly && tv.games !== undefined && (
                              <span className="text-(--text-muted) ml-1">({tv.games} games)</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                }}
              />
              {/* Gray areas for winrate below 50% */}
              {teams.map((_, index) => (
                <Area
                  key={`below50-${index}-${animationKey}`}
                  type="monotone"
                  dataKey={`team${index}Winrate`}
                  baseValue={50}
                  stroke="none"
                  fill="url(#wrGradientGray)"
                  fillOpacity={1}
                  dot={false}
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={true}
                  animationDuration={DRAW_DURATION}
                  animationEasing="ease-out"
                />
              ))}
              {teams.map((team, index) => (
                <Area
                  key={`${team.teamName}-${animationKey}`}
                  type="monotone"
                  dataKey={`team${index}Winrate`}
                  stroke={chartColors[index]}
                  strokeWidth={2.5}
                  fill={`url(#wrGradient${index})`}
                  fillOpacity={1}
                  dot={{ fill: chartColors[index], strokeWidth: 2, stroke: 'var(--bg-card)', r: 3 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  connectNulls={false}
                  isAnimationActive={true}
                  animationDuration={DRAW_DURATION}
                  animationEasing="ease-out"
                >
                  {shouldShowLabels && (
                    <LabelList
                      dataKey={`team${index}Winrate`}
                      position="top"
                      fill="var(--text-secondary)"
                      fontSize={9}
                      formatter={((value: number | null) => (value !== null ? `${Math.round(value)}%` : '')) as (value: unknown) => string}
                    />
                  )}
                </Area>
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default memo(DailyWinrateChart)
