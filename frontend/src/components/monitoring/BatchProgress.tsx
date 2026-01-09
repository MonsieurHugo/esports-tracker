'use client'

import { memo } from 'react'
import type { ActiveBatch } from '@/lib/types'

interface Props {
  activeBatches: Record<string, ActiveBatch>
}

function BatchProgress({ activeBatches }: Props) {
  const regions = Object.entries(activeBatches)

  if (regions.length === 0) {
    return null
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">Batches en cours</h3>
        <span className="text-xs text-[var(--text-muted)]">
          {regions.length} region{regions.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-3">
        {regions.map(([region, batch]) => {
          const percentage = batch.total > 0 ? Math.round((batch.progress / batch.total) * 100) : 0
          const typeColor = batch.type === 'lol' ? 'var(--lol)' : '#ff4655'

          return (
            <div key={region}>
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 text-[10px] font-semibold rounded uppercase"
                    style={{
                      backgroundColor: `${typeColor}20`,
                      color: typeColor,
                    }}
                  >
                    {region}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {batch.type === 'lol' ? 'LoL' : 'Valorant'}
                  </span>
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {batch.progress} / {batch.total} ({percentage}%)
                </span>
              </div>

              <div className="w-full h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: typeColor,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default memo(BatchProgress)
