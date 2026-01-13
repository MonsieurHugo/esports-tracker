import { create } from 'zustand'
import type { DashboardPeriod, TeamLeaderboardEntry, PlayerLeaderboardEntry } from '@/lib/types'
import { formatToDateString } from '@/lib/dateUtils'
import { VALID_ROLES } from '@/lib/constants'

export type SortOption = 'lp' | 'games' | 'winrate'
export type ItemsPerPageOption = 10 | 20 | 50
export type LeaderboardView = 'teams' | 'players'

interface DashboardState {
  // Period management
  period: DashboardPeriod
  referenceDate: Date
  customStartDate: Date | null
  customEndDate: Date | null

  // Filters
  selectedLeagues: string[]
  selectedRoles: string[]
  minGames: number

  // Sorting
  sortBy: SortOption

  // Pagination
  currentPage: number
  itemsPerPage: ItemsPerPageOption

  // Leaderboard view mode
  leaderboardView: LeaderboardView

  // Selected teams for comparison (max 2)
  selectedTeams: TeamLeaderboardEntry[]

  // Selected players for comparison (max 2)
  selectedPlayers: PlayerLeaderboardEntry[]

  // Reset key to force component remount
  resetKey: number

  // Locked teams/players (pinned to top individually)
  lockedTeamIds: number[]
  lockedPlayerIds: number[]

  // Track which position has the oldest selection (for replacement logic)
  oldestTeamPosition: 0 | 1
  oldestPlayerPosition: 0 | 1

  // Actions
  setPeriod: (period: DashboardPeriod) => void
  setCustomDateRange: (startDate: Date, endDate: Date) => void
  navigatePeriod: (direction: 'prev' | 'next') => void
  toggleLeague: (league: string) => void
  selectAllLeagues: () => void
  toggleRole: (role: string) => void
  selectAllRoles: () => void
  setMinGames: (minGames: number) => void
  setSortBy: (sort: SortOption) => void
  setPage: (page: number) => void
  setItemsPerPage: (count: ItemsPerPageOption) => void
  setLeaderboardView: (view: LeaderboardView) => void
  selectTeam: (team: TeamLeaderboardEntry) => void
  updateSelectedTeamData: (team: TeamLeaderboardEntry) => void
  clearTeams: () => void
  selectPlayer: (player: PlayerLeaderboardEntry) => void
  clearPlayers: () => void
  toggleLockTeam: (teamId: number) => void
  toggleLockPlayer: (playerId: number) => void
  resetToDefault: () => void

  // Computed
  getDateRange: () => { startDate: string; endDate: string }
  getPeriodLabel: () => string
  getRefDateString: () => string
}

