'use client'

import { useCallback } from 'react'
import Image from 'next/image'
import type { PlayerLeaderboardEntry } from '@/lib/types'
import type { DashboardPeriod } from '@/lib/types'
import api from '@/lib/api'
import { getLeagueTagClasses, getRoleImagePath } from '@/lib/utils'
import SearchDropdown, { type SearchDropdownItem } from './SearchDropdown'

interface PlayerSearchItem extends SearchDropdownItem {
  entry: PlayerLeaderboardEntry
}

interface PlayerSearchDropdownProps {
  selectedPlayers: PlayerLeaderboardEntry[]
  onSelect: (player: PlayerLeaderboardEntry) => void
  onClear: () => void
  period: DashboardPeriod
  refDate: string
  selectedLeagues: string[]
  lockedPlayerIds: number[]
  onToggleLock: (playerId: number) => void
}

export default function PlayerSearchDropdown({
  selectedPlayers,
  onSelect,
  onClear,
  period,
  refDate,
  selectedLeagues,
  lockedPlayerIds,
  onToggleLock,
}: PlayerSearchDropdownProps) {
  // Transform PlayerLeaderboardEntry to SearchDropdownItem
  const toSearchItem = (entry: PlayerLeaderboardEntry): PlayerSearchItem => ({
    id: entry.player.playerId,
    name: entry.player.pseudo,
    secondaryText: entry.team?.region,
    imageUrl: entry.team ? `/images/teams/${entry.team.slug}.png` : null,
    entry,
  })

  const selectedItems = selectedPlayers.map(toSearchItem)

  const handleFetch = useCallback(async (): Promise<PlayerSearchItem[]> => {
    const res = await api.get<{
      data: PlayerLeaderboardEntry[]
      meta: { total: number }
    }>('/lol/dashboard/players', {
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

  const handleSelect = useCallback((item: PlayerSearchItem) => {
    onSelect(item.entry)
  }, [onSelect])

  const filterItems = useCallback((items: PlayerSearchItem[], search: string): PlayerSearchItem[] => {
    const searchLower = search.toLowerCase()
    return items.filter((item) =>
      item.entry.player.pseudo.toLowerCase().includes(searchLower) ||
      item.entry.team?.shortName.toLowerCase().includes(searchLower) ||
      item.entry.team?.region.toLowerCase().includes(searchLower) ||
      item.entry.role.toLowerCase().includes(searchLower)
    )
  }, [])

  const renderItem = useCallback((item: PlayerSearchItem, isSelected: boolean, selectionIndex: number) => {
    const entry = item.entry
    const isBlocked = selectedPlayers.length >= 2 && !isSelected

    return (
      <div
        className={`
          flex items-center gap-2 px-3 py-2 transition-colors
          ${isBlocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
          ${selectionIndex === 0 ? 'bg-(--accent)/10 border-l-2 border-l-(--accent)' : ''}
          ${selectionIndex === 1 ? 'bg-(--lol)/10 border-l-2 border-l-(--lol)' : ''}
          ${!isSelected && !isBlocked ? 'hover:bg-(--bg-hover)' : ''}
        `}
      >
        {entry.team ? (
          <Image
            src={`/images/teams/${entry.team.slug}.png`}
            alt={entry.team.shortName}
            width={20}
            height={20}
            className="w-5 h-5 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        ) : (
          <div className="w-5 h-5" />
        )}
        <span className="text-[11px] font-medium truncate flex-1">{entry.player.pseudo}</span>
        <Image
          src={getRoleImagePath(entry.role)}
          alt={entry.role}
          width={14}
          height={14}
          className="w-3.5 h-3.5 object-contain opacity-60"
        />
        {entry.team && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded-sm ${getLeagueTagClasses(entry.team.region)}`}>
            {entry.team.region}
          </span>
        )}
        {isSelected && (
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: selectionIndex === 0 ? 'var(--accent)' : 'var(--lol)' }}
          />
        )}
      </div>
    )
  }, [selectedPlayers.length])

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
      lockedItemIds={lockedPlayerIds}
      placeholder="Rechercher un joueur..."
      addPlaceholder="+ joueur"
      emptyMessage="Aucun joueur disponible"
      noResultsMessage="Aucun joueur trouve"
      filterItems={filterItems}
      renderItem={renderItem}
      refreshKey={`${period}-${refDate}-${selectedLeagues.join(',')}`}
      storageKey="lol_players"
    />
  )
}
