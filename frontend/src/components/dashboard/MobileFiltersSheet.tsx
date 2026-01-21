'use client'

import { memo } from 'react'
import Image from 'next/image'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { useUIStore, type LeaderboardView } from '@/stores/uiStore'
import { VALID_ROLES } from '@/lib/constants'
import type { LeagueInfo, DashboardPeriod } from '@/lib/types'

// Default colors if league doesn't have one in DB
const DEFAULT_COLORS: Record<string, string> = {
  'LEC': '#00e5bf',
  'LFL': '#ff7b57',
  'LCK': '#f5e6d3',
  'LCS': '#0a7cff',
  'LPL': '#de2910',
  'LCKCL': '#a855f7',
  'LCP': '#22c55e',
  'CBLOL': '#10b981',
  'LTAS': '#14b8a6',
  'LTAN': '#06b6d4',
}

const GAME_PRESETS = [0, 5, 10, 20, 50]

const periods: { value: DashboardPeriod; label: string }[] = [
  { value: '7d', label: '7 jours' },
  { value: '14d', label: '14 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
]

interface MobileFiltersSheetProps {
  // Period
  period: DashboardPeriod
  onPeriodChange: (period: DashboardPeriod) => void
  // View
  leaderboardView: LeaderboardView
  onViewChange: (view: LeaderboardView) => void
  // Leagues
  selectedLeagues: string[]
  onToggleLeague: (league: string) => void
  onSelectAllLeagues: () => void
  leagues: LeagueInfo[]
  // Roles
  selectedRoles: string[]
  onToggleRole: (role: string) => void
  onSelectAllRoles: () => void
  // Min games
  minGames: number
  onMinGamesChange: (value: number) => void
  // Reset
  onResetFilters: () => void
}

function MobileFiltersSheet({
  period,
  onPeriodChange,
  leaderboardView,
  onViewChange,
  selectedLeagues,
  onToggleLeague,
  onSelectAllLeagues,
  leagues,
  selectedRoles,
  onToggleRole,
  onSelectAllRoles,
  minGames,
  onMinGamesChange,
  onResetFilters,
}: MobileFiltersSheetProps) {
  const { isMobileFiltersOpen, closeMobileFilters } = useUIStore()

  const isAllLeaguesSelected = selectedLeagues.length === 0 || selectedLeagues.length === leagues.length
  const isAllRolesSelected = selectedRoles.length === 0 || selectedRoles.length === VALID_ROLES.length

  const isRoleSelected = (role: string) => {
    if (isAllRolesSelected) return true
    return selectedRoles.includes(role)
  }

  const handleReset = () => {
    onResetFilters()
    closeMobileFilters()
  }

  const handleApply = () => {
    closeMobileFilters()
  }

  return (
    <BottomSheet
      isOpen={isMobileFiltersOpen}
      onClose={closeMobileFilters}
      title="Filtres"
    >
      <div className="flex flex-col gap-5">
        {/* Period Selection */}
        <div>
          <label className="text-xs font-semibold text-(--text-secondary) mb-2 block">
            Période
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => onPeriodChange(p.value)}
                className={`
                  px-3 py-2 rounded-lg text-xs font-medium transition-all
                  ${period === p.value
                    ? 'bg-(--accent) text-(--bg-primary)'
                    : 'bg-(--bg-secondary) text-(--text-secondary) hover:bg-(--bg-hover)'}
                `}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* View Toggle */}
        <div>
          <label className="text-xs font-semibold text-(--text-secondary) mb-2 block">
            Vue
          </label>
          <div className="relative flex bg-(--bg-secondary) p-1 rounded-lg border border-(--border)">
            <div
              className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-(--accent) rounded-md transition-transform duration-200 ease-out ${
                leaderboardView === 'players' ? 'translate-x-full' : 'translate-x-0'
              }`}
            />
            <button
              onClick={() => onViewChange('teams')}
              className={`
                relative z-10 flex-1 py-2 rounded-md text-xs font-medium transition-colors
                ${leaderboardView === 'teams'
                  ? 'text-(--bg-primary)'
                  : 'text-(--text-muted)'}
              `}
            >
              Équipes
            </button>
            <button
              onClick={() => onViewChange('players')}
              className={`
                relative z-10 flex-1 py-2 rounded-md text-xs font-medium transition-colors
                ${leaderboardView === 'players'
                  ? 'text-(--bg-primary)'
                  : 'text-(--text-muted)'}
              `}
            >
              Joueurs
            </button>
          </div>
        </div>

        {/* League Selection */}
        <div>
          <label className="text-xs font-semibold text-(--text-secondary) mb-2 block">
            Ligues
          </label>
          <div className="flex flex-wrap gap-1.5">
            {/* All button */}
            <button
              onClick={onSelectAllLeagues}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${isAllLeaguesSelected
                  ? 'bg-(--accent) text-(--bg-primary)'
                  : 'bg-(--bg-secondary) text-(--text-secondary) hover:bg-(--bg-hover)'}
              `}
            >
              Toutes
            </button>
            {leagues.map((league) => {
              const isSelected = selectedLeagues.includes(league.shortName) && !isAllLeaguesSelected
              const dotColor = league.color || DEFAULT_COLORS[league.shortName] || '#8a8a94'
              return (
                <button
                  key={league.leagueId}
                  onClick={() => onToggleLeague(league.shortName)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${isSelected
                      ? 'bg-(--accent) text-(--bg-primary)'
                      : 'bg-(--bg-secondary) text-(--text-secondary) hover:bg-(--bg-hover)'}
                  `}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: isSelected ? 'currentColor' : dotColor }}
                  />
                  {league.shortName}
                </button>
              )
            })}
          </div>
        </div>

        {/* Role Selection - Only visible in players view */}
        {leaderboardView === 'players' && (
          <div>
            <label className="text-xs font-semibold text-(--text-secondary) mb-2 block">
              Rôles
            </label>
            <div className="flex flex-wrap gap-1.5">
              {/* All button */}
              <button
                onClick={onSelectAllRoles}
                className={`
                  px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                  ${isAllRolesSelected
                    ? 'bg-(--accent) text-(--bg-primary)'
                    : 'bg-(--bg-secondary) text-(--text-secondary) hover:bg-(--bg-hover)'}
                `}
              >
                ALL
              </button>
              {VALID_ROLES.map((role) => {
                const isActive = isRoleSelected(role)
                return (
                  <button
                    key={role}
                    onClick={() => onToggleRole(role)}
                    className={`
                      flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                      ${isActive
                        ? 'bg-(--accent)/20 ring-1 ring-(--accent) text-(--accent)'
                        : 'bg-(--bg-secondary) text-(--text-muted) hover:bg-(--bg-hover)'}
                    `}
                  >
                    <Image
                      src={`/images/roles/${role}.png`}
                      alt={role}
                      width={16}
                      height={16}
                      className="object-contain"
                      style={{ filter: isActive ? 'none' : 'grayscale(100%)' }}
                    />
                    {role}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Min Games */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-(--text-secondary)">
              Minimum de games
            </label>
            <span className="text-sm font-mono font-semibold text-(--accent)">
              {minGames === 0 ? 'Tous' : `${minGames}+`}
            </span>
          </div>
          <div className="flex gap-1.5">
            {GAME_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => onMinGamesChange(preset)}
                className={`
                  flex-1 py-2 rounded-lg text-xs font-medium transition-all
                  ${minGames === preset
                    ? 'bg-(--accent) text-(--bg-primary)'
                    : 'bg-(--bg-secondary) text-(--text-muted) hover:bg-(--bg-hover)'}
                `}
              >
                {preset === 0 ? 'Tous' : preset}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2 border-t border-(--border)">
          <button
            onClick={handleReset}
            className="flex-1 py-3 rounded-lg text-xs font-semibold bg-(--bg-secondary) text-(--text-secondary) hover:bg-(--bg-hover) transition-colors"
          >
            Réinitialiser
          </button>
          <button
            onClick={handleApply}
            className="flex-1 py-3 rounded-lg text-xs font-semibold bg-(--accent) text-(--bg-primary) hover:bg-(--accent-hover) transition-colors"
          >
            Appliquer
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

export default memo(MobileFiltersSheet)
