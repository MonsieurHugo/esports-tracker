'use client'

import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import type {
  WorkerAccountsListResponse,
  EnhancedWorkerAccountInfo,
  AccountHealthStatus,
} from '@/lib/types'
import AccountHealthBadge from './AccountHealthBadge'

interface AccountsTableProps {
  regions?: string[]
}

function formatTimeAgo(isoDate: string | null): string {
  if (!isoDate) return 'Jamais'
  const diff = Date.now() - new Date(isoDate).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}j`
}

export default function AccountsTable({ regions = [] }: AccountsTableProps) {
  const [accounts, setAccounts] = useState<EnhancedWorkerAccountInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [regionFilter, setRegionFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<AccountHealthStatus | ''>('')
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ total: 0, lastPage: 1, perPage: 20, currentPage: 1 })
  const [summary, setSummary] = useState({ fresh: 0, normal: 0, stale: 0, critical: 0 })
  const [sortBy, setSortBy] = useState<'last_fetched_at' | 'game_name' | 'region'>('last_fetched_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {
        page: String(page),
        perPage: '20',
        sortBy,
        sortDir,
      }
      if (search) params.search = search
      if (regionFilter) params.region = regionFilter
      if (statusFilter) params.status = statusFilter

      const response = await api.get<WorkerAccountsListResponse>('/worker/accounts/list', {
        params,
      })

      setAccounts(response.data)
      setMeta(response.meta)
      setSummary(response.summary)
    } catch (error) {
      console.error('Failed to fetch accounts:', error)
    } finally {
      setIsLoading(false)
    }
  }, [page, search, regionFilter, statusFilter, sortBy, sortDir])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [search, regionFilter, statusFilter])

  const handleSort = (column: 'last_fetched_at' | 'game_name' | 'region') => {
    if (sortBy === column) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return null
    return (
      <svg
        className={`w-3 h-3 ml-1 inline transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    )
  }

  return (
    <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
      {/* Header with filters */}
      <div className="px-4 py-3 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Rechercher un compte..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-(--bg-secondary) border border-(--border) rounded focus:outline-none focus:border-(--accent) text-(--text-primary) placeholder:text-(--text-muted)"
            />
          </div>

          {/* Region filter */}
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-(--bg-secondary) border border-(--border) rounded focus:outline-none focus:border-(--accent) text-(--text-primary)"
          >
            <option value="">Toutes les regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AccountHealthStatus | '')}
            className="px-3 py-1.5 text-sm bg-(--bg-secondary) border border-(--border) rounded focus:outline-none focus:border-(--accent) text-(--text-primary)"
          >
            <option value="">Tous les statuts</option>
            <option value="fresh">Frais ({summary.fresh})</option>
            <option value="normal">Normal ({summary.normal})</option>
            <option value="stale">Ancien ({summary.stale})</option>
            <option value="critical">Critique ({summary.critical})</option>
          </select>
        </div>

        {/* Summary badges */}
        <div className="flex gap-2 mt-3">
          <span className="px-2 py-0.5 text-[10px] font-medium bg-(--accent)/10 text-(--accent) rounded">
            {summary.fresh} frais
          </span>
          <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-500/10 text-blue-400 rounded">
            {summary.normal} normal
          </span>
          <span className="px-2 py-0.5 text-[10px] font-medium bg-(--warning)/10 text-(--warning) rounded">
            {summary.stale} ancien
          </span>
          <span className="px-2 py-0.5 text-[10px] font-medium bg-(--negative)/10 text-(--negative) rounded">
            {summary.critical} critique
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-(--border) bg-(--bg-secondary)">
              <th
                className="px-4 py-2 text-left text-[10px] font-semibold text-(--text-muted) uppercase tracking-wider cursor-pointer hover:text-(--text-secondary)"
                onClick={() => handleSort('game_name')}
              >
                Compte
                <SortIcon column="game_name" />
              </th>
              <th
                className="px-4 py-2 text-left text-[10px] font-semibold text-(--text-muted) uppercase tracking-wider cursor-pointer hover:text-(--text-secondary)"
                onClick={() => handleSort('region')}
              >
                Region
                <SortIcon column="region" />
              </th>
              <th className="px-4 py-2 text-left text-[10px] font-semibold text-(--text-muted) uppercase tracking-wider">
                Joueur
              </th>
              <th
                className="px-4 py-2 text-left text-[10px] font-semibold text-(--text-muted) uppercase tracking-wider cursor-pointer hover:text-(--text-secondary)"
                onClick={() => handleSort('last_fetched_at')}
              >
                Dernier fetch
                <SortIcon column="last_fetched_at" />
              </th>
              <th className="px-4 py-2 text-center text-[10px] font-semibold text-(--text-muted) uppercase tracking-wider">
                Statut
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(10)].map((_, i) => (
                <tr key={i} className="border-b border-(--border)">
                  <td className="px-4 py-2">
                    <div className="animate-pulse h-4 bg-(--bg-hover) rounded w-32" />
                  </td>
                  <td className="px-4 py-2">
                    <div className="animate-pulse h-4 bg-(--bg-hover) rounded w-12" />
                  </td>
                  <td className="px-4 py-2">
                    <div className="animate-pulse h-4 bg-(--bg-hover) rounded w-24" />
                  </td>
                  <td className="px-4 py-2">
                    <div className="animate-pulse h-4 bg-(--bg-hover) rounded w-16" />
                  </td>
                  <td className="px-4 py-2">
                    <div className="animate-pulse h-4 bg-(--bg-hover) rounded w-8 mx-auto" />
                  </td>
                </tr>
              ))
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-(--text-muted)">
                  Aucun compte trouve
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr
                  key={account.puuid}
                  className="border-b border-(--border) hover:bg-(--bg-hover) transition-colors"
                >
                  <td className="px-4 py-2">
                    <span className="font-mono text-sm text-(--text-primary)">
                      {account.game_name}
                      <span className="text-(--text-muted)">#{account.tag_line}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs font-mono text-(--text-secondary)">
                      {account.region}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-sm text-(--text-secondary)">
                      {account.player_name || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs font-mono text-(--text-muted)">
                      {formatTimeAgo(account.last_fetched)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <AccountHealthBadge status={account.health_status} showLabel />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t border-(--border) flex items-center justify-between">
        <span className="text-xs text-(--text-muted)">
          {meta.total} comptes au total
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-xs font-medium bg-(--bg-secondary) border border-(--border) rounded hover:bg-(--bg-hover) disabled:opacity-50 disabled:cursor-not-allowed text-(--text-secondary)"
          >
            Precedent
          </button>
          <span className="text-xs text-(--text-muted)">
            Page {meta.currentPage} / {meta.lastPage}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(meta.lastPage, p + 1))}
            disabled={page >= meta.lastPage}
            className="px-3 py-1 text-xs font-medium bg-(--bg-secondary) border border-(--border) rounded hover:bg-(--bg-hover) disabled:opacity-50 disabled:cursor-not-allowed text-(--text-secondary)"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  )
}
