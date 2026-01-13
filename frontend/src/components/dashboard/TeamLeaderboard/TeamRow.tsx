'use client'

import { memo, useState } from 'react'
import Image from 'next/image'
import type { TeamLeaderboardEntry } from '@/lib/types'
import type { SortOption } from '@/stores/dashboardStore'
import { getRankTextClass, getLeagueTagClasses } from '@/lib/utils'
import PlayerAccordion from './PlayerAccordion'

interface TeamRowProps {
  entry: TeamLeaderboardEntry
  selectionIndex: number | null // 0 = first team (indigo), 1 = second team (orange), null = not selected
  isExpanded: boolean
  onSelect: (entry: TeamLeaderboardEntry) => void
  onToggle: (teamId: number) => void
  sortBy: SortOption
  isPinned?: boolean
  isLocked?: boolean
  onToggleLock?: (teamId: number) => void
}

function TeamRow({ entry, selectionIndex, isExpanded, onSelect, onToggle, sortBy, isPinned, isLocked, onToggleLock }: TeamRowProps) {
  const [logoError, setLogoError] = useState(false)
  const isSelected = selectionIndex !== null

  const handleLockClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleLock?.(entry.team.teamId)
  }

  const handleRowClick = () => {
    onSelect(entry) // Sélectionne l'équipe pour le graphique
  }

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Empêche la sélection de l'équipe
    onToggle(entry.team.teamId) // Toggle l'expansion
  }

  const teamLogoPath = `/images/teams/${entry.team.slug}.png`

  return (
    <div>
      <div
        onClick={handleRowClick}
        className={`
          flex items-center px-2 sm:px-3 py-1.5 cursor-pointer transition-colors duration-150 border-b border-(--border)
          ${selectionIndex === 0 ? 'bg-(--accent)/10 border-l-2 border-l-(--accent)' : ''}
          ${selectionIndex === 1 ? 'bg-(--lol)/10 border-l-2 border-l-(--lol)' : ''}
          ${selectionIndex === null ? 'hover:bg-(--bg-hover)' : ''}
          ${isPinned && selectionIndex === 0 ? 'bg-(--accent)/15 border-b-2 border-b-(--accent)/30' : ''}
          ${isPinned && selectionIndex === 1 ? 'bg-(--lol)/15 border-b-2 border-b-(--lol)/30' : ''}
        `}
      >
        <span className={`font-mono font-semibold text-[10px] sm:text-[11px] w-6 sm:w-7 ${entry.rank === -1 ? 'text-(--text-muted)' : getRankTextClass(entry.rank)}`}>
          {entry.rank === -1 ? '-' : entry.rank}
        </span>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0">
          {!logoError ? (
            <Image
              src={teamLogoPath}
              alt={entry.team.currentName}
              width={24}
              height={24}
              className="w-5 h-5 sm:w-6 sm:h-6 object-contain shrink-0"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="w-5 h-5 sm:w-6 sm:h-6 bg-(--bg-secondary) rounded-sm shrink-0 flex items-center justify-center text-[7px] sm:text-[8px] font-semibold text-(--text-muted)">
              {entry.team.shortName.substring(0, 2)}
            </div>
          )}
          <span className="font-medium text-[11px] sm:text-xs truncate">
            {entry.team.currentName}
          </span>
          {entry.team.league && (
            <span className={`hidden sm:inline text-[9px] px-1.5 py-0.5 rounded-sm shrink-0 ${getLeagueTagClasses(entry.team.league)}`}>
              {entry.team.league}
            </span>
          )}
          {/* Lock button - only visible for selected teams */}
          {isSelected && onToggleLock && (
            <button
              onClick={handleLockClick}
              className={`
                w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-md transition-all duration-200 shrink-0
                ${isLocked
                  ? 'text-(--accent)'
                  : 'text-(--text-muted) hover:text-(--text-secondary) hover:bg-(--bg-secondary)'
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
        <span className={`font-mono font-semibold text-[10px] sm:text-[11px] w-16 sm:w-20 text-right pr-4 ${sortBy === 'lp' ? 'text-(--text-primary)' : 'text-(--text-secondary)'}`}>
          {entry.totalLp > 0 ? entry.totalLp.toLocaleString() : '-'}
        </span>
        <span className={`font-mono font-semibold text-[10px] sm:text-[11px] w-14 sm:w-16 text-right pr-4 ${sortBy === 'games' ? 'text-(--text-primary)' : 'text-(--text-secondary)'}`}>
          {entry.games === -1 ? '-' : entry.games}
        </span>
        <span className={`font-mono font-semibold text-[10px] sm:text-[11px] w-[4.5rem] sm:w-20 text-right pr-4 ${sortBy === 'winrate' ? 'text-(--text-primary)' : 'text-(--text-secondary)'}`}>
          {entry.winrate === -1 || entry.games === 0 ? '-' : `${entry.winrate.toFixed(0)}%`}
        </span>
        <button
          onClick={handleToggleClick}
          className={`
            w-7 h-7 sm:w-8 sm:h-8 -my-1 flex items-center justify-center rounded-md text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-secondary) ml-2 transition-all duration-200
          `}
          title={isExpanded ? 'Masquer les joueurs' : 'Afficher les joueurs'}
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
      <PlayerAccordion players={entry.players} isOpen={isExpanded} />
    </div>
  )
}

export default memo(TeamRow)
