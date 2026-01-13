'use client'

import type { WorkerStatus } from '@/lib/types'

interface WorkerStatusCardProps {
  status: WorkerStatus | null
  isLoading: boolean
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatTimeAgo(isoDate: string | null): string {
  if (!isoDate) return 'Jamais'
  const diff = Date.now() - new Date(isoDate).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h`
}

export default function WorkerStatusCard({ status, isLoading }: WorkerStatusCardProps) {
  if (isLoading) {
    return (
      <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-(--bg-hover) rounded w-24" />
          <div className="h-8 bg-(--bg-hover) rounded w-32" />
          <div className="h-3 bg-(--bg-hover) rounded w-full" />
        </div>
      </div>
    )
  }

  const isRunning = status?.is_running ?? false

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4">
      {/* Header with status indicator */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-(--text-secondary)">Worker Status</h3>
        <div className="flex items-center gap-2">
          <span
            className={`relative flex h-2.5 w-2.5 ${isRunning ? 'animate-pulse' : ''}`}
          >
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isRunning ? 'bg-(--accent) animate-ping' : 'bg-(--negative)'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                isRunning ? 'bg-(--accent)' : 'bg-(--negative)'
              }`}
            />
          </span>
          <span
            className={`text-xs font-medium ${
              isRunning ? 'text-(--accent)' : 'text-(--negative)'
            }`}
          >
            {isRunning ? 'En ligne' : 'Hors ligne'}
          </span>
        </div>
      </div>

      {/* Uptime */}
      <div className="mb-4">
        <div className="text-2xl font-mono font-bold text-(--text-primary)">
          {formatUptime(status?.uptime ?? 0)}
        </div>
        <div className="text-xs text-(--text-muted)">Uptime</div>
      </div>

      {/* Current activity */}
      {status?.current_account_name && (
        <div className="mb-3 p-2 bg-(--bg-hover) rounded text-xs">
          <div className="text-(--text-muted) mb-1">En cours de traitement</div>
          <div className="font-mono text-(--text-primary) truncate">
            {status.current_account_name}
            <span className="text-(--text-muted) ml-1">
              ({status.current_account_region})
            </span>
          </div>
        </div>
      )}

      {/* Last activity */}
      <div className="flex justify-between text-xs text-(--text-muted)">
        <span>Derniere activite</span>
        <span className="font-mono">{formatTimeAgo(status?.last_activity_at ?? null)}</span>
      </div>

      {/* Last error if present */}
      {status?.last_error_message && (
        <div className="mt-3 p-2 bg-(--negative)/10 border border-(--negative)/20 rounded text-xs">
          <div className="text-(--negative) font-medium mb-1">Derniere erreur</div>
          <div className="text-(--text-secondary) truncate">
            {status.last_error_message}
          </div>
          <div className="text-(--text-muted) mt-1">
            {formatTimeAgo(status.last_error_at ?? null)}
          </div>
        </div>
      )}
    </div>
  )
}
