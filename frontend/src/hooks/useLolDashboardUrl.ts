import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useFilterStore } from '@/stores/dashboardStore'
import type { DashboardPeriod, LeagueInfo, SortOption } from '@/lib/types'

interface UseLolDashboardUrlParams {
  period: DashboardPeriod
  selectedLeagues: string[]
  selectedRoles: string[]
  minGames: number
  leaderboardView: 'teams' | 'players'
  sortBy: SortOption
  availableLeagues: LeagueInfo[]
  setPeriod: (period: DashboardPeriod) => void
  selectAllRoles: () => void
  toggleRole: (role: string) => void
  setLeaderboardView: (view: 'teams' | 'players') => void
  setSortBy: (sort: SortOption) => void
}

interface UseLolDashboardUrlResult {
  isUrlInitialized: boolean
}

/**
 * Hook for managing URL synchronization with dashboard state.
 *
 * Handles:
 * - Reading initial state from URL on mount
 * - Writing state changes back to URL
 * - Period migration from old format
 * - View-specific filter handling (roles only apply in players view)
 */
export function useLolDashboardUrl({
  period,
  selectedLeagues,
  selectedRoles,
  minGames,
  leaderboardView,
  sortBy,
  availableLeagues,
  setPeriod,
  selectAllRoles,
  toggleRole,
  setLeaderboardView,
  setSortBy,
}: UseLolDashboardUrlParams): UseLolDashboardUrlResult {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isInitialMount = useRef(true)
  const isUpdatingFromUrl = useRef(false)
  const [isUrlInitialized, setIsUrlInitialized] = useState(false)

  // Get filter store actions directly for URL initialization (to pass view explicitly)
  const filterStore = useFilterStore()

  // Initialize state from URL on mount
  useEffect(() => {
    if (!isInitialMount.current) return
    isInitialMount.current = false
    isUpdatingFromUrl.current = true

    const urlPeriod = searchParams.get('period')
    const urlLeagues = searchParams.get('leagues')
    const urlRoles = searchParams.get('roles')
    const urlMinGames = searchParams.get('minGames')
    const urlView = searchParams.get('view')
    const urlSort = searchParams.get('sort')

    // Determine the target view (default to 'teams' if not specified)
    const targetView = (urlView && ['teams', 'players'].includes(urlView))
      ? urlView as 'teams' | 'players'
      : 'teams'

    // Set view first
    setLeaderboardView(targetView)

    // Period migration: map old periods to new ones
    const periodMapping: Record<string, DashboardPeriod> = {
      'day': '7d', 'month': '30d', 'year': '90d',
      '7d': '7d', '14d': '14d', '30d': '30d', '90d': '90d',
    }
    if (urlPeriod && urlPeriod in periodMapping) {
      setPeriod(periodMapping[urlPeriod])
    }

    // Apply leagues filter directly to the target view's state
    if (urlLeagues) {
      const leagues = urlLeagues.split(',').filter(Boolean)
      filterStore.selectAllLeagues(targetView)
      leagues.forEach(league => filterStore.toggleLeague(targetView, league))
    }

    // Only apply roles from URL if in players view (roles don't apply to teams)
    if (urlRoles && targetView === 'players') {
      const roles = urlRoles.split(',').filter(Boolean)
      selectAllRoles()
      roles.forEach(toggleRole)
    }

    // Apply minGames filter directly to the target view's state
    if (urlMinGames) {
      const minGamesVal = parseInt(urlMinGames, 10)
      if (!isNaN(minGamesVal) && minGamesVal >= 0) {
        filterStore.setMinGames(targetView, minGamesVal)
      }
    }

    if (urlSort && ['lp', 'games', 'winrate', 'lpChange'].includes(urlSort)) {
      setSortBy(urlSort as SortOption)
    }

    // Mark URL initialization as complete after state updates settle
    setTimeout(() => {
      isUpdatingFromUrl.current = false
      setIsUrlInitialized(true)
    }, 0)
  }, [searchParams, setPeriod, selectAllRoles, toggleRole, setLeaderboardView, setSortBy, filterStore])

  // Update URL when filters change
  const updateUrl = useCallback(() => {
    if (isUpdatingFromUrl.current) return

    const params = new URLSearchParams()

    if (period !== '7d') params.set('period', period)
    // Only add leagues to URL if some (but not all) leagues are selected
    const allLeaguesSelected = availableLeagues.length > 0 && selectedLeagues.length === availableLeagues.length
    if (selectedLeagues.length > 0 && !allLeaguesSelected) {
      params.set('leagues', selectedLeagues.join(','))
    }
    // Only include roles in URL when in players view (roles don't apply to teams)
    if (leaderboardView === 'players' && selectedRoles.length > 0) {
      params.set('roles', selectedRoles.join(','))
    }
    if (minGames > 0) params.set('minGames', minGames.toString())
    if (leaderboardView !== 'teams') params.set('view', leaderboardView)
    if (sortBy !== 'lp') params.set('sort', sortBy)

    const queryString = params.toString()
    const newUrl = queryString ? `${pathname}?${queryString}` : pathname

    router.replace(newUrl, { scroll: false })
  }, [period, selectedLeagues, availableLeagues, selectedRoles, minGames, leaderboardView, sortBy, pathname, router])

  useEffect(() => {
    updateUrl()
  }, [updateUrl])

  return { isUrlInitialized }
}
