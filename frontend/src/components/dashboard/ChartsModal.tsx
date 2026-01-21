'use client'

import type { ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import GamesChart, { type TeamGamesData } from './GamesChart'
import LpChart, { type TeamLpData } from './LpChart'
import LpChangeChart from './LpChangeChart'
import DailyWinrateChart from './DailyWinrateChart'
import PeriodSelector from './PeriodSelector'
import PeriodNavigator from './PeriodNavigator'
import type { TeamLeaderboardEntry, PlayerLeaderboardEntry, DashboardPeriod } from '@/lib/types'
import type { LeaderboardView } from '@/stores/uiStore'

interface ChartsModalProps {
  isOpen: boolean
  onClose: () => void
  teams?: TeamLeaderboardEntry[]
  players?: PlayerLeaderboardEntry[]
  gamesData: TeamGamesData[]
  lpData: TeamLpData[]
  isLoading: boolean
  // Period controls
  period: DashboardPeriod
  onPeriodChange: (period: DashboardPeriod) => void
  periodLabel: string
  onNavigatePeriod: (direction: 'prev' | 'next') => void
  canGoNext: boolean
  canGoPrev?: boolean
  // Search dropdown (passed as ReactNode for flexibility)
  searchDropdown: ReactNode
  // View toggle
  leaderboardView: LeaderboardView
  onViewChange: (view: LeaderboardView) => void
  // Complete date range for charts (ensures all days are displayed)
  dateRange?: { date: string; label: string }[]
}

export default function ChartsModal({
  isOpen,
  onClose,
  teams,
  players,
  gamesData,
  lpData,
  isLoading,
  period,
  onPeriodChange,
  periodLabel,
  onNavigatePeriod,
  canGoNext,
  canGoPrev = true,
  searchDropdown,
  leaderboardView,
  onViewChange,
  dateRange,
}: ChartsModalProps) {
  // Build title based on selected entities
  const getTitle = () => {
    if (teams && teams.length > 0) {
      const names = teams.map((t) => t.team.shortName || t.team.currentName).join(' vs ')
      return `${names}`
    }
    if (players && players.length > 0) {
      const names = players.map((p) => p.player.pseudo).join(' vs ')
      return `${names}`
    }
    return 'Graphiques'
  }

  const hasData = gamesData.length > 0 || lpData.length > 0


  // Header content with period controls and search
  const headerContent = (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full">
      {/* Top row on mobile: View Toggle + Search */}
      <div className="flex items-center gap-2 sm:contents">
        {/* Credit - hidden on mobile */}
        <span className="text-xs text-(--text-muted) hidden lg:block">by MonsieurYordle</span>
        {/* View Toggle */}
        <div className="relative flex bg-(--bg-secondary) p-[3px] rounded-md border border-(--border) shrink-0">
          <div
            className={`absolute top-[3px] bottom-[3px] left-[3px] w-[calc(50%-3px)] bg-(--accent) rounded transition-transform duration-200 ease-out ${
              leaderboardView === 'players' ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          <button
            onClick={() => onViewChange('teams')}
            className={`
              relative z-10 px-2 sm:px-3 py-[5px] border-none rounded text-[10px] sm:text-[11px] font-medium transition-colors duration-150
              ${leaderboardView === 'teams'
                ? 'text-(--bg-primary)'
                : 'bg-transparent text-(--text-muted) hover:text-(--text-secondary)'
              }
            `}
          >
            Équipes
          </button>
          <button
            onClick={() => onViewChange('players')}
            className={`
              relative z-10 px-2 sm:px-3 py-[5px] border-none rounded text-[10px] sm:text-[11px] font-medium transition-colors duration-150
              ${leaderboardView === 'players'
                ? 'text-(--bg-primary)'
                : 'bg-transparent text-(--text-muted) hover:text-(--text-secondary)'
              }
            `}
          >
            Joueurs
          </button>
        </div>
        {/* Search dropdown for comparison */}
        <div className="flex-1 min-w-0 sm:max-w-[400px]">
          {searchDropdown}
        </div>
      </div>
      {/* Bottom row on mobile: Period Controls */}
      <div className="flex items-center gap-2 sm:gap-3 sm:ml-auto">
        <div className="flex-1 sm:flex-none sm:w-[180px] lg:w-[200px]">
          <PeriodSelector value={period} onChange={onPeriodChange} />
        </div>
        <div className="flex-1 sm:flex-none sm:w-[200px] lg:w-[240px]">
          <PeriodNavigator
            label={periodLabel}
            onPrevious={() => onNavigatePeriod('prev')}
            onNext={() => onNavigatePeriod('next')}
            canGoNext={canGoNext}
            canGoPrev={canGoPrev}
          />
        </div>
      </div>
    </div>
  )

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={getTitle()} size="xl" headerContent={headerContent}>
      {!hasData && !isLoading ? (
        <div className="flex items-center justify-center h-[400px] text-(--text-muted)">
          Aucune donnée disponible
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 modal-charts" style={{ height: 'calc(92vh - 140px)' }}>
          {/* Top Left - LP Evolution */}
          <div className="[&>div]:!h-full [&_.h-\[180px\]]:!h-[calc(100%-48px)]">
            <LpChart teams={lpData} isLoading={isLoading} showLabels dateRange={dateRange} period={period} viewMode={leaderboardView} />
          </div>

          {/* Top Right - Games per day */}
          <div className="[&>div]:!h-full [&_.h-\[180px\]]:!h-[calc(100%-48px)]">
            <GamesChart teams={gamesData} isLoading={isLoading} showLabels dateRange={dateRange} period={period} viewMode={leaderboardView} />
          </div>

          {/* Bottom Left - Winrate evolution */}
          <div className="[&>div]:!h-full [&_.h-\[180px\]]:!h-[calc(100%-48px)]">
            <DailyWinrateChart teams={gamesData} isLoading={isLoading} showLabels dateRange={dateRange} period={period} viewMode={leaderboardView} />
          </div>

          {/* Bottom Right - LP Change */}
          <div className="[&>div]:!h-full [&_.h-\[180px\]]:!h-[calc(100%-48px)]">
            <LpChangeChart teams={lpData} isLoading={isLoading} showLabels dateRange={dateRange} period={period} viewMode={leaderboardView} />
          </div>
        </div>
      )}
    </Modal>
  )
}
