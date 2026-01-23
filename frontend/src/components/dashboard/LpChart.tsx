'use client'

import { useMemo, memo, useRef } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  LabelList,
} from 'recharts'
import { useTranslations, useLocale, useFormatter } from 'next-intl'
import { getTodayString, shouldAggregateByWeek, generateWeekBuckets } from '@/lib/dateUtils'
import type { DashboardPeriod } from '@/lib/types'
import { calculateXAxisInterval } from '@/lib/chartUtils'
import { useChartWidth } from '@/hooks/useChartTicks'
import { useChartAnimation } from '@/hooks/useChartAnimation'
import { useChartColors } from '@/stores/themeStore'

export interface LpHistoryData {
  date: string
  label: string
  totalLp: number
}

export interface TeamLpData {
  teamName: string
  shortName?: string
  data: LpHistoryData[]
}

interface LpChartProps {
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

// Formatter pour les valeurs LP - harmonisé selon le max
const createLpFormatter = (maxValue: number) => {
  return (value: number): string => {
    if (maxValue >= 1000) {
      // Tout en "k" avec une décimale pour cohérence
      return `${(value / 1000).toFixed(1)}k`
    }
    return value.toString()
  }
}

function LpChart({ teams, showLabels = false, dateRange, period, viewMode = 'teams' }: LpChartProps) {
  const t = useTranslations()
  const locale = useLocale()
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

    // Check if weekly aggregation should be used (30d, 90d periods)
    const useWeeklyAggregation = period && shouldAggregateByWeek(period as DashboardPeriod)

    // Vérifier si une équipe a des labels dupliqués (cas de la vue année)
    const hasLabelDuplicates = teams.some((team) => {
      const labels = team.data.map((d) => d.label)
      return new Set(labels).size < labels.length
    })

    if (hasLabelDuplicates) {
      // Vue année: prendre le max LP par label (mois)
      const labelMap = new Map<string, { label: string; minDate: string; maxDate: string; teamLps: number[] }>()

      teams.forEach((team, teamIndex) => {
        team.data.forEach((d) => {
          if (!labelMap.has(d.label)) {
            labelMap.set(d.label, { label: d.label, minDate: d.date, maxDate: d.date, teamLps: new Array(teams.length).fill(0) })
          }
          const entry = labelMap.get(d.label)!
          // Pour LP, on prend la valeur la plus récente du mois
          if (d.date >= entry.maxDate) {
            entry.teamLps[teamIndex] = d.totalLp || 0
            entry.maxDate = d.date
          }
          if (d.date < entry.minDate) entry.minDate = d.date
        })
      })

      // Pour la vue année, utiliser dateRange si fourni (12 mois)
      const baseLabels = dateRange && dateRange.length > 0
        ? dateRange.map(d => ({ label: d.label, minDate: d.date, teamLps: labelMap.get(d.label)?.teamLps || new Array(teams.length).fill(0) }))
        : Array.from(labelMap.values()).sort((a, b) => a.minDate.localeCompare(b.minDate))

      const today = getTodayString()

      return baseLabels.map(({ label, minDate, teamLps }) => {
        const result: Record<string, string | number | null> = { label, date: minDate }
        const isFuture = minDate > today
        teamLps.forEach((lp, index) => {
          result[`team${index}Lp`] = isFuture ? null : lp
        })
        return result
      })
    }

    // Weekly aggregation for 30d and 90d periods
    if (useWeeklyAggregation && dateRange && dateRange.length > 0) {
      const startDate = dateRange[0].date
      const endDate = dateRange[dateRange.length - 1].date
      const weekBuckets = generateWeekBuckets(startDate, endDate)
      const today = getTodayString()

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

      // Track last known LP for each team (for propagation)
      const lastKnownLp: number[] = new Array(teams.length).fill(0)

      return weekBuckets.map(bucket => {
        const result: Record<string, string | number | boolean | null> = {
          label: bucket.label,
          rangeLabel: bucket.rangeLabel,
          date: bucket.startDate,
          weekKey: bucket.weekKey,
          isPartial: bucket.isPartial,
          dayCount: bucket.dayCount,
        }

        const isFuture = bucket.startDate > today

        teams.forEach((_, teamIndex) => {
          const dateMap = teamDataByDate.get(teamIndex)!

          // Find the last LP value in this week (end-of-week snapshot)
          let weekLp: number | null = null
          const bucketStart = new Date(bucket.startDate + 'T00:00:00')
          const bucketEnd = new Date(bucket.endDate + 'T00:00:00')

          for (let d = new Date(bucketEnd); d >= bucketStart; d.setDate(d.getDate() - 1)) {
            const dateStr = d.toISOString().split('T')[0]
            const lp = dateMap.get(dateStr)
            if (lp !== undefined) {
              weekLp = lp
              break
            }
          }

          // Use last known LP if no data for this week (propagate forward)
          if (weekLp === null && lastKnownLp[teamIndex] > 0) {
            weekLp = lastKnownLp[teamIndex]
          }

          // Update last known LP for next iteration
          if (weekLp !== null && weekLp > 0) {
            lastKnownLp[teamIndex] = weekLp
          }

          result[`team${teamIndex}Lp`] = isFuture ? null : (weekLp ?? 0)
        })

        return result
      })
    }

    // Vue jour/semaine/mois: utiliser dateRange comme base si fourni
    // Cela garantit que tous les jours de la période sont affichés
    const baseDates = dateRange && dateRange.length > 0
      ? dateRange.map(d => ({ date: d.date, label: d.label }))
      : (() => {
          // Fallback: construire à partir des données existantes
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

    const today = getTodayString()

    return baseDates.map(({ date, label }) => {
      const result: Record<string, string | number | null> = { label, date }
      const dateData = dataIndex.get(date)
      const isFuture = date > today

      teams.forEach((_, index) => {
        const lp = dateData?.get(index)
        // Null pour les dates futures, sinon la valeur ou 0
        result[`team${index}Lp`] = isFuture ? null : (lp ?? 0)
      })

      return result
    })
  }, [teams, dateRange, period])

  const { maxLp, padding } = useMemo(() => {
    if (teams.length === 0) return { maxLp: 100, padding: 50 }

    const allValues = teams.flatMap((t) => t.data.map((d) => d.totalLp)).filter((v) => v !== undefined)

    if (allValues.length === 0) return { maxLp: 100, padding: 50 }

    const max = Math.max(...allValues)
    const pad = Math.max(max * 0.1, 50)
    return { maxLp: max, padding: pad }
  }, [teams])

  // Calculate Y-axis bounds from stable team data (not animated displayedData)
  // This prevents unnecessary recalculations during chart animations
  const { minLpValue, maxLpValue } = useMemo(() => {
    if (teams.length === 0) return { minLpValue: 0, maxLpValue: 100 }

    let min = Infinity
    let max = -Infinity

    teams.forEach((team) => {
      team.data.forEach((d) => {
        if (d.totalLp !== undefined && d.totalLp !== null) {
          if (d.totalLp > max) max = d.totalLp
          if (d.totalLp < min && d.totalLp > 0) min = d.totalLp
        }
      })
    })

    if (max <= 0) return { minLpValue: 0, maxLpValue: 100 }
    if (min === Infinity) min = 0

    return { minLpValue: min, maxLpValue: max }
  }, [teams])

  // Animation for smooth data transitions
  const { opacity, displayData: displayedData, animationKey } = useChartAnimation(mergedData, {
    fadeDuration: FADE_DURATION,
  })

  // Show chart if teams are selected AND have actual data
  const hasData = teams.length > 0 && teams.some((t) => t.data.length > 0)

  // Calculer les ticks de l'axe Y avec adaptation dynamique
  // Uses stable minLpValue/maxLpValue to prevent re-renders during animations
  const yAxisTicks = useMemo(() => {
    const DEFAULT_TICKS = [0, 1000, 2000, 3000, 4000, 5000]

    if (maxLpValue <= 0 || !isFinite(minLpValue)) return DEFAULT_TICKS

    // Ajouter du padding en haut (10% de la valeur max, minimum 50 LP)
    const calculatedPadding = Math.max(maxLpValue * 0.1, padding, 50)
    const paddedMax = maxLpValue + calculatedPadding
    const paddedMin = 0 // Toujours commencer à 0

    // Calculer la range et déterminer le nombre de ticks cible
    const range = paddedMax - paddedMin

    // Nombre de ticks adaptatif selon la range
    let targetTickCount: number
    if (range < 500) {
      targetTickCount = 5
    } else if (range < 1000) {
      targetTickCount = 6
    } else if (range < 8000) {
      targetTickCount = 5
    } else {
      targetTickCount = 4
    }

    // Intervalles LP-friendly (base 10 régulière)
    const LP_INTERVALS = [100, 200, 500, 1000, 2000, 5000, 10000]

    // Calculer l'intervalle idéal
    const idealInterval = range / targetTickCount

    // Trouver le meilleur intervalle LP-friendly
    let selectedInterval = LP_INTERVALS[LP_INTERVALS.length - 1]
    for (const interval of LP_INTERVALS) {
      if (interval >= idealInterval) {
        selectedInterval = interval
        break
      }
    }

    // Vérifier que le nombre de ticks est dans la plage acceptable (3-8)
    let tickCount = Math.ceil(range / selectedInterval) + 1

    // Si trop de ticks, utiliser l'intervalle supérieur
    if (tickCount > 8) {
      const currentIndex = LP_INTERVALS.indexOf(selectedInterval)
      if (currentIndex < LP_INTERVALS.length - 1) {
        selectedInterval = LP_INTERVALS[currentIndex + 1]
      }
    }

    // Si trop peu de ticks, utiliser l'intervalle inférieur
    if (tickCount < 3) {
      const currentIndex = LP_INTERVALS.indexOf(selectedInterval)
      if (currentIndex > 0) {
        selectedInterval = LP_INTERVALS[currentIndex - 1]
      }
    }

    // Arrondir le min vers le bas et max vers le haut
    const niceMin = Math.floor(paddedMin / selectedInterval) * selectedInterval
    const niceMax = Math.ceil(paddedMax / selectedInterval) * selectedInterval

    // Générer les ticks
    const ticks: number[] = []
    for (let tick = niceMin; tick <= niceMax; tick += selectedInterval) {
      ticks.push(tick)
      if (ticks.length > 15) break // Sécurité anti-boucle infinie
    }

    if (ticks.length < 2) return DEFAULT_TICKS

    return ticks
  }, [minLpValue, maxLpValue, padding])

  // Formatter harmonisé basé sur le max
  const formatLpAxis = useMemo(() => createLpFormatter(maxLp), [maxLp])

  if (!hasData) {
    return (
      <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-(--border) text-[11px] font-semibold text-(--text-secondary)">
          {t('charts.lpEvolution')}
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
        <span className="text-[11px] font-semibold text-(--text-secondary) shrink-0">{t('charts.lpEvolution')}</span>
        {/* Légende des équipes */}
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          {teams.map((team, index) => (
            <div key={team.teamName} className="flex items-center gap-1 min-w-0">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: chartColors[index] || chartColors[0] }}
              />
              <span className="text-[9px] text-(--text-muted) truncate max-w-[80px]">
                {team.shortName || team.teamName}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div ref={chartContainerRef} className="p-3 h-[180px] relative">
        {/* Background watermark */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none">
          <span className="text-[56px] font-black text-(--text-muted) opacity-[0.07] tracking-wider">
            LP
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
            <ComposedChart data={displayedData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              {/* Dégradés pour les areas */}
              <defs>
                <linearGradient id="lpGradient0" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={team1} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={team1} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="lpGradient1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={team2} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={team2} stopOpacity={0.02} />
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
                domain={[yAxisTicks[0], yAxisTicks[yAxisTicks.length - 1]]}
                allowDecimals={false}
                ticks={yAxisTicks}
                tickFormatter={formatLpAxis}
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
                    .filter(p => typeof p.dataKey === 'string' && (p.dataKey as string).endsWith('Lp'))
                    .map(p => {
                      const index = parseInt((p.dataKey as string).replace('team', '').replace('Lp', ''), 10)
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
                            {tv.shortName}: <span className="font-mono">{tv.value.toLocaleString('fr-FR')} LP</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                }}
              />
              {teams.map((team, index) => (
                <Area
                  key={`${team.teamName}-${animationKey}`}
                  type="monotone"
                  dataKey={`team${index}Lp`}
                  stroke={chartColors[index]}
                  strokeWidth={2.5}
                  fill={`url(#lpGradient${index})`}
                  fillOpacity={1}
                  dot={{ fill: chartColors[index], strokeWidth: 2, stroke: 'var(--bg-card)', r: 3 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  connectNulls
                  isAnimationActive={true}
                  animationDuration={DRAW_DURATION}
                  animationEasing="ease-out"
                >
                  {shouldShowLabels && (
                    <LabelList
                      dataKey={`team${index}Lp`}
                      position="top"
                      fill="var(--text-secondary)"
                      fontSize={9}
                      formatter={((value: number) => (value > 0 ? formatLpAxis(value) : '')) as (value: unknown) => string}
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

export default memo(LpChart)
