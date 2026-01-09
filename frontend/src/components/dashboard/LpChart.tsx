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

  // Calculer les ticks de l'axe Y pour avoir des valeurs régulières
  const yAxisTicks = useMemo(() => {
    if (displayedData.length === 0) return [0, 1000, 2000, 3000, 4000, 5000]

    // Trouver le min et max des données
    let minValue = Infinity
    let maxValue = 0
    displayedData.forEach((d) => {
      teams.forEach((_, index) => {
        const val = d[`team${index}Lp`] as number
        if (val > maxValue) maxValue = val
        if (val < minValue && val > 0) minValue = val
      })
    })

    if (maxValue <= 0) return [0, 1000, 2000, 3000, 4000, 5000]

    // Ajouter du padding
    const paddedMax = maxValue + padding
    const paddedMin = Math.max(0, minValue - padding)

    // Calculer un intervalle "joli" (100, 200, 500, 1000, 2000, 5000, etc.)
    const range = paddedMax - paddedMin
    const targetTickCount = 5
    const rawInterval = range / targetTickCount
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)))
    const normalized = rawInterval / magnitude

    let niceInterval: number
    if (normalized <= 1) niceInterval = magnitude
    else if (normalized <= 2) niceInterval = 2 * magnitude
    else if (normalized <= 5) niceInterval = 5 * magnitude
    else niceInterval = 10 * magnitude

    // Arrondir le min vers le bas et max vers le haut
    const niceMin = Math.floor(paddedMin / niceInterval) * niceInterval
    const niceMax = Math.ceil(paddedMax / niceInterval) * niceInterval

    // Générer les ticks
    const ticks: number[] = []
    for (let i = niceMin; i <= niceMax; i += niceInterval) {
      ticks.push(i)
    }

    return ticks
  }, [displayedData, teams, padding])

  if (!hasData) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-[var(--border)] text-[11px] font-semibold text-[var(--text-secondary)]">
          Évolution LP
        </div>
        <div className="p-3 h-[180px] flex items-center justify-center">
          <div className="text-[var(--text-muted)] text-sm">Sélectionnez une équipe</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[var(--border)] flex items-center gap-3">
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] flex-shrink-0">Évolution LP</span>
        {/* Légende des équipes */}
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          {teams.map((team, index) => (
            <div key={team.teamName} className="flex items-center gap-1 min-w-0">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: index === 0 ? 'var(--accent)' : 'var(--lol)' }}
              />
              <span className="text-[9px] text-[var(--text-muted)] truncate max-w-[80px]">
                {team.teamName}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="p-3 h-[180px] relative">
        {/* Background watermark */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none">
          <span className="text-[56px] font-black text-[var(--text-muted)] opacity-[0.07] tracking-wider">
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
              tickFormatter={(value) => value.toLocaleString('fr-FR')}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '8px',
              }}
              labelStyle={{ color: 'var(--text-primary)', fontSize: 11 }}
              itemStyle={{ fontSize: 10 }}
              formatter={(value: number, name: string) => {
                if (name.startsWith('team') && name.endsWith('Lp')) {
                  const index = parseInt(name.replace('team', '').replace('Lp', ''), 10)
                  const teamName = teams[index]?.teamName || `Équipe ${index + 1}`
                  return [`${value.toLocaleString('fr-FR')} LP`, teamName]
                }
                return [`${value.toLocaleString('fr-FR')} LP`, name]
              }}
            />
            {teams.map((team, index) => (
              <Area
                key={`${team.teamName}-${animationKey}`}
                type="monotone"
                dataKey={`team${index}Lp`}
                stroke={TEAM_COLORS[index].stroke}
                strokeWidth={2}
                fill={TEAM_COLORS[index].fill}
                fillOpacity={0.15}
                dot={{ fill: TEAM_COLORS[index].stroke, strokeWidth: 2, stroke: 'var(--bg-card)', r: 3 }}
                activeDot={{ r: 5 }}
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
