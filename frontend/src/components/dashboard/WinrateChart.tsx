'use client'

import { useMemo, memo } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
} from 'recharts'
import type { GamesPerDayData } from '@/lib/types'

interface WinrateChartProps {
  data: GamesPerDayData[]
  isLoading?: boolean
  teamId?: number
}

function WinrateChart({ data, isLoading, teamId }: WinrateChartProps) {
  const title = teamId ? "Winrate par jour (équipe)" : "Winrate par jour"

  // Hook DOIT être avant tout return conditionnel
  const avgWinrate = useMemo(() => {
    return data.length > 0
      ? data.reduce((sum, d) => sum + d.winrate, 0) / data.length
      : 50
  }, [data])

  if (isLoading) {
    return (
      <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-(--border) text-[11px] font-semibold text-(--text-secondary)">
          {title}
        </div>
        <div className="p-3 h-[120px] flex items-center justify-center">
          <div className="text-(--text-muted) text-sm">Chargement...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-(--border) text-[11px] font-semibold text-(--text-secondary) flex justify-between items-center">
        <span>{title}</span>
        <span className="text-[10px] text-(--text-muted)">
          Moy: {avgWinrate.toFixed(1)}%
        </span>
      </div>
      <div className="p-3 h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorWinrate" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--positive)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--positive)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 9 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 9 }}
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
            />
            <ReferenceLine
              y={50}
              stroke="var(--text-muted)"
              strokeDasharray="3 3"
              strokeOpacity={0.5}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '8px',
              }}
              labelStyle={{ color: 'var(--text-primary)', fontSize: 11 }}
              itemStyle={{ color: 'var(--text-secondary)', fontSize: 11 }}
              formatter={(value, _name, props) => {
                if (typeof value !== 'number') return ['', '']
                const payload = props?.payload as GamesPerDayData | undefined
                if (!payload) return [`${value}%`, '']
                const { wins, games } = payload
                return [`${value}% (${wins}W/${games - wins}L)`, '']
              }}
            />
            <Area
              type="monotone"
              dataKey="winrate"
              stroke="var(--positive)"
              strokeWidth={2}
              fill="url(#colorWinrate)"
              dot={{ fill: 'var(--positive)', strokeWidth: 2, stroke: 'var(--bg-card)', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default memo(WinrateChart)
