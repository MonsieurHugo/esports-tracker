'use client'

import { memo, useMemo } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Legend,
} from 'recharts'
import type { WorkerMetricsHourly, WorkerDailyStats, WorkerMetricsPeriod } from '@/lib/types'

interface Props {
  hourlyData: WorkerMetricsHourly[]
  dailyData: WorkerDailyStats[]
  period: WorkerMetricsPeriod
  onPeriodChange: (period: WorkerMetricsPeriod) => void
}

function MetricsChart({ hourlyData, dailyData, period, onPeriodChange }: Props) {
  const chartData = useMemo(() => {
    if (period === 'day') {
      if (!hourlyData || hourlyData.length === 0) return []
      return hourlyData.map((d) => ({
        label: new Date(d.hour).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        lolMatches: d.lol_matches_added,
        valorantMatches: d.valorant_matches_added,
        errors: d.api_errors,
      }))
    }

    if (!dailyData || dailyData.length === 0) return []
    return dailyData.map((d) => ({
      label: new Date(d.date).toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
      }),
      lolMatches: d.lol_matches,
      valorantMatches: d.valorant_matches,
      errors: d.errors,
    }))
  }, [hourlyData, dailyData, period])

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <h3 className="text-sm font-semibold">Historique des matchs</h3>

        {/* Period Selector */}
        <div className="flex gap-1">
          {(['day', 'week', 'month'] as const).map((p) => (
            <button
              key={p}
              onClick={() => onPeriodChange(p)}
              className={`px-2 py-1 text-[10px] rounded transition-colors ${
                period === p
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-hover)] text-[var(--text-muted)]'
              }`}
            >
              {p === 'day' ? '24h' : p === 'week' ? '7j' : '30j'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 h-[250px]">
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
            Aucune donnee disponible
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
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
                allowDecimals={false}
                domain={[0, 'auto']}
                tickCount={6}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '10px' }}
              />
              <Area
                type="monotone"
                dataKey="lolMatches"
                name="LoL"
                stroke="var(--lol)"
                fill="var(--lol)"
                fillOpacity={0.3}
                stackId="1"
              />
              <Area
                type="monotone"
                dataKey="valorantMatches"
                name="Valorant"
                stroke="#ff4655"
                fill="#ff4655"
                fillOpacity={0.3}
                stackId="1"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export default memo(MetricsChart)
