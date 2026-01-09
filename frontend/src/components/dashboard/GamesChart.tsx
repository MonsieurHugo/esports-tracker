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
import type { GamesPerDayData } from '@/lib/types'

export interface TeamGamesData {
  teamName: string
  data: GamesPerDayData[]
}

interface GamesChartProps {
  teams: TeamGamesData[]
  isLoading?: boolean
}

// Couleurs pour les équipes
const TEAM_COLORS = [
  { stroke: 'var(--accent)', fill: 'var(--accent)' },
  { stroke: 'var(--lol)', fill: 'var(--lol)' },
]

const FADE_DURATION = 150
const DRAW_DURATION = 500

function GamesChart({ teams }: GamesChartProps) {
  // Fusionner les données des équipes en un seul tableau
  const mergedData = useMemo(() => {
    if (teams.length === 0) return []

    // Vérifier si une équipe a des labels dupliqués (cas de la vue année)
    const hasLabelDuplicates = teams.some((team) => {
      const labels = team.data.map((d) => d.label)
      return new Set(labels).size < labels.length
    })

    if (hasLabelDuplicates) {
      // Vue année: agréger par label (mois)
      const labelMap = new Map<string, { label: string; minDate: string; teamGames: number[] }>()

      teams.forEach((team, teamIndex) => {
        team.data.forEach((d) => {
          if (!labelMap.has(d.label)) {
            labelMap.set(d.label, { label: d.label, minDate: d.date, teamGames: new Array(teams.length).fill(0) })
          }
          const entry = labelMap.get(d.label)!
          entry.teamGames[teamIndex] = (entry.teamGames[teamIndex] || 0) + (d.games || 0)
          if (d.date < entry.minDate) entry.minDate = d.date
        })
      })

      return Array.from(labelMap.values())
        .sort((a, b) => a.minDate.localeCompare(b.minDate))
        .map(({ label, minDate, teamGames }) => {
          const result: Record<string, string | number> = { label, date: minDate }
          teamGames.forEach((games, index) => {
            // Si pas de données, mettre 0
            result[`team${index}Games`] = games || 0
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

    return Array.from(dateMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ date, label }) => {
        const result: Record<string, string | number> = { label, date }

        teams.forEach((team, index) => {
          const point = team.data.find((d) => d.date === date)
          // Si pas de données pour cette date, mettre 0
          result[`team${index}Games`] = point?.games ?? 0
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
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-[var(--border)] text-[11px] font-semibold text-[var(--text-secondary)]">
          Games par jour
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
        <span className="text-[11px] font-semibold text-[var(--text-secondary)] flex-shrink-0">Games par jour</span>
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
            <ComposedChart data={displayedData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
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
                domain={[0, yAxisTicks[yAxisTicks.length - 1]]}
                allowDecimals={false}
                ticks={yAxisTicks}
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
                  if (name.startsWith('team') && name.endsWith('Games')) {
                    const index = parseInt(name.replace('team', '').replace('Games', ''), 10)
                    const teamName = teams[index]?.teamName || `Équipe ${index + 1}`
                    return [`${value} games`, teamName]
                  }
                  return [`${value} games`, name]
                }}
              />
              {teams.map((team, index) => (
                <Area
                  key={`${team.teamName}-${animationKey}`}
                  type="monotone"
                  dataKey={`team${index}Games`}
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

export default memo(GamesChart)
