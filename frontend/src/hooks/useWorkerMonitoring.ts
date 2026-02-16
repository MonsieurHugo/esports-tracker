'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import type {
  WorkerStatus,
  ProMonitoringStats,
  WorkerSummary,
  WorkerMetricsHourly,
  WorkerDailyStats,
  WorkerLog,
} from '@/lib/types'

const WORKER_API_URL = process.env.NEXT_PUBLIC_WORKER_API_URL || 'http://localhost:8000'

interface ProHealth {
  status: string
  running: boolean
  startedAt: string | null
  currentTask: string | null
  currentTaskStartedAt: string | null
}

interface SoloQData {
  status: WorkerStatus | null
  coveragePercent: number | null
  isLoading: boolean
}

interface ProData {
  stats: ProMonitoringStats | null
  health: ProHealth | null
  isLoading: boolean
  isOnline: boolean | null
}

interface ChartsData {
  hourly: WorkerMetricsHourly[]
  daily: WorkerDailyStats[]
  errorLogs: WorkerLog[]
  isLoading: boolean
}

interface UseWorkerMonitoringReturn {
  soloq: SoloQData
  pro: ProData
  charts: ChartsData
  workers: WorkerSummary[]
  lastUpdate: Date | null
  autoRefresh: boolean
  toggleAutoRefresh: () => void
  refreshNow: () => void
}

export function useWorkerMonitoring(): UseWorkerMonitoringReturn {
  // SoloQ state
  const [soloqStatus, setSoloqStatus] = useState<WorkerStatus | null>(null)
  const [coveragePercent, setCoveragePercent] = useState<number | null>(null)
  const [soloqLoading, setSoloqLoading] = useState(true)

  // Pro state
  const [proStats, setProStats] = useState<ProMonitoringStats | null>(null)
  const [proHealth, setProHealth] = useState<ProHealth | null>(null)
  const [proLoading, setProLoading] = useState(true)
  const [proOnline, setProOnline] = useState<boolean | null>(null)

  // Charts state
  const [hourlyMetrics, setHourlyMetrics] = useState<WorkerMetricsHourly[]>([])
  const [dailyStats, setDailyStats] = useState<WorkerDailyStats[]>([])
  const [errorLogs, setErrorLogs] = useState<WorkerLog[]>([])
  const [chartsLoading, setChartsLoading] = useState(true)

  // Shared state
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  // SoloQ fetchers
  const fetchSoloqStatus = useCallback(async () => {
    try {
      const data = await api.get<WorkerStatus>('/worker/status')
      setSoloqStatus(data)
    } catch (error) {
      logError('Failed to fetch worker status', error)
    } finally {
      setSoloqLoading(false)
    }
  }, [])

  const fetchCoveragePercent = useCallback(async () => {
    try {
      const data = await api.get<{ todayCoverage: number }>('/worker/coverage-stats')
      setCoveragePercent(data.todayCoverage)
    } catch (error) {
      logError('Failed to fetch coverage stats', error)
    }
  }, [])

  // Pro fetchers
  const fetchProStats = useCallback(async () => {
    try {
      const data = await api.get<ProMonitoringStats>('/pro/monitoring/stats')
      setProStats(data)
    } catch (error) {
      logError('Failed to fetch pro stats', error)
    } finally {
      setProLoading(false)
    }
  }, [])

  const checkProHealth = useCallback(async () => {
    try {
      const response = await fetch(`${WORKER_API_URL}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      })
      if (response.ok) {
        const data = await response.json()
        setProHealth(data)
        setProOnline(true)
      } else {
        setProOnline(false)
        setProHealth(null)
      }
    } catch {
      setProOnline(false)
      setProHealth(null)
    }
  }, [])

  // Charts fetcher (heavier, not called on auto-refresh)
  const fetchChartsData = useCallback(async () => {
    setChartsLoading(true)
    try {
      const [hourlyRes, dailyRes, logsRes] = await Promise.all([
        api.get<{ data: WorkerMetricsHourly[] }>('/worker/metrics/history?hours=24'),
        api.get<{ data: WorkerDailyStats[] }>('/worker/metrics/daily?days=7'),
        api.get<{ data: WorkerLog[] }>('/worker/logs?severity=error&limit=20'),
      ])
      setHourlyMetrics(hourlyRes.data)
      setDailyStats(dailyRes.data)
      setErrorLogs(logsRes.data)
    } catch (error) {
      logError('Failed to fetch charts data', error)
    } finally {
      setChartsLoading(false)
    }
  }, [])

  // Fetch all data (stat cards only — used by auto-refresh)
  const fetchAll = useCallback(() => {
    fetchSoloqStatus()
    fetchCoveragePercent()
    fetchProStats()
    checkProHealth()
    setLastUpdate(new Date())
  }, [fetchSoloqStatus, fetchCoveragePercent, fetchProStats, checkProHealth])

  // Fetch everything including charts (used on mount + manual refresh)
  const fetchEverything = useCallback(() => {
    fetchAll()
    fetchChartsData()
  }, [fetchAll, fetchChartsData])

  // Initial fetch (includes charts)
  useEffect(() => {
    fetchEverything()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(fetchAll, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchAll])

  // Build worker summaries
  const workers: WorkerSummary[] = [
    {
      id: 'soloq',
      name: 'SoloQ Worker',
      status: soloqStatus
        ? soloqStatus.is_running ? 'online' : 'offline'
        : soloqLoading ? 'unknown' : 'offline',
      keyMetric: soloqStatus
        ? `${soloqStatus.session_lol_matches} matches`
        : 'N/A',
      lastActivity: soloqStatus?.last_activity_at ?? null,
    },
    {
      id: 'pro',
      name: 'Pro Worker',
      status: proOnline === null ? 'unknown' : proOnline ? 'online' : 'offline',
      keyMetric: proStats
        ? `${proStats.matches} matches`
        : 'N/A',
      lastActivity: proStats?.lastSyncAt ?? null,
    },
  ]

  return {
    soloq: {
      status: soloqStatus,
      coveragePercent,
      isLoading: soloqLoading,
    },
    pro: {
      stats: proStats,
      health: proHealth,
      isLoading: proLoading,
      isOnline: proOnline,
    },
    charts: {
      hourly: hourlyMetrics,
      daily: dailyStats,
      errorLogs,
      isLoading: chartsLoading,
    },
    workers,
    lastUpdate,
    autoRefresh,
    toggleAutoRefresh: () => setAutoRefresh((prev) => !prev),
    refreshNow: fetchEverything,
  }
}
