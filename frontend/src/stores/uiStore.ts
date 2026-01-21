import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SortOption } from '@/lib/types'

export type ItemsPerPageOption = 10 | 20 | 50
export type LeaderboardView = 'teams' | 'players'

interface UIState {
  // Hydration state
  _hasHydrated: boolean

  // Sorting
  sortBy: SortOption

  // Pagination
  currentPage: number
  itemsPerPage: ItemsPerPageOption

  // Leaderboard view mode
  leaderboardView: LeaderboardView

  // Reset key to force component remount
  resetKey: number

  // Charts modal state
  isChartsModalOpen: boolean

  // Actions
  setSortBy: (sort: SortOption) => void
  setPage: (page: number) => void
  setItemsPerPage: (count: ItemsPerPageOption) => void
  setLeaderboardView: (view: LeaderboardView) => void
  resetPage: () => void
  incrementResetKey: () => void
  resetUI: () => void
  openChartsModal: () => void
  closeChartsModal: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      _hasHydrated: false,
      sortBy: 'lp',
      currentPage: 1,
      itemsPerPage: 20,
      leaderboardView: 'teams',
      resetKey: 0,
      isChartsModalOpen: false,

      setSortBy: (sortBy) => set({ sortBy, currentPage: 1 }),

      setPage: (page) => set({ currentPage: page }),

      setItemsPerPage: (count) => set({ itemsPerPage: count, currentPage: 1 }),

      setLeaderboardView: (view) => set({ leaderboardView: view, currentPage: 1 }),

      resetPage: () => set({ currentPage: 1 }),

      incrementResetKey: () => set((state) => ({ resetKey: state.resetKey + 1 })),

      resetUI: () => set({
        sortBy: 'lp',
        currentPage: 1,
        // Keep itemsPerPage and leaderboardView as-is
      }),

      openChartsModal: () => set({ isChartsModalOpen: true }),
      closeChartsModal: () => set({ isChartsModalOpen: false }),
    }),
    {
      name: 'ui-store',
      partialize: (state) => ({
        sortBy: state.sortBy,
        itemsPerPage: state.itemsPerPage,
        leaderboardView: state.leaderboardView,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true
        }
      },
    }
  )
)
