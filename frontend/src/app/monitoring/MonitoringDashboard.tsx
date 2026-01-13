'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import type { WorkerStatus, WorkerLog, WorkerLogFilter, CoverageStatsData } from '@/lib/types'

import WorkerStatusCard from '@/components/monitoring/WorkerStatusCard'
import MetricsOverview from '@/components/monitoring/MetricsOverview'
import AccountsProgress from '@/components/monitoring/AccountsProgress'
import LogsPanel from '@/components/monitoring/LogsPanel'
import CoverageStats from '@/components/monitoring/CoverageStats'
import ProcessingTimelineChart from '@/components/monitoring/ProcessingTimelineChart'
import AccountsTable from '@/components/monitoring/AccountsTable'

export default function MonitoringDashboard() {
  const [status, setStatus] = useState<WorkerStatus | null>(null)
  const [logs, setLogs] = useState<WorkerLog[]>([])
  const [coverageStats, setCoverageStats] = useState<CoverageStatsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(true)
  const [coverageLoading, setCoverageLoading] = useState(true)
  const [logFilter, setLogFilter] = useState<WorkerLogFilter>('all')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Get available regions from status
  const regions = status?.region_stats ? Object.keys(status.region_stats) : []

  // Fetch worker status
  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.get<WorkerStatus>('/worker/status')
      setStatus(data)
      setLastUpdate(new Date())
    } catch (error) {
      console.error('Failed to fetch worker status:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch logs
  const fetchLogs = useCallback(async (filter: WorkerLogFilter) => {
    setLogsLoading(true)
    try {
      const params: Record<string, string> = { limit: '50' }
      if (filter !== 'all') {
        params.type = filter
      }
      const data = await api.get<{ data: WorkerLog[] }>('/worker/logs', { params })
      setLogs(data.data)
    } catch (error) {
      console.error('Failed to fetch logs:', error)
    } finally {
      setLogsLoading(false)
    }
  }, [])

  // Fetch coverage stats
  const fetchCoverageStats = useCallback(async () => {
    setCoverageLoading(true)
    try {
      const data = await api.get<CoverageStatsData>('/worker/coverage-stats')
      setCoverageStats(data)
    } catch (error) {
      console.error('Failed to fetch coverage stats:', error)
    } finally {
      setCoverageLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchStatus()
    fetchLogs(logFilter)
    fetchCoverageStats()
  }, [fetchStatus, fetchLogs, fetchCoverageStats, logFilter])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus()
      fetchLogs(logFilter)
      fetchCoverageStats()
    }, 30000)

    return () => clearInterval(interval)
  }, [fetchStatus, fetchLogs, fetchCoverageStats, logFilter])

  // Handle log filter change
  const handleLogFilterChange = (filter: WorkerLogFilter) => {
    setLogFilter(filter)
    fetchLogs(filter)
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-(--text-primary)">Worker Monitoring</h1>
            <p className="text-sm text-(--text-muted) mt-1">
              Surveillance du worker de collecte des matchs
            </p>
          </div>
          <div className="text-xs text-(--text-muted)">
            {lastUpdate && (
              <span>
                Mis a jour: {lastUpdate.toLocaleTimeString('fr-FR')}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Top row: Status + Coverage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <WorkerStatusCard status={status} isLoading={isLoading} />
        <CoverageStats stats={coverageStats} isLoading={coverageLoading} />
      </div>

      {/* Metrics overview */}
      <div className="mb-4">
        <MetricsOverview status={status} isLoading={isLoading} />
      </div>

      {/* Processing timeline chart */}
      <div className="mb-4">
        <ProcessingTimelineChart isLoading={isLoading} />
      </div>

      {/* Accounts progress by region */}
      <div className="mb-4">
        <AccountsProgress status={status} isLoading={isLoading} />
      </div>

      {/* Main content: Accounts table + Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Accounts table - takes 2/3 */}
        <div className="lg:col-span-2">
          <AccountsTable regions={regions} />
        </div>

        {/* Logs panel - takes 1/3 */}
        <div className="lg:col-span-1">
          <LogsPanel
            logs={logs}
            isLoading={logsLoading}
            onFilterChange={handleLogFilterChange}
          />
        </div>
      </div>
    </div>
  )
}
