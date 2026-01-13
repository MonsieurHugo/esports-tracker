'use client'

import type { WorkerStatus } from '@/lib/types'

interface AccountsProgressProps {
  status: WorkerStatus | null
  isLoading: boolean
}

export default function AccountsProgress({ status, isLoading }: AccountsProgressProps) {
  if (isLoading) {
    return (
      <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-(--bg-hover) rounded w-32" />
          <div className="h-2 bg-(--bg-hover) rounded" />
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-3 bg-(--bg-hover) rounded w-full" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const regionStats = status?.region_stats ?? {}
  const regions = Object.entries(regionStats).sort((a, b) => b[1].accounts_total - a[1].accounts_total)

  const totalAccounts = regions.reduce((sum, [, stats]) => sum + stats.accounts_total, 0)
  const totalDone = regions.reduce((sum, [, stats]) => sum + stats.accounts_done, 0)
  const globalProgress = totalAccounts > 0 ? (totalDone / totalAccounts) * 100 : 0

  const regionColors: Record<string, string> = {
    KR: 'bg-blue-500',
    EUW: 'bg-green-500',
    NA: 'bg-red-500',
    BR: 'bg-yellow-500',
  }

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4">
      <h3 className="text-sm font-medium text-(--text-secondary) mb-3">Progression par region</h3>

      {/* Global progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-(--text-muted) mb-1">
          <span>Comptes traites (24h)</span>
          <span className="font-mono">{totalDone} / {totalAccounts}</span>
        </div>
        <div className="h-2 bg-(--bg-hover) rounded-full overflow-hidden">
          <div
            className="h-full bg-(--accent) transition-all duration-500"
            style={{ width: `${globalProgress}%` }}
          />
        </div>
        <div className="text-right text-xs text-(--text-muted) mt-1">
          {globalProgress.toFixed(1)}%
        </div>
      </div>

      {/* Per-region breakdown */}
      <div className="space-y-2">
        {regions.map(([region, stats]) => {
          const progress = stats.accounts_total > 0
            ? (stats.accounts_done / stats.accounts_total) * 100
            : 0

          return (
            <div key={region} className="flex items-center gap-3">
              <div className="w-10 text-xs font-mono font-medium text-(--text-primary)">
                {region}
              </div>
              <div className="flex-1 h-1.5 bg-(--bg-hover) rounded-full overflow-hidden">
                <div
                  className={`h-full ${regionColors[region] || 'bg-(--accent)'} transition-all duration-500`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="w-20 text-xs font-mono text-(--text-muted) text-right">
                {stats.accounts_done}/{stats.accounts_total}
              </div>
            </div>
          )
        })}
      </div>

      {regions.length === 0 && (
        <div className="text-center text-sm text-(--text-muted) py-4">
          Aucune donnee de region disponible
        </div>
      )}
    </div>
  )
}
