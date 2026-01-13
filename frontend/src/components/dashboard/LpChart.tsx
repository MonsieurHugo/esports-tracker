'use client'

import { useMemo, memo, useState, useEffect, useRef } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from 'recharts'

export interface LpHistoryData {
  date: string
  label: string
  totalLp: number
}

export interface TeamLpData {
  teamName: string
  data: LpHistoryData[]
}

interface LpChartProps {
  teams: TeamLpData[]
  isLoading?: boolean
}

// Couleurs pour les équipes
const TEAM_COLORS = [
  { stroke: 'var(--accent)', fill: 'var(--accent)' },     // Équipe 1 - Indigo
  { stroke: 'var(--lol)', fill: 'var(--lol)' },           // Équipe 2 - Doré
]

const FADE_DURATION = 150
const DRAW_DURATION = 500

// Formatter pour les valeurs LP (10k format)
const formatLpAxis = (value: number): string => {
  if (value >= 10000) return `${(value / 1000).toFixed(0)}k`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return value.toString()
}

// Convertir LP en rang approximatif
const getLpRankDisplay = (lp: number): string => {
  if (lp >= 14400) return 'Challenger'
  if (lp >= 12800) return 'GrandMaster'
  if (lp >= 11200) return 'Master'
  if (lp >= 9600) return 'Diamond 1'
  if (lp >= 8800) return 'Diamond 2'
  if (lp >= 8000) return 'Diamond 3'
  if (lp >= 7200) return 'Diamond 4'
  if (lp >= 6400) return 'Emerald 1'
  if (lp >= 5600) return 'Emerald 2'
  if (lp >= 4800) return 'Emerald 3'
  if (lp >= 4000) return 'Emerald 4'
  if (lp >= 3200) return 'Platinum'
  if (lp >= 2400) return 'Gold'
  if (lp >= 1600) return 'Silver'
  if (lp >= 800) return 'Bronze'
  return 'Iron'
}

