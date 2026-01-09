'use client'

import { memo } from 'react'
import type { WorkerStatus } from '@/lib/types'

interface Props {
  status: WorkerStatus | null
}

function MetricsOverview({ status }: Props) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Session actuelle</h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* LoL Matches */}
        <div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase">Matchs LoL</div>
          <div className="font-mono text-lg font-bold text-[var(--lol)]">
            {status?.session_lol_matches?.toLocaleString('fr-FR') ?? 0}
          </div>
        </div>

        {/* Valorant Matches */}
        <div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase">Matchs Valorant</div>
          <div className="font-mono text-lg font-bold text-red-500">
            {status?.session_valorant_matches?.toLocaleString('fr-FR') ?? 0}
          </div>
        </div>

        {/* LoL Accounts */}
        <div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase">Comptes LoL</div>
          <div className="font-mono text-lg font-bold">
            {status?.session_lol_accounts?.toLocaleString('fr-FR') ?? 0}
          </div>
        </div>

        {/* Valorant Accounts */}
        <div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase">Comptes Valorant</div>
          <div className="font-mono text-lg font-bold">
            {status?.session_valorant_accounts?.toLocaleString('fr-FR') ?? 0}
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(MetricsOverview)
