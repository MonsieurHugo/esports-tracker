import { describe, it, expect, beforeEach } from 'vitest'
import { usePeriodStore } from './periodStore'
import { useFilterStore } from './filterStore'
import { useSelectionStore } from './selectionStore'
import { useUIStore } from './uiStore'
import { mockTeam, mockPlayer } from '@/tests/mocks'
import type { TeamLeaderboardEntry, PlayerLeaderboardEntry } from '@/lib/types'

// Helper to reset all stores between tests
const resetStores = () => {
  usePeriodStore.setState({
    period: '7d',
    referenceDate: '2024-01-15',
  })
  useFilterStore.setState({
    teamsSelectedLeagues: [],
    playersSelectedLeagues: [],
    selectedRoles: [],
    teamsMinGames: 0,
    playersMinGames: 0,
  })
  useSelectionStore.setState({
    selectedTeams: [],
    selectedPlayers: [],
    lockedTeamIds: [],
    lockedPlayerIds: [],
    oldestTeamPosition: 0,
    oldestPlayerPosition: 0,
  })
  useUIStore.setState({
    sortBy: 'lp',
    currentPage: 1,
    itemsPerPage: 20,
    leaderboardView: 'teams',
    resetKey: 0,
  })
}

// Helper to parse date string and get date parts
const parseDate = (dateStr: string) => new Date(dateStr + 'T00:00:00')

