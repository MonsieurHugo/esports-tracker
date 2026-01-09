'use client'

import { memo } from 'react'
import type { WorkerStatus } from '@/lib/types'

interface Props {
  status: WorkerStatus | null
}

function SmartRefreshStats({ status }: Props) {
  const active = status?.active_accounts_count || 0
  const today = status?.today_accounts_count || 0
  const inactive = status?.inactive_accounts_count || 0
  const total = active + today + inactive

  if (total === 0) {
    return null
  }

  const activePercent = Math.round((active / total) * 100)
  const todayPercent = Math.round((today / total) * 100)
  const inactivePercent = 100 - activePercent - todayPercent

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Smart Refresh</h3>

      {/* Stacked progress bar */}
      <div className="h-2 bg-[var(--bg)] rounded-full overflow-hidden flex mb-3">
        {active > 0 && (
          <div
            className="h-full bg-green-500"
            style={{ width: `${activePercent}%` }}
            title={`Actifs: ${active}`}
          />
        )}
        {today > 0 && (
          <div
            className="h-full bg-yellow-500"
            style={{ width: `${todayPercent}%` }}
            title={`Aujourd'hui: ${today}`}
          />
        )}
        {inactive > 0 && (
          <div
            className="h-full bg-gray-500"
            style={{ width: `${inactivePercent}%` }}
            title={`Inactifs: ${inactive}`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="text-[var(--text-muted)]">Actifs (6h)</span>
          <span className="font-mono font-bold text-green-500">{active}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <span className="text-[var(--text-muted)]">Aujourd'hui</span>
          <span className="font-mono font-bold text-yellow-500">{today}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-500" />
          <span className="text-[var(--text-muted)]">Autres</span>
          <span className="font-mono font-bold text-gray-400">{inactive}</span>
        </div>
      </div>
    </div>
  )
}

export default memo(SmartRefreshStats)
