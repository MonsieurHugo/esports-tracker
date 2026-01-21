import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useDashboardData, usePlayersData } from './useDashboardData'
import api from '@/lib/api'
import { mockTeam, mockPlayer } from '@/tests/mocks'

// Mock the api module
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

const mockApiGet = vi.mocked(api.get)

describe('useDashboardData', () => {
  const defaultParams = {
    period: '7d',
    refDate: '2024-01-15',
    selectedLeagues: [] as string[],
    selectedRoles: [] as string[],
    minGames: 0,
    sortBy: 'lp',
    currentPage: 1,
    itemsPerPage: 20,
    selectedTeamIds: '',
    grindersSort: 'desc' as const,
    lpGainersSort: 'desc' as const,
    lpLosersSort: 'desc' as const,
    leaderboardView: 'teams' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock responses for batch API
    mockApiGet.mockImplementation((endpoint: string) => {
      if (endpoint === '/lol/dashboard/batch') {
        return Promise.resolve({
          grinders: { data: [] },
          gainers: { data: [] },
          losers: { data: [] },
        })
      }
      if (endpoint === '/lol/dashboard/teams') {
        return Promise.resolve({
          data: [mockTeam],
          meta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
        })
      }
      if (endpoint === '/lol/dashboard/players') {
        return Promise.resolve({
          data: [],
          meta: { total: 0, perPage: 20, currentPage: 1, lastPage: 1 },
        })
      }
      return Promise.resolve({})
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial fetch', () => {
    it('should fetch dashboard data on mount', async () => {
      const { result } = renderHook(() => useDashboardData(defaultParams))

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockApiGet).toHaveBeenCalledWith(
        '/lol/dashboard/batch',
        expect.objectContaining({
          params: expect.objectContaining({ period: '7d', date: '2024-01-15' }),
        })
      )

      expect(mockApiGet).toHaveBeenCalledWith(
        '/lol/dashboard/teams',
        expect.objectContaining({
          params: expect.objectContaining({
            period: '7d',
            date: '2024-01-15',
            sort: 'lp',
            page: 1,
            perPage: 20,
          }),
        })
      )
    })

    it('should return fetched data', async () => {
      const { result } = renderHook(() => useDashboardData(defaultParams))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.data.teams).toHaveLength(1)
      expect(result.current.data.teams[0]).toEqual(mockTeam)
    })

    it('should set correct teamsMeta from response', async () => {
      const { result } = renderHook(() => useDashboardData(defaultParams))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.data.teamsMeta).toEqual({
        total: 1,
        perPage: 20,
        currentPage: 1,
        lastPage: 1,
      })
    })
  })

  describe('abort controller on unmount', () => {
    it('should abort pending requests on unmount', async () => {
      let abortSignal: AbortSignal | undefined

      mockApiGet.mockImplementation((endpoint: string, options?: { signal?: AbortSignal }) => {
        if (endpoint === '/lol/dashboard/batch') {
          abortSignal = options?.signal
          // Return a promise that never resolves to simulate pending request
          return new Promise(() => {})
        }
        return Promise.resolve({
          data: [],
          meta: { total: 0, perPage: 20, currentPage: 1, lastPage: 1 },
        })
      })

      const { unmount } = renderHook(() => useDashboardData(defaultParams))

      // Wait a bit for the effect to run (debounce + effect)
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350))
      })

      expect(abortSignal?.aborted).toBe(false)

      unmount()

      expect(abortSignal?.aborted).toBe(true)
    })

    it('should not update state after abort', async () => {
      let resolvePromise: ((value: unknown) => void) | undefined

      mockApiGet.mockImplementation((endpoint: string) => {
        if (endpoint === '/lol/dashboard/batch') {
          return new Promise((resolve) => {
            resolvePromise = resolve
          })
        }
        return Promise.resolve({
          data: [],
          meta: { total: 0, perPage: 20, currentPage: 1, lastPage: 1 },
        })
      })

      const { result, unmount } = renderHook(() => useDashboardData(defaultParams))

      // Wait for debounce so the API call starts
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350))
      })

      // Unmount before resolving
      unmount()

      // Resolve after unmount (if resolvePromise was assigned)
      if (resolvePromise) {
        resolvePromise({
          grinders: { data: [] },
          gainers: { data: [] },
          losers: { data: [] },
        })
      }

      // State should remain as initial (no teams loaded)
      expect(result.current.data.teams).toHaveLength(0)
    })
  })

  describe('filters', () => {
    it('should include league filter in API calls', async () => {
      const params = {
        ...defaultParams,
        selectedLeagues: ['LEC', 'LFL'],
      }

      renderHook(() => useDashboardData(params))

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          '/lol/dashboard/teams',
          expect.objectContaining({
            params: expect.objectContaining({
              leagues: 'LEC,LFL',
            }),
          })
        )
      })
    })

    it('should include role filter in batch call for players view', async () => {
      const params = {
        ...defaultParams,
        selectedRoles: ['MID', 'ADC'],
        leaderboardView: 'players' as const,
      }

      renderHook(() => useDashboardData(params))

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          '/lol/dashboard/batch',
          expect.objectContaining({
            params: expect.objectContaining({
              roles: 'MID,ADC',
              viewMode: 'players',
            }),
          })
        )
      })
    })

    it('should not include role filter in batch call for teams view', async () => {
      const params = {
        ...defaultParams,
        selectedRoles: ['MID', 'ADC'],
        leaderboardView: 'teams' as const,
      }

      renderHook(() => useDashboardData(params))

      await waitFor(() => {
        const batchCall = mockApiGet.mock.calls.find(
          (call) => call[0] === '/lol/dashboard/batch'
        )
        expect(batchCall?.[1]?.params?.roles).toBeUndefined()
      })
    })

    it('should include minGames filter when set', async () => {
      const params = {
        ...defaultParams,
        minGames: 10,
      }

      renderHook(() => useDashboardData(params))

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          '/lol/dashboard/teams',
          expect.objectContaining({
            params: expect.objectContaining({
              minGames: 10,
            }),
          })
        )
      })
    })

    it('should not include minGames when zero', async () => {
      renderHook(() => useDashboardData(defaultParams))

      await waitFor(() => {
        const teamsCall = mockApiGet.mock.calls.find(
          (call) => call[0] === '/lol/dashboard/teams'
        )
        expect(teamsCall?.[1]?.params?.minGames).toBeUndefined()
      })
    })
  })

  describe('period changes', () => {
    it('should detect period changes', async () => {
      const { result, rerender } = renderHook(
        (props) => useDashboardData(props),
        { initialProps: defaultParams }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Change period
      rerender({ ...defaultParams, period: '30d' })

      await waitFor(() => {
        expect(result.current.isPeriodChange).toBe(true)
      })
    })

    it('should call onTeamsChange callback with teams data', async () => {
      const onTeamsChange = vi.fn()
      const params = { ...defaultParams, onTeamsChange }

      renderHook(() => useDashboardData(params))

      await waitFor(() => {
        expect(onTeamsChange).toHaveBeenCalledWith(
          expect.arrayContaining([expect.objectContaining({ team: mockTeam.team })]),
          expect.any(Boolean)
        )
      })
    })
  })

  describe('grinders and LP data', () => {
    it('should fetch batch data with limit for grinders/gainers/losers', async () => {
      renderHook(() => useDashboardData(defaultParams))

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          '/lol/dashboard/batch',
          expect.objectContaining({
            params: expect.objectContaining({
              limit: '5',
            }),
          })
        )
      })
    })

    it('should include viewMode in batch call', async () => {
      renderHook(() => useDashboardData(defaultParams))

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          '/lol/dashboard/batch',
          expect.objectContaining({
            params: expect.objectContaining({
              viewMode: 'teams',
            }),
          })
        )
      })
    })
  })

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useDashboardData(defaultParams))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should not crash, data remains empty
      expect(result.current.data.teams).toEqual([])
    })

    it('should set error state on failure', async () => {
      const networkError = new Error('Network error')
      mockApiGet.mockRejectedValue(networkError)

      const { result } = renderHook(() => useDashboardData(defaultParams))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.error).toBeDefined()
      expect(result.current.error?.message).toBe('Network error')
    })

    it('should ignore AbortError', async () => {
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      mockApiGet.mockRejectedValue(abortError)

      const { result, unmount } = renderHook(() => useDashboardData(defaultParams))

      unmount()

      // Should not throw or log errors
      expect(result.current.data.teams).toEqual([])
    })

    it('should not set error for AbortError', async () => {
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      mockApiGet.mockRejectedValue(abortError)

      const { result } = renderHook(() => useDashboardData(defaultParams))

      // Wait a bit for the error to be processed
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('retry functionality', () => {
    it('should provide a retry function', async () => {
      mockApiGet.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useDashboardData(defaultParams))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(typeof result.current.retry).toBe('function')
    })

    it('should clear error and refetch when retry is called', async () => {
      // First call fails for both batch and teams
      mockApiGet.mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useDashboardData(defaultParams))

      await waitFor(() => {
        expect(result.current.error).not.toBeNull()
      }, { timeout: 600 })

      // Clear mocks and setup success for retry
      mockApiGet.mockReset()
      mockApiGet.mockImplementation((endpoint: string) => {
        if (endpoint === '/lol/dashboard/batch') {
          return Promise.resolve({
              grinders: { data: [] },
            gainers: { data: [] },
            losers: { data: [] },
          })
        }
        if (endpoint === '/lol/dashboard/teams') {
          return Promise.resolve({
            data: [mockTeam],
            meta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
          })
        }
        return Promise.resolve({ data: [] })
      })

      // Call retry
      act(() => {
        result.current.retry()
      })

      await waitFor(() => {
        expect(result.current.error).toBeNull()
        expect(result.current.data.teams).toHaveLength(1)
      }, { timeout: 700 })
    })

    it('should increment retryTrigger and trigger new fetch', async () => {
      mockApiGet.mockRejectedValueOnce(new Error('First error'))

      const { result } = renderHook(() => useDashboardData(defaultParams))

      await waitFor(() => {
        expect(result.current.error).toBeDefined()
      })

      const callCountBeforeRetry = mockApiGet.mock.calls.length

      // Setup success for retry
      mockApiGet.mockResolvedValue({ data: [], meta: {} })

      act(() => {
        result.current.retry()
      })

      await waitFor(() => {
        expect(mockApiGet.mock.calls.length).toBeGreaterThan(callCountBeforeRetry)
      })
    })
  })

  describe('newTeams tracking', () => {
    it('should track newTeams from fetch response', async () => {
      mockApiGet.mockImplementation((endpoint: string) => {
        if (endpoint === '/lol/dashboard/batch') {
          return Promise.resolve({
              grinders: { data: [] },
            gainers: { data: [] },
            losers: { data: [] },
          })
        }
        if (endpoint === '/lol/dashboard/teams') {
          return Promise.resolve({
            data: [mockTeam],
            meta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
          })
        }
        return Promise.resolve({ data: [] })
      })

      const { result } = renderHook(() => useDashboardData(defaultParams))

      await waitFor(() => {
        expect(result.current.newTeams).toHaveLength(1)
      })

      expect(result.current.newTeams[0].team.teamId).toBe(mockTeam.team.teamId)
    })
  })

  describe('pagination', () => {
    it('should pass pagination params to API', async () => {
      const params = {
        ...defaultParams,
        currentPage: 2,
        itemsPerPage: 50,
      }

      renderHook(() => useDashboardData(params))

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          '/lol/dashboard/teams',
          expect.objectContaining({
            params: expect.objectContaining({
              page: 2,
              perPage: 50,
            }),
          })
        )
      })
    })
  })
})

