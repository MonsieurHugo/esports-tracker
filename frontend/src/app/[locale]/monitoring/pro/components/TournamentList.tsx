'use client'

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'

interface Tournament {
  id: number
  externalId: string
  name: string
  year: number | null
  split: string | null
  tournamentLevel: string | null
  startDate: string | null
  endDate: string | null
  matchCount: number
  gameCount: number
  leagueId: number | null
  leagueName: string | null
  leagueShortName: string | null
  parentTournamentId: number | null
  childCount: number
}

interface League {
  id: number
  name: string
  shortName: string | null
}

interface TournamentListProps {
  onSelect: (tournamentId: number) => void
}

export default function TournamentList({ onSelect }: TournamentListProps) {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [selectedLeagueFilter, setSelectedLeagueFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [assigningId, setAssigningId] = useState<number | null>(null)

  const fetchLeagues = useCallback(async () => {
    try {
      const data = await api.get<{ data: League[] }>('/pro/monitoring/leagues')
      setLeagues(data.data)
    } catch (error) {
      logError('Failed to fetch leagues', error)
    }
  }, [])

  const fetchTournaments = useCallback(async () => {
    setIsLoading(true)
    try {
      const params: Record<string, string> = {}
      if (selectedYear !== null) params.year = String(selectedYear)
      if (selectedLeagueFilter) params.leagueId = selectedLeagueFilter
      if (search.trim().length >= 2) params.search = search.trim()

      const data = await api.get<{ data: Tournament[] }>('/pro/monitoring/tournaments', { params })
      setTournaments(data.data)
    } catch (error) {
      logError('Failed to fetch tournaments', error)
    } finally {
      setIsLoading(false)
    }
  }, [selectedYear, selectedLeagueFilter, search])

  useEffect(() => {
    fetchLeagues()
  }, [fetchLeagues])

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTournaments()
    }, search ? 300 : 0)

    return () => clearTimeout(timer)
  }, [fetchTournaments, search])

  const handleAssignLeague = async (tournamentId: number, leagueId: number | null) => {
    try {
      await api.patch(`/pro/monitoring/tournaments/${tournamentId}/league`, { leagueId })
      setAssigningId(null)
      fetchTournaments()
    } catch (error) {
      logError('Failed to assign league', error)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
    })
  }

  // Group tournaments by (league, year, split) for visual hierarchy
  const orderedTournaments = useMemo(() => {
    // Build parent→children map for GRID tournaments with real parent_tournament_id
    const childrenByParent = new Map<number, Tournament[]>()
    for (const t of tournaments) {
      if (t.parentTournamentId) {
        const siblings = childrenByParent.get(t.parentTournamentId) || []
        siblings.push(t)
        childrenByParent.set(t.parentTournamentId, siblings)
      }
    }

    // Group remaining tournaments by (leagueId, year, split)
    const groups = new Map<string, Tournament[]>()
    const ungrouped: Tournament[] = []

    for (const t of tournaments) {
      // Skip GRID children — they'll be placed under their parent
      if (t.parentTournamentId && !t.externalId.startsWith('lp:')) {
        continue
      }

      if (t.leagueId && t.year && t.split) {
        const key = `${t.leagueId}:${t.year}:${t.split}`
        const group = groups.get(key) || []
        group.push(t)
        groups.set(key, group)
      } else {
        ungrouped.push(t)
      }
    }

    const result: { tournament: Tournament; isChild: boolean; groupHeader?: string }[] = []

    const appendChildren = (parentId: number) => {
      const children = childrenByParent.get(parentId)
      if (children) {
        for (const child of children) {
          result.push({ tournament: child, isChild: true })
        }
      }
    }

    // Emit grouped tournaments
    for (const [, group] of groups) {
      if (group.length === 1) {
        // Single tournament in group — no header needed
        result.push({ tournament: group[0], isChild: false })
        appendChildren(group[0].id)
      } else {
        // Multiple tournaments — show group header
        const first = group[0]
        const header = `${first.leagueShortName || first.leagueName || 'League'} ${first.year} ${first.split}`
        result.push({ tournament: group[0], isChild: true, groupHeader: header })
        for (let i = 1; i < group.length; i++) {
          result.push({ tournament: group[i], isChild: true })
        }
        // Append GRID children for each group member
        for (const t of group) {
          appendChildren(t.id)
        }
      }
    }

    // Emit ungrouped tournaments
    for (const t of ungrouped) {
      result.push({ tournament: t, isChild: false })
      appendChildren(t.id)
    }

    return result
  }, [tournaments])

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
      {/* Header with filters */}
      <div className="py-2 px-3 border-b border-[var(--border)]">
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={selectedYear ?? ''}
            onChange={(e) => setSelectedYear(e.target.value ? Number(e.target.value) : null)}
            className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary)"
          >
            <option value="">All Years</option>
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
            <option value={2024}>2024</option>
          </select>
          <select
            value={selectedLeagueFilter}
            onChange={(e) => setSelectedLeagueFilter(e.target.value)}
            className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary)"
          >
            <option value="">All Leagues</option>
            <option value="unassigned">Unassigned</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.shortName || l.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary) placeholder:text-(--text-muted)"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-(--text-muted) border-b border-[var(--border)]">
              <th className="text-left py-2 px-3 font-medium">Tournament</th>
              <th className="text-left py-2 px-3 font-medium">League</th>
              <th className="text-left py-2 px-3 font-medium">Dates</th>
              <th className="text-right py-2 px-3 font-medium">M</th>
              <th className="text-right py-2 px-3 font-medium">G</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b border-[var(--border)]">
                  <td className="py-1.5 px-3"><Skeleton className="h-4 w-48" /></td>
                  <td className="py-1.5 px-3"><Skeleton className="h-4 w-16" /></td>
                  <td className="py-1.5 px-3"><Skeleton className="h-4 w-20" /></td>
                  <td className="py-1.5 px-3"><Skeleton className="h-4 w-8 ml-auto" /></td>
                  <td className="py-1.5 px-3"><Skeleton className="h-4 w-8 ml-auto" /></td>
                </tr>
              ))
            ) : tournaments.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-(--text-muted) text-sm">
                  No tournaments found
                </td>
              </tr>
            ) : (
              orderedTournaments.map(({ tournament: t, isChild, groupHeader }) => (
                <React.Fragment key={t.id}>
                  {groupHeader && (
                    <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                      <td colSpan={5} className="py-1.5 px-3">
                        <span className="text-xs font-semibold text-(--text-muted) uppercase tracking-wide">
                          {groupHeader}
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr
                    className="border-b border-[var(--border)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <td
                      className="py-1.5 px-3 cursor-pointer"
                      onClick={() => onSelect(t.id)}
                    >
                      <span className={`text-sm font-medium ${isChild ? 'text-(--text-secondary)' : 'text-(--text-primary)'}`}>
                        {isChild && <span className="text-(--text-muted) mr-1">{'\u2514'}</span>}
                        {t.name}
                        {t.childCount > 0 && (
                          <span className="ml-1.5 text-xs text-(--text-muted) font-normal">
                            ({t.childCount} {t.childCount === 1 ? 'phase' : 'phases'})
                          </span>
                        )}
                      </span>
                    </td>
                  <td className="py-1.5 px-3">
                    {assigningId === t.id ? (
                      <select
                        autoFocus
                        value={t.leagueId || ''}
                        onChange={(e) => {
                          const value = e.target.value
                          handleAssignLeague(t.id, value ? Number(value) : null)
                        }}
                        onBlur={() => setAssigningId(null)}
                        className="px-1.5 py-0.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-(--text-primary)"
                      >
                        <option value="">--</option>
                        {leagues.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.shortName || l.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setAssigningId(t.id)
                        }}
                        className={`px-1.5 py-0.5 text-xs rounded transition-colors ${
                          t.leagueName
                            ? 'bg-[var(--accent)]/20 text-[var(--accent)] hover:bg-[var(--accent)]/30'
                            : 'bg-[var(--bg-secondary)] text-(--text-muted) hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        {t.leagueShortName || t.leagueName || '+'}
                      </button>
                    )}
                  </td>
                  <td className="py-1.5 px-3 text-xs text-(--text-muted)">
                    {formatDate(t.startDate)} - {formatDate(t.endDate)}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs text-(--text-primary)">
                    {t.matchCount}
                  </td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs text-(--text-primary)">
                    {t.gameCount}
                  </td>
                </tr>
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
