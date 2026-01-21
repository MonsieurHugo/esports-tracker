'use client'

import { useCallback } from 'react'
import type { TeamLeaderboardEntry } from '@/lib/types'
import type { DashboardPeriod } from '@/lib/types'
import api from '@/lib/api'
import { sanitizeSlug } from '@/lib/utils'
import SearchDropdown, { type SearchDropdownItem } from './SearchDropdown'
import LeagueTag from '@/components/ui/LeagueTag'

interface TeamSearchItem extends SearchDropdownItem {
  entry: TeamLeaderboardEntry
}

interface TeamSearchDropdownProps {
  selectedTeams: TeamLeaderboardEntry[]
  onSelect: (team: TeamLeaderboardEntry) => void
  onClear: () => void
  period: DashboardPeriod
  refDate: string
  selectedLeagues: string[]
  lockedTeamIds: number[]
  onToggleLock: (teamId: number) => void
}

export default function TeamSearchDropdown({
  selectedTeams,
  onSelect,
  onClear,
  period,
  refDate,
  selectedLeagues,
  lockedTeamIds,
  onToggleLock,
}: TeamSearchDropdownProps) {
  // Transform TeamLeaderboardEntry to SearchDropdownItem
  const toSearchItem = (entry: TeamLeaderboardEntry): TeamSearchItem => ({
    id: entry.team.teamId,
    name: entry.team.currentName,
    secondaryText: entry.team.league || entry.team.region,
    imageUrl: `/images/teams/${sanitizeSlug(entry.team.shortName)}.png`,
    imageFallback: entry.team.shortName.substring(0, 2),
    badge: entry.team.league ? (
      <LeagueTag league={entry.team.league} />
    ) : null,
    entry,
  })

  const selectedItems = selectedTeams.map(toSearchItem)

  const handleFetch = useCallback(async (): Promise<TeamSearchItem[]> => {
    const res = await api.get<{
      data: TeamLeaderboardEntry[]
      meta: { total: number }
    }>('/lol/dashboard/teams', {
      params: {
        period,
        date: refDate,
        leagues: selectedLeagues.length > 0 ? selectedLeagues : undefined,
        sortBy: 'lp',
        limit: 100,
      },
    })
    return (res.data || []).map(toSearchItem)
  }, [period, refDate, selectedLeagues])

  const handleSelect = useCallback((item: TeamSearchItem) => {
    onSelect(item.entry)
  }, [onSelect])

  const filterItems = useCallback((items: TeamSearchItem[], search: string): TeamSearchItem[] => {
    const searchLower = search.toLowerCase()
    return items.filter((item) =>
      item.entry.team.currentName.toLowerCase().includes(searchLower) ||
      item.entry.team.shortName.toLowerCase().includes(searchLower) ||
      item.entry.team.league?.toLowerCase().includes(searchLower) ||
      item.entry.team.region.toLowerCase().includes(searchLower)
    )
  }, [])

  const handleToggleLock = useCallback(
    (itemId: string | number) => {
      onToggleLock(typeof itemId === 'number' ? itemId : parseInt(itemId, 10))
    },
    [onToggleLock]
  )

  return (
    <SearchDropdown
      selectedItems={selectedItems}
      maxItems={2}
      onSelect={handleSelect}
      onClear={onClear}
      onToggleLock={handleToggleLock}
      onFetch={handleFetch}
      lockedItemIds={lockedTeamIds}
      placeholder="Rechercher une equipe..."
      addPlaceholder="+ equipe"
      emptyMessage="Aucune equipe disponible"
      noResultsMessage="Aucune equipe trouvee"
      filterItems={filterItems}
      refreshKey={`${period}-${refDate}-${selectedLeagues.join(',')}`}
      storageKey="lol_teams"
    />
  )
}
