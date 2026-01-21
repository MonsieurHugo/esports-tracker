'use client'

import type { PriorityStatsData } from '@/lib/types'

interface PriorityQueueStatsProps {
  stats: PriorityStatsData | null
  isLoading: boolean
}

// Tier display configuration
const TIER_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  very_active: {
    label: 'Tres actif',
    color: 'text-[var(--accent)]',
    bgColor: 'bg-[var(--accent)]',
  },
  active: {
    label: 'Actif',
    color: 'text-[var(--lol)]',
    bgColor: 'bg-[var(--lol)]',
  },
  moderate: {
    label: 'Modere',
    color: 'text-[var(--warning)]',
    bgColor: 'bg-[var(--warning)]',
  },
  inactive: {
    label: 'Inactif',
    color: 'text-[var(--negative)]',
    bgColor: 'bg-[var(--negative)]',
  },
}

// Format staleness time
function formatStaleness(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`
  return `${Math.round(seconds / 3600)}h`
}

export default function PriorityQueueStats({ stats, isLoading }: PriorityQueueStatsProps) {
  if (isLoading) {
    return (
      <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-(--bg-hover) rounded w-32" />
          <div className="h-8 bg-(--bg-hover) rounded w-20" />
          <div className="space-y-2">
            <div className="h-4 bg-(--bg-hover) rounded w-full" />
            <div className="h-4 bg-(--bg-hover) rounded w-full" />
            <div className="h-4 bg-(--bg-hover) rounded w-full" />
            <div className="h-4 bg-(--bg-hover) rounded w-full" />
          </div>
        </div>
      </div>
    )
  }

  const tiers = stats?.by_tier ?? []
  const totals = stats?.totals ?? { total_accounts: 0, overall_avg_score: 0, total_ready: 0, unscored: 0 }
  const totalAccounts = totals.total_accounts || 1 // Avoid division by zero

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4">
      <h3 className="text-sm font-medium text-(--text-secondary) mb-3">File de Priorite</h3>

      {/* Main metrics row */}
      <div className="flex items-end gap-4 mb-4">
        <div>
          <div className="text-3xl font-mono font-bold text-(--text-primary)">
            {totals.overall_avg_score.toFixed(0)}
          </div>
          <div className="text-[10px] text-(--text-muted)">Score moyen</div>
        </div>
        <div>
          <div className="text-xl font-mono font-semibold text-(--accent)">
            {totals.total_ready}
          </div>
          <div className="text-[10px] text-(--text-muted)">Prets</div>
        </div>
      </div>

      {/* Tier distribution */}
      <div className="space-y-2 mb-4">
        {tiers.map((tier) => {
          const config = TIER_CONFIG[tier.tier] || {
            label: tier.tier,
            color: 'text-(--text-primary)',
            bgColor: 'bg-(--text-muted)',
          }
          const percentage = Math.round((tier.count / totalAccounts) * 100)

          return (
            <div key={tier.tier} className="group">
              {/* Tier header */}
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${config.color}`}>{config.label}</span>
                  <span className="text-(--text-muted)">
                    {tier.count} ({percentage}%)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-(--text-muted)">
                  <span title="Score moyen" className="font-mono">
                    {tier.avg_score.toFixed(0)}
                  </span>
                  <span className="text-(--border)">|</span>
                  <span title="Anciennete moyenne" className="font-mono">
                    {formatStaleness(tier.avg_staleness_sec)}
                  </span>
                  {tier.ready_now > 0 && (
                    <>
                      <span className="text-(--border)">|</span>
                      <span title="Prets maintenant" className="text-(--accent) font-mono">
                        {tier.ready_now}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-(--bg-secondary) rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${config.bgColor}`}
                  style={{ width: `${percentage}%`, opacity: 0.8 }}
                />
              </div>
            </div>
          )
        })}

        {tiers.length === 0 && (
          <div className="text-xs text-(--text-muted) text-center py-4">
            Aucune donnee de priorite
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="pt-3 border-t border-(--border)">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-(--text-muted)">Total comptes: </span>
            <span className="font-mono text-(--text-primary)">{totals.total_accounts}</span>
          </div>
          {totals.unscored > 0 && (
            <div>
              <span className="text-(--text-muted)">Non scores: </span>
              <span className="font-mono text-(--warning)">{totals.unscored}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
