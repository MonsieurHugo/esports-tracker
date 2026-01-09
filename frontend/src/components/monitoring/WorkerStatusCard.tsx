'use client'

import { memo } from 'react'
import type { WorkerStatus } from '@/lib/types'

interface Props {
  status: WorkerStatus | null
  isConnected: boolean
}

function WorkerStatusCard({ status, isConnected }: Props) {
  const isOnline = status?.is_running ?? false

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  return (
    <>
      {/* Status */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
          Statut
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`}
          />
          <span className="font-semibold">{isOnline ? 'En ligne' : 'Hors ligne'}</span>
        </div>
        {!isConnected && (
          <div className="text-[10px] text-orange-500 mt-1">WebSocket deconnecte</div>
        )}
      </div>

      {/* Uptime */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
          Uptime
        </div>
        <div className="font-mono text-xl font-bold">
          {status?.uptime ? formatUptime(status.uptime) : '-'}
        </div>
      </div>

      {/* API Requests */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
          Requetes API
        </div>
        <div className="font-mono text-xl font-bold">
          {status?.session_api_requests?.toLocaleString('fr-FR') ?? 0}
        </div>
      </div>

      {/* Errors */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1">
          Erreurs
        </div>
        <div
          className={`font-mono text-xl font-bold ${
            (status?.session_errors ?? 0) > 0 ? 'text-red-500' : ''
          }`}
        >
          {status?.session_errors ?? 0}
        </div>
      </div>
    </>
  )
}

export default memo(WorkerStatusCard)