const getPeriodLabel = (period: DashboardPeriod, ref: Date, customStart?: Date | null, customEnd?: Date | null): string => {
  const months = ['jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  const fullMonths = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

  switch (period) {
    case 'day': {
      // 7 derniers jours: de ref-6 à ref
      const startDate = new Date(ref)
      startDate.setDate(ref.getDate() - 6)
      const endDate = ref

      if (startDate.getMonth() === endDate.getMonth()) {
        return `${startDate.getDate()} - ${endDate.getDate()} ${months[endDate.getMonth()]} ${endDate.getFullYear()}`
      } else {
        return `${startDate.getDate()} ${months[startDate.getMonth()]} - ${endDate.getDate()} ${months[endDate.getMonth()]} ${endDate.getFullYear()}`
      }
    }

    case 'month':
      return `${fullMonths[ref.getMonth()]} ${ref.getFullYear()}`

    case 'year':
      return `${ref.getFullYear()}`

    case 'custom': {
      if (!customStart || !customEnd) return 'Personnalisé'
      if (customStart.getMonth() === customEnd.getMonth() && customStart.getFullYear() === customEnd.getFullYear()) {
        return `${customStart.getDate()} - ${customEnd.getDate()} ${months[customEnd.getMonth()]} ${customEnd.getFullYear()}`
      } else if (customStart.getFullYear() === customEnd.getFullYear()) {
        return `${customStart.getDate()} ${months[customStart.getMonth()]} - ${customEnd.getDate()} ${months[customEnd.getMonth()]} ${customEnd.getFullYear()}`
      } else {
        return `${customStart.getDate()} ${months[customStart.getMonth()]} ${customStart.getFullYear()} - ${customEnd.getDate()} ${months[customEnd.getMonth()]} ${customEnd.getFullYear()}`
      }
    }

    default:
      return ''
  }
}

const getDateRange = (period: DashboardPeriod, ref: Date, customStart?: Date | null, customEnd?: Date | null): { startDate: string; endDate: string } => {
  let startDate: Date
  let endDate: Date

  switch (period) {
    case 'day':
      // 7 derniers jours: de ref-6 à ref
      startDate = new Date(ref)
      startDate.setDate(ref.getDate() - 6)
      endDate = new Date(ref)
      break

    case 'month':
      startDate = new Date(ref.getFullYear(), ref.getMonth(), 1)
      endDate = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
      break

    case 'year':
      startDate = new Date(ref.getFullYear(), 0, 1)
      endDate = new Date(ref.getFullYear(), 11, 31)
      break

    case 'custom':
      if (customStart && customEnd) {
        startDate = new Date(customStart)
        endDate = new Date(customEnd)
      } else {
        // Default to last 7 days if no custom dates
        startDate = new Date(ref)
        startDate.setDate(ref.getDate() - 6)
        endDate = new Date(ref)
      }
      break

    default:
      startDate = new Date(2000, 0, 1)
      endDate = new Date()
      break
  }

  return {
    startDate: formatToDateString(startDate),
    endDate: formatToDateString(endDate),
  }
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  period: 'day',
  referenceDate: new Date(),
  customStartDate: null,
  customEndDate: null,
  selectedLeagues: [],
  selectedRoles: [],
  minGames: 0,
  sortBy: 'lp',
  currentPage: 1,
  itemsPerPage: 20,
  leaderboardView: 'teams',
  selectedTeams: [],
  selectedPlayers: [],
  resetKey: 0,
  lockedTeamIds: [],
  lockedPlayerIds: [],
  oldestTeamPosition: 0,
  oldestPlayerPosition: 0,

  setPeriod: (period) => set({ period, referenceDate: new Date(), currentPage: 1 }),

  setCustomDateRange: (startDate, endDate) => set({
    period: 'custom',
    customStartDate: startDate,
    customEndDate: endDate,
    currentPage: 1,
  }),

  navigatePeriod: (direction) => {
    const { period, referenceDate, customStartDate, customEndDate } = get()

    if (period === 'custom' && customStartDate && customEndDate) {
      // For custom period, shift by the same number of days
      const daysDiff = Math.ceil((customEndDate.getTime() - customStartDate.getTime()) / (1000 * 60 * 60 * 24))
      const shift = direction === 'next' ? daysDiff + 1 : -(daysDiff + 1)

      const newStart = new Date(customStartDate)
      newStart.setDate(newStart.getDate() + shift)
      const newEnd = new Date(customEndDate)
      newEnd.setDate(newEnd.getDate() + shift)

      set({ customStartDate: newStart, customEndDate: newEnd, currentPage: 1 })
      return
    }

    const newDate = new Date(referenceDate)

    switch (period) {
      case 'day':
        // 7 jours glissants: avancer/reculer de 7 jours
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7))
        break
      case 'month':
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1))
        break
      case 'year':
        newDate.setFullYear(newDate.getFullYear() + (direction === 'next' ? 1 : -1))
        break
    }

    set({ referenceDate: newDate, currentPage: 1 })
  },

  toggleLeague: (league) => {
    const { selectedLeagues } = get()
    const newSelected = selectedLeagues.includes(league)
      ? selectedLeagues.filter((l) => l !== league)
      : [...selectedLeagues, league]

    // Si aucune ligue sélectionnée, on reset (= toutes)
    if (newSelected.length === 0) {
      set({ selectedLeagues: [], currentPage: 1 })
    } else {
      set({ selectedLeagues: newSelected, currentPage: 1 })
    }
  },

  selectAllLeagues: () => set({ selectedLeagues: [], currentPage: 1 }),

  toggleRole: (role) => {
    const { selectedRoles } = get()
    const newSelected = selectedRoles.includes(role)
      ? selectedRoles.filter((r) => r !== role)
      : [...selectedRoles, role]

    // Si tous sont sélectionnés ou aucun, on reset
    if (newSelected.length === VALID_ROLES.length || newSelected.length === 0) {
      set({ selectedRoles: [], currentPage: 1 })
    } else {
      set({ selectedRoles: newSelected, currentPage: 1 })
    }
  },

  selectAllRoles: () => set({ selectedRoles: [], currentPage: 1 }),

  setMinGames: (minGames) => set({ minGames, currentPage: 1 }),

  setSortBy: (sortBy) => set({ sortBy, currentPage: 1 }),

  setPage: (page) => set({ currentPage: page }),

  setItemsPerPage: (count) => set({ itemsPerPage: count, currentPage: 1 }),

  setLeaderboardView: (view) => set({ leaderboardView: view, currentPage: 1 }),

  selectTeam: (team) => {
    const { selectedTeams, lockedTeamIds, oldestTeamPosition } = get()
    const teamId = team.team.teamId
    const existingIndex = selectedTeams.findIndex((t) => t.team.teamId === teamId)

    if (existingIndex !== -1) {
      // Team already selected -> deselect it and unlock it
      const newTeams = selectedTeams.filter((t) => t.team.teamId !== teamId)
      set({
        selectedTeams: newTeams,
        lockedTeamIds: lockedTeamIds.filter((id) => id !== teamId),
        // Reset oldest position when going back to 0 or 1 team
        oldestTeamPosition: 0,
      })
    } else if (selectedTeams.length < 2) {
      // Less than 2 teams selected -> add it
      set({ selectedTeams: [...selectedTeams, team] })
    } else {
      // 2 teams already selected -> replace the oldest one (unless locked)
      const newerPosition = oldestTeamPosition === 0 ? 1 : 0
      const oldestLocked = lockedTeamIds.includes(selectedTeams[oldestTeamPosition].team.teamId)
      const newerLocked = lockedTeamIds.includes(selectedTeams[newerPosition].team.teamId)

      if (!oldestLocked) {
        // Replace the oldest team
        const newTeams = [...selectedTeams]
        newTeams[oldestTeamPosition] = team
        set({
          selectedTeams: newTeams,
          // The team that stayed is now the oldest
          oldestTeamPosition: newerPosition,
        })
      } else if (!newerLocked) {
        // Oldest is locked, replace the newer one
        const newTeams = [...selectedTeams]
        newTeams[newerPosition] = team
        set({ selectedTeams: newTeams })
        // oldestTeamPosition stays the same (oldest is still locked)
      }
      // Both locked -> do nothing
    }
  },

  updateSelectedTeamData: (team) => {
    const { selectedTeams } = get()
    const teamId = team.team.teamId
    const existingIndex = selectedTeams.findIndex((t) => t.team.teamId === teamId)

    if (existingIndex !== -1) {
      // Update existing team data without toggling selection
      const newSelectedTeams = [...selectedTeams]
      newSelectedTeams[existingIndex] = team
      set({ selectedTeams: newSelectedTeams })
    }
  },

  clearTeams: () => set({ selectedTeams: [], lockedTeamIds: [], oldestTeamPosition: 0 }),

  selectPlayer: (player) => {
    const { selectedPlayers, lockedPlayerIds, oldestPlayerPosition } = get()
    const playerId = player.player.playerId
    const existingIndex = selectedPlayers.findIndex((p) => p.player.playerId === playerId)

    if (existingIndex !== -1) {
      // Player already selected -> deselect it and unlock it
      const newPlayers = selectedPlayers.filter((p) => p.player.playerId !== playerId)
      set({
        selectedPlayers: newPlayers,
        lockedPlayerIds: lockedPlayerIds.filter((id) => id !== playerId),
        // Reset oldest position when going back to 0 or 1 player
        oldestPlayerPosition: 0,
      })
    } else if (selectedPlayers.length < 2) {
      // Less than 2 players selected -> add it
      set({ selectedPlayers: [...selectedPlayers, player] })
    } else {
      // 2 players already selected -> replace the oldest one (unless locked)
      const newerPosition = oldestPlayerPosition === 0 ? 1 : 0
      const oldestLocked = lockedPlayerIds.includes(selectedPlayers[oldestPlayerPosition].player.playerId)
      const newerLocked = lockedPlayerIds.includes(selectedPlayers[newerPosition].player.playerId)

      if (!oldestLocked) {
        // Replace the oldest player
        const newPlayers = [...selectedPlayers]
        newPlayers[oldestPlayerPosition] = player
        set({
          selectedPlayers: newPlayers,
          // The player that stayed is now the oldest
          oldestPlayerPosition: newerPosition,
        })
      } else if (!newerLocked) {
        // Oldest is locked, replace the newer one
        const newPlayers = [...selectedPlayers]
        newPlayers[newerPosition] = player
        set({ selectedPlayers: newPlayers })
        // oldestPlayerPosition stays the same (oldest is still locked)
      }
      // Both locked -> do nothing
    }
  },

  clearPlayers: () => set({ selectedPlayers: [], lockedPlayerIds: [], oldestPlayerPosition: 0 }),

  toggleLockTeam: (teamId) => {
    const { lockedTeamIds, selectedTeams } = get()
    // Only allow locking selected teams
    if (!selectedTeams.some((t) => t.team.teamId === teamId)) return

    if (lockedTeamIds.includes(teamId)) {
      set({ lockedTeamIds: lockedTeamIds.filter((id) => id !== teamId) })
    } else {
      set({ lockedTeamIds: [...lockedTeamIds, teamId] })
    }
  },

  toggleLockPlayer: (playerId) => {
    const { lockedPlayerIds, selectedPlayers } = get()
    // Only allow locking selected players
    if (!selectedPlayers.some((p) => p.player.playerId === playerId)) return

    if (lockedPlayerIds.includes(playerId)) {
      set({ lockedPlayerIds: lockedPlayerIds.filter((id) => id !== playerId) })
    } else {
      set({ lockedPlayerIds: [...lockedPlayerIds, playerId] })
    }
  },

  resetToDefault: () => set((state) => ({
    period: 'day',
    referenceDate: new Date(),
    customStartDate: null,
    customEndDate: null,
    selectedLeagues: [],
    selectedRoles: [],
    minGames: 0,
    sortBy: 'lp',
    currentPage: 1,
    // Keep itemsPerPage as-is (responsive default set on mount)
    leaderboardView: 'teams',
    selectedTeams: [],
    selectedPlayers: [],
    lockedTeamIds: [],
    lockedPlayerIds: [],
    oldestTeamPosition: 0,
    oldestPlayerPosition: 0,
    resetKey: state.resetKey + 1,
  })),

  getDateRange: () => {
    const { period, referenceDate, customStartDate, customEndDate } = get()
    return getDateRange(period, referenceDate, customStartDate, customEndDate)
  },

  getPeriodLabel: () => {
    const { period, referenceDate, customStartDate, customEndDate } = get()
    return getPeriodLabel(period, referenceDate, customStartDate, customEndDate)
  },

  getRefDateString: () => {
    const { period, referenceDate, customEndDate } = get()
    // For custom period, use the end date as reference
    if (period === 'custom' && customEndDate) {
      return formatToDateString(customEndDate)
    }
    return formatToDateString(referenceDate)
  },
}))
