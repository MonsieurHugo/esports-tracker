'use client'

import { useMemo } from 'react'
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Bar,
  BarChart,
  Line,
  ComposedChart,
} from 'recharts'
import { useWorkerMonitoring } from '@/hooks/useWorkerMonitoring'
import CollapsibleSection from '@/components/monitoring/CollapsibleSection'
import { Skeleton } from '@/components/ui/Skeleton'
import type { WorkerMetricsHourly, WorkerDailyStats, WorkerLog } from '@/lib/types'

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatUptimeFromDate(startedAt: string): string {
  const diffMs = Date.now() - new Date(startedAt).getTime()
  const hours = Math.floor(diffMs / 3600000)
  const minutes = Math.floor((diffMs % 3600000) / 60000)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatTimeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `il y a ${days}j`
  if (hours > 0) return `il y a ${hours}h`
  if (minutes > 0) return `il y a ${minutes}m`
  return 'à l\'instant'
}

function formatLastSync(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

function StatCard({ label, value, isLoading, isText }: {
  label: string
  value: number | string
  isLoading: boolean
  isText?: boolean
}) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
      <div className="text-xs text-(--text-muted) mb-0.5">{label}</div>
      {isLoading ? (
        <Skeleton className="h-6 w-16" />
      ) : (
        <div className={`font-mono ${isText ? 'text-sm' : 'text-lg'} font-bold text-(--text-primary)`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
      )}
    </div>
  )
}

function StatusDot({ status }: { status: 'online' | 'offline' | 'unknown' }) {
  const color = status === 'online'
    ? 'bg-green-500'
    : status === 'offline'
      ? 'bg-red-500'
      : 'bg-gray-500 animate-pulse'
  return <div className={`w-3 h-3 rounded-full ${color}`} />
}

function computeNiceTicks(data: Record<string, unknown>[], keys: string[]): number[] {
  let maxValue = 0
  for (const d of data) {
    for (const key of keys) {
      const val = d[key] as number
      if (val > maxValue) maxValue = val
    }
  }
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
}

