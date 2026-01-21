'use client'

import type { FC } from 'react'
import type { DashboardPeriod, LeagueInfo } from '@/lib/types'
import PeriodSelector from './PeriodSelector'
import PeriodNavigator from './PeriodNavigator'
import LeagueDropdown from './LeagueDropdown'
import RoleIconFilter from './RoleIconFilter'
import GamesFilter from './GamesFilter'

interface DashboardFiltersProps {
  // Period
  period: DashboardPeriod
  onPeriodChange: (period: DashboardPeriod) => void
  periodLabel: string
  onPreviousPeriod: () => void
  onNextPeriod: () => void
  canGoNext: boolean

  // Leagues
  selectedLeagues: string[]
  onToggleLeague: (league: string) => void
  onSelectAllLeagues: () => void
  availableLeagues: LeagueInfo[]

  // Roles (optional - only visible in players view)
  selectedRoles?: string[]
  onToggleRole?: (role: string) => void
  onSelectAllRoles?: () => void

  // Games filter
  minGames: number
  onMinGamesChange: (value: number) => void

  // Layout control
  showPeriodControls?: boolean
  showFilters?: boolean
}

export const DashboardFilters: FC<DashboardFiltersProps> = ({
  period,
  onPeriodChange,
  periodLabel,
  onPreviousPeriod,
  onNextPeriod,
  canGoNext,
  selectedLeagues,
  onToggleLeague,
  onSelectAllLeagues,
  availableLeagues,
  selectedRoles,
  onToggleRole,
  onSelectAllRoles,
  minGames,
  onMinGamesChange,
  showPeriodControls = true,
  showFilters = false,
}) => {
  return (
    <div className="flex flex-col gap-2">
      {showPeriodControls && (
        <>
          <PeriodSelector value={period} onChange={onPeriodChange} />
          <PeriodNavigator
            label={periodLabel}
            onPrevious={onPreviousPeriod}
            onNext={onNextPeriod}
            canGoNext={canGoNext}
          />
        </>
      )}
      {showFilters && (
        <div className="flex flex-col gap-2">
          <LeagueDropdown
            selected={selectedLeagues}
            onToggle={onToggleLeague}
            onSelectAll={onSelectAllLeagues}
            leagues={availableLeagues}
          />
          {selectedRoles && onToggleRole && onSelectAllRoles && (
            <RoleIconFilter
              selected={selectedRoles}
              onToggle={onToggleRole}
              onSelectAll={onSelectAllRoles}
            />
          )}
          <GamesFilter value={minGames} onChange={onMinGamesChange} />
        </div>
      )}
    </div>
  )
}

export default DashboardFilters
