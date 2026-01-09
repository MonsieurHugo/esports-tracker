import { create } from 'zustand'
import type {
  WorkerStatus,
  WorkerLog,
  WorkerMetricsHourly,
  WorkerDailyStats,
  WorkerLogFilter,
  WorkerMetricsPeriod,
  ActiveBatch,
} from '@/lib/types'

interface WebSocketEvent {
  type: string
  timestamp: string
  data: Record<string, unknown>
}

interface WorkerMonitoringState {
  // Status
  status: WorkerStatus | null
  isConnected: boolean

  // Logs
  logs: WorkerLog[]
  logFilter: WorkerLogFilter

  // Metrics
  hourlyMetrics: WorkerMetricsHourly[]
  dailyStats: WorkerDailyStats[]
  metricsPeriod: WorkerMetricsPeriod

  // Actions
  setStatus: (status: WorkerStatus) => void
  updateFromWebSocket: (event: WebSocketEvent) => void
  addLog: (log: WorkerLog) => void
  setLogs: (logs: WorkerLog[]) => void
  setLogFilter: (filter: WorkerLogFilter) => void
  setHourlyMetrics: (metrics: WorkerMetricsHourly[]) => void
  setDailyStats: (stats: WorkerDailyStats[]) => void
  setMetricsPeriod: (period: WorkerMetricsPeriod) => void
  setConnected: (connected: boolean) => void
}

export const useWorkerMonitoringStore = create<WorkerMonitoringState>((set, get) => ({
  status: null,
  isConnected: false,
  logs: [],
  logFilter: 'all',
  hourlyMetrics: [],
  dailyStats: [],
  metricsPeriod: 'day',

  setStatus: (status) => set({ status }),

  updateFromWebSocket: (event) => {
    const { status } = get()

    switch (event.type) {
      case 'account_processed': {
        if (status) {
          const data = event.data as {
            type: string
            name: string
            region: string
            matches_added: number
            progress: number
            total: number
            active_batches: Record<string, ActiveBatch>
          }
          const isLol = data.type === 'lol'
          set({
            status: {
              ...status,
              active_batches: data.active_batches || status.active_batches,
              current_account_name: data.name,
              current_account_region: data.region,
              session_lol_matches: isLol
                ? status.session_lol_matches + data.matches_added
                : status.session_lol_matches,
              session_valorant_matches: !isLol
                ? status.session_valorant_matches + data.matches_added
                : status.session_valorant_matches,
              session_lol_accounts: isLol
                ? status.session_lol_accounts + 1
                : status.session_lol_accounts,
              session_valorant_accounts: !isLol
                ? status.session_valorant_accounts + 1
                : status.session_valorant_accounts,
              last_activity_at: event.timestamp,
            },
          })
        }
        break
      }

      case 'error': {
        if (status) {
          set({
            status: {
              ...status,
              session_errors: status.session_errors + 1,
              last_error_at: event.timestamp,
              last_error_message: (event.data as { message: string }).message,
            },
          })
        }
        break
      }

      case 'batch_started': {
        if (status) {
          const data = event.data as {
            type: string
            region: string | null
            total: number
            priority_counts: { active: number; today: number; inactive: number }
          }

          // Add new batch to active_batches
          const newBatch: ActiveBatch = {
            type: data.type as 'lol' | 'valorant',
            progress: 0,
            total: data.total,
            priority_counts: data.priority_counts,
          }

          const activeBatches = { ...status.active_batches }
          if (data.region) {
            activeBatches[data.region] = newBatch
          }

          set({
            status: {
              ...status,
              active_batches: activeBatches,
              active_accounts_count: status.active_accounts_count + (data.priority_counts?.active || 0),
              today_accounts_count: status.today_accounts_count + (data.priority_counts?.today || 0),
              inactive_accounts_count: status.inactive_accounts_count + (data.priority_counts?.inactive || 0),
            },
          })
        }
        break
      }

      case 'batch_completed': {
        if (status) {
          const data = event.data as {
            type: string
            region: string | null
            active_batches: Record<string, ActiveBatch>
          }

          set({
            status: {
              ...status,
              active_batches: data.active_batches || {},
              current_account_name: null,
              current_account_region: null,
            },
          })
        }
        break
      }

      case 'log': {
        const logData = event.data as {
          log_type: string
          severity: string
          message: string
          account_name: string
        }
        get().addLog({
          id: Date.now(),
          timestamp: event.timestamp,
          log_type: logData.log_type as 'lol' | 'valorant' | 'error' | 'info',
          severity: logData.severity as 'info' | 'warning' | 'error',
          message: logData.message,
          account_name: logData.account_name,
          account_puuid: null,
          details: null,
        })
        break
      }
    }
  },

  addLog: (log) =>
    set((state) => ({
      logs: [log, ...state.logs].slice(0, 200), // Keep max 200 logs in memory
    })),

  setLogs: (logs) => set({ logs }),
  setLogFilter: (logFilter) => set({ logFilter }),
  setHourlyMetrics: (hourlyMetrics) => set({ hourlyMetrics }),
  setDailyStats: (dailyStats) => set({ dailyStats }),
  setMetricsPeriod: (metricsPeriod) => set({ metricsPeriod }),
  setConnected: (isConnected) => set({ isConnected }),
}))
