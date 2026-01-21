/**
 * Dashboard Store - Unified facade for backward compatibility
 *
 * This file re-exports the split stores and provides a combined hook
 * for components that haven't been migrated yet.
 *
 * New code should import directly from:
 * - @/stores/periodStore
 * - @/stores/filterStore
 * - @/stores/selectionStore
 * - @/stores/uiStore
 */

import { useShallow } from 'zustand/react/shallow'

// Re-export individual stores
export { usePeriodStore, selectDateRange, selectPeriodLabel, selectRefDateString } from './periodStore'
export { useFilterStore } from './filterStore'
export { useSelectionStore } from './selectionStore'
export { useUIStore, type ItemsPerPageOption, type LeaderboardView } from './uiStore'

// Re-export types
export type { SortOption } from '@/lib/types'

import { usePeriodStore } from './periodStore'
import { useFilterStore } from './filterStore'
import { useSelectionStore } from './selectionStore'
import { useUIStore } from './uiStore'

/**
 * Combined dashboard store hook for backward compatibility.
 * Uses useShallow to prevent unnecessary re-renders.
 *
 * @deprecated Use individual stores instead:
 *   - usePeriodStore() for period/date management
 *   - useFilterStore() for leagues/roles/minGames
 *   - useSelectionStore() for team/player selection
 *   - useUIStore() for sorting/pagination/view mode
 */
export const useDashboardStore = () => {
  // Use useShallow to prevent re-renders when unrelated state changes
  const period = usePeriodStore(
    useShallow((state) => ({
      period: state.period,
      referenceDate: state.referenceDate,
      setPeriod: state.setPeriod,
      navigatePeriod: state.navigatePeriod,
      resetPeriod: state.resetPeriod,
      getDateRange: state.getDateRange,
      getPeriodLabel: state.getPeriodLabel,
      getRefDateString: state.getRefDateString,
    }))
  )

  const filter = useFilterStore(
    useShallow((state) => ({
      // Per-view state
      teamsSelectedLeagues: state.teamsSelectedLeagues,
      playersSelectedLeagues: state.playersSelectedLeagues,
      teamsMinGames: state.teamsMinGames,
      playersMinGames: state.playersMinGames,
      selectedRoles: state.selectedRoles,
      // Actions
      toggleLeague: state.toggleLeague,
      selectAllLeagues: state.selectAllLeagues,
      setMinGames: state.setMinGames,
      toggleRole: state.toggleRole,
      selectAllRoles: state.selectAllRoles,
      resetFilters: state.resetFilters,
      // Getters
      getSelectedLeagues: state.getSelectedLeagues,
      getMinGames: state.getMinGames,
    }))
  )

  const selection = useSelectionStore(
    useShallow((state) => ({
      selectedTeams: state.selectedTeams,
      selectedPlayers: state.selectedPlayers,
      lockedTeamIds: state.lockedTeamIds,
      lockedPlayerIds: state.lockedPlayerIds,
      oldestTeamPosition: state.oldestTeamPosition,
      oldestPlayerPosition: state.oldestPlayerPosition,
      selectTeam: state.selectTeam,
      updateSelectedTeamData: state.updateSelectedTeamData,
      clearTeams: state.clearTeams,
      toggleLockTeam: state.toggleLockTeam,
      selectPlayer: state.selectPlayer,
      clearPlayers: state.clearPlayers,
      toggleLockPlayer: state.toggleLockPlayer,
      resetSelection: state.resetSelection,
    }))
  )

  const ui = useUIStore(
    useShallow((state) => ({
      sortBy: state.sortBy,
      currentPage: state.currentPage,
      itemsPerPage: state.itemsPerPage,
      leaderboardView: state.leaderboardView,
      resetKey: state.resetKey,
      setSortBy: state.setSortBy,
      setPage: state.setPage,
      resetPage: state.resetPage,
      setItemsPerPage: state.setItemsPerPage,
      setLeaderboardView: state.setLeaderboardView,
      incrementResetKey: state.incrementResetKey,
      resetUI: state.resetUI,
    }))
  )

  // Compute current view's filters
  const currentView = ui.leaderboardView
  const selectedLeagues = currentView === 'teams' ? filter.teamsSelectedLeagues : filter.playersSelectedLeagues
  const minGames = currentView === 'teams' ? filter.teamsMinGames : filter.playersMinGames

  return {
    // Period state
    period: period.period,
    referenceDate: period.referenceDate,

    // Filter state (view-aware)
    selectedLeagues,
    selectedRoles: filter.selectedRoles,
    minGames,

    // Raw per-view filter state (for URL persistence)
    teamsSelectedLeagues: filter.teamsSelectedLeagues,
    playersSelectedLeagues: filter.playersSelectedLeagues,
    teamsMinGames: filter.teamsMinGames,
    playersMinGames: filter.playersMinGames,

    // UI state
    sortBy: ui.sortBy,
    currentPage: ui.currentPage,
    itemsPerPage: ui.itemsPerPage,
    leaderboardView: ui.leaderboardView,
    resetKey: ui.resetKey,

    // Selection state
    selectedTeams: selection.selectedTeams,
    selectedPlayers: selection.selectedPlayers,
    lockedTeamIds: selection.lockedTeamIds,
    lockedPlayerIds: selection.lockedPlayerIds,
    oldestTeamPosition: selection.oldestTeamPosition,
    oldestPlayerPosition: selection.oldestPlayerPosition,

    // Period actions (reset page on period change)
    setPeriod: (newPeriod: Parameters<typeof period.setPeriod>[0]) => {
      period.setPeriod(newPeriod)
      ui.resetPage()
    },
    navigatePeriod: (direction: 'prev' | 'next') => {
      period.navigatePeriod(direction)
      ui.resetPage()
    },

    // Filter actions (view-aware, reset page on filter change)
    toggleLeague: (league: string) => {
      filter.toggleLeague(currentView, league)
      ui.resetPage()
    },
    selectAllLeagues: () => {
      filter.selectAllLeagues(currentView)
      ui.resetPage()
    },
    toggleRole: (role: string) => {
      filter.toggleRole(role)
      ui.resetPage()
    },
    selectAllRoles: () => {
      filter.selectAllRoles()
      ui.resetPage()
    },
    setMinGames: (min: number) => {
      filter.setMinGames(currentView, min)
      ui.resetPage()
    },

    // UI actions
    setSortBy: ui.setSortBy,
    setPage: ui.setPage,
    setItemsPerPage: ui.setItemsPerPage,
    setLeaderboardView: ui.setLeaderboardView,

    // Selection actions
    selectTeam: selection.selectTeam,
    updateSelectedTeamData: selection.updateSelectedTeamData,
    clearTeams: selection.clearTeams,
    toggleLockTeam: selection.toggleLockTeam,
    selectPlayer: selection.selectPlayer,
    clearPlayers: selection.clearPlayers,
    toggleLockPlayer: selection.toggleLockPlayer,

    // Computed
    getDateRange: period.getDateRange,
    getPeriodLabel: period.getPeriodLabel,
    getRefDateString: period.getRefDateString,

    // Combined reset
    resetToDefault: () => {
      period.resetPeriod()
      filter.resetFilters()
      selection.resetSelection()
      ui.resetUI()
      ui.incrementResetKey()
    },
  }
}
