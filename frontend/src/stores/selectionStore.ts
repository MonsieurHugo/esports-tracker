import { create } from 'zustand'
import type { TeamLeaderboardEntry, PlayerLeaderboardEntry } from '@/lib/types'

interface SelectionState {
  // State
  selectedTeams: TeamLeaderboardEntry[]
  selectedPlayers: PlayerLeaderboardEntry[]
  lockedTeamIds: number[]
  lockedPlayerIds: number[]
  oldestTeamPosition: 0 | 1
  oldestPlayerPosition: 0 | 1

  // Actions
  selectTeam: (team: TeamLeaderboardEntry) => void
  updateSelectedTeamData: (team: TeamLeaderboardEntry) => void
  clearTeams: () => void
  toggleLockTeam: (teamId: number) => void
  selectPlayer: (player: PlayerLeaderboardEntry) => void
  clearPlayers: () => void
  toggleLockPlayer: (playerId: number) => void
  resetSelection: () => void
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedTeams: [],
  selectedPlayers: [],
  lockedTeamIds: [],
  lockedPlayerIds: [],
  oldestTeamPosition: 0,
  oldestPlayerPosition: 0,

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

  clearTeams: () => set({
    selectedTeams: [],
    lockedTeamIds: [],
    oldestTeamPosition: 0,
  }),

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

  clearPlayers: () => set({
    selectedPlayers: [],
    lockedPlayerIds: [],
    oldestPlayerPosition: 0,
  }),

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

  resetSelection: () => set({
    selectedTeams: [],
    selectedPlayers: [],
    lockedTeamIds: [],
    lockedPlayerIds: [],
    oldestTeamPosition: 0,
    oldestPlayerPosition: 0,
  }),
}))
