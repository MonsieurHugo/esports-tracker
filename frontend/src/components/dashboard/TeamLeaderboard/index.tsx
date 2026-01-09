'use client'

import { useState, useCallback, useMemo } from 'react'
import type { TeamLeaderboardEntry } from '@/lib/types'
import type { SortOption, ItemsPerPageOption, LeaderboardView } from '@/stores/dashboardStore'
import TeamRow from './TeamRow'
import Pagination from './Pagination'
import LeaderboardHeader from '../LeaderboardHeader'

interface TeamLeaderboardProps {
  data: TeamLeaderboardEntry[]
  isLoading?: boolean
  currentPage: number
  totalItems: number
  itemsPerPage: ItemsPerPageOption
  onPageChange: (page: number) => void
  onItemsPerPageChange: (count: ItemsPerPageOption) => void
  selectedTeams: TeamLeaderboardEntry[]
  onSelectTeam: (team: TeamLeaderboardEntry) => void
  sortBy: SortOption
  onSortChange: (sort: SortOption) => void
  lockedTeamIds: number[]
  onToggleLock: (teamId: number) => void
  leagueFilter?: React.ReactNode
  leaderboardView: LeaderboardView
  onViewChange: (view: LeaderboardView) => void
}

function SortIcon({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 10 10"
      fill="currentColor"
      className="inline-block ml-0.5 -mt-0.5"
    >
      <path d="M5 7L1 3h8L5 7z" />
    </svg>
  )
}

export default function TeamLeaderboard({
  data,
  isLoading,
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  selectedTeams,
  onSelectTeam,
  sortBy,
  onSortChange,
  lockedTeamIds,
  onToggleLock,
  leagueFilter,
  leaderboardView,
  onViewChange,
}: TeamLeaderboardProps) {
  // Set pour permettre plusieurs équipes expanded en même temps
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<number>>(new Set())

  // Réorganiser les données pour mettre les équipes lockées en premier
  const displayData = useMemo(() => {
    if (lockedTeamIds.length === 0) return data

    const lockedSet = new Set(lockedTeamIds)
    const pinnedTeams: TeamLeaderboardEntry[] = []

    // Pour chaque équipe lockée, chercher les données mises à jour
    for (const teamId of lockedTeamIds) {
      const team = data.find((e) => e.team.teamId === teamId)
      // Si pas dans data, chercher dans selectedTeams
      if (team) {
        pinnedTeams.push(team)
      } else {
        const selected = selectedTeams.find((t) => t.team.teamId === teamId)
        if (selected) pinnedTeams.push(selected)
      }
    }

    // Filtrer les équipes non lockées
    const otherTeams = data.filter((e) => !lockedSet.has(e.team.teamId))

    return [...pinnedTeams, ...otherTeams]
  }, [data, selectedTeams, lockedTeamIds])

  // Helper pour obtenir l'index de sélection d'une équipe
  const getSelectionIndex = useCallback((teamId: number): number | null => {
    const index = selectedTeams.findIndex((t) => t.team.teamId === teamId)
    return index === -1 ? null : index
  }, [selectedTeams])

  const handleToggleExpand = useCallback((teamId: number) => {
    setExpandedTeamIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(teamId)) {
        newSet.delete(teamId)
      } else {
        newSet.add(teamId)
      }
      return newSet
    })
  }, [])

  const handleSelectTeam = useCallback((entry: TeamLeaderboardEntry) => {
    onSelectTeam(entry) // Le store gère la logique de sélection/déselection
  }, [onSelectTeam])

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
      {/* Header */}
      <LeaderboardHeader
        view={leaderboardView}
        onViewChange={onViewChange}
        leagueFilter={leagueFilter}
      />

      {/* Table Header */}
      <div className="bg-[var(--bg-secondary)]">
        <div className="flex items-center px-2 sm:px-3 py-2 text-[10px] sm:text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
          <span className="w-6 sm:w-7">#</span>
          <span className="flex-1 min-w-0">Équipe</span>
          <span
            onClick={() => onSortChange('lp')}
            className={`w-16 sm:w-20 pr-3 text-right cursor-pointer hover:text-[var(--text-primary)] transition-colors ${sortBy === 'lp' ? 'text-[var(--text-primary)]' : ''}`}
          >
            LP<SortIcon active={sortBy === 'lp'} />
          </span>
          <span
            onClick={() => onSortChange('games')}
            className={`w-12 sm:w-16 pr-3 text-right cursor-pointer hover:text-[var(--text-primary)] transition-colors ${sortBy === 'games' ? 'text-[var(--text-primary)]' : ''}`}
          >
            Games<SortIcon active={sortBy === 'games'} />
          </span>
          <span
            onClick={() => onSortChange('winrate')}
            className={`w-14 sm:w-16 text-right cursor-pointer hover:text-[var(--text-primary)] transition-colors ${sortBy === 'winrate' ? 'text-[var(--text-primary)]' : ''}`}
          >
            Winrate<SortIcon active={sortBy === 'winrate'} />
          </span>
          <span className="w-7 sm:w-8 ml-2"></span>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-[420px] relative overflow-hidden">
        {/* Loading/Empty overlay avec transition */}
        <div
          className={`
            absolute inset-0 bg-[var(--bg-card)] z-10 flex items-center justify-center
            transition-opacity duration-200
            ${isLoading || data.length === 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}
          `}
        >
          <div className="text-[var(--text-muted)] text-sm">
            {isLoading ? 'Chargement...' : 'Aucune donnée'}
          </div>
        </div>
        {/* Content */}
        <div>
          {displayData.map((entry, index) => {
            const selectionIndex = getSelectionIndex(entry.team.teamId)
            return (
              <TeamRow
                key={entry.team.teamId}
                entry={entry}
                selectionIndex={selectionIndex}
                isExpanded={expandedTeamIds.has(entry.team.teamId)}
                onSelect={handleSelectTeam}
                onToggle={handleToggleExpand}
                sortBy={sortBy}
                isPinned={lockedTeamIds.includes(entry.team.teamId)}
                isLocked={lockedTeamIds.includes(entry.team.teamId)}
                onToggleLock={onToggleLock}
              />
            )
          })}
        </div>
      </div>

      {/* Pagination */}
      {totalItems > 0 && (
        <Pagination
          currentPage={currentPage}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={onPageChange}
          onItemsPerPageChange={onItemsPerPageChange}
        />
      )}
    </div>
  )
}
