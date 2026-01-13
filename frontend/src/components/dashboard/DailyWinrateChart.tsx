'use client'

import { useMemo, memo, useState, useEffect, useRef } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  ReferenceLine,
  ReferenceArea,
} from 'recharts'
import type { TeamGamesData } from './GamesChart'

interface DailyWinrateChartProps {
  teams: TeamGamesData[]
  isLoading?: boolean
}

// Couleurs et styles pour les équipes
const TEAM_STYLES = [
  { stroke: 'var(--accent)', strokeDasharray: undefined as undefined | string },
  { stroke: 'var(--lol)', strokeDasharray: '5 3' },
]

const FADE_DURATION = 150
const DRAW_DURATION = 500

function DailyWinrateChart({ teams }: DailyWinrateChartProps) {
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

      return Array.from(labelMap.values())
        .sort((a, b) => a.minDate.localeCompare(b.minDate))
        .map(({ label, minDate, teamWins, teamGames }) => {
          const result: Record<string, string | number> = { label, date: minDate }
          teamGames.forEach((games, index) => {
            const wins = teamWins[index]
            result[`team${index}Winrate`] = games > 0 ? Math.round((wins / games) * 100) : 0
            result[`team${index}Games`] = games
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
          result[`team${index}Winrate`] = point?.winrate ?? 0
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

  // Ticks fixes pour le winrate (0 à 100)
  const yAxisTicks = [0, 25, 50, 75, 100]

  if (!hasData) {
    return (
      <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-(--border) text-[11px] font-semibold text-(--text-secondary)">
          Winrate par jour
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
        <span className="text-[11px] font-semibold text-(--text-secondary) shrink-0">Winrate par jour</span>
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
            <ComposedChart data={displayedData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              {/* Zones de fond colorées pour le contexte */}
              <ReferenceArea y1={0} y2={45} fill="var(--negative)" fillOpacity={0.03} />
              <ReferenceArea y1={45} y2={55} fill="var(--border)" fillOpacity={0.05} />
              <ReferenceArea y1={55} y2={100} fill="var(--positive)" fillOpacity={0.03} />
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
                domain={[0, 100]}
                allowDecimals={false}
                ticks={yAxisTicks}
                tickFormatter={(value) => `${value}%`}
              />
              <ReferenceLine y={50} stroke="var(--border)" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '8px',
                }}
                labelStyle={{ color: 'var(--text-primary)', fontSize: 11 }}
                itemStyle={{ fontSize: 10 }}
                formatter={(value, name, props) => {
                  if (typeof value !== 'number') return ['', '']
                  if (typeof name === 'string' && name.startsWith('team') && name.endsWith('Winrate')) {
                    const index = parseInt(name.replace('team', '').replace('Winrate', ''), 10)
                    const teamName = teams[index]?.teamName || `Équipe ${index + 1}`
                    const games = props.payload[`team${index}Games`] as number
                    const wins = Math.round((value / 100) * games)
                    const losses = games - wins
                    return [`${value}% (${wins}W - ${losses}L sur ${games}G)`, teamName]
                  }
                  return [`${value}%`, String(name)]
                }}
              />
              {teams.map((team, index) => (
                <Line
                  key={`${team.teamName}-${animationKey}`}
                  type="monotone"
                  dataKey={`team${index}Winrate`}
                  stroke={TEAM_STYLES[index].stroke}
                  strokeWidth={2.5}
                  strokeDasharray={TEAM_STYLES[index].strokeDasharray}
                  dot={{ fill: TEAM_STYLES[index].stroke, strokeWidth: 2, stroke: 'var(--bg-card)', r: 3 }}
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

export default memo(DailyWinrateChart)
