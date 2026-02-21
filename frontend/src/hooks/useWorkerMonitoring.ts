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
  ProMatchesOverview,
} from '@/lib/types'

interface ProHealth {
  is_running: boolean
  started_at: string | null
  uptime: number
  current_task: string | null
  current_task_started_at: string | null
  last_task: string | null
  last_task_completed_at: string | null
  session_tournaments: number
  session_matches: number
  session_games: number
  session_errors: number
  session_api_requests: number
  last_activity_at: string | null
  last_error_at: string | null
  last_error_message: string | null
  updated_at: string | null
}

interface SoloQData {
  status: WorkerStatus | null
  coveragePercent: number | null
  isLoading: boolean
}

interface ProData {
  stats: ProMonitoringStats | null
  health: ProHealth | null
  matchOverview: ProMatchesOverview | null
  matchOverviewLoading: boolean
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
  const [matchOverview, setMatchOverview] = useState<ProMatchesOverview | null>(null)
  const [matchOverviewLoading, setMatchOverviewLoading] = useState(true)

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
      const data = await api.get<ProHealth>('/pro/monitoring/worker-status')
      setProHealth(data)
      setProOnline(data.is_running ?? false)
    } catch {
      setProOnline(false)
      setProHealth(null)
    }
  }, [])

  const fetchMatchOverview = useCallback(async () => {
    try {
      const data = await api.get<ProMatchesOverview>('/pro/monitoring/matches-overview')
      setMatchOverview(data)
    } catch (error) {
      logError('Failed to fetch match overview', error)
    } finally {
      setMatchOverviewLoading(false)
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
    fetchMatchOverview()
    setLastUpdate(new Date())
  }, [fetchSoloqStatus, fetchCoveragePercent, fetchProStats, checkProHealth, fetchMatchOverview])

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
      keyMetric: proHealth
        ? `${proHealth.session_games} games`
        : proStats
          ? `${proStats.matches} matches`
          : 'N/A',
      lastActivity: proHealth?.last_activity_at ?? proStats?.lastSyncAt ?? null,
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
      matchOverview,
      matchOverviewLoading,
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
