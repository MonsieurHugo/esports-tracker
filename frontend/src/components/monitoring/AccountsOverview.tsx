'use client'

import { memo, useEffect, useState } from 'react'
import api from '@/lib/api'
import type { WorkerAccountStats, WorkerAccountInfo } from '@/lib/types'

// Region display names
const REGION_NAMES: Record<string, string> = {
  euw1: 'EUW',
  eun1: 'EUNE',
  na1: 'NA',
  kr: 'KR',
  br1: 'BR',
  jp1: 'JP',
  la1: 'LAN',
  la2: 'LAS',
  oc1: 'OCE',
  tr1: 'TR',
  ru: 'RU',
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Jamais'

  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return `${diffSec}s`
  if (diffMin < 60) return `${diffMin}m`
  if (diffHour < 24) return `${diffHour}h`
  return `${diffDay}j`
}

function AccountRow({ account, type }: { account: WorkerAccountInfo; type: 'recent' | 'oldest' }) {
  const regionName = REGION_NAMES[account.region] || account.region?.toUpperCase()
  const timeAgo = formatTimeAgo(account.last_fetched)
  const isOld = type === 'oldest'

  return (
    <div className={`flex items-center justify-between py-1.5 px-2 rounded ${isOld ? 'bg-orange-500/5' : 'bg-green-500/5'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] text-[var(--text-muted)] w-8">{regionName}</span>
        <div className="truncate">
          <span className="text-sm font-medium">{account.game_name}</span>
          <span className="text-xs text-[var(--text-muted)]">#{account.tag_line}</span>
        </div>
        {account.player_name && (
          <span className="text-xs text-[var(--lol)] hidden sm:inline">({account.player_name})</span>
        )}
      </div>
      <span className={`text-xs font-mono ${isOld ? 'text-orange-400' : 'text-green-400'}`}>
        {timeAgo}
      </span>
    </div>
  )
}

function AccountsOverview() {
  const [stats, setStats] = useState<WorkerAccountStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await api.get<WorkerAccountStats>('/worker/accounts', {
          params: { limit: 5 },
        })
        setStats(data)
      } catch (error) {
        console.error('Failed to fetch account stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()

    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
        <div className="animate-pulse h-40 bg-[var(--bg)] rounded" />
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Comptes LoL</h3>
        <span className="text-xs text-[var(--text-muted)]">{stats.total} comptes</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent accounts */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-[var(--text-muted)]">Derniers mis a jour</span>
          </div>
          <div className="space-y-1">
            {stats.recent.map((account) => (
              <AccountRow key={account.puuid} account={account} type="recent" />
            ))}
          </div>
        </div>

        {/* Oldest accounts */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-xs text-[var(--text-muted)]">En attente de refresh</span>
          </div>
          <div className="space-y-1">
            {stats.oldest.map((account) => (
              <AccountRow key={account.puuid} account={account} type="oldest" />
            ))}
          </div>
        </div>
      </div>

      {/* Region distribution */}
      {stats.by_region.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--border)]">
          <div className="flex flex-wrap gap-2">
            {stats.by_region.map(({ region, count }) => (
              <div
                key={region}
                className="text-xs px-2 py-1 rounded bg-[var(--bg)] border border-[var(--border)]"
              >
                <span className="text-[var(--text-muted)]">{REGION_NAMES[region] || region}: </span>
                <span className="font-mono font-bold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(AccountsOverview)