describe('usePlayersData', () => {
  const defaultParams = {
    leaderboardView: 'players' as const,
    period: '7d',
    refDate: '2024-01-15',
    selectedLeagues: [] as string[],
    selectedRoles: [] as string[],
    minGames: 0,
    sortBy: 'lp',
    currentPage: 1,
    itemsPerPage: 20,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({
      data: [mockPlayer],
      meta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should fetch players when in players view', async () => {
    const { result } = renderHook(() => usePlayersData(defaultParams))

    // Wait for debounce (300ms) + API call to complete
    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(
        '/lol/dashboard/players',
        expect.objectContaining({
          params: expect.objectContaining({
            period: '7d',
            date: '2024-01-15',
          }),
        })
      )
    }, { timeout: 500 })

    await waitFor(() => {
      expect(result.current.players).toHaveLength(1)
    })

    expect(result.current.players[0]).toEqual(mockPlayer)
  })

  it('should not fetch when in teams view', async () => {
    const params = { ...defaultParams, leaderboardView: 'teams' as const }

    renderHook(() => usePlayersData(params))

    // Wait longer than debounce to ensure no fetch is triggered
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400))
    })

    expect(mockApiGet).not.toHaveBeenCalledWith(
      '/lol/dashboard/players',
      expect.any(Object)
    )
  })

  it('should include role filter', async () => {
    const params = {
      ...defaultParams,
      selectedRoles: ['MID', 'SUP'],
    }

    renderHook(() => usePlayersData(params))

    await waitFor(() => {
      expect(mockApiGet).toHaveBeenCalledWith(
        '/lol/dashboard/players',
        expect.objectContaining({
          params: expect.objectContaining({
            roles: 'MID,SUP',
          }),
        })
      )
    })
  })

  it('should abort on unmount', async () => {
    let abortSignal: AbortSignal | undefined

    mockApiGet.mockImplementation((_endpoint: string, options?: { signal?: AbortSignal }) => {
      abortSignal = options?.signal
      return new Promise(() => {})
    })

    const { unmount } = renderHook(() => usePlayersData(defaultParams))

    // Wait for debounce (300ms) + margin for the API call to start
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350))
    })

    expect(abortSignal?.aborted).toBe(false)

    unmount()

    expect(abortSignal?.aborted).toBe(true)
  })

  describe('error handling', () => {
    it('should set error state on API failure', async () => {
      mockApiGet.mockRejectedValue(new Error('Player fetch error'))

      const { result } = renderHook(() => usePlayersData(defaultParams))

      // Wait for debounce + error to be set
      await waitFor(() => {
        expect(result.current.error).not.toBeNull()
        expect(result.current.error?.message).toBe('Player fetch error')
      }, { timeout: 600 })
    })

    it('should not set error for AbortError', async () => {
      const abortError = new Error('AbortError')
      abortError.name = 'AbortError'
      mockApiGet.mockRejectedValue(abortError)

      const { result } = renderHook(() => usePlayersData(defaultParams))

      // Wait for debounce + error handling
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500))
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('retry functionality', () => {
    it('should provide a retry function', async () => {
      const { result } = renderHook(() => usePlayersData(defaultParams))

      expect(typeof result.current.retry).toBe('function')
    })

    it('should clear error and refetch when retry is called', async () => {
      mockApiGet.mockRejectedValueOnce(new Error('First error'))

      const { result } = renderHook(() => usePlayersData(defaultParams))

      // Wait for first error to be set
      await waitFor(() => {
        expect(result.current.error).not.toBeNull()
      }, { timeout: 600 })

      // Setup success for retry - must come BEFORE retry() is called
      mockApiGet.mockResolvedValue({
        data: [mockPlayer],
        meta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
      })

      act(() => {
        result.current.retry()
      })

      // Wait for retry to complete (debounce + API call)
      await waitFor(() => {
        expect(result.current.error).toBeNull()
        expect(result.current.players).toHaveLength(1)
      }, { timeout: 600 })
    })
  })

  describe('pagination', () => {
    it('should include pagination params', async () => {
      const params = {
        ...defaultParams,
        currentPage: 3,
        itemsPerPage: 10,
      }

      renderHook(() => usePlayersData(params))

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledWith(
          '/lol/dashboard/players',
          expect.objectContaining({
            params: expect.objectContaining({
              page: 3,
              perPage: 10,
            }),
          })
        )
      })
    })

    it('should set correct playersMeta from response', async () => {
      const meta = { total: 100, perPage: 10, currentPage: 2, lastPage: 10 }
      mockApiGet.mockResolvedValue({
        data: [mockPlayer],
        meta,
      })

      const { result } = renderHook(() => usePlayersData(defaultParams))

      // Wait for debounce + API call to complete and meta to be set
      await waitFor(() => {
        expect(result.current.playersMeta).toEqual(meta)
      }, { timeout: 500 })
    })
  })
})
