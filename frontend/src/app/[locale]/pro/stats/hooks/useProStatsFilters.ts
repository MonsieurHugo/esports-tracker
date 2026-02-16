'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import type { FilterMapResponse } from '@/lib/types'

const TIER_LABELS: Record<number, string> = { 1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3' }

export interface AvailableOptions {
  years: number[]
  leagues: { leagueId: number; name: string; shortName: string | null; tier: number }[]
  tournaments: { tournamentId: number; name: string }[]
  teams: { teamId: number; name: string; shortName: string }[]
  players: { playerId: number; name: string }[]
  tiers: number[]
}

export interface ProStatsFilters {
  // State
  selectedYears: Set<number>
  selectedLeagueIds: Set<number>
  selectedTournamentIds: Set<number>
  selectedTeamIds: Set<number>
  selectedPlayerIds: Set<number>
  role: string | null
  selectedTier: number | null
  playoffsFilter: 'all' | 'season' | 'playoffs'

  // Setters
  setSelectedYears: (v: Set<number>) => void
  setSelectedLeagueIds: (v: Set<number>) => void
  setSelectedTournamentIds: (v: Set<number>) => void
  setSelectedTeamIds: (v: Set<number>) => void
  setSelectedPlayerIds: (v: Set<number>) => void
  setRole: (v: string | null) => void
  setSelectedTier: (v: number | null) => void
  setPlayoffsFilter: (v: 'all' | 'season' | 'playoffs') => void

  // Derived
  availableOptions: AvailableOptions
  filterMapLoading: boolean
  buildParams: () => Record<string, string>
  resetFilters: () => void
}

export { TIER_LABELS }

export function useProStatsFilters(defaultYears?: Set<number>): ProStatsFilters {
  const [selectedYears, setSelectedYears] = useState<Set<number>>(defaultYears ?? new Set())
  const [selectedLeagueIds, setSelectedLeagueIds] = useState<Set<number>>(new Set())
  const [selectedTournamentIds, setSelectedTournamentIds] = useState<Set<number>>(new Set())
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<number>>(new Set())
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(new Set())
  const [role, setRole] = useState<string | null>(null)
  const [selectedTier, setSelectedTier] = useState<number | null>(null)
  const [playoffsFilter, setPlayoffsFilter] = useState<'all' | 'season' | 'playoffs'>('all')

  // Filter map data (loaded once at mount)
  const [filterMap, setFilterMap] = useState<FilterMapResponse | null>(null)
  const [filterMapLoading, setFilterMapLoading] = useState(true)

  // Load filter map once at mount
  useEffect(() => {
    const ctrl = new AbortController()
    api.get<FilterMapResponse>('/pro/stats/filter-map', { signal: ctrl.signal })
      .then((data) => {
        if (!ctrl.signal.aborted) setFilterMap(data)
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return
        logError('Failed to fetch filter map', error)
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setFilterMapLoading(false)
      })
    return () => ctrl.abort()
  }, [])

  // Independent filters: return all lists directly from the backend (no cascading)
  const availableOptions = useMemo<AvailableOptions>(() => {
    if (!filterMap) return { years: [], leagues: [], tournaments: [], teams: [], players: [], tiers: [] }

    return {
      years: filterMap.years,
      leagues: [...filterMap.leagues].sort((a, b) => (a.shortName || a.name).localeCompare(b.shortName || b.name)),
      tournaments: [...filterMap.tournaments].sort((a, b) => a.name.localeCompare(b.name)),
      teams: [...filterMap.teams].sort((a, b) => a.shortName.localeCompare(b.shortName)),
      players: [...filterMap.players].sort((a, b) => a.name.localeCompare(b.name)),
      tiers: filterMap.tiers,
    }
  }, [filterMap])

  const defaultYearsRef = defaultYears

  const resetFilters = useCallback(() => {
    setSelectedYears(defaultYearsRef ? new Set(defaultYearsRef) : new Set())
    setSelectedLeagueIds(new Set())
    setSelectedTournamentIds(new Set())
    setSelectedTeamIds(new Set())
    setSelectedPlayerIds(new Set())
    setRole(null)
    setSelectedTier(null)
    setPlayoffsFilter('all')
  }, [defaultYearsRef])

  const buildParams = useCallback(() => {
    const params: Record<string, string> = {}
    if (selectedYears.size > 0) params.years = [...selectedYears].join(',')
    if (selectedLeagueIds.size > 0) params.leagueIds = [...selectedLeagueIds].join(',')
    if (selectedTournamentIds.size > 0) params.tournamentIds = [...selectedTournamentIds].join(',')
    if (selectedTeamIds.size > 0) params.teamIds = [...selectedTeamIds].join(',')
    if (selectedPlayerIds.size > 0) params.playerIds = [...selectedPlayerIds].join(',')
    if (role) params.role = role
    if (selectedTier !== null) params.tier = String(selectedTier)
    if (playoffsFilter !== 'all') params.isPlayoffs = playoffsFilter === 'playoffs' ? 'true' : 'false'
    return params
  }, [selectedYears, selectedLeagueIds, selectedTournamentIds, selectedTeamIds, selectedPlayerIds, role, selectedTier, playoffsFilter])

  return {
    selectedYears,
    selectedLeagueIds,
    selectedTournamentIds,
    selectedTeamIds,
    selectedPlayerIds,
    role,
    selectedTier,
    playoffsFilter,
    setSelectedYears,
    setSelectedLeagueIds,
    setSelectedTournamentIds,
    setSelectedTeamIds,
    setSelectedPlayerIds,
    setRole,
    setSelectedTier,
    setPlayoffsFilter,
    availableOptions,
    filterMapLoading,
    buildParams,
    resetFilters,
  }
}
