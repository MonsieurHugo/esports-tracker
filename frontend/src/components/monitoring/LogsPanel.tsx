'use client'

import { useState } from 'react'
import type { WorkerLog, WorkerLogFilter } from '@/lib/types'

interface LogsPanelProps {
  logs: WorkerLog[]
  isLoading: boolean
  onFilterChange: (filter: WorkerLogFilter) => void
}

const LOG_TYPE_COLORS: Record<string, string> = {
  lol: 'bg-(--lol)/20 text-(--lol) border-(--lol)/30',
  valorant: 'bg-red-500/20 text-red-400 border-red-500/30',
  error: 'bg-(--negative)/20 text-(--negative) border-(--negative)/30',
  info: 'bg-(--text-muted)/20 text-(--text-muted) border-(--text-muted)/30',
}

const SEVERITY_COLORS: Record<string, string> = {
  error: 'text-(--negative)',
  warning: 'text-(--warning)',
  info: 'text-(--text-secondary)',
}

function formatTimestamp(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function LogsPanel({ logs, isLoading, onFilterChange }: LogsPanelProps) {
  const [filter, setFilter] = useState<WorkerLogFilter>('all')

  const handleFilterChange = (newFilter: WorkerLogFilter) => {
    setFilter(newFilter)
    onFilterChange(newFilter)
  }

  const filters: { label: string; value: WorkerLogFilter }[] = [
    { label: 'Tous', value: 'all' },
    { label: 'LoL', value: 'lol' },
    { label: 'Erreurs', value: 'error' },
  ]

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-(--border) flex items-center justify-between">
        <h3 className="text-sm font-medium text-(--text-secondary)">Logs</h3>
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f.value}
              onClick={() => handleFilterChange(f.value)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                filter === f.value
                  ? 'bg-(--accent) text-(--bg-primary)'
                  : 'bg-(--bg-hover) text-(--text-muted) hover:text-(--text-primary)'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Logs list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 max-h-[400px]">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-12 bg-(--bg-hover) rounded" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center text-sm text-(--text-muted) py-8">
            Aucun log disponible
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="p-2 bg-(--bg-secondary) rounded text-xs hover:bg-(--bg-hover) transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-(--text-muted)">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded border text-[10px] uppercase font-medium ${
                    LOG_TYPE_COLORS[log.log_type] || LOG_TYPE_COLORS.info
                  }`}
                >
                  {log.log_type}
                </span>
                {log.severity !== 'info' && (
                  <span className={`text-[10px] uppercase ${SEVERITY_COLORS[log.severity]}`}>
                    {log.severity}
                  </span>
                )}
              </div>
              <div className={`${SEVERITY_COLORS[log.severity]} break-words`}>
                {log.message}
              </div>
              {log.account_name && (
                <div className="text-(--text-muted) mt-1 font-mono">
                  {log.account_name}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
