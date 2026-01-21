import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { VALID_ROLES } from '@/lib/constants'
import { logWarn, logError } from '@/lib/logger'

type ViewType = 'teams' | 'players'

interface FilterState {
  // Hydration state
  _hasHydrated: boolean

  // State per view
  teamsSelectedLeagues: string[]
  playersSelectedLeagues: string[]
  teamsMinGames: number
  playersMinGames: number
  selectedRoles: string[] // Only applies to players view

  // Actions with view parameter
  toggleLeague: (view: ViewType, league: string) => void
  selectAllLeagues: (view: ViewType) => void
  setMinGames: (view: ViewType, min: number) => void

  // Role actions (players only)
  toggleRole: (role: string) => void
  selectAllRoles: () => void

  // Getters
  getSelectedLeagues: (view: ViewType) => string[]
  getMinGames: (view: ViewType) => number

  // Reset
  resetFilters: () => void
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      teamsSelectedLeagues: [],
      playersSelectedLeagues: [],
      teamsMinGames: 0,
      playersMinGames: 0,
      selectedRoles: [],

      toggleLeague: (view, league) => {
        const key = view === 'teams' ? 'teamsSelectedLeagues' : 'playersSelectedLeagues'
        const currentSelected = get()[key]
        const newSelected = currentSelected.includes(league)
          ? currentSelected.filter((l) => l !== league)
          : [...currentSelected, league]

        // Si aucune ligue selectionnee, on reset (= toutes)
        set({ [key]: newSelected.length === 0 ? [] : newSelected })
      },

      selectAllLeagues: (view) => {
        const key = view === 'teams' ? 'teamsSelectedLeagues' : 'playersSelectedLeagues'
        set({ [key]: [] })
      },

      setMinGames: (view, min) => {
        const key = view === 'teams' ? 'teamsMinGames' : 'playersMinGames'
        set({ [key]: min })
      },

      toggleRole: (role) => {
        const { selectedRoles } = get()
        const newSelected = selectedRoles.includes(role)
          ? selectedRoles.filter((r) => r !== role)
          : [...selectedRoles, role]

        // Si tous sont selectionnes ou aucun, on reset
        if (newSelected.length === VALID_ROLES.length || newSelected.length === 0) {
          set({ selectedRoles: [] })
        } else {
          set({ selectedRoles: newSelected })
        }
      },

      selectAllRoles: () => set({ selectedRoles: [] }),

      getSelectedLeagues: (view) => {
        return view === 'teams' ? get().teamsSelectedLeagues : get().playersSelectedLeagues
      },

      getMinGames: (view) => {
        return view === 'teams' ? get().teamsMinGames : get().playersMinGames
      },

      resetFilters: () => set({
        teamsSelectedLeagues: [],
        playersSelectedLeagues: [],
        teamsMinGames: 0,
        playersMinGames: 0,
        selectedRoles: [],
      }),
    }),
    {
      name: 'filter-store',
      // Custom storage with robust validation
      storage: {
        getItem: (name) => {
          if (typeof window === 'undefined') return null
          try {
            const str = localStorage.getItem(name)
            if (!str) return null

            const data = JSON.parse(str)

            // Validate basic structure
            if (!data || typeof data !== 'object' || !data.state || typeof data.state !== 'object') {
              logWarn('Filter store: invalid data structure, using defaults')
              return null
            }

            const { state } = data

            // Helper to validate string array
            const validateStringArray = (arr: unknown): string[] => {
              if (!Array.isArray(arr)) return []
              return arr.filter((item: unknown): item is string => typeof item === 'string')
            }

            // Helper to validate non-negative number
            const validateMinGames = (val: unknown): number => {
              if (typeof val === 'number' && !isNaN(val) && val >= 0) {
                return Math.floor(val)
              }
              return 0
            }

            // Validate each field
            const teamsSelectedLeagues = validateStringArray(state.teamsSelectedLeagues)
            const playersSelectedLeagues = validateStringArray(state.playersSelectedLeagues)
            const teamsMinGames = validateMinGames(state.teamsMinGames)
            const playersMinGames = validateMinGames(state.playersMinGames)

            // Validate selectedRoles (must be array of valid role strings)
            let selectedRoles: string[] = []
            if (Array.isArray(state.selectedRoles)) {
              selectedRoles = state.selectedRoles.filter(
                (r: unknown): r is string =>
                  typeof r === 'string' && VALID_ROLES.includes(r as typeof VALID_ROLES[number])
              )
            }

            // Migration: if old format exists, migrate it
            if (state.selectedLeagues !== undefined && state.teamsSelectedLeagues === undefined) {
              const oldLeagues = validateStringArray(state.selectedLeagues)
              const oldMinGames = validateMinGames(state.minGames)
              return {
                ...data,
                state: {
                  teamsSelectedLeagues: oldLeagues,
                  playersSelectedLeagues: oldLeagues,
                  teamsMinGames: oldMinGames,
                  playersMinGames: oldMinGames,
                  selectedRoles,
                },
              }
            }

            return {
              ...data,
              state: {
                teamsSelectedLeagues,
                playersSelectedLeagues,
                teamsMinGames,
                playersMinGames,
                selectedRoles,
              },
            }
          } catch (error) {
            logError('Filter store: failed to parse stored data', error)
            // Clean up corrupted data
            try {
              localStorage.removeItem(name)
            } catch {}
            return null
          }
        },
        setItem: (name, value) => {
          if (typeof window === 'undefined') return
          try {
            localStorage.setItem(name, JSON.stringify(value))
          } catch (error) {
            logError('Filter store: failed to save data', error)
          }
        },
        removeItem: (name) => {
          if (typeof window === 'undefined') return
          try {
            localStorage.removeItem(name)
          } catch {}
        },
      },
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._hasHydrated = true
        }
      },
    }
  )
)
