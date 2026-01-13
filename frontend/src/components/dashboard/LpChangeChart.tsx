'use client'

import { useMemo, memo, useState, useEffect, useRef } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  ComposedChart,
  Cell,
  ReferenceLine,
} from 'recharts'
import type { TeamLpData } from './LpChart'

interface LpChangeChartProps {
  teams: TeamLpData[]
  isLoading?: boolean
}

// Couleurs pour les équipes
const TEAM_COLORS = [
  { positive: 'var(--positive)', negative: 'var(--negative)' },
  { positive: 'var(--lol)', negative: 'var(--warning)' },
]

const FADE_DURATION = 150
const DRAW_DURATION = 500

function LpChangeChart({ teams }: LpChangeChartProps) {
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

      return Array.from(labelMap.values())
        .sort((a, b) => a.minDate.localeCompare(b.minDate))
        .map(({ label, minDate, teamFirstLp, teamLastLp }) => {
          const result: Record<string, string | number> = { label, date: minDate }
          teamLastLp.forEach((lastLp, index) => {
            const firstLp = teamFirstLp[index]
            result[`team${index}Change`] = lastLp - firstLp
          })
          return result
        })
    }

    // Vue jour/semaine/mois: calculer le changement quotidien
    const dateMap = new Map<string, { date: string; label: string }>()
    teams.forEach((team) => {
      team.data.forEach((d) => {
        if (!dateMap.has(d.date)) {
          dateMap.set(d.date, { date: d.date, label: d.label })
        }
      })
    })

    const sortedDates = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))
    const lastKnownLp: number[] = new Array(teams.length).fill(0)

    return sortedDates.map(({ date, label }, dateIndex) => {
      const result: Record<string, string | number> = { label, date }

      teams.forEach((team, teamIndex) => {
        const point = team.data.find((d) => d.date === date)
        const currentLp = point?.totalLp ?? lastKnownLp[teamIndex]

        // Le changement est la différence avec le jour précédent
        if (dateIndex === 0) {
          result[`team${teamIndex}Change`] = 0
        } else {
          result[`team${teamIndex}Change`] = currentLp - lastKnownLp[teamIndex]
        }

        if (point?.totalLp !== undefined) {
          lastKnownLp[teamIndex] = point.totalLp
        }
      })

      return result
    })
  }, [teams])

  // Animation states
  const [displayedData, setDisplayedData] = useState(mergedData)
  const [opacity, setOpacity] = useState(1)
  const [animationKey, setAnimationKey] = useState(0)
  const isFirstRender = useRef(true)
  const prevDataRef = useRef<string>('')

  useEffect(() => {
    const serialized = JSON.stringify(mergedData)

    if (serialized === prevDataRef.current) {
      return
    }
    prevDataRef.current = serialized

    if (isFirstRender.current) {
      isFirstRender.current = false
      setDisplayedData(mergedData)
      return
    }

    setOpacity(0)

    const fadeTimer = setTimeout(() => {
      setDisplayedData(mergedData)
      setAnimationKey((k) => k + 1)
      setOpacity(1)
    }, FADE_DURATION)

    return () => clearTimeout(fadeTimer)
  }, [mergedData])

  const hasData = teams.length > 0 && teams.some((t) => t.data.length > 0)

  // Calculer la taille dynamique des barres
  const barSize = useMemo(() => {
    const maxBarWidth = 18
    const minBarWidth = 4
    const chartWidth = 280
    const totalBars = displayedData.length * teams.length
    if (totalBars === 0) return maxBarWidth
    const calculated = (chartWidth / totalBars) * 0.6
    return Math.max(minBarWidth, Math.min(maxBarWidth, calculated))
  }, [displayedData.length, teams.length])

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
          LP gagnés/perdus par jour
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
        <span className="text-[11px] font-semibold text-(--text-secondary) shrink-0">LP +/- par jour</span>
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
            <ComposedChart data={displayedData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }} barCategoryGap="15%" barGap={2}>
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
                tickFormatter={(value) => (value > 0 ? `+${value}` : value.toString())}
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '8px',
                }}
                labelStyle={{ color: 'var(--text-primary)', fontSize: 11 }}
                itemStyle={{ fontSize: 10 }}
                formatter={(value, name) => {
                  if (typeof value !== 'number') return ['', '']
                  if (typeof name === 'string' && name.startsWith('team') && name.endsWith('Change')) {
                    const index = parseInt(name.replace('team', '').replace('Change', ''), 10)
                    const teamName = teams[index]?.teamName || `Équipe ${index + 1}`
                    const prefix = value > 0 ? '+' : ''
                    const color = value >= 0 ? 'var(--positive)' : 'var(--negative)'
                    return [<span key="v" style={{ color }}>{prefix}{value} LP</span>, teamName]
                  }
                  return [`${value} LP`, String(name)]
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
                  maxBarSize={barSize}
                >
                  {displayedData.map((entry, index) => {
                    const value = entry[`team${teamIndex}Change`] as number
                    const colors = TEAM_COLORS[teamIndex] || TEAM_COLORS[0]
                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={value >= 0 ? colors.positive : colors.negative}
                        fillOpacity={teamIndex === 0 ? 0.9 : 0.7}
                      />
                    )
                  })}
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
