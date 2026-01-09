'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import type { TeamLeaderboardEntry } from '@/lib/types'
import type { DashboardPeriod } from '@/lib/types'
import api from '@/lib/api'
import { getLeagueTagClasses } from '@/lib/utils'

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
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [teams, setTeams] = useState<TeamLeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fermer le dropdown quand on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus input quand on ouvre le dropdown
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Charger toutes les équipes quand on ouvre le dropdown
  const fetchTeams = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await api.get<{
        data: TeamLeaderboardEntry[]
        meta: { total: number }
      }>('/lol/dashboard/teams', {
        params: {
          period,
          date: refDate,
          leagues: selectedLeagues.length > 0 ? selectedLeagues : undefined,
          sortBy: 'lp',
          limit: 100, // Récupérer toutes les équipes
        },
      })
      setTeams(res.data || [])
    } catch (error) {
      console.error('Failed to fetch teams:', error)
      setTeams([])
    } finally {
      setIsLoading(false)
    }
  }, [period, refDate, selectedLeagues])

  useEffect(() => {
    if (isOpen && teams.length === 0) {
      fetchTeams()
    }
  }, [isOpen, teams.length, fetchTeams])

  // Recharger les équipes si les paramètres changent
  useEffect(() => {
    setTeams([])
  }, [period, refDate, selectedLeagues])

  // Filtrer les équipes selon la recherche
  const filteredTeams = useMemo(() => {
    if (!search.trim()) return teams
    const searchLower = search.toLowerCase()
    return teams.filter(
      (entry) =>
        entry.team.currentName.toLowerCase().includes(searchLower) ||
        entry.team.shortName.toLowerCase().includes(searchLower) ||
        entry.team.region.toLowerCase().includes(searchLower)
    )
  }, [teams, search])

  const handleSelect = (team: TeamLeaderboardEntry) => {
    onSelect(team)
    setIsOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClear()
    setSearch('')
  }

  return (
    <div ref={dropdownRef} className="relative flex-1 min-w-[200px]">
      {/* Trigger */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 bg-[var(--bg-card)] border rounded-md px-3 h-[34px] cursor-pointer transition-colors duration-200
          ${isOpen ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/20' : 'border-[var(--border)] hover:border-[var(--text-muted)]'}
        `}
      >
        {selectedTeams.length > 0 ? (
          <>
            <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
              {selectedTeams.map((team, index) => {
                const isLocked = lockedTeamIds.includes(team.team.teamId)
                return (
                  <div key={team.team.teamId} className="flex items-center gap-1 min-w-0">
                    {index > 0 && <span className="text-[var(--text-muted)] text-[10px] font-medium">vs</span>}
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: index === 0 ? 'var(--accent)' : 'var(--lol)' }}
                    />
                    <span className="text-[11px] font-medium truncate">
                      {team.team.currentName}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleLock(team.team.teamId)
                      }}
                      className={`p-0.5 rounded transition-colors flex-shrink-0 ${
                        isLocked
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                      }`}
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
                  </div>
                )
              })}
            </div>
            {selectedTeams.length < 2 && (
              <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0 border border-dashed border-[var(--border)] rounded px-1.5 py-0.5">
                + équipe
              </span>
            )}
            <button
              onClick={handleClear}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
              title="Tout désélectionner"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--text-muted)]">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
              <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span className="text-[11px] text-[var(--text-muted)] flex-1">Rechercher une équipe...</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}>
              <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-md shadow-lg z-50 overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 bg-[var(--bg-secondary)] rounded px-2 py-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--text-muted)]">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
                <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="flex-1 bg-transparent text-[11px] outline-none placeholder:text-[var(--text-muted)]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="max-h-[240px] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-[var(--text-muted)] text-[11px]">
                Chargement...
              </div>
            ) : filteredTeams.length === 0 ? (
              <div className="p-4 text-center text-[var(--text-muted)] text-[11px]">
                {search ? 'Aucune équipe trouvée' : 'Aucune équipe disponible'}
              </div>
            ) : (
              filteredTeams.map((entry) => {
                const selectionIndex = selectedTeams.findIndex((t) => t.team.teamId === entry.team.teamId)
                const isSelected = selectionIndex !== -1
                const isBlocked = selectedTeams.length >= 2 && !isSelected

                return (
                  <div
                    key={entry.team.teamId}
                    onClick={() => !isBlocked && handleSelect(entry)}
                    className={`
                      flex items-center gap-2 px-3 py-2 transition-colors
                      ${isBlocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                      ${selectionIndex === 0 ? 'bg-[var(--accent)]/10 border-l-2 border-l-[var(--accent)]' : ''}
                      ${selectionIndex === 1 ? 'bg-[var(--lol)]/10 border-l-2 border-l-[var(--lol)]' : ''}
                      ${!isSelected && !isBlocked ? 'hover:bg-[var(--bg-hover)]' : ''}
                    `}
                  >
                    {entry.team.logoUrl ? (
                      <img
                        src={entry.team.logoUrl}
                        alt={entry.team.currentName}
                        className="w-5 h-5 object-contain"
                      />
                    ) : (
                      <div className="w-5 h-5 bg-[var(--bg-secondary)] rounded flex items-center justify-center text-[8px] font-bold text-[var(--text-muted)]">
                        {entry.team.shortName.substring(0, 2)}
                      </div>
                    )}
                    <span className="text-[11px] font-medium truncate flex-1">{entry.team.currentName}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${getLeagueTagClasses(entry.team.region)}`}>
                      {entry.team.region}
                    </span>
                    {isSelected && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: selectionIndex === 0 ? 'var(--accent)' : 'var(--lol)' }}
                      />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
