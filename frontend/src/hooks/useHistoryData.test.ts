import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useTeamHistory, usePlayerHistory } from './useHistoryData'
import api from '@/lib/api'
import { mockTeam, mockPlayer } from '@/tests/mocks'
import type { TeamLeaderboardEntry, PlayerLeaderboardEntry } from '@/lib/types'

// Mock the api module
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

const mockApiGet = vi.mocked(api.get)

describe('useTeamHistory', () => {
  const mockTeam2: TeamLeaderboardEntry = {
    ...mockTeam,
    team: { ...mockTeam.team, teamId: 2, slug: 'team-2', currentName: 'Team 2', shortName: 'T2' },
  }

  const mockHistoryData = [
    { date: '2024-01-09', label: 'Mon', games: 10, wins: 6, winrate: 60, totalLp: 1000 },
    { date: '2024-01-10', label: 'Tue', games: 8, wins: 5, winrate: 62.5, totalLp: 1050 },
    { date: '2024-01-11', label: 'Wed', games: 12, wins: 7, winrate: 58.3, totalLp: 1100 },
  ]

  const defaultParams = {
    selectedTeams: [mockTeam],
    period: '7d',
    refDate: '2024-01-15',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: mockHistoryData })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should not fetch if no teams selected', () => {
      renderHook(() => useTeamHistory({
        selectedTeams: [],
        period: '7d',
        refDate: '2024-01-15',
      }))

      expect(mockApiGet).not.toHaveBeenCalled()
    })

    it('should clear data when teams deselected', async () => {
      const { result, rerender } = renderHook(
        (props) => useTeamHistory(props),
        { initialProps: defaultParams }
      )

      await waitFor(() => {
        expect(result.current.gamesData).toHaveLength(1)
      })

      rerender({ ...defaultParams, selectedTeams: [] })

      expect(result.current.gamesData).toEqual([])
      expect(result.current.lpData).toEqual([])
    })
  })

  describe('fetching history', () => {
    it('should fetch history for selected teams', async () => {
      const { result } = renderHook(() => useTeamHistory(defaultParams))

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockApiGet).toHaveBeenCalledWith(
        '/lol/dashboard/team-history',
        expect.objectContaining({
          params: expect.objectContaining({
            period: '7d',
            date: '2024-01-15',
            teamId: mockTeam.team.teamId,
          }),
        })
      )
    })

    it('should return games data with correct structure', async () => {
      const { result } = renderHook(() => useTeamHistory(defaultParams))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.gamesData).toHaveLength(1)
      expect(result.current.gamesData[0]).toEqual({
        teamName: mockTeam.team.currentName,
        shortName: mockTeam.team.shortName,
        data: expect.arrayContaining([
          expect.objectContaining({
            date: '2024-01-09',
            games: 10,
            wins: 6,
            winrate: 60,
          }),
        ]),
      })
    })

    it('should return LP data with correct structure', async () => {
      const { result } = renderHook(() => useTeamHistory(defaultParams))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.lpData).toHaveLength(1)
      expect(result.current.lpData[0]).toEqual({
        teamName: mockTeam.team.currentName,
        shortName: mockTeam.team.shortName,
        data: expect.arrayContaining([
          expect.objectContaining({
            date: '2024-01-09',
            totalLp: 1000,
          }),
        ]),
      })
    })

    it('should fetch history for multiple teams', async () => {
      const params = {
        ...defaultParams,
        selectedTeams: [mockTeam, mockTeam2],
      }

      const { result } = renderHook(() => useTeamHistory(params))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockApiGet).toHaveBeenCalledTimes(2)
      expect(result.current.gamesData).toHaveLength(2)
      expect(result.current.lpData).toHaveLength(2)
    })
  })

  describe('abort controller', () => {
    it('should abort pending requests on unmount', async () => {
      let abortSignal: AbortSignal | undefined

      mockApiGet.mockImplementation((_endpoint: string, options?: { signal?: AbortSignal }) => {
        abortSignal = options?.signal
        return new Promise(() => {}) // Never resolves
      })

      const { unmount } = renderHook(() => useTeamHistory(defaultParams))

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(abortSignal?.aborted).toBe(false)

      unmount()

      expect(abortSignal?.aborted).toBe(true)
    })

    it('should abort previous request when params change', async () => {
      let firstAbortSignal: AbortSignal | undefined
      let callCount = 0

      mockApiGet.mockImplementation((_endpoint: string, options?: { signal?: AbortSignal }) => {
        callCount++
        if (callCount === 1) {
          firstAbortSignal = options?.signal
          return new Promise(() => {}) // First request never resolves
        }
        return Promise.resolve({ data: mockHistoryData })
      })

      const { result, rerender } = renderHook(
        (props) => useTeamHistory(props),
        { initialProps: defaultParams }
      )

      // Wait for first request to start
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Change period to trigger new request
      rerender({ ...defaultParams, period: '30d' })

      await waitFor(() => {
        expect(firstAbortSignal?.aborted).toBe(true)
      })
    })
  })

  describe('race condition handling', () => {
    it('should ignore stale requests using requestId', async () => {
      let resolveFirst: (value: unknown) => void
      let resolveSecond: (value: unknown) => void

      mockApiGet
        .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
        .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

      const { result, rerender } = renderHook(
        (props) => useTeamHistory(props),
        { initialProps: defaultParams }
      )

      // Trigger second request
      rerender({ ...defaultParams, period: '30d' })

      // Wait for both requests to be in flight
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Resolve second request first
      const secondData = [{ date: '2024-01-15', label: 'Jan', games: 50, wins: 30, winrate: 60, totalLp: 2000 }]
      resolveSecond!({ data: secondData })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Then resolve first (should be ignored due to requestId)
      const firstData = [{ date: '2024-01-09', label: 'Mon', games: 10, wins: 6, winrate: 60, totalLp: 1000 }]
      resolveFirst!({ data: firstData })

      // Should have second request's data
      expect(result.current.gamesData[0].data[0].games).toBe(50)
    })
  })

  describe('error handling', () => {
    it('should clear data on error', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useTeamHistory(defaultParams))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.gamesData).toEqual([])
      expect(result.current.lpData).toEqual([])
    })

    it('should ignore AbortError', async () => {
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      mockApiGet.mockRejectedValue(abortError)

      const { result, unmount } = renderHook(() => useTeamHistory(defaultParams))

      unmount()

      // Should not throw
      expect(result.current.gamesData).toEqual([])
    })

    it('should handle empty response data', async () => {
      mockApiGet.mockResolvedValue({ data: null })

      const { result } = renderHook(() => useTeamHistory(defaultParams))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.gamesData[0].data).toEqual([])
    })
  })
})

