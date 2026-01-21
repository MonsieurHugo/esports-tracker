'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import type { WorkerMetricsHourly, WorkerDailyStats } from '@/lib/types'

type TimeRange = '24h' | '7d' | '30d'
type DataMode = 'accounts' | 'matches'

interface ProcessingTimelineChartProps {
  isLoading?: boolean
}

interface TimelineData {
  label: string
  accounts: number
  matches: number
}

export default function ProcessingTimelineChart({ isLoading: parentLoading }: ProcessingTimelineChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h')
  const [dataMode, setDataMode] = useState<DataMode>('accounts')
  const [data, setData] = useState<TimelineData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      if (timeRange === '24h') {
        const response = await api.get<{ data: WorkerMetricsHourly[] }>('/worker/metrics/history', {
          params: { hours: '24' },
        })

        const formatted = response.data.map((m) => {
          const date = new Date(m.hour)
          return {
            label: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            accounts: m.lol_accounts_processed,
            matches: m.lol_matches_added,
          }
        })
        setData(formatted)
      } else {
        const days = timeRange === '7d' ? 7 : 30
        const response = await api.get<{ data: WorkerDailyStats[] }>('/worker/metrics/daily', {
          params: { days: String(days) },
        })

        const formatted = response.data.map((d) => {
          const date = new Date(d.date)
          const label =
            timeRange === '7d'
              ? date.toLocaleDateString('fr-FR', { weekday: 'short' })
              : date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
          return {
            label,
            accounts: d.lol_accounts,
            matches: d.lol_matches,
          }
        })
        setData(formatted)
      }
    } catch (error) {
      logError('Failed to fetch timeline data', error)
      setData([])
    } finally {
      setIsLoading(false)
    }
  }, [timeRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const chartData = useMemo(() => data, [data])

  const yAxisTicks = useMemo(() => {
    if (chartData.length === 0) return [0, 5, 10, 15, 20]

    const maxValue = Math.max(...chartData.map((d) => (dataMode === 'accounts' ? d.accounts : d.matches)))

    if (maxValue <= 0) return [0, 5, 10, 15, 20]

    const targetTickCount = 5
    const rawInterval = maxValue / targetTickCount
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)))
    const normalized = rawInterval / magnitude

    let niceInterval: number
    if (normalized <= 1) niceInterval = magnitude
    else if (normalized <= 2) niceInterval = 2 * magnitude
    else if (normalized <= 5) niceInterval = 5 * magnitude
    else niceInterval = 10 * magnitude

    const ticks: number[] = []
    for (let i = 0; i <= Math.ceil(maxValue / niceInterval); i++) {
      ticks.push(i * niceInterval)
    }

    return ticks
  }, [chartData, dataMode])

  const loading = parentLoading || isLoading

  if (loading && chartData.length === 0) {
    return (
      <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-(--border)">
          <div className="animate-pulse h-4 bg-(--bg-hover) rounded w-40" />
        </div>
        <div className="p-3 h-[200px] flex items-center justify-center">
          <div className="animate-pulse w-full h-full bg-(--bg-hover) rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-(--border) flex items-center justify-between flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-(--text-secondary)">
          Timeline de traitement
        </span>

        <div className="flex items-center gap-2">
          {/* Time range selector */}
          <div className="flex bg-(--bg-hover) rounded p-0.5">
            {(['24h', '7d', '30d'] as TimeRange[]).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                  timeRange === range
                    ? 'bg-(--bg-card) text-(--text-primary)'
                    : 'text-(--text-muted) hover:text-(--text-secondary)'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          {/* Data mode toggle */}
          <div className="flex bg-(--bg-hover) rounded p-0.5">
            <button
              onClick={() => setDataMode('accounts')}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                dataMode === 'accounts'
                  ? 'bg-(--bg-card) text-(--text-primary)'
                  : 'text-(--text-muted) hover:text-(--text-secondary)'
              }`}
            >
              Comptes
            </button>
            <button
              onClick={() => setDataMode('matches')}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                dataMode === 'matches'
                  ? 'bg-(--bg-card) text-(--lol)'
                  : 'text-(--text-muted) hover:text-(--text-secondary)'
              }`}
            >
              Matchs
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="p-3 h-[200px] relative">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-sm text-(--text-muted)">Aucune donnee disponible</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
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
                formatter={(value) => [
                  value ?? 0,
                  dataMode === 'accounts' ? 'Comptes traites' : 'Matchs ajoutes',
                ]}
              />
              <Area
                type="monotone"
                dataKey={dataMode}
                stroke={dataMode === 'accounts' ? 'var(--accent)' : 'var(--lol)'}
                strokeWidth={2}
                fill={dataMode === 'accounts' ? 'var(--accent)' : 'var(--lol)'}
                fillOpacity={0.15}
                dot={{
                  fill: dataMode === 'accounts' ? 'var(--accent)' : 'var(--lol)',
                  strokeWidth: 2,
                  stroke: 'var(--bg-card)',
                  r: 3,
                }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