function HourlyChart({ data }: { data: WorkerMetricsHourly[] }) {
  const chartData = useMemo(
    () =>
      data.map((m) => ({
        label: m.hour.slice(11, 16), // "2024-01-15T14:00:00" -> "14:00"
        matches: m.lol_matches_added,
        errors: m.api_errors,
      })),
    [data]
  )

  const yTicks = useMemo(() => computeNiceTicks(chartData, ['matches']), [chartData])

  if (data.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-[var(--border)] text-[11px] font-semibold text-(--text-secondary)">
          Activite horaire (24h)
        </div>
        <div className="p-3 h-[200px] flex items-center justify-center">
          <span className="text-(--text-muted) text-sm">Aucune donnee</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[var(--border)] flex items-center gap-3">
        <span className="text-[11px] font-semibold text-(--text-secondary)">Activite horaire (24h)</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
            <span className="text-[9px] text-(--text-muted)">Matches</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-[var(--negative)]" />
            <span className="text-[9px] text-(--text-muted)">Erreurs</span>
          </div>
        </div>
      </div>
      <div className="p-3 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              interval={Math.max(0, Math.floor(chartData.length / 8) - 1)}
            />
            <YAxis
              yAxisId="left"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              allowDecimals={false}
              domain={[0, yTicks[yTicks.length - 1]]}
              ticks={yTicks}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
              allowDecimals={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null
                const d = payload[0]?.payload as { label: string; matches: number; errors: number }
                return (
                  <div className="bg-[var(--bg-hover)] border border-[var(--border)] rounded p-2">
                    <div className="text-[9px] text-(--text-muted) mb-1">{d.label}</div>
                    <div className="text-[10px]">
                      <span className="text-[var(--accent)]">Matches:</span>{' '}
                      <span className="font-mono">{d.matches}</span>
                    </div>
                    <div className="text-[10px]">
                      <span className="text-[var(--negative)]">Erreurs:</span>{' '}
                      <span className="font-mono">{d.errors}</span>
                    </div>
                  </div>
                )
              }}
            />
            <Bar
              yAxisId="left"
              dataKey="matches"
              fill="var(--accent)"
              fillOpacity={0.8}
              radius={[3, 3, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="errors"
              stroke="var(--negative)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function DailyChart({ data }: { data: WorkerDailyStats[] }) {
  const DAY_NAMES = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

  const chartData = useMemo(
    () =>
      data.map((d) => {
        const date = new Date(d.date + 'T00:00:00')
        return {
          label: DAY_NAMES[date.getDay()],
          matches: d.lol_matches,
          accounts: d.lol_accounts,
        }
      }),
    [data]
  )

  const yTicks = useMemo(() => computeNiceTicks(chartData, ['matches', 'accounts']), [chartData])

  if (data.length === 0) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-[var(--border)] text-[11px] font-semibold text-(--text-secondary)">
          Vue journaliere (7j)
        </div>
        <div className="p-3 h-[200px] flex items-center justify-center">
          <span className="text-(--text-muted) text-sm">Aucune donnee</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[var(--border)] flex items-center gap-3">
        <span className="text-[11px] font-semibold text-(--text-secondary)">Vue journaliere (7j)</span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
            <span className="text-[9px] text-(--text-muted)">Matches</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-[#3B82F6]" />
            <span className="text-[9px] text-(--text-muted)">Comptes</span>
          </div>
        </div>
      </div>
      <div className="p-3 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barCategoryGap="20%">
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
              allowDecimals={false}
              domain={[0, yTicks[yTicks.length - 1]]}
              ticks={yTicks}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null
                const d = payload[0]?.payload as { label: string; matches: number; accounts: number }
                return (
                  <div className="bg-[var(--bg-hover)] border border-[var(--border)] rounded p-2">
                    <div className="text-[9px] text-(--text-muted) mb-1">{d.label}</div>
                    <div className="text-[10px]">
                      <span className="text-[var(--accent)]">Matches:</span>{' '}
                      <span className="font-mono">{d.matches}</span>
                    </div>
                    <div className="text-[10px]">
                      <span className="text-[#3B82F6]">Comptes:</span>{' '}
                      <span className="font-mono">{d.accounts}</span>
                    </div>
                  </div>
                )
              }}
            />
            <Bar dataKey="matches" fill="var(--accent)" fillOpacity={0.8} radius={[3, 3, 0, 0]} />
            <Bar dataKey="accounts" fill="#3B82F6" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ErrorLogsPanel({ logs }: { logs: WorkerLog[] }) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[var(--border)] flex items-center gap-2">
        <span className="text-[11px] font-semibold text-(--text-secondary)">Erreurs recentes</span>
        {logs.length > 0 && (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
            {logs.length}
          </span>
        )}
      </div>
      {logs.length === 0 ? (
        <div className="p-4 text-center text-(--text-muted) text-sm">
          Aucune erreur recente
        </div>
      ) : (
        <div className="max-h-[260px] overflow-y-auto">
          {logs.map((log, i) => (
            <div
              key={log.id ?? i}
              className={`px-3.5 py-2.5 ${i < logs.length - 1 ? 'border-b border-[var(--border)]' : ''}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-(--text-muted) font-mono">
                  {formatTimeAgo(log.timestamp)}
                </span>
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                    log.severity === 'error'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}
                >
                  {log.severity}
                </span>
              </div>
              <div className="font-mono text-xs text-(--text-secondary) line-clamp-2">
                {log.message}
              </div>
              {log.account_name && (
                <div className="text-[10px] text-(--text-muted) mt-0.5">{log.account_name}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MonitoringDashboard() {
  const {
    soloq,
    pro,
    charts,
    lastUpdate,
    autoRefresh,
    toggleAutoRefresh,
    refreshNow,
  } = useWorkerMonitoring()

  const soloqOnline = soloq.status?.is_running ?? false
  const soloqStatus = soloq.status
    ? soloq.status.is_running ? 'online' as const : 'offline' as const
    : soloq.isLoading ? 'unknown' as const : 'offline' as const

  const proStatus = pro.isOnline === null
    ? 'unknown' as const
    : pro.isOnline ? 'online' as const : 'offline' as const

  return (
    <div className="p-4 sm:p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <h1 className="text-xl font-bold text-(--text-primary)">Worker Monitoring</h1>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-(--text-muted) cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={toggleAutoRefresh}
              className="rounded border-[var(--border)]"
            />
            Auto-refresh
          </label>

          {lastUpdate && (
            <span className="text-xs text-(--text-muted) whitespace-nowrap">
              {lastUpdate.toLocaleTimeString('fr-FR')}
            </span>
          )}

          <button
            onClick={refreshNow}
            className="p-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded-lg text-(--text-secondary) transition-colors"
            title="Refresh all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </header>

      {/* SoloQ Worker Section */}
      <div className="mb-4">
        <CollapsibleSection
          id="soloq-worker"
          title="SoloQ Worker"
          subtitle="Riot API — Match data collection"
          statusIndicator={<StatusDot status={soloqStatus} />}
          defaultOpen={true}
        >
          {/* Status line */}
          <div className="flex items-center gap-2 mb-4">
            <span className={`text-sm font-medium ${soloqOnline ? 'text-green-400' : 'text-red-400'}`}>
              {soloq.isLoading ? 'Checking...' : soloqOnline ? 'Online' : 'Offline'}
            </span>
            {soloqOnline && soloq.status?.uptime != null && (
              <>
                <span className="text-(--text-muted)">·</span>
                <span className="text-sm text-(--text-muted)">
                  Uptime: {formatUptime(soloq.status.uptime)}
                </span>
              </>
            )}
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard
              label="Matches"
              value={soloq.status?.session_lol_matches ?? 0}
              isLoading={soloq.isLoading}
            />
            <StatCard
              label="Comptes"
              value={soloq.status?.session_lol_accounts ?? 0}
              isLoading={soloq.isLoading}
            />
            <StatCard
              label="Erreurs"
              value={soloq.status?.session_errors ?? 0}
              isLoading={soloq.isLoading}
            />
            <StatCard
              label="Couverture"
              value={soloq.coveragePercent != null ? `${Math.round(soloq.coveragePercent)}%` : 'N/A'}
              isLoading={soloq.isLoading}
              isText
            />
          </div>

          {/* Activity & error info */}
          <div className="space-y-1.5">
            {soloq.status?.current_account_name && (
              <div className="flex items-center gap-2 text-sm text-(--text-secondary)">
                <span className="text-(--text-muted)">{'>'}</span>
                <span>
                  Processing: <span className="font-mono text-(--text-primary)">{soloq.status.current_account_name}</span>
                  {soloq.status.last_activity_at && (
                    <span className="text-(--text-muted)"> — {formatTimeAgo(soloq.status.last_activity_at)}</span>
                  )}
                </span>
              </div>
            )}
            {soloq.status?.last_error_message && soloq.status.last_error_at && (
              <div className="flex items-center gap-2 text-sm text-red-400/80">
                <span className="text-(--text-muted)">{'>'}</span>
                <span>
                  Last error: <span className="font-mono">{soloq.status.last_error_message}</span>
                  <span className="text-(--text-muted)"> — {formatTimeAgo(soloq.status.last_error_at)}</span>
                </span>
              </div>
            )}
          </div>
        </CollapsibleSection>
      </div>

      {/* Activity & Errors Section */}
      <div className="mb-4">
        <CollapsibleSection
          id="soloq-charts"
          title="Activity & Errors"
          subtitle="Hourly metrics, daily overview & error logs"
          defaultOpen={true}
        >
          {charts.isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Skeleton className="h-[240px] rounded-lg" />
              <Skeleton className="h-[240px] rounded-lg" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <HourlyChart data={charts.hourly} />
                <DailyChart data={charts.daily} />
              </div>
              <ErrorLogsPanel logs={charts.errorLogs} />
            </>
          )}
        </CollapsibleSection>
      </div>

      {/* Pro Worker Section */}
      <div className="mb-4">
        <CollapsibleSection
          id="pro-worker"
          title="Pro Worker"
          subtitle="GRID API — Pro esports data"
          statusIndicator={<StatusDot status={proStatus} />}
          defaultOpen={true}
        >
          {/* Status line */}
          <div className="flex items-center gap-2 mb-4">
            <span className={`text-sm font-medium ${
              pro.isOnline === null
                ? 'text-(--text-muted)'
                : pro.isOnline ? 'text-green-400' : 'text-red-400'
            }`}>
              {pro.isOnline === null ? 'Checking...' : pro.isOnline ? 'Online' : 'Offline'}
            </span>
            {pro.isOnline && pro.health?.startedAt && (
              <>
                <span className="text-(--text-muted)">·</span>
                <span className="text-sm text-(--text-muted)">
                  Uptime: {formatUptimeFromDate(pro.health.startedAt)}
                </span>
              </>
            )}
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard
              label="Tournaments"
              value={pro.stats?.tournaments ?? 0}
              isLoading={pro.isLoading}
            />
            <StatCard
              label="Matches"
              value={pro.stats?.matches ?? 0}
              isLoading={pro.isLoading}
            />
            <StatCard
              label="Games"
              value={pro.stats?.games ?? 0}
              isLoading={pro.isLoading}
            />
            <StatCard
              label="Last Sync"
              value={formatLastSync(pro.stats?.lastSyncAt ?? null)}
              isLoading={pro.isLoading}
              isText
            />
          </div>

          {/* Current task */}
          {pro.isOnline && pro.health && (
            <div className="space-y-1.5">
              {pro.health.currentTask ? (
                <div className="flex items-center gap-2 text-sm text-(--text-secondary)">
                  <span className="text-(--text-muted)">{'>'}</span>
                  <span>
                    Task: <span className="font-mono text-blue-400">{pro.health.currentTask}</span>
                    {pro.health.currentTaskStartedAt && (
                      <span className="text-(--text-muted)"> — depuis {formatTimeAgo(pro.health.currentTaskStartedAt).replace('il y a ', '')}</span>
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-(--text-muted)">
                  <span>{'>'}</span>
                  <span>Idle</span>
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  )
}
