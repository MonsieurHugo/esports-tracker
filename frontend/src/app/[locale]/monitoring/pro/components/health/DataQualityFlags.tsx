'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'

interface Flag {
  flagId: number
  flagType: string
  severity: string
  entityType: string | null
  entityId: number | null
  externalId: string | null
  context: Record<string, unknown>
  resolved: boolean
  resolvedAt: string | null
  resolvedBy: string | null
  createdAt: string
}

interface Summary {
  flagType: string
  severity: string
  count: number
}

interface FlagsResponse {
  data: Flag[]
  meta: { total: number; perPage: number; currentPage: number; lastPage: number }
  summary: Summary[]
}

const SEVERITY_COLORS: Record<string, string> = {
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
}

const FLAG_LABELS: Record<string, string> = {
  format_inferred: 'Format Inferred',
  side_defaulted: 'Side Defaulted',
  role_swapped: 'Role Swapped (CS/min)',
  duplicate_merged: 'Duplicate Merged',
  team_name_defaulted: 'Team Name Unknown',
  file_not_found: 'File Not Found',
  region_defaulted: 'Region Defaulted',
  data_defaulted: 'Data Defaulted',
  player_name_unknown: 'Player Name Unknown',
  player_side_inferred: 'Player Side Inferred',
  winner_inferred: 'Winner Inferred',
  no_data_sources: 'No Data Sources',
}

export default function DataQualityFlags() {
  const [data, setData] = useState<FlagsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [flagType, setFlagType] = useState<string>('')
  const [severity, setSeverity] = useState<string>('')
  const [showResolved, setShowResolved] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('perPage', '30')
      params.set('resolved', String(showResolved))
      if (flagType) params.set('flagType', flagType)
      if (severity) params.set('severity', severity)

      const response = await api.get<FlagsResponse>(
        `/pro/monitoring/data-quality-flags?${params.toString()}`
      )
      setData(response)
    } catch (error) {
      logError('Failed to fetch data quality flags', error)
    } finally {
      setIsLoading(false)
    }
  }, [page, flagType, severity, showResolved])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleResolve = async (flagId: number) => {
    try {
      await api.post(`/pro/monitoring/data-quality-flags/${flagId}/resolve`, {})
      fetchData()
    } catch (error) {
      logError('Failed to resolve flag', error)
    }
  }

  const handleBulkResolve = async (type: string, sev?: string) => {
    try {
      await api.post('/pro/monitoring/data-quality-flags/resolve-bulk', {
        flagType: type,
        severity: sev,
      })
      fetchData()
    } catch (error) {
      logError('Failed to bulk resolve flags', error)
    }
  }

  if (isLoading && !data) {
    return (
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
    )
  }

  const summary = data?.summary ?? []
  const totalOpen = summary.reduce((acc, s) => acc + s.count, 0)

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-(--text-primary)">
            Data Quality Flags
          </h3>
          <span className="font-mono text-sm text-(--text-muted)">
            {totalOpen} open
          </span>
        </div>

        {summary.length === 0 ? (
          <p className="text-sm text-(--text-muted)">No open flags</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {summary.map((s) => (
              <button
                key={`${s.flagType}-${s.severity}`}
                onClick={() => {
                  setFlagType(s.flagType)
                  setSeverity(s.severity)
                  setPage(1)
                }}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono cursor-pointer transition-opacity hover:opacity-80 ${SEVERITY_COLORS[s.severity] || 'bg-[var(--bg-secondary)] text-(--text-secondary) border-[var(--border)]'}`}
              >
                <span>{FLAG_LABELS[s.flagType] || s.flagType}</span>
                <span className="font-bold">{s.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={flagType}
            onChange={(e) => { setFlagType(e.target.value); setPage(1) }}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-(--text-primary)"
          >
            <option value="">All types</option>
            {Object.entries(FLAG_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select
            value={severity}
            onChange={(e) => { setSeverity(e.target.value); setPage(1) }}
            className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-(--text-primary)"
          >
            <option value="">All severities</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>

          <label className="flex items-center gap-2 text-sm text-(--text-secondary) cursor-pointer">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => { setShowResolved(e.target.checked); setPage(1) }}
              className="rounded"
            />
            Show resolved
          </label>

          {flagType && (
            <button
              onClick={() => handleBulkResolve(flagType, severity || undefined)}
              className="ml-auto px-3 py-1.5 bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent)]/30 rounded-lg text-xs font-medium hover:bg-[var(--accent)]/30 transition-colors cursor-pointer"
            >
              Resolve all {FLAG_LABELS[flagType] || flagType}
              {severity ? ` (${severity})` : ''}
            </button>
          )}

          {(flagType || severity) && (
            <button
              onClick={() => { setFlagType(''); setSeverity(''); setPage(1) }}
              className="px-3 py-1.5 text-xs text-(--text-muted) hover:text-(--text-primary) cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Flags Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-(--text-muted) text-xs">
                <th className="text-left py-2 px-2">Severity</th>
                <th className="text-left py-2 px-2">Type</th>
                <th className="text-left py-2 px-2">Entity</th>
                <th className="text-left py-2 px-2">External ID</th>
                <th className="text-left py-2 px-2">Context</th>
                <th className="text-left py-2 px-2">Date</th>
                <th className="text-right py-2 px-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((flag) => (
                <tr
                  key={flag.flagId}
                  className={`border-b border-[var(--border)] hover:bg-[var(--bg-hover)] ${flag.resolved ? 'opacity-50' : ''}`}
                >
                  <td className="py-2 px-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${SEVERITY_COLORS[flag.severity] || ''}`}>
                      {flag.severity}
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono text-xs text-(--text-primary)">
                    {FLAG_LABELS[flag.flagType] || flag.flagType}
                  </td>
                  <td className="py-2 px-2 text-xs text-(--text-secondary)">
                    {flag.entityType && (
                      <span>
                        {flag.entityType}
                        {flag.entityId ? ` #${flag.entityId}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 font-mono text-xs text-(--text-muted) max-w-[200px] truncate">
                    {flag.externalId}
                  </td>
                  <td className="py-2 px-2 text-xs text-(--text-muted) max-w-[300px]">
                    <code className="text-xs break-all">
                      {JSON.stringify(flag.context).slice(0, 120)}
                      {JSON.stringify(flag.context).length > 120 ? '...' : ''}
                    </code>
                  </td>
                  <td className="py-2 px-2 text-xs text-(--text-muted) whitespace-nowrap">
                    {new Date(flag.createdAt).toLocaleDateString('fr-FR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-2 px-2 text-right">
                    {!flag.resolved && (
                      <button
                        onClick={() => handleResolve(flag.flagId)}
                        className="text-xs text-[var(--accent)] hover:underline cursor-pointer"
                      >
                        Resolve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {data?.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-(--text-muted)">
                    No flags found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.meta.lastPage > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border)]">
            <span className="text-xs text-(--text-muted)">
              Page {data.meta.currentPage} of {data.meta.lastPage} ({data.meta.total} total)
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg disabled:opacity-30 cursor-pointer"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= data.meta.lastPage}
                className="px-3 py-1 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg disabled:opacity-30 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
