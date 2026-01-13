'use client'

import type { CoverageStatsData } from '@/lib/types'

interface CoverageStatsProps {
  stats: CoverageStatsData | null
  isLoading: boolean
}

export default function CoverageStats({ stats, isLoading }: CoverageStatsProps) {
  if (isLoading) {
    return (
      <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-(--bg-hover) rounded w-32" />
          <div className="h-10 bg-(--bg-hover) rounded w-20" />
          <div className="h-3 bg-(--bg-hover) rounded w-full" />
        </div>
      </div>
    )
  }

  const todayCoverage = stats?.todayCoverage ?? 0
  const weeklyAvg = stats?.weeklyAvgCoverage ?? 0
  const accountsToday = stats?.accountsWithActivityToday ?? 0
  const total = stats?.totalAccounts ?? 0
  const trend = stats?.trend ?? 'stable'
  const trendValue = stats?.trendValue ?? 0
  const dailyUpdateCoverage = stats?.dailyUpdateCoverage ?? 0
  const accountsUpdatedToday = stats?.accountsUpdatedToday ?? 0
  const dailyCoverage = stats?.dailyCoverage ?? []

  // Format day label (Mon, Tue, etc.)
  const formatDayLabel = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 3)
  }

  // Get color based on coverage
  const getCoverageColor = (coverage: number) => {
    if (coverage >= 100) return 'bg-[var(--accent)]'
    if (coverage >= 80) return 'bg-[var(--warning)]'
    return 'bg-[var(--negative)]'
  }

  const getTrendIcon = () => {
    if (trend === 'up') {
      return (
        <svg
          className="w-4 h-4 text-(--accent)"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      )
    }
    if (trend === 'down') {
      return (
        <svg
          className="w-4 h-4 text-(--negative)"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      )
    }
    return (
      <svg
        className="w-4 h-4 text-(--text-muted)"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
      </svg>
    )
  }

  const getTrendColor = () => {
    if (trend === 'up') return 'text-(--accent)'
    if (trend === 'down') return 'text-(--negative)'
    return 'text-(--text-muted)'
  }

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg p-4">
      <h3 className="text-sm font-medium text-(--text-secondary) mb-3">Couverture</h3>

      {/* Main coverage percentage */}
      <div className="flex items-end gap-2 mb-4">
        <div className="text-3xl font-mono font-bold text-(--text-primary)">
          {todayCoverage.toFixed(1)}%
        </div>
        <div className="flex items-center gap-1 mb-1">
          {getTrendIcon()}
          <span className={`text-xs font-medium ${getTrendColor()}`}>
            {trendValue > 0 ? '+' : ''}
            {trendValue}%
          </span>
        </div>
      </div>

      {/* Subtitle */}
      <div className="text-xs text-(--text-muted) mb-4">
        Comptes avec activite aujourd'hui
      </div>

      {/* Daily update coverage chart */}
      <div className="mb-4 p-3 rounded-md bg-(--bg-secondary)">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-(--text-primary)">
            Mise à jour journalière
          </div>
          <div className="flex items-center gap-1">
            {dailyUpdateCoverage >= 100 ? (
              <svg
                className="w-4 h-4 text-(--accent)"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <span className="text-[10px] text-(--warning) font-mono">
                {accountsUpdatedToday}/{total}
              </span>
            )}
          </div>
        </div>

        {/* Daily coverage bars */}
        <div className="flex items-end gap-1 h-12">
          {dailyCoverage.map((day) => (
            <div
              key={day.date}
              className="flex-1 flex flex-col items-center gap-1"
              title={`${day.date}: ${day.accountsUpdated}/${total} (${day.coverage}%)`}
            >
              <div className="w-full flex flex-col justify-end h-8">
                <div
                  className={`w-full rounded-t-sm transition-all ${getCoverageColor(day.coverage)}`}
                  style={{ height: `${Math.max(day.coverage, 5)}%` }}
                />
              </div>
              <span className="text-[8px] text-(--text-muted)">{formatDayLabel(day.date)}</span>
            </div>
          ))}
          {dailyCoverage.length === 0 && (
            <div className="flex-1 text-[10px] text-(--text-muted) text-center">
              Aucune donnée
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-2 pt-2 border-t border-(--border)">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
            <span className="text-[9px] text-(--text-muted)">100%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-[var(--warning)]" />
            <span className="text-[9px] text-(--text-muted)">80-99%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-[var(--negative)]" />
            <span className="text-[9px] text-(--text-muted)">&lt;80%</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-(--border)">
        <div>
          <div className="text-lg font-mono font-semibold text-(--text-primary)">
            {accountsToday}
            <span className="text-xs text-(--text-muted) font-normal ml-1">/ {total}</span>
          </div>
          <div className="text-[10px] text-(--text-muted)">Comptes actifs</div>
        </div>
        <div>
          <div className="text-lg font-mono font-semibold text-(--text-primary)">
            {weeklyAvg.toFixed(1)}%
          </div>
          <div className="text-[10px] text-(--text-muted)">Moyenne 7j</div>
        </div>
      </div>
    </div>
  )
}
