'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'

interface WorkerHealth {
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
}

export default function WorkerStatus() {
  const [health, setHealth] = useState<WorkerHealth | null>(null)
  const [isOnline, setIsOnline] = useState<boolean | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const checkWorkerHealth = useCallback(async () => {
    try {
      const data = await api.get<WorkerHealth>('/pro/monitoring/worker-status')
      setHealth(data)
      setIsOnline(data.is_running ?? false)
    } catch {
      setIsOnline(false)
      setHealth(null)
    }
    setLastChecked(new Date())
  }, [])

  useEffect(() => {
    checkWorkerHealth()
    const interval = setInterval(checkWorkerHealth, 5000)
    return () => clearInterval(interval)
  }, [checkWorkerHealth])

  const formatDuration = (startTime: string) => {
    const start = new Date(startTime)
    const now = new Date()
    const diffMs = now.getTime() - start.getTime()

    if (diffMs < 1000) return 'just now'
    if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s ago`
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`
    return `${Math.floor(diffMs / 3600000)}h ago`
  }

  const formatUptime = (startTime: string) => {
    const start = new Date(startTime)
    const now = new Date()
    const diffMs = now.getTime() - start.getTime()

    const hours = Math.floor(diffMs / 3600000)
    const minutes = Math.floor((diffMs % 3600000) / 60000)

    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-(--text-primary)">Worker Status</h3>
        <button
          onClick={checkWorkerHealth}
          className="p-1.5 text-xs bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border)] rounded-lg text-(--text-secondary) transition-colors"
          title="Refresh"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="space-y-3">
        {/* Status indicator */}
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            isOnline === null
              ? 'bg-gray-500 animate-pulse'
              : isOnline
                ? 'bg-green-500'
                : 'bg-red-500'
          }`} />
          <span className={`text-sm font-medium ${
            isOnline === null
              ? 'text-(--text-muted)'
              : isOnline
                ? 'text-green-400'
                : 'text-red-400'
          }`}>
            {isOnline === null ? 'Checking...' : isOnline ? 'Online' : 'Offline'}
          </span>
          {health?.started_at && (
            <span className="text-xs text-(--text-muted)">
              Uptime: {formatUptime(health.started_at)}
            </span>
          )}
        </div>

        {/* Current task */}
        {isOnline && health && (
          <div className="pl-6 space-y-2">
            {health.current_task ? (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-sm text-blue-400">{health.current_task}</span>
                {health.current_task_started_at && (
                  <span className="text-xs text-(--text-muted)">
                    ({formatDuration(health.current_task_started_at)})
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-500" />
                <span className="text-sm text-(--text-muted)">Idle</span>
              </div>
            )}

            {/* Last completed task */}
            {health.last_task && (
              <div className="text-xs text-(--text-muted)">
                Last: {health.last_task}
                {health.last_task_completed_at && (
                  <span> ({formatDuration(health.last_task_completed_at)})</span>
                )}
              </div>
            )}

            {/* Session stats */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="text-xs text-(--text-muted)">
                <span className="text-(--text-secondary) font-mono">{health.session_tournaments}</span> tournaments
              </div>
              <div className="text-xs text-(--text-muted)">
                <span className="text-(--text-secondary) font-mono">{health.session_matches}</span> matches
              </div>
              <div className="text-xs text-(--text-muted)">
                <span className="text-(--text-secondary) font-mono">{health.session_games}</span> games
              </div>
            </div>
          </div>
        )}

        {/* Offline message */}
        {isOnline === false && (
          <div className="pl-6">
            <p className="text-xs text-(--text-muted)">
              Worker is not running.
            </p>
          </div>
        )}

        {/* Last checked */}
        {lastChecked && (
          <div className="text-xs text-(--text-muted) pt-2 border-t border-[var(--border)]">
            Last checked: {lastChecked.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  )
}
