'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface ProState {
  // Filters
  selectedTournamentId: number | null
  selectedRegion: string | null
  selectedStatus: 'upcoming' | 'ongoing' | 'completed' | null

  // UI state
  _hasHydrated: boolean

  // Actions
  setSelectedTournament: (tournamentId: number | null) => void
  setSelectedRegion: (region: string | null) => void
  setSelectedStatus: (status: 'upcoming' | 'ongoing' | 'completed' | null) => void
  reset: () => void
}

const initialState = {
  selectedTournamentId: null,
  selectedRegion: null,
  selectedStatus: null as 'upcoming' | 'ongoing' | 'completed' | null,
  _hasHydrated: false,
}

export const useProStore = create<ProState>()(
  persist(
    (set) => ({
      ...initialState,

      setSelectedTournament: (tournamentId) =>
        set({ selectedTournamentId: tournamentId }),

      setSelectedRegion: (region) =>
        set({ selectedRegion: region }),

      setSelectedStatus: (status) =>
        set({ selectedStatus: status }),

      reset: () =>
        set({
          selectedTournamentId: null,
          selectedRegion: null,
          selectedStatus: null,
        }),
    }),
    {
      name: 'pro-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selectedTournamentId: state.selectedTournamentId,
        selectedRegion: state.selectedRegion,
        selectedStatus: state.selectedStatus,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true
        }
      },
    }
  )
)
