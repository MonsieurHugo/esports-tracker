'use client'

import { memo, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { PlayerLeaderboardEntry } from '@/lib/types'
import type { SortOption, ItemsPerPageOption, LeaderboardView } from '@/stores/dashboardStore'
import { getRankTextClass, getLeagueTagClasses, getRoleImagePath } from '@/lib/utils'
import Pagination from '../TeamLeaderboard/Pagination'
import AccountAccordion from './AccountAccordion'
import LeaderboardHeader from '../LeaderboardHeader'

interface PlayerLeaderboardProps {
  data: PlayerLeaderboardEntry[]
  isLoading?: boolean
  currentPage: number
  totalItems: number
  itemsPerPage: ItemsPerPageOption
  onPageChange: (page: number) => void
  onItemsPerPageChange: (count: ItemsPerPageOption) => void
  selectedPlayers: PlayerLeaderboardEntry[]
  onSelectPlayer: (player: PlayerLeaderboardEntry) => void
  sortBy: SortOption
  onSortChange: (sort: SortOption) => void
  lockedPlayerIds: number[]
  onToggleLock: (playerId: number) => void
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

function getRankImagePath(tier: string | null): string | null {
  if (!tier) return null
  const tierLower = tier.toLowerCase()
  // challenger.webp is different extension
  if (tierLower === 'challenger') return '/images/ranks/challenger.webp'
  return `/images/ranks/${tierLower}.png`
}

interface PlayerRowProps {
  entry: PlayerLeaderboardEntry
  sortBy: SortOption
  selectionIndex: number | null
  isExpanded: boolean
  onSelect: (entry: PlayerLeaderboardEntry) => void
  onToggle: (playerId: number) => void
  isPinned?: boolean
  isLocked?: boolean
  onToggleLock?: (playerId: number) => void
}

function PlayerRow({ entry, sortBy, selectionIndex, isExpanded, onSelect, onToggle, isPinned, isLocked, onToggleLock }: PlayerRowProps) {
  const [logoError, setLogoError] = useState(false)
  const [roleError, setRoleError] = useState(false)
  const [rankError, setRankError] = useState(false)
  const isSelected = selectionIndex !== null

  const teamLogoPath = entry.team ? `/images/teams/${entry.team.slug}.png` : null
  const roleImagePath = getRoleImagePath(entry.role)
  const rankImagePath = getRankImagePath(entry.tier)

  const handleRowClick = () => {
    onSelect(entry)
  }

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggle(entry.player.playerId)
  }

  const handleLockClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleLock?.(entry.player.playerId)
  }

  return (
    <div>
      <div
        onClick={handleRowClick}
        className={`
          flex items-center px-2 sm:px-3 py-1.5 border-b border-[var(--border)] cursor-pointer transition-colors duration-150
          ${selectionIndex === 0 ? 'bg-[var(--accent)]/10 border-l-2 border-l-[var(--accent)]' : ''}
          ${selectionIndex === 1 ? 'bg-[var(--lol)]/10 border-l-2 border-l-[var(--lol)]' : ''}
          ${selectionIndex === null ? 'hover:bg-[var(--bg-hover)]' : ''}
          ${isPinned && selectionIndex === 0 ? 'bg-[var(--accent)]/15 border-b-2 border-b-[var(--accent)]/30' : ''}
          ${isPinned && selectionIndex === 1 ? 'bg-[var(--lol)]/15 border-b-2 border-b-[var(--lol)]/30' : ''}
        `}
      >
        {/* Rank */}
        <span className={`font-mono font-semibold text-[10px] sm:text-[11px] w-6 sm:w-7 ${getRankTextClass(entry.rank)}`}>
          {entry.rank}
        </span>

        {/* Player info */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
          {/* Team logo */}
          {teamLogoPath && !logoError ? (
            <Image
              src={teamLogoPath}
              alt={entry.team?.shortName || ''}
              width={20}
              height={20}
              className="w-4 h-4 sm:w-5 sm:h-5 object-contain flex-shrink-0"
              onError={() => setLogoError(true)}
            />
          ) : entry.team ? (
            <div className="w-4 h-4 sm:w-5 sm:h-5 bg-[var(--bg-secondary)] rounded flex-shrink-0 flex items-center justify-center text-[6px] sm:text-[7px] font-semibold text-[var(--text-muted)]">
              {entry.team.shortName.substring(0, 2)}
            </div>
          ) : null}

          {/* Player name */}
          <Link
            href={`/lol/player/${entry.player.slug}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-[11px] sm:text-xs truncate hover:text-[var(--accent)] hover:underline transition-colors"
          >
            {entry.player.pseudo}
          </Link>

          {/* Role image */}
          {!roleError ? (
            <Image
              src={roleImagePath}
              alt={entry.role}
              width={16}
              height={16}
              className="w-3.5 h-3.5 sm:w-4 sm:h-4 object-contain flex-shrink-0 opacity-70"
              onError={() => setRoleError(true)}
            />
          ) : (
            <span className="text-[8px] sm:text-[9px] px-1 py-0.5 bg-[var(--bg-secondary)] text-[var(--text-muted)] rounded flex-shrink-0">
              {entry.role}
            </span>
          )}

          {/* League tag */}
          {entry.team && (
            <span className={`hidden sm:inline text-[9px] px-1.5 py-0.5 rounded flex-shrink-0 ${getLeagueTagClasses(entry.team.region)}`}>
              {entry.team.region}
            </span>
          )}
          {/* Lock button - only visible for selected players */}
          {isSelected && onToggleLock && (
            <button
              onClick={handleLockClick}
              className={`
                w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-md transition-all duration-200 flex-shrink-0
                ${isLocked
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                }
              `}
              title={isLocked ? 'Désépingler' : 'Épingler en haut'}
            >
              {isLocked ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Rank image */}
        <div className="hidden sm:flex items-center justify-end w-12 pr-2">
          {rankImagePath && !rankError ? (
            <Image
              src={rankImagePath}
              alt={entry.tier || ''}
              width={24}
              height={24}
              className="w-5 h-5 sm:w-6 sm:h-6 object-contain"
              onError={() => setRankError(true)}
            />
          ) : (
            <span className="text-[9px] text-[var(--text-muted)]">-</span>
          )}
        </div>

        {/* LP */}
        <span className={`font-mono font-semibold text-[10px] sm:text-[11px] w-14 sm:w-16 text-right pr-3 ${sortBy === 'lp' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
          {entry.totalLp > 0 ? entry.totalLp.toLocaleString() : '-'}
        </span>

        {/* Games */}
        <span className={`font-mono font-semibold text-[10px] sm:text-[11px] w-10 sm:w-14 text-right pr-3 ${sortBy === 'games' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
          {entry.games}
        </span>

        {/* Winrate */}
        <span className={`font-mono font-semibold text-[10px] sm:text-[11px] w-12 sm:w-14 text-right ${sortBy === 'winrate' ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
          {entry.games > 0 ? `${entry.winrate.toFixed(0)}%` : '-'}
        </span>

        {/* Expand button */}
        <button
          onClick={handleToggleClick}
          className={`
            w-7 h-7 sm:w-8 sm:h-8 -my-1 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] ml-2 transition-all duration-200
          `}
          title={isExpanded ? 'Masquer les comptes' : 'Afficher les comptes'}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          >
            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      <AccountAccordion accounts={entry.accounts} isOpen={isExpanded} />
    </div>
  )
}

const MemoizedPlayerRow = memo(PlayerRow)

export default function PlayerLeaderboard({
  data,
  isLoading,
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  selectedPlayers,
  onSelectPlayer,
  sortBy,
  onSortChange,
  lockedPlayerIds,
  onToggleLock,
  leagueFilter,
  leaderboardView,
  onViewChange,
}: PlayerLeaderboardProps) {
  // Set pour permettre plusieurs joueurs expanded en même temps
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<Set<number>>(new Set())

  // Réorganiser les données pour mettre les joueurs lockés en premier
  const displayData = useMemo(() => {
    if (lockedPlayerIds.length === 0) return data

    const lockedSet = new Set(lockedPlayerIds)
    const pinnedPlayers: PlayerLeaderboardEntry[] = []

    // Pour chaque joueur locké, chercher les données mises à jour
    for (const playerId of lockedPlayerIds) {
      const player = data.find((e) => e.player.playerId === playerId)
      if (player) {
        pinnedPlayers.push(player)
      } else {
        const selected = selectedPlayers.find((p) => p.player.playerId === playerId)
        if (selected) pinnedPlayers.push(selected)
      }
    }

    // Filtrer les joueurs non lockés
    const otherPlayers = data.filter((e) => !lockedSet.has(e.player.playerId))

    return [...pinnedPlayers, ...otherPlayers]
  }, [data, selectedPlayers, lockedPlayerIds])

  // Helper to get selection index
  const getSelectionIndex = useCallback((playerId: number): number | null => {
    const index = selectedPlayers.findIndex((p) => p.player.playerId === playerId)
    return index === -1 ? null : index
  }, [selectedPlayers])

  const handleToggleExpand = useCallback((playerId: number) => {
    setExpandedPlayerIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(playerId)) {
        newSet.delete(playerId)
      } else {
        newSet.add(playerId)
      }
      return newSet
    })
  }, [])

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
          <span className="flex-1 min-w-0">Joueur</span>
          <span className="hidden sm:block w-12 pr-2 text-right">Rang</span>
          <span
            onClick={() => onSortChange('lp')}
            className={`w-14 sm:w-16 pr-3 text-right cursor-pointer hover:text-[var(--text-primary)] transition-colors ${sortBy === 'lp' ? 'text-[var(--text-primary)]' : ''}`}
          >
            LP<SortIcon active={sortBy === 'lp'} />
          </span>
          <span
            onClick={() => onSortChange('games')}
            className={`w-10 sm:w-14 pr-3 text-right cursor-pointer hover:text-[var(--text-primary)] transition-colors ${sortBy === 'games' ? 'text-[var(--text-primary)]' : ''}`}
          >
            Games<SortIcon active={sortBy === 'games'} />
          </span>
          <span
            onClick={() => onSortChange('winrate')}
            className={`w-12 sm:w-14 text-right cursor-pointer hover:text-[var(--text-primary)] transition-colors ${sortBy === 'winrate' ? 'text-[var(--text-primary)]' : ''}`}
          >
            WR<SortIcon active={sortBy === 'winrate'} />
          </span>
          <span className="w-7 sm:w-8 ml-2"></span>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-[420px] relative overflow-hidden">
        {/* Loading/Empty overlay */}
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
            const selectionIndex = getSelectionIndex(entry.player.playerId)
            return (
              <MemoizedPlayerRow
                key={entry.player.playerId}
                entry={entry}
                sortBy={sortBy}
                selectionIndex={selectionIndex}
                isExpanded={expandedPlayerIds.has(entry.player.playerId)}
                onSelect={onSelectPlayer}
                onToggle={handleToggleExpand}
                isPinned={lockedPlayerIds.includes(entry.player.playerId)}
                isLocked={lockedPlayerIds.includes(entry.player.playerId)}
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