describe('dashboardStore (split stores)', () => {
  beforeEach(() => {
    resetStores()
  })

  describe('periodStore', () => {
    describe('period actions', () => {
      it('should set period', () => {
        const { setPeriod } = usePeriodStore.getState()

        setPeriod('30d')

        expect(usePeriodStore.getState().period).toBe('30d')
      })

      it('should preserve reference date when changing period', () => {
        usePeriodStore.setState({ referenceDate: '2024-01-10' })
        const { setPeriod } = usePeriodStore.getState()

        setPeriod('30d')

        const state = usePeriodStore.getState()
        expect(state.referenceDate).toBe('2024-01-10')
      })

      it('should use today if reference date is in the future', () => {
        const futureDate = new Date()
        futureDate.setFullYear(futureDate.getFullYear() + 1)
        const futureDateStr = futureDate.toISOString().split('T')[0]
        usePeriodStore.setState({ referenceDate: futureDateStr })
        const { setPeriod } = usePeriodStore.getState()

        setPeriod('30d')

        const state = usePeriodStore.getState()
        const today = new Date().toISOString().split('T')[0]
        expect(state.referenceDate).toBe(today)
      })
    })

    describe('navigatePeriod', () => {
      it('should navigate 7d period by 7 days', () => {
        usePeriodStore.setState({
          period: '7d',
          referenceDate: '2024-01-15',
        })
        const { navigatePeriod } = usePeriodStore.getState()

        navigatePeriod('next')

        let state = usePeriodStore.getState()
        expect(parseDate(state.referenceDate).getDate()).toBe(22) // 15 + 7

        navigatePeriod('prev')
        state = usePeriodStore.getState()
        expect(parseDate(state.referenceDate).getDate()).toBe(15) // back to 15
      })

      it('should navigate 14d period by 14 days', () => {
        usePeriodStore.setState({
          period: '14d',
          referenceDate: '2024-01-15',
        })
        const { navigatePeriod } = usePeriodStore.getState()

        navigatePeriod('next')

        expect(parseDate(usePeriodStore.getState().referenceDate).getDate()).toBe(29) // 15 + 14

        navigatePeriod('prev')
        expect(parseDate(usePeriodStore.getState().referenceDate).getDate()).toBe(15) // back to 15
      })

      it('should navigate 30d period by 30 days', () => {
        usePeriodStore.setState({
          period: '30d',
          referenceDate: '2024-01-15',
        })
        const { navigatePeriod } = usePeriodStore.getState()

        navigatePeriod('next')

        const state = usePeriodStore.getState()
        const refDate = parseDate(state.referenceDate)
        expect(refDate.getMonth()).toBe(1) // February (0-indexed)
        expect(refDate.getDate()).toBe(14) // 15 + 30 = Feb 14
      })

      it('should navigate 90d period by 90 days', () => {
        usePeriodStore.setState({
          period: '90d',
          referenceDate: '2024-01-15',
        })
        const { navigatePeriod } = usePeriodStore.getState()

        navigatePeriod('next')

        const state = usePeriodStore.getState()
        const refDate = parseDate(state.referenceDate)
        expect(refDate.getMonth()).toBe(3) // April (0-indexed)
        expect(refDate.getDate()).toBe(14) // Jan 15 + 90 = April 14
      })
    })

    describe('computed values', () => {
      describe('getDateRange', () => {
        it('should return correct range for 7d period', () => {
          usePeriodStore.setState({
            period: '7d',
            referenceDate: '2024-01-15',
          })

          const { getDateRange } = usePeriodStore.getState()
          const range = getDateRange()

          expect(range.startDate).toBe('2024-01-09') // 15 - 6
          expect(range.endDate).toBe('2024-01-15')
        })

        it('should return correct range for 14d period', () => {
          usePeriodStore.setState({
            period: '14d',
            referenceDate: '2024-01-15',
          })

          const { getDateRange } = usePeriodStore.getState()
          const range = getDateRange()

          expect(range.startDate).toBe('2024-01-02') // 15 - 13
          expect(range.endDate).toBe('2024-01-15')
        })

        it('should return correct range for 30d period', () => {
          usePeriodStore.setState({
            period: '30d',
            referenceDate: '2024-01-30',
          })

          const { getDateRange } = usePeriodStore.getState()
          const range = getDateRange()

          expect(range.startDate).toBe('2024-01-01') // 30 - 29
          expect(range.endDate).toBe('2024-01-30')
        })

        it('should return correct range for 90d period', () => {
          usePeriodStore.setState({
            period: '90d',
            referenceDate: '2024-06-15',
          })

          const { getDateRange } = usePeriodStore.getState()
          const range = getDateRange()

          expect(range.startDate).toBe('2024-03-18') // June 15 - 89 days
          expect(range.endDate).toBe('2024-06-15')
        })
      })

      describe('getPeriodLabel', () => {
        it('should return correct label for 7d period', () => {
          usePeriodStore.setState({
            period: '7d',
            referenceDate: '2024-01-15',
          })

          const { getPeriodLabel } = usePeriodStore.getState()
          const label = getPeriodLabel()

          expect(label).toContain('9')
          expect(label).toContain('15')
          expect(label).toContain('jan')
        })

        it('should return correct label for 30d period', () => {
          usePeriodStore.setState({
            period: '30d',
            referenceDate: '2024-01-30',
          })

          const { getPeriodLabel } = usePeriodStore.getState()
          const label = getPeriodLabel()

          expect(label).toContain('1')
          expect(label).toContain('30')
          expect(label).toContain('jan')
        })

        it('should return correct label crossing months', () => {
          usePeriodStore.setState({
            period: '30d',
            referenceDate: '2024-02-15',
          })

          const { getPeriodLabel } = usePeriodStore.getState()
          const label = getPeriodLabel()

          // Should show both jan and fev
          expect(label).toContain('17')
          expect(label).toContain('jan')
          expect(label).toContain('15')
          expect(label).toContain('fev')
        })
      })

      describe('getRefDateString', () => {
        it('should return reference date as string', () => {
          usePeriodStore.setState({
            period: '7d',
            referenceDate: '2024-01-15',
          })

          const { getRefDateString } = usePeriodStore.getState()

          expect(getRefDateString()).toBe('2024-01-15')
        })
      })
    })
  })

  describe('filterStore', () => {
    describe('league filters', () => {
      it('should toggle league selection for teams view', () => {
        const { toggleLeague } = useFilterStore.getState()

        toggleLeague('teams', 'LEC')

        expect(useFilterStore.getState().teamsSelectedLeagues).toEqual(['LEC'])

        toggleLeague('teams', 'LFL')

        expect(useFilterStore.getState().teamsSelectedLeagues).toEqual(['LEC', 'LFL'])

        toggleLeague('teams', 'LEC')

        expect(useFilterStore.getState().teamsSelectedLeagues).toEqual(['LFL'])
      })

      it('should toggle league selection for players view', () => {
        const { toggleLeague } = useFilterStore.getState()

        toggleLeague('players', 'LCK')

        expect(useFilterStore.getState().playersSelectedLeagues).toEqual(['LCK'])

        toggleLeague('players', 'LCK')

        expect(useFilterStore.getState().playersSelectedLeagues).toEqual([])
      })

      it('should reset when all leagues deselected', () => {
        useFilterStore.setState({ teamsSelectedLeagues: ['LEC'] })
        const { toggleLeague } = useFilterStore.getState()

        toggleLeague('teams', 'LEC')

        expect(useFilterStore.getState().teamsSelectedLeagues).toEqual([])
      })

      it('should select all leagues (reset)', () => {
        useFilterStore.setState({ teamsSelectedLeagues: ['LEC', 'LFL'] })
        const { selectAllLeagues } = useFilterStore.getState()

        selectAllLeagues('teams')

        expect(useFilterStore.getState().teamsSelectedLeagues).toEqual([])
      })

      it('should keep views independent', () => {
        const { toggleLeague } = useFilterStore.getState()

        toggleLeague('teams', 'LEC')
        toggleLeague('players', 'LCK')

        expect(useFilterStore.getState().teamsSelectedLeagues).toEqual(['LEC'])
        expect(useFilterStore.getState().playersSelectedLeagues).toEqual(['LCK'])
      })
    })

    describe('role filters', () => {
      it('should toggle role selection', () => {
        const { toggleRole } = useFilterStore.getState()

        toggleRole('MID')

        expect(useFilterStore.getState().selectedRoles).toContain('MID')

        toggleRole('MID')

        expect(useFilterStore.getState().selectedRoles).not.toContain('MID')
      })

      it('should reset when all roles selected', () => {
        const { toggleRole } = useFilterStore.getState()
        toggleRole('TOP')
        toggleRole('JGL')
        toggleRole('MID')
        toggleRole('ADC')
        toggleRole('SUP')

        expect(useFilterStore.getState().selectedRoles).toEqual([])
      })

      it('should select all roles (reset)', () => {
        useFilterStore.setState({ selectedRoles: ['MID', 'ADC'] })
        const { selectAllRoles } = useFilterStore.getState()

        selectAllRoles()

        expect(useFilterStore.getState().selectedRoles).toEqual([])
      })
    })

    describe('minGames', () => {
      it('should set min games for teams view', () => {
        const { setMinGames } = useFilterStore.getState()

        setMinGames('teams', 10)

        expect(useFilterStore.getState().teamsMinGames).toBe(10)
      })

      it('should set min games for players view', () => {
        const { setMinGames } = useFilterStore.getState()

        setMinGames('players', 5)

        expect(useFilterStore.getState().playersMinGames).toBe(5)
      })

      it('should keep views independent for minGames', () => {
        const { setMinGames } = useFilterStore.getState()

        setMinGames('teams', 10)
        setMinGames('players', 20)

        expect(useFilterStore.getState().teamsMinGames).toBe(10)
        expect(useFilterStore.getState().playersMinGames).toBe(20)
      })
    })
  })

  describe('uiStore', () => {
    describe('sorting and pagination', () => {
      it('should set sort by', () => {
        const { setSortBy } = useUIStore.getState()

        setSortBy('games')

        expect(useUIStore.getState().sortBy).toBe('games')
      })

      it('should reset page when changing sort', () => {
        useUIStore.setState({ currentPage: 3 })
        const { setSortBy } = useUIStore.getState()

        setSortBy('games')

        expect(useUIStore.getState().currentPage).toBe(1)
      })

      it('should set page', () => {
        const { setPage } = useUIStore.getState()

        setPage(5)

        expect(useUIStore.getState().currentPage).toBe(5)
      })

      it('should set items per page and reset to page 1', () => {
        useUIStore.setState({ currentPage: 3 })
        const { setItemsPerPage } = useUIStore.getState()

        setItemsPerPage(50)

        const state = useUIStore.getState()
        expect(state.itemsPerPage).toBe(50)
        expect(state.currentPage).toBe(1)
      })
    })

    describe('leaderboard view', () => {
      it('should set leaderboard view', () => {
        const { setLeaderboardView } = useUIStore.getState()

        setLeaderboardView('players')

        expect(useUIStore.getState().leaderboardView).toBe('players')
      })

      it('should reset page when changing view', () => {
        useUIStore.setState({ currentPage: 3 })
        const { setLeaderboardView } = useUIStore.getState()

        setLeaderboardView('players')

        expect(useUIStore.getState().currentPage).toBe(1)
      })
    })
  })

  describe('selectionStore', () => {
    describe('team selection', () => {
      const team1 = mockTeam
      const team2: TeamLeaderboardEntry = {
        ...mockTeam,
        team: { ...mockTeam.team, teamId: 2, slug: 'team-2', currentName: 'Team 2' },
      }
      const team3: TeamLeaderboardEntry = {
        ...mockTeam,
        team: { ...mockTeam.team, teamId: 3, slug: 'team-3', currentName: 'Team 3' },
      }

      it('should select a team', () => {
        const { selectTeam } = useSelectionStore.getState()

        selectTeam(team1)

        expect(useSelectionStore.getState().selectedTeams).toHaveLength(1)
        expect(useSelectionStore.getState().selectedTeams[0].team.teamId).toBe(team1.team.teamId)
      })

      it('should deselect a team when clicking again', () => {
        const { selectTeam } = useSelectionStore.getState()

        selectTeam(team1)
        selectTeam(team1)

        expect(useSelectionStore.getState().selectedTeams).toHaveLength(0)
      })

      it('should allow selecting up to 2 teams', () => {
        const { selectTeam } = useSelectionStore.getState()

        selectTeam(team1)
        selectTeam(team2)

        expect(useSelectionStore.getState().selectedTeams).toHaveLength(2)
      })

      it('should replace oldest team when selecting third', () => {
        const { selectTeam } = useSelectionStore.getState()

        selectTeam(team1)
        selectTeam(team2)
        selectTeam(team3) // Should replace team1

        const state = useSelectionStore.getState()
        expect(state.selectedTeams).toHaveLength(2)
        expect(state.selectedTeams.map((t) => t.team.teamId)).toContain(team2.team.teamId)
        expect(state.selectedTeams.map((t) => t.team.teamId)).toContain(team3.team.teamId)
      })

      it('should not replace locked team', () => {
        const { selectTeam, toggleLockTeam } = useSelectionStore.getState()

        selectTeam(team1)
        selectTeam(team2)
        toggleLockTeam(team1.team.teamId) // Lock team1
        selectTeam(team3) // Should replace team2, not team1

        const state = useSelectionStore.getState()
        expect(state.selectedTeams.map((t) => t.team.teamId)).toContain(team1.team.teamId)
        expect(state.selectedTeams.map((t) => t.team.teamId)).toContain(team3.team.teamId)
      })

      it('should not replace when both teams are locked', () => {
        const { selectTeam, toggleLockTeam } = useSelectionStore.getState()

        selectTeam(team1)
        selectTeam(team2)
        toggleLockTeam(team1.team.teamId)
        toggleLockTeam(team2.team.teamId)
        selectTeam(team3) // Should not replace anything

        const state = useSelectionStore.getState()
        expect(state.selectedTeams.map((t) => t.team.teamId)).toContain(team1.team.teamId)
        expect(state.selectedTeams.map((t) => t.team.teamId)).toContain(team2.team.teamId)
        expect(state.selectedTeams.map((t) => t.team.teamId)).not.toContain(team3.team.teamId)
      })

      it('should update selected team data', () => {
        const { selectTeam, updateSelectedTeamData } = useSelectionStore.getState()

        selectTeam(team1)

        const updatedTeam: TeamLeaderboardEntry = {
          ...team1,
          games: 999,
        }
        updateSelectedTeamData(updatedTeam)

        expect(useSelectionStore.getState().selectedTeams[0].games).toBe(999)
      })

      it('should clear teams and locks', () => {
        const { selectTeam, toggleLockTeam, clearTeams } = useSelectionStore.getState()

        selectTeam(team1)
        selectTeam(team2)
        toggleLockTeam(team1.team.teamId)
        clearTeams()

        const state = useSelectionStore.getState()
        expect(state.selectedTeams).toHaveLength(0)
        expect(state.lockedTeamIds).toHaveLength(0)
      })

      it('should unlock team when deselecting', () => {
        const { selectTeam, toggleLockTeam } = useSelectionStore.getState()

        selectTeam(team1)
        toggleLockTeam(team1.team.teamId)
        selectTeam(team1) // Deselect

        expect(useSelectionStore.getState().lockedTeamIds).not.toContain(team1.team.teamId)
      })
    })

    describe('player selection', () => {
      const player1 = mockPlayer
      const player2: PlayerLeaderboardEntry = {
        ...mockPlayer,
        player: { ...mockPlayer.player, playerId: 2, slug: 'player-2', pseudo: 'Player 2' },
      }
      const player3: PlayerLeaderboardEntry = {
        ...mockPlayer,
        player: { ...mockPlayer.player, playerId: 3, slug: 'player-3', pseudo: 'Player 3' },
      }

      it('should select a player', () => {
        const { selectPlayer } = useSelectionStore.getState()

        selectPlayer(player1)

        expect(useSelectionStore.getState().selectedPlayers).toHaveLength(1)
      })

      it('should deselect a player when clicking again', () => {
        const { selectPlayer } = useSelectionStore.getState()

        selectPlayer(player1)
        selectPlayer(player1)

        expect(useSelectionStore.getState().selectedPlayers).toHaveLength(0)
      })

      it('should replace oldest player when selecting third', () => {
        const { selectPlayer } = useSelectionStore.getState()

        selectPlayer(player1)
        selectPlayer(player2)
        selectPlayer(player3)

        const state = useSelectionStore.getState()
        expect(state.selectedPlayers).toHaveLength(2)
        expect(state.selectedPlayers.map((p) => p.player.playerId)).toContain(player2.player.playerId)
        expect(state.selectedPlayers.map((p) => p.player.playerId)).toContain(player3.player.playerId)
      })

      it('should not replace locked player', () => {
        const { selectPlayer, toggleLockPlayer } = useSelectionStore.getState()

        selectPlayer(player1)
        selectPlayer(player2)
        toggleLockPlayer(player1.player.playerId)
        selectPlayer(player3)

        const state = useSelectionStore.getState()
        expect(state.selectedPlayers.map((p) => p.player.playerId)).toContain(player1.player.playerId)
        expect(state.selectedPlayers.map((p) => p.player.playerId)).toContain(player3.player.playerId)
      })

      it('should clear players and locks', () => {
        const { selectPlayer, toggleLockPlayer, clearPlayers } = useSelectionStore.getState()

        selectPlayer(player1)
        toggleLockPlayer(player1.player.playerId)
        clearPlayers()

        const state = useSelectionStore.getState()
        expect(state.selectedPlayers).toHaveLength(0)
        expect(state.lockedPlayerIds).toHaveLength(0)
      })
    })

    describe('lock toggles', () => {
      it('should only lock selected teams', () => {
        const { toggleLockTeam } = useSelectionStore.getState()

        toggleLockTeam(999) // Non-existent team

        expect(useSelectionStore.getState().lockedTeamIds).toHaveLength(0)
      })

      it('should only lock selected players', () => {
        const { toggleLockPlayer } = useSelectionStore.getState()

        toggleLockPlayer(999) // Non-existent player

        expect(useSelectionStore.getState().lockedPlayerIds).toHaveLength(0)
      })

      it('should toggle lock on and off', () => {
        const { selectTeam, toggleLockTeam } = useSelectionStore.getState()

        selectTeam(mockTeam)
        toggleLockTeam(mockTeam.team.teamId)

        expect(useSelectionStore.getState().lockedTeamIds).toContain(mockTeam.team.teamId)

        toggleLockTeam(mockTeam.team.teamId)

        expect(useSelectionStore.getState().lockedTeamIds).not.toContain(mockTeam.team.teamId)
      })
    })
  })

  describe('combined reset', () => {
    it('should reset all stores', () => {
      // Set various non-default values
      usePeriodStore.setState({
        period: '30d',
        referenceDate: '2020-01-01',
      })
      useFilterStore.setState({
        teamsSelectedLeagues: ['LEC'],
        playersSelectedLeagues: ['LCK'],
        selectedRoles: ['MID'],
        teamsMinGames: 10,
        playersMinGames: 5,
      })
      useUIStore.setState({
        sortBy: 'games',
        currentPage: 5,
        leaderboardView: 'players',
      })
      useSelectionStore.setState({
        selectedTeams: [mockTeam],
        selectedPlayers: [mockPlayer],
        lockedTeamIds: [1],
        lockedPlayerIds: [1],
      })

      // Reset all stores
      usePeriodStore.getState().resetPeriod()
      useFilterStore.getState().resetFilters()
      useSelectionStore.getState().resetSelection()
      useUIStore.getState().resetUI()

      // Verify all reset
      const periodState = usePeriodStore.getState()
      expect(periodState.period).toBe('7d')

      const filterState = useFilterStore.getState()
      expect(filterState.teamsSelectedLeagues).toEqual([])
      expect(filterState.playersSelectedLeagues).toEqual([])
      expect(filterState.selectedRoles).toEqual([])
      expect(filterState.teamsMinGames).toBe(0)
      expect(filterState.playersMinGames).toBe(0)

      const uiState = useUIStore.getState()
      expect(uiState.sortBy).toBe('lp')
      expect(uiState.currentPage).toBe(1)
      // leaderboardView is intentionally not reset by resetUI() - it's kept as-is
      expect(uiState.leaderboardView).toBe('players')

      const selectionState = useSelectionStore.getState()
      expect(selectionState.selectedTeams).toEqual([])
      expect(selectionState.selectedPlayers).toEqual([])
      expect(selectionState.lockedTeamIds).toEqual([])
      expect(selectionState.lockedPlayerIds).toEqual([])
    })
  })

  describe('selectionStore - oldestPosition edge cases', () => {
    const team1 = mockTeam
    const team2: TeamLeaderboardEntry = {
      ...mockTeam,
      team: { ...mockTeam.team, teamId: 2, slug: 'team-2', currentName: 'Team 2' },
    }
    const team3: TeamLeaderboardEntry = {
      ...mockTeam,
      team: { ...mockTeam.team, teamId: 3, slug: 'team-3', currentName: 'Team 3' },
    }
    const team4: TeamLeaderboardEntry = {
      ...mockTeam,
      team: { ...mockTeam.team, teamId: 4, slug: 'team-4', currentName: 'Team 4' },
    }

    it('should track oldestTeamPosition correctly through multiple replacements', () => {
      const { selectTeam } = useSelectionStore.getState()

      // Add first two teams
      selectTeam(team1)
      selectTeam(team2)

      // Now team1 is at position 0 (oldest), team2 at position 1
      expect(useSelectionStore.getState().oldestTeamPosition).toBe(0)

      // Add team3, should replace team1 (oldest)
      selectTeam(team3)

      // Now team2 becomes oldest (position 1), team3 is newer
      let state = useSelectionStore.getState()
      expect(state.selectedTeams.map(t => t.team.teamId)).toEqual([team3.team.teamId, team2.team.teamId])
      expect(state.oldestTeamPosition).toBe(1) // team2 is now oldest

      // Add team4, should replace team2 (oldest at position 1)
      selectTeam(team4)

      state = useSelectionStore.getState()
      expect(state.selectedTeams.map(t => t.team.teamId)).toContain(team3.team.teamId)
      expect(state.selectedTeams.map(t => t.team.teamId)).toContain(team4.team.teamId)
    })

    it('should reset oldestTeamPosition when going back to 1 team', () => {
      const { selectTeam } = useSelectionStore.getState()

      selectTeam(team1)
      selectTeam(team2)
      selectTeam(team3) // Replaces team1

      expect(useSelectionStore.getState().oldestTeamPosition).toBe(1)

      // Deselect one team
      selectTeam(team2)

      expect(useSelectionStore.getState().oldestTeamPosition).toBe(0)
    })

    it('should replace newer team when older is locked', () => {
      const { selectTeam, toggleLockTeam } = useSelectionStore.getState()

      selectTeam(team1)
      selectTeam(team2)
      toggleLockTeam(team1.team.teamId) // Lock team1 (oldest)

      selectTeam(team3) // Should replace team2 (newer, not locked)

      const state = useSelectionStore.getState()
      expect(state.selectedTeams.map(t => t.team.teamId)).toContain(team1.team.teamId)
      expect(state.selectedTeams.map(t => t.team.teamId)).toContain(team3.team.teamId)
      expect(state.selectedTeams.map(t => t.team.teamId)).not.toContain(team2.team.teamId)
    })
  })

  describe('selectionStore - updateSelectedTeamData edge cases', () => {
    it('should not affect other teams when updating one', () => {
      const team1 = mockTeam
      const team2: TeamLeaderboardEntry = {
        ...mockTeam,
        team: { ...mockTeam.team, teamId: 2, slug: 'team-2', currentName: 'Team 2' },
        games: 100,
      }

      const { selectTeam, updateSelectedTeamData } = useSelectionStore.getState()

      selectTeam(team1)
      selectTeam(team2)

      const updatedTeam1: TeamLeaderboardEntry = {
        ...team1,
        games: 999,
        winrate: 99.9,
      }
      updateSelectedTeamData(updatedTeam1)

      const state = useSelectionStore.getState()
      expect(state.selectedTeams.find(t => t.team.teamId === team1.team.teamId)?.games).toBe(999)
      expect(state.selectedTeams.find(t => t.team.teamId === team2.team.teamId)?.games).toBe(100)
    })

    it('should not add team if not already selected', () => {
      const { updateSelectedTeamData } = useSelectionStore.getState()

      const newTeam: TeamLeaderboardEntry = {
        ...mockTeam,
        team: { ...mockTeam.team, teamId: 999 },
      }

      updateSelectedTeamData(newTeam)

      expect(useSelectionStore.getState().selectedTeams).toHaveLength(0)
    })
  })

  describe('uiStore - resetKey', () => {
    it('should increment resetKey', () => {
      const initial = useUIStore.getState().resetKey
      const { incrementResetKey } = useUIStore.getState()

      incrementResetKey()

      expect(useUIStore.getState().resetKey).toBe(initial + 1)
    })

    it('should increment multiple times', () => {
      const initial = useUIStore.getState().resetKey
      const { incrementResetKey } = useUIStore.getState()

      incrementResetKey()
      incrementResetKey()
      incrementResetKey()

      expect(useUIStore.getState().resetKey).toBe(initial + 3)
    })
  })

  describe('periodStore - edge cases', () => {
    it('should handle 7d navigation across month boundary', () => {
      usePeriodStore.setState({
        period: '7d',
        referenceDate: '2024-01-03',
      })
      const { navigatePeriod } = usePeriodStore.getState()

      navigatePeriod('prev')

      const state = usePeriodStore.getState()
      const refDate = parseDate(state.referenceDate)
      expect(refDate.getFullYear()).toBe(2023)
      expect(refDate.getMonth()).toBe(11) // December
      expect(refDate.getDate()).toBe(27) // 3 - 7 = Dec 27
    })

    it('should handle 30d navigation across year boundary', () => {
      usePeriodStore.setState({
        period: '30d',
        referenceDate: '2024-01-15',
      })
      const { navigatePeriod } = usePeriodStore.getState()

      navigatePeriod('prev')

      const state = usePeriodStore.getState()
      const refDate = parseDate(state.referenceDate)
      expect(refDate.getFullYear()).toBe(2023)
      expect(refDate.getMonth()).toBe(11) // December
    })
  })

  describe('filterStore - getters', () => {
    it('should get selected leagues for teams view', () => {
      useFilterStore.setState({ teamsSelectedLeagues: ['LEC', 'LFL'] })
      const { getSelectedLeagues } = useFilterStore.getState()

      expect(getSelectedLeagues('teams')).toEqual(['LEC', 'LFL'])
    })

    it('should get selected leagues for players view', () => {
      useFilterStore.setState({ playersSelectedLeagues: ['LCK'] })
      const { getSelectedLeagues } = useFilterStore.getState()

      expect(getSelectedLeagues('players')).toEqual(['LCK'])
    })

    it('should get minGames for teams view', () => {
      useFilterStore.setState({ teamsMinGames: 15 })
      const { getMinGames } = useFilterStore.getState()

      expect(getMinGames('teams')).toBe(15)
    })

    it('should get minGames for players view', () => {
      useFilterStore.setState({ playersMinGames: 8 })
      const { getMinGames } = useFilterStore.getState()

      expect(getMinGames('players')).toBe(8)
    })
  })
})