function LpChart({ teams }: LpChartProps) {
  // Fusionner les données des équipes en un seul tableau
  const mergedData = useMemo(() => {
    if (teams.length === 0) return []

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

      // Trier et carry forward les valeurs LP manquantes
      const sortedLabels = Array.from(labelMap.values()).sort((a, b) => a.minDate.localeCompare(b.minDate))
      const lastKnownLp: number[] = new Array(teams.length).fill(0)

      return sortedLabels.map(({ label, minDate, teamLps }) => {
        const result: Record<string, string | number> = { label, date: minDate }
        teamLps.forEach((lp, index) => {
          if (lp > 0) {
            lastKnownLp[index] = lp
          }
          // Utiliser la dernière valeur connue (carry forward)
          result[`team${index}Lp`] = lastKnownLp[index]
        })
        return result
      })
    }

    // Vue jour/semaine/mois: grouper par date
    const dateMap = new Map<string, { date: string; label: string }>()
    teams.forEach((team) => {
      team.data.forEach((d) => {
        if (!dateMap.has(d.date)) {
          dateMap.set(d.date, { date: d.date, label: d.label })
        }
      })
    })

    // Trier les dates et carry forward les valeurs LP manquantes
    const sortedDates = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))
    const lastKnownLp: number[] = new Array(teams.length).fill(0)

    return sortedDates.map(({ date, label }) => {
      const result: Record<string, string | number> = { label, date }

      teams.forEach((team, index) => {
        const point = team.data.find((d) => d.date === date)
        if (point?.totalLp !== undefined) {
          lastKnownLp[index] = point.totalLp
        }
        // Utiliser la dernière valeur connue (carry forward)
        result[`team${index}Lp`] = lastKnownLp[index]
      })

      return result
    })
  }, [teams])

  const { maxLp, padding } = useMemo(() => {
    if (teams.length === 0) return { maxLp: 100, padding: 50 }

    const allValues = teams.flatMap((t) => t.data.map((d) => d.totalLp)).filter((v) => v !== undefined)

    if (allValues.length === 0) return { maxLp: 100, padding: 50 }

    const max = Math.max(...allValues)
    const pad = Math.max(max * 0.1, 50)
    return { maxLp: max, padding: pad }
  }, [teams])

  // Animation states
  const [displayedData, setDisplayedData] = useState(mergedData)
  const [opacity, setOpacity] = useState(1)
  const [animationKey, setAnimationKey] = useState(0)
  const isFirstRender = useRef(true)
  const prevDataRef = useRef<string>('')

  useEffect(() => {
    // Serialize data to compare
    const serialized = JSON.stringify(mergedData)

    // Skip if data hasn't actually changed
    if (serialized === prevDataRef.current) {
      return
    }
    prevDataRef.current = serialized

    // Skip animation on first render
    if (isFirstRender.current) {
      isFirstRender.current = false
      setDisplayedData(mergedData)
      return
    }

    // Fade out
    setOpacity(0)

    const fadeTimer = setTimeout(() => {
      // Update data after fade out
      setDisplayedData(mergedData)
      setAnimationKey((k) => k + 1)
      // Fade in
      setOpacity(1)
    }, FADE_DURATION)

    return () => clearTimeout(fadeTimer)
  }, [mergedData])

  const hasData = teams.length > 0 && teams.some((t) => t.data.length > 0)

  // Calculer les ticks de l'axe Y avec adaptation dynamique
  const yAxisTicks = useMemo(() => {
    const DEFAULT_TICKS = [0, 1000, 2000, 3000, 4000, 5000]

    if (displayedData.length === 0) return DEFAULT_TICKS

    // Trouver le min et max des données
    let minValue = Infinity
    let maxValue = -Infinity
    displayedData.forEach((d) => {
      teams.forEach((_, index) => {
        const val = d[`team${index}Lp`] as number
        if (val !== undefined && val !== null) {
          if (val > maxValue) maxValue = val
          if (val < minValue && val > 0) minValue = val
        }
      })
    })

    if (maxValue <= 0 || !isFinite(minValue)) return DEFAULT_TICKS
    if (minValue === Infinity) minValue = 0

    // Ajouter du padding (10% de la range, minimum 50 LP)
    const rawRange = maxValue - minValue
    const calculatedPadding = Math.max(rawRange * 0.1, padding, 50)
    const paddedMax = maxValue + calculatedPadding
    const paddedMin = Math.max(0, minValue - calculatedPadding)

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

    // Intervalles LP-friendly
    const LP_INTERVALS = [50, 100, 200, 250, 400, 500, 800, 1000, 2000, 2500, 5000, 10000]

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
  }, [displayedData, teams, padding])

  if (!hasData) {
    return (
      <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-(--border) text-[11px] font-semibold text-(--text-secondary)">
          Évolution LP
        </div>
        <div className="p-3 h-[180px] flex items-center justify-center">
          <div className="text-(--text-muted) text-sm">Sélectionnez une équipe</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-(--border) flex items-center gap-3">
        <span className="text-[11px] font-semibold text-(--text-secondary) shrink-0">Évolution LP</span>
        {/* Légende des équipes */}
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          {teams.map((team, index) => (
            <div key={team.teamName} className="flex items-center gap-1 min-w-0">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: index === 0 ? 'var(--accent)' : 'var(--lol)' }}
              />
              <span className="text-[9px] text-(--text-muted) truncate max-w-[80px]">
                {team.teamName}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="p-3 h-[180px] relative">
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
            <ComposedChart data={displayedData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              {/* Dégradés pour les areas */}
              <defs>
                <linearGradient id="lpGradient0" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="lpGradient1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--lol)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--lol)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
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
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null

                  const teamValues = payload
                    .filter(p => typeof p.dataKey === 'string' && (p.dataKey as string).endsWith('Lp'))
                    .map(p => {
                      const index = parseInt((p.dataKey as string).replace('team', '').replace('Lp', ''), 10)
                      const value = p.value as number
                      return {
                        teamName: teams[index]?.teamName || `Équipe ${index + 1}`,
                        value,
                        color: TEAM_COLORS[index]?.stroke || 'var(--accent)',
                        rank: getLpRankDisplay(value),
                      }
                    })

                  return (
                    <div className="bg-(--bg-hover) border border-(--border) rounded p-2">
                      <div className="text-[11px] text-(--text-primary) mb-1">{label}</div>
                      {teamValues.map((tv, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: tv.color }}
                          />
                          <span className="text-[10px]">
                            {tv.teamName}: <span className="font-mono">{tv.value.toLocaleString('fr-FR')} LP</span>
                            <span className="opacity-60 ml-1">({tv.rank})</span>
                          </span>
                        </div>
                      ))}
                      {teamValues.length === 2 && (
                        <div className="text-[9px] mt-1 pt-1 border-t border-(--border) text-(--text-muted)">
                          Diff: {Math.abs(teamValues[0].value - teamValues[1].value).toLocaleString('fr-FR')} LP
                        </div>
                      )}
                    </div>
                  )
                }}
              />
              {teams.map((team, index) => (
                <Area
                  key={`${team.teamName}-${animationKey}`}
                  type="monotone"
                  dataKey={`team${index}Lp`}
                  stroke={TEAM_COLORS[index].stroke}
                  strokeWidth={2.5}
                  fill={`url(#lpGradient${index})`}
                  fillOpacity={1}
                  dot={{ fill: TEAM_COLORS[index].stroke, strokeWidth: 2, stroke: 'var(--bg-card)', r: 3 }}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                  connectNulls
                  isAnimationActive={true}
                  animationDuration={DRAW_DURATION}
                  animationEasing="ease-out"
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

export default memo(LpChart)
