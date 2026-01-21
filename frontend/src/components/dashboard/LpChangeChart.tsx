'use client'

import { useMemo, memo, useRef } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  ComposedChart,
  Cell,
  ReferenceLine,
  LabelList,
} from 'recharts'
import type { TeamLpData } from './LpChart'
import { calculateXAxisInterval } from '@/lib/chartUtils'
import { useChartWidth, useBarLabelFontSize } from '@/hooks/useChartTicks'
import { useChartAnimation } from '@/hooks/useChartAnimation'
import { shouldAggregateByWeek, generateWeekBuckets } from '@/lib/dateUtils'
import type { DashboardPeriod } from '@/lib/types'
import { useChartColors } from '@/stores/themeStore'

interface LpChangeChartProps {
  teams: TeamLpData[]
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

function LpChangeChart({ teams, showLabels = false, dateRange, period, viewMode = 'teams' }: LpChangeChartProps) {
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

  // Calculer les changements de LP par jour
  const mergedData = useMemo(() => {
    if (teams.length === 0) return []

    // Vérifier si une équipe a des labels dupliqués (cas de la vue année)
    const hasLabelDuplicates = teams.some((team) => {
      const labels = team.data.map((d) => d.label)
      return new Set(labels).size < labels.length
    })

    if (hasLabelDuplicates) {
      // Vue année: calculer le changement mensuel
      const labelMap = new Map<string, { label: string; minDate: string; maxDate: string; teamFirstLp: number[]; teamLastLp: number[] }>()

      teams.forEach((team, teamIndex) => {
        team.data.forEach((d) => {
          if (!labelMap.has(d.label)) {
            labelMap.set(d.label, {
              label: d.label,
              minDate: d.date,
              maxDate: d.date,
              teamFirstLp: new Array(teams.length).fill(0),
              teamLastLp: new Array(teams.length).fill(0),
            })
          }
          const entry = labelMap.get(d.label)!

          // Garder le premier et dernier LP du mois
          if (d.date <= entry.minDate) {
            entry.teamFirstLp[teamIndex] = d.totalLp || 0
            entry.minDate = d.date
          }
          if (d.date >= entry.maxDate) {
            entry.teamLastLp[teamIndex] = d.totalLp || 0
            entry.maxDate = d.date
          }
        })
      })

      // Pour la vue année, utiliser dateRange si fourni (12 mois)
      const baseLabels = dateRange && dateRange.length > 0
        ? dateRange.map(d => {
            const existing = labelMap.get(d.label)
            return {
              label: d.label,
              minDate: d.date,
              teamFirstLp: existing?.teamFirstLp || new Array(teams.length).fill(0),
              teamLastLp: existing?.teamLastLp || new Array(teams.length).fill(0),
            }
          })
        : Array.from(labelMap.values()).sort((a, b) => a.minDate.localeCompare(b.minDate))

      return baseLabels.map(({ label, minDate, teamFirstLp, teamLastLp }) => {
        const result: Record<string, string | number> = { label, date: minDate }
        teamLastLp.forEach((lastLp, index) => {
          const firstLp = teamFirstLp[index]
          result[`team${index}Change`] = lastLp - firstLp
        })
        return result
      })
    }

    // Weekly aggregation for 30d and 90d periods
    if (useWeeklyAggregation && dateRange && dateRange.length > 0) {
      const startDate = dateRange[0].date
      const endDate = dateRange[dateRange.length - 1].date
      const weekBuckets = generateWeekBuckets(startDate, endDate)

      // Create LP data index by date for each team
      const teamDataByDate: Map<number, Map<string, number>> = new Map()
      teams.forEach((team, teamIndex) => {
        const dateMap = new Map<string, number>()
        team.data.forEach(d => {
          if (d.totalLp !== undefined && d.totalLp !== null) {
            dateMap.set(d.date, d.totalLp)
          }
        })
        teamDataByDate.set(teamIndex, dateMap)
      })

      // Track last known LP for calculating change from previous week
      const lastWeekEndLp: number[] = new Array(teams.length).fill(0)

      return weekBuckets.map((bucket, bucketIndex) => {
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

          // Find the first and last LP values in this week
          let firstLp: number | null = null
          let lastLp: number | null = null
          const bucketStart = new Date(bucket.startDate + 'T00:00:00')
          const bucketEnd = new Date(bucket.endDate + 'T00:00:00')

          for (let d = new Date(bucketStart); d <= bucketEnd; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0]
            const lp = dateMap.get(dateStr)
            if (lp !== undefined) {
              if (firstLp === null) firstLp = lp
              lastLp = lp
            }
          }

          // Calculate change: difference between last LP of this week and last LP of previous week
          let change = 0
          if (lastLp !== null) {
            if (bucketIndex === 0) {
              // First week: change is difference within the week (or 0 if only one value)
              change = firstLp !== null ? lastLp - firstLp : 0
            } else {
              // Subsequent weeks: change from previous week's end
              change = lastLp - lastWeekEndLp[teamIndex]
            }
            lastWeekEndLp[teamIndex] = lastLp
          }

          result[`team${teamIndex}Change`] = change
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
    const dataIndex = new Map<string, Map<number, number>>()
    teams.forEach((team, teamIndex) => {
      team.data.forEach((d) => {
        if (!dataIndex.has(d.date)) {
          dataIndex.set(d.date, new Map())
        }
        if (d.totalLp !== undefined) {
          dataIndex.get(d.date)!.set(teamIndex, d.totalLp)
        }
      })
    })

    const lastKnownLp: number[] = new Array(teams.length).fill(0)

    return baseDates.map(({ date, label }, dateIndex) => {
      const result: Record<string, string | number> = { label, date }
      const dateData = dataIndex.get(date)

      teams.forEach((_, teamIndex) => {
        const currentLp = dateData?.get(teamIndex)

        // Si pas de données pour ce jour, changement = 0
        if (currentLp === undefined) {
          result[`team${teamIndex}Change`] = 0
        } else if (dateIndex === 0) {
          // Premier jour: pas de changement calculable
          result[`team${teamIndex}Change`] = 0
          lastKnownLp[teamIndex] = currentLp
        } else {
          // Le changement est la différence avec le dernier LP connu
          result[`team${teamIndex}Change`] = currentLp - lastKnownLp[teamIndex]
          lastKnownLp[teamIndex] = currentLp
        }
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

  // Calculer les ticks de l'axe Y
  const yAxisTicks = useMemo(() => {
    if (displayedData.length === 0) return [-200, -100, 0, 100, 200]

    let minValue = 0
    let maxValue = 0
    displayedData.forEach((d) => {
      teams.forEach((_, index) => {
        const val = d[`team${index}Change`] as number
        if (val > maxValue) maxValue = val
        if (val < minValue) minValue = val
      })
    })

    // S'assurer que 0 est toujours inclus
    const absMax = Math.max(Math.abs(minValue), Math.abs(maxValue), 50)

    // Calculer un intervalle "joli"
    const targetTickCount = 4
    const rawInterval = absMax / targetTickCount
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)))
    const normalized = rawInterval / magnitude

    let niceInterval: number
    if (normalized <= 1) niceInterval = magnitude
    else if (normalized <= 2) niceInterval = 2 * magnitude
    else if (normalized <= 5) niceInterval = 5 * magnitude
    else niceInterval = 10 * magnitude

    const ticks: number[] = []
    const niceMax = Math.ceil(absMax / niceInterval) * niceInterval

    for (let i = -niceMax; i <= niceMax; i += niceInterval) {
      ticks.push(i)
    }

    return ticks
  }, [displayedData, teams])

  if (!hasData) {
    return (
      <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-(--border) text-[11px] font-semibold text-(--text-secondary)">
          LP +/- par {useWeeklyAggregation ? 'semaine' : 'jour'}
        </div>
        <div className="p-3 h-[180px] flex items-center justify-center">
          <div className="text-(--text-muted) text-sm">
            {viewMode === 'players' ? 'Sélectionnez un joueur' : 'Sélectionnez une équipe'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-(--border) flex items-center gap-3">
        <span className="text-[11px] font-semibold text-(--text-secondary) shrink-0">
          LP +/- par {useWeeklyAggregation ? 'semaine' : 'jour'}
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
            +/-
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
            <ComposedChart data={displayedData} margin={{ top: 15, right: 5, left: -20, bottom: 0 }} barCategoryGap="5%" barGap={2}>
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
                domain={[yAxisTicks[0], yAxisTicks[yAxisTicks.length - 1]]}
                allowDecimals={false}
                ticks={yAxisTicks}
                tickFormatter={(value) => (value > 0 ? `+${value}` : value.toString())}
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
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

                  // Format date for display (e.g., "15 janvier 2024")
                  const formattedDate = dateStr && !isWeekly
                    ? new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : null

                  const teamValues = payload
                    .filter(p => typeof p.dataKey === 'string' && (p.dataKey as string).endsWith('Change'))
                    .map(p => {
                      const index = parseInt((p.dataKey as string).replace('team', '').replace('Change', ''), 10)
                      const value = p.value as number
                      return {
                        shortName: teams[index]?.shortName || teams[index]?.teamName || `Équipe ${index + 1}`,
                        value,
                        color: chartColors[index] || 'var(--accent)',
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
                            {tv.shortName}: <span className="font-mono">{tv.value > 0 ? '+' : ''}{tv.value} LP</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                }}
              />
              {teams.map((team, teamIndex) => (
                <Bar
                  key={`${team.teamName}-${animationKey}`}
                  dataKey={`team${teamIndex}Change`}
                  isAnimationActive={true}
                  animationDuration={DRAW_DURATION}
                  animationEasing="ease-out"
                  radius={[2, 2, 0, 0]}
                >
                  {shouldShowLabels && (
                    <LabelList
                      dataKey={`team${teamIndex}Change`}
                      position="top"
                      fill="var(--text-secondary)"
                      fontSize={barLabelFontSize}
                      formatter={((value: number) => {
                        if (value === 0) return ''
                        return value > 0 ? `+${value}` : String(value)
                      }) as (value: unknown) => string}
                    />
                  )}
                  {displayedData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={chartColors[teamIndex] || chartColors[0]}
                      fillOpacity={teamIndex === 0 ? 0.9 : 0.7}
                    />
                  ))}
                </Bar>
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default memo(LpChangeChart)
