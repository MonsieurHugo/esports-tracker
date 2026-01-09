'use client'

import { useEffect, memo } from 'react'
import { useWorkerMonitoringStore } from '@/stores/workerMonitoringStore'
import api from '@/lib/api'
import type { WorkerLog, WorkerLogFilter } from '@/lib/types'

const FILTER_OPTIONS: { value: WorkerLogFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'lol', label: 'LoL' },
  { value: 'valorant', label: 'Val' },
  { value: 'error', label: 'Erreurs' },
]

function LogsPanel() {
  const { logs, logFilter, setLogs, setLogFilter } = useWorkerMonitoringStore()

  // Fetch initial logs
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const params: Record<string, string> = { limit: '100' }
        if (logFilter !== 'all') {
          params.type = logFilter
        }

        const res = await api.get<{ data: WorkerLog[] }>('/worker/logs', { params })
        setLogs(res.data)
      } catch (error) {
        console.error('Failed to fetch logs:', error)
      }
    }

    fetchLogs()
  }, [logFilter, setLogs])

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const getLogTypeColor = (type: string): string => {
    switch (type) {
      case 'lol':
        return 'text-[var(--lol)]'
      case 'valorant':
        return 'text-red-500'
      case 'error':
        return 'text-red-600'
      default:
        return 'text-[var(--text-muted)]'
    }
  }

  const filteredLogs =
    logFilter === 'all' ? logs : logs.filter((log) => log.log_type === logFilter)

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg flex flex-col h-[500px]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <h3 className="text-sm font-semibold">Logs temps reel</h3>

        {/* Filter */}
        <div className="flex gap-1">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setLogFilter(option.value)}
              className={`px-2 py-1 text-[10px] rounded transition-colors ${
                logFilter === option.value
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Logs List */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
        {filteredLogs.length === 0 ? (
          <div className="text-center text-[var(--text-muted)] py-8">Aucun log disponible</div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className="py-1 px-2 hover:bg-[var(--bg-hover)] rounded flex gap-2"
            >
              <span className="text-[var(--text-muted)] flex-shrink-0">
                {formatTime(log.timestamp)}
              </span>
              <span className={`flex-shrink-0 uppercase ${getLogTypeColor(log.log_type)}`}>
                [{log.log_type}]
              </span>
              <span className="text-[var(--text-primary)] truncate">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default memo(LogsPanel)
