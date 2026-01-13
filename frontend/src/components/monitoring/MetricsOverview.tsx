'use client'

import type { WorkerStatus } from '@/lib/types'

interface MetricsOverviewProps {
  status: WorkerStatus | null
  isLoading: boolean
}

interface MetricCardProps {
  label: string
  value: number
  color?: string
  icon?: React.ReactNode
}

function MetricCard({ label, value, color = '--text-primary', icon }: MetricCardProps) {
  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-(--text-muted)">{label}</span>
      </div>
      <div className={`text-xl font-mono font-bold text-(${color})`}>
        {value.toLocaleString('fr-FR')}
      </div>
    </div>
  )
}

export default function MetricsOverview({ status, isLoading }: MetricsOverviewProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-(--bg-card) border border-(--border) rounded-lg p-3">
            <div className="animate-pulse space-y-2">
              <div className="h-3 bg-(--bg-hover) rounded w-20" />
              <div className="h-6 bg-(--bg-hover) rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <MetricCard
        label="Matchs LoL"
        value={status?.session_lol_matches ?? 0}
        color="--lol"
        icon={
          <svg className="w-4 h-4 text-(--lol)" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        }
      />
      <MetricCard
        label="Comptes traites"
        value={status?.session_lol_accounts ?? 0}
        color="--accent"
        icon={
          <svg className="w-4 h-4 text-(--accent)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        }
      />
      <MetricCard
        label="Requetes API"
        value={status?.session_api_requests ?? 0}
        color="--text-secondary"
        icon={
          <svg className="w-4 h-4 text-(--text-secondary)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
      />
      <MetricCard
        label="Erreurs"
        value={status?.session_errors ?? 0}
        color={status?.session_errors ? '--negative' : '--text-muted'}
        icon={
          <svg className={`w-4 h-4 ${status?.session_errors ? 'text-(--negative)' : 'text-(--text-muted)'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        }
      />
    </div>
  )
}