describe('usePlayerHistory', () => {
  const mockPlayer2: PlayerLeaderboardEntry = {
    ...mockPlayer,
    player: { ...mockPlayer.player, playerId: 2, slug: 'player-2', pseudo: 'Player 2' },
  }

  const mockHistoryData = [
    { date: '2024-01-09', label: 'Mon', games: 5, wins: 3, winrate: 60, totalLp: 500 },
    { date: '2024-01-10', label: 'Tue', games: 4, wins: 3, winrate: 75, totalLp: 550 },
  ]

  const defaultParams = {
    selectedPlayers: [mockPlayer],
    period: '7d',
    refDate: '2024-01-15',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: mockHistoryData })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should not fetch if no players selected', () => {
      renderHook(() => usePlayerHistory({
        selectedPlayers: [],
        period: '7d',
        refDate: '2024-01-15',
      }))

      expect(mockApiGet).not.toHaveBeenCalled()
    })

    it('should clear data when players deselected', async () => {
      const { result, rerender } = renderHook(
        (props) => usePlayerHistory(props),
        { initialProps: defaultParams }
      )

      await waitFor(() => {
        expect(result.current.gamesData).toHaveLength(1)
      })

      rerender({ ...defaultParams, selectedPlayers: [] })

      expect(result.current.gamesData).toEqual([])
      expect(result.current.lpData).toEqual([])
    })
  })

  describe('fetching history', () => {
    it('should fetch history for selected players', async () => {
      const { result } = renderHook(() => usePlayerHistory(defaultParams))

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockApiGet).toHaveBeenCalledWith(
        '/lol/dashboard/player-history',
        expect.objectContaining({
          params: expect.objectContaining({
            period: '7d',
            date: '2024-01-15',
            playerId: mockPlayer.player.playerId,
          }),
        })
      )
    })

    it('should return games data with player pseudo as teamName', async () => {
      const { result } = renderHook(() => usePlayerHistory(defaultParams))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.gamesData).toHaveLength(1)
      expect(result.current.gamesData[0]).toEqual({
        teamName: mockPlayer.player.pseudo,
        shortName: mockPlayer.player.pseudo,
        data: expect.arrayContaining([
          expect.objectContaining({
            date: '2024-01-09',
            games: 5,
            wins: 3,
          }),
        ]),
      })
    })

    it('should fetch history for multiple players', async () => {
      const params = {
        ...defaultParams,
        selectedPlayers: [mockPlayer, mockPlayer2],
      }

      const { result } = renderHook(() => usePlayerHistory(params))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockApiGet).toHaveBeenCalledTimes(2)
      expect(result.current.gamesData).toHaveLength(2)
    })
  })

  describe('abort controller', () => {
    it('should abort pending requests on unmount', async () => {
      let abortSignal: AbortSignal | undefined

      mockApiGet.mockImplementation((_endpoint: string, options?: { signal?: AbortSignal }) => {
        abortSignal = options?.signal
        return new Promise(() => {})
      })

      const { unmount } = renderHook(() => usePlayerHistory(defaultParams))

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(abortSignal?.aborted).toBe(false)

      unmount()

      expect(abortSignal?.aborted).toBe(true)
    })
  })

  describe('race condition handling', () => {
    it('should ignore stale requests using requestId', async () => {
      let resolveFirst: (value: unknown) => void
      let resolveSecond: (value: unknown) => void

      mockApiGet
        .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
        .mockImplementationOnce(() => new Promise((r) => { resolveSecond = r }))

      const { result, rerender } = renderHook(
        (props) => usePlayerHistory(props),
        { initialProps: defaultParams }
      )

      // Trigger second request
      rerender({ ...defaultParams, period: '30d' })

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      // Resolve second request first with different data
      resolveSecond!({ data: [{ date: '2024-01-15', label: 'Jan', games: 100, wins: 60, winrate: 60, totalLp: 3000 }] })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Then resolve first (should be ignored)
      resolveFirst!({ data: mockHistoryData })

      // Should have second request's data
      expect(result.current.gamesData[0].data[0].games).toBe(100)
    })
  })

  describe('error handling', () => {
    it('should clear data on error', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => usePlayerHistory(defaultParams))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.gamesData).toEqual([])
      expect(result.current.lpData).toEqual([])
    })

    it('should not update loading state for stale error requests', async () => {
      let rejectFirst: (error: Error) => void

      mockApiGet
        .mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject }))
        .mockResolvedValueOnce({ data: mockHistoryData })

      const { result, rerender } = renderHook(
        (props) => usePlayerHistory(props),
        { initialProps: defaultParams }
      )

      // Trigger second request
      rerender({ ...defaultParams, period: '30d' })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Reject first request after second completes
      rejectFirst!(new Error('Stale error'))

      // Loading should still be false (stale request shouldn't affect state)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.gamesData).toHaveLength(1)
    })
  })
})
