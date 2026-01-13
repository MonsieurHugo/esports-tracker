'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { DashboardPeriod } from '@/lib/types'

/**
 * Hook to synchronize dashboard state with URL parameters.
 * Enables shareable URLs and browser history navigation.
 */
export function useUrlSync() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const isInitialMount = useRef(true)
  const isUpdatingFromUrl = useRef(false)

  const {
    period,
    selectedLeagues,
    selectedRoles,
    minGames,
    leaderboardView,
    sortBy,
    setPeriod,
    selectAllLeagues,
    toggleLeague,
    selectAllRoles,
    toggleRole,
    setMinGames,
    setLeaderboardView,
    setSortBy,
  } = useDashboardStore()

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

    // Déterminer d'abord la vue pour savoir quels filtres appliquer
    const isPlayersView = urlView === 'players'

    if (urlPeriod && ['day', 'month', 'year', 'custom'].includes(urlPeriod)) {
      setPeriod(urlPeriod as DashboardPeriod)
    }
    if (urlLeagues) {
      const leagues = urlLeagues.split(',').filter(Boolean)
      selectAllLeagues()
      leagues.forEach(toggleLeague)
    }
    // Ne lire les rôles que si on est en vue joueurs (inutile en vue équipes)
    if (isPlayersView && urlRoles) {
      const roles = urlRoles.split(',').filter(Boolean)
      selectAllRoles()
      roles.forEach(toggleRole)
    }
    if (urlMinGames) {
      const minGamesVal = parseInt(urlMinGames, 10)
      if (!isNaN(minGamesVal) && minGamesVal >= 0) {
        setMinGames(minGamesVal)
      }
    }
    if (urlView && ['teams', 'players'].includes(urlView)) {
      setLeaderboardView(urlView as 'teams' | 'players')
    }
    if (urlSort && ['lp', 'games', 'winrate'].includes(urlSort)) {
      setSortBy(urlSort as 'lp' | 'games' | 'winrate')
    }

    // Si l'URL contenait des rôles en vue équipes, nettoyer l'URL immédiatement
    if (!isPlayersView && urlRoles) {
      const params = new URLSearchParams()
      if (urlPeriod && urlPeriod !== 'day') params.set('period', urlPeriod)
      if (urlLeagues) params.set('leagues', urlLeagues)
      // Ne pas ajouter roles
      if (urlMinGames) params.set('minGames', urlMinGames)
      if (urlSort && urlSort !== 'lp') params.set('sort', urlSort)
      const queryString = params.toString()
      const newUrl = queryString ? `${pathname}?${queryString}` : pathname
      window.history.replaceState(null, '', newUrl)
    }

    // Reset flag after a tick
    setTimeout(() => {
      isUpdatingFromUrl.current = false
    }, 100)
  }, [
    searchParams,
    router,
    pathname,
    setPeriod,
    selectAllLeagues,
    toggleLeague,
    selectAllRoles,
    toggleRole,
    setMinGames,
    setLeaderboardView,
    setSortBy,
  ])

  // Update URL when filters change
  const updateUrl = useCallback(() => {
    if (isUpdatingFromUrl.current) return

    const params = new URLSearchParams()

    if (period !== 'day') params.set('period', period)
    if (selectedLeagues.length > 0) params.set('leagues', selectedLeagues.join(','))
    // Ne synchroniser les rôles que si on est en vue joueurs (inutile en vue équipes)
    if (leaderboardView === 'players' && selectedRoles.length > 0) {
      params.set('roles', selectedRoles.join(','))
    }
    if (minGames > 0) params.set('minGames', minGames.toString())
    if (leaderboardView !== 'teams') params.set('view', leaderboardView)
    if (sortBy !== 'lp') params.set('sort', sortBy)

    const queryString = params.toString()
    const newUrl = queryString ? `${pathname}?${queryString}` : pathname

    router.replace(newUrl, { scroll: false })
  }, [period, selectedLeagues, selectedRoles, minGames, leaderboardView, sortBy, pathname, router])

  useEffect(() => {
    updateUrl()
  }, [updateUrl])
}
