'use client'

import { memo } from 'react'
import type { WorkerStatus } from '@/lib/types'

interface Props {
  status: WorkerStatus | null
}

// Region display names and colors
const REGION_INFO: Record<string, { name: string; color: string }> = {
  euw1: { name: 'EUW', color: 'text-blue-400' },
  eun1: { name: 'EUNE', color: 'text-green-400' },
  na1: { name: 'NA', color: 'text-red-400' },
  kr: { name: 'KR', color: 'text-purple-400' },
  br1: { name: 'BR', color: 'text-yellow-400' },
  jp1: { name: 'JP', color: 'text-pink-400' },
  la1: { name: 'LAN', color: 'text-orange-400' },
  la2: { name: 'LAS', color: 'text-orange-300' },
  oc1: { name: 'OCE', color: 'text-cyan-400' },
  tr1: { name: 'TR', color: 'text-red-300' },
  ru: { name: 'RU', color: 'text-amber-400' },
  ph2: { name: 'PH', color: 'text-indigo-400' },
  sg2: { name: 'SG', color: 'text-emerald-400' },
  th2: { name: 'TH', color: 'text-violet-400' },
  tw2: { name: 'TW', color: 'text-rose-400' },
  vn2: { name: 'VN', color: 'text-lime-400' },
}

function RegionStats({ status }: Props) {
  const regionStats = status?.region_stats || {}
  const regions = Object.keys(regionStats)

  if (regions.length === 0) {
    return null
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Regions</h3>
        {status?.current_account_name && (
          <div className="text-xs text-[var(--text-muted)]">
            <span className="text-[var(--text)]">{status.current_account_name}</span>
            {status.current_account_region && (
              <span className={`ml-1 ${REGION_INFO[status.current_account_region]?.color || 'text-gray-400'}`}>
                ({REGION_INFO[status.current_account_region]?.name || status.current_account_region.toUpperCase()})
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {regions.map((region) => {
          const stats = regionStats[region]
          const info = REGION_INFO[region] || { name: region.toUpperCase(), color: 'text-gray-400' }
          const progress = stats.accounts_total > 0
            ? Math.round((stats.accounts_done / stats.accounts_total) * 100)
            : 0
          const isComplete = stats.accounts_done === stats.accounts_total

          return (
            <div
              key={region}
              className={`p-2 rounded border ${
                isComplete
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'border-[var(--border)] bg-[var(--bg)]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-bold ${info.color}`}>{info.name}</span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {stats.accounts_done}/{stats.accounts_total}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1 bg-[var(--bg)] rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full transition-all ${isComplete ? 'bg-green-500' : 'bg-[var(--lol)]'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="text-[10px] text-[var(--text-muted)]">
                {stats.matches} match{stats.matches !== 1 ? 's' : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default memo(RegionStats)
