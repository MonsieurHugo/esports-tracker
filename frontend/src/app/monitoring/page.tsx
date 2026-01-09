'use client'

import { useEffect } from 'react'
import { useWorkerMonitoringStore } from '@/stores/workerMonitoringStore'
import { useWorkerWebSocket } from '@/hooks/useWorkerWebSocket'
import api from '@/lib/api'
import type {
  WorkerStatus,
  WorkerMetricsHourly,
  WorkerDailyStats,
  WorkerMetricsTotals,
} from '@/lib/types'

import WorkerStatusCard from '@/components/monitoring/WorkerStatusCard'
import MetricsOverview from '@/components/monitoring/MetricsOverview'
import MetricsChart from '@/components/monitoring/MetricsChart'
import DailyCoverageChart from '@/components/monitoring/DailyCoverageChart'
import LogsPanel from '@/components/monitoring/LogsPanel'
import BatchProgress from '@/components/monitoring/BatchProgress'
import RegionStats from '@/components/monitoring/RegionStats'
import SmartRefreshStats from '@/components/monitoring/SmartRefreshStats'
import AccountsOverview from '@/components/monitoring/AccountsOverview'
import PlayerSearch from '@/components/monitoring/PlayerSearch'

export default function MonitoringPage() {
  const { isConnected } = useWorkerWebSocket()

  const {
    status,
    hourlyMetrics,
    dailyStats,
    metricsPeriod,
    setStatus,
    setHourlyMetrics,
    setDailyStats,
    setMetricsPeriod,
  } = useWorkerMonitoringStore()

  // Initial data fetch
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [statusRes, metricsRes, dailyRes] = await Promise.all([
          api.get<WorkerStatus>('/worker/status'),
          api.get<{ data: WorkerMetricsHourly[]; totals: WorkerMetricsTotals }>(
            '/worker/metrics/history',
            {
              params: { period: metricsPeriod },
            }
          ),
          api.get<{ data: WorkerDailyStats[] }>('/worker/metrics/daily', {
            params: { days: 7 },
          }),
        ])

        setStatus(statusRes)
        setHourlyMetrics(metricsRes.data)
        setDailyStats(dailyRes.data)
      } catch (error) {
        console.error('Failed to fetch monitoring data:', error)
      }
    }

    fetchInitialData()

    // Refresh status every 30 seconds
    const interval = setInterval(async () => {
      try {
        const statusRes = await api.get<WorkerStatus>('/worker/status')
        setStatus(statusRes)
      } catch (e) {
        console.error('Status refresh failed:', e)
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [metricsPeriod, setStatus, setHourlyMetrics, setDailyStats])

  // Refetch metrics when period changes
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const metricsRes = await api.get<{ data: WorkerMetricsHourly[]; totals: WorkerMetricsTotals }>(
          '/worker/metrics/history',
          {
            params: { period: metricsPeriod },
          }
        )
        setHourlyMetrics(metricsRes.data)

        if (metricsPeriod !== 'day') {
          const days = metricsPeriod === 'week' ? 7 : 30
          const dailyRes = await api.get<{ data: WorkerDailyStats[] }>(
            '/worker/metrics/daily',
            {
              params: { days },
            }
          )
          setDailyStats(dailyRes.data)
        }
      } catch (error) {
        console.error('Failed to fetch metrics:', error)
      }
    }

    fetchMetrics()
  }, [metricsPeriod, setHourlyMetrics, setDailyStats])

  return (
    <main className="p-3 sm:p-5 max-w-[1600px] mx-auto">
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-semibold">Monitoring Worker</h1>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-orange-500'
            }`}
          />
          <span className="text-xs text-[var(--text-muted)]">
            {isConnected ? 'Connecte' : 'Reconnexion...'}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Left Column: Status + Metrics */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          {/* Status Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <WorkerStatusCard status={status} isConnected={isConnected} />
          </div>

          {/* Batch Progress */}
          {status?.active_batches && Object.keys(status.active_batches).length > 0 && (
            <BatchProgress activeBatches={status.active_batches} />
          )}

          {/* Smart Refresh Stats */}
          <SmartRefreshStats status={status} />

          {/* Region Stats */}
          <RegionStats status={status} />

          {/* Metrics Overview */}
          <MetricsOverview status={status} />

          {/* Player Search */}
          <PlayerSearch />

          {/* Accounts Overview */}
          <AccountsOverview />

          {/* Daily Coverage Chart */}
          <DailyCoverageChart />

          {/* Charts */}
          <MetricsChart
            hourlyData={hourlyMetrics}
            dailyData={dailyStats}
            period={metricsPeriod}
            onPeriodChange={setMetricsPeriod}
          />
        </div>

        {/* Right Column: Logs */}
        <div className="lg:col-span-1">
          <LogsPanel />
        </div>
      </div>
    </main>
  )
}
