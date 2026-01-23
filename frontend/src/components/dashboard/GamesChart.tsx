'use client'

import { useMemo, memo, useRef } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  BarChart,
  LabelList,
} from 'recharts'
import { useTranslations, useFormatter } from 'next-intl'
import type { GamesPerDayData, DashboardPeriod } from '@/lib/types'
import { calculateXAxisInterval } from '@/lib/chartUtils'
import { useChartWidth, useBarLabelFontSize } from '@/hooks/useChartTicks'
import { useChartAnimation } from '@/hooks/useChartAnimation'
import { shouldAggregateByWeek, generateWeekBuckets } from '@/lib/dateUtils'
import { useChartColors } from '@/stores/themeStore'

export interface TeamGamesData {
  teamName: string
  shortName?: string
  data: GamesPerDayData[]
}

interface GamesChartProps {
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

function GamesChart({ teams, showLabels = false, dateRange, period, viewMode = 'teams' }: GamesChartProps) {
  const t = useTranslations()
  const format = useFormatter()
  // Couleurs du thème pour les graphiques
  const { colors: chartColors } = useChartColors()

  // Ref for measuring chart width
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartWidth = useChartWidth(chartContainerRef)

  // Determine if using weekly aggregation
  const useWeeklyAggregation = period && shouldAggregateByWeek(period as DashboardPeriod)

  // Calculate the number of data points (weekly buckets for 30d/90d, daily otherwise)
  const dataPointCount = useMemo(() => {
    if (!dateRange || dateRange.length === 0) return 0
    if (useWeeklyAggregation) {
      return Math.ceil(dateRange.length / 7)
    }
    return dateRange.length
  }, [dateRange, useWeeklyAggregation])

  // Calculate bar label font size based on bar width
  const { fontSize: barLabelFontSize, shouldShowLabels: canShowLabels } = useBarLabelFontSize(
    chartContainerRef,
    dataPointCount,
    teams.length,
    5, // barCategoryGap %
    2  // barGap px
  )

  // Show labels only if explicitly requested OR single team AND not in month view, AND bars are wide enough
  const shouldShowLabels = (showLabels || (teams.length === 1 && period !== 'month')) && canShowLabels

  // Calculate X-axis interval - show fewer labels for cleaner display
  const xAxisInterval = useMemo(() => {
    if (showLabels) return 0
    if (useWeeklyAggregation) {
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
      // Vue année: agréger par label (mois) avec wins pour le winrate
      const labelMap = new Map<string, { label: string; minDate: string; teamGames: number[]; teamWins: number[] }>()

      teams.forEach((team, teamIndex) => {
        team.data.forEach((d) => {
          if (!labelMap.has(d.label)) {
            labelMap.set(d.label, {
              label: d.label,
              minDate: d.date,
              teamGames: new Array(teams.length).fill(0),
              teamWins: new Array(teams.length).fill(0),
            })
          }
          const entry = labelMap.get(d.label)!
          entry.teamGames[teamIndex] = (entry.teamGames[teamIndex] || 0) + (d.games || 0)
          entry.teamWins[teamIndex] = (entry.teamWins[teamIndex] || 0) + (d.wins || 0)
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
              teamGames: existing?.teamGames || new Array(teams.length).fill(0),
              teamWins: existing?.teamWins || new Array(teams.length).fill(0),
            }
          })
        : Array.from(labelMap.values()).sort((a, b) => a.minDate.localeCompare(b.minDate))

      return baseLabels.map(({ label, minDate, teamGames, teamWins }) => {
        const result: Record<string, string | number> = { label, date: minDate }
        teamGames.forEach((games, index) => {
          result[`team${index}Games`] = games || 0
          result[`team${index}Winrate`] = games > 0 ? Math.round((teamWins[index] / games) * 100) : 0
        })
        return result
      })
    }

    // Weekly aggregation for 30d and 90d periods
    if (useWeeklyAggregation && dateRange && dateRange.length > 0) {
      const startDate = dateRange[0].date
      const endDate = dateRange[dateRange.length - 1].date
      const weekBuckets = generateWeekBuckets(startDate, endDate)

      // Create games data index by date for each team
      const teamDataByDate: Map<number, Map<string, { games: number; wins: number }>> = new Map()
      teams.forEach((team, teamIndex) => {
        const dateMap = new Map<string, { games: number; wins: number }>()
        team.data.forEach(d => {
          dateMap.set(d.date, { games: d.games || 0, wins: d.wins || 0 })
        })
        teamDataByDate.set(teamIndex, dateMap)
      })

      return weekBuckets.map(bucket => {
        const result: Record<string, string | number | boolean> = {
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

          result[`team${teamIndex}Games`] = totalGames
          result[`team${teamIndex}Winrate`] = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0
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
      const result: Record<string, string | number> = { label, date }
      const dateData = dataIndex.get(date)

      teams.forEach((_, index) => {
        const data = dateData?.get(index)
        result[`team${index}Games`] = data?.games ?? 0
        result[`team${index}Winrate`] = data?.winrate ?? 0
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

  // Calculer les ticks de l'axe Y pour avoir des valeurs régulières
  const yAxisTicks = useMemo(() => {
    if (displayedData.length === 0) return [0, 5, 10, 15, 20]

    // Trouver le max des données
    let maxValue = 0
    displayedData.forEach((d) => {
      teams.forEach((_, index) => {
        const val = d[`team${index}Games`] as number
        if (val > maxValue) maxValue = val
      })
    })

    if (maxValue <= 0) return [0, 5, 10, 15, 20]

    // Calculer un intervalle "joli" (1, 2, 5, 10, 20, 50, etc.)
    const targetTickCount = 5
    const rawInterval = maxValue / targetTickCount
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)))
    const normalized = rawInterval / magnitude

    let niceInterval: number
    if (normalized <= 1) niceInterval = magnitude
    else if (normalized <= 2) niceInterval = 2 * magnitude
    else if (normalized <= 5) niceInterval = 5 * magnitude
    else niceInterval = 10 * magnitude

    // Générer les ticks
    const ticks: number[] = []
    for (let i = 0; i <= Math.ceil(maxValue / niceInterval); i++) {
      ticks.push(i * niceInterval)
    }

    return ticks
  }, [displayedData, teams])

  if (!hasData) {
    return (
      <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-(--border) text-[11px] font-semibold text-(--text-secondary)">
          {useWeeklyAggregation ? t('charts.gamesPerWeek') : t('charts.gamesPerDay')}
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
          {useWeeklyAggregation ? t('charts.gamesPerWeek') : t('charts.gamesPerDay')}
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
            GAMES
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
            <BarChart data={displayedData} margin={{ top: 15, right: 5, left: -20, bottom: 0 }} barCategoryGap="5%" barGap={2}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                interval={xAxisInterval}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                domain={[0, yAxisTicks[yAxisTicks.length - 1]]}
                allowDecimals={false}
                ticks={yAxisTicks}
              />
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

                  const teamValues = payload
                    .filter(p => typeof p.dataKey === 'string' && (p.dataKey as string).endsWith('Games'))
                    .map(p => {
                      const index = parseInt((p.dataKey as string).replace('team', '').replace('Games', ''), 10)
                      const value = p.value as number
                      return {
                        shortName: teams[index]?.shortName || teams[index]?.teamName || `${t('dashboard.team')} ${index + 1}`,
                        value,
                        color: chartColors[index] || chartColors[0],
                      }
                    })

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
                            {tv.shortName}: <span className="font-mono">{tv.value} games</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                }}
              />
              {teams.map((team, index) => (
                <Bar
                  key={`${team.teamName}-${animationKey}`}
                  dataKey={`team${index}Games`}
                  fill={chartColors[index]}
                  fillOpacity={index === 0 ? 0.9 : 0.7}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={DRAW_DURATION}
                  animationEasing="ease-out"
                >
                  {shouldShowLabels && (
                    <LabelList
                      dataKey={`team${index}Games`}
                      position="top"
                      fill="var(--text-secondary)"
                      fontSize={barLabelFontSize}
                      formatter={((value: number) => (value > 0 ? value : '')) as (value: unknown) => string}
                    />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default memo(GamesChart)
