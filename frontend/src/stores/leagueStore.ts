'use client'

import { create } from 'zustand'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import type { LeagueInfo } from '@/lib/types'

interface LeagueState {
  leagues: LeagueInfo[]
  isLoading: boolean
  isLoaded: boolean
  fetchLeagues: () => Promise<void>
  getLeagueColor: (shortName: string) => string | null
}

// Couleurs par défaut si la ligue n'a pas de couleur en BDD
const DEFAULT_COLORS: Record<string, string> = {
  'LEC': '#00e5bf',
  'LFL': '#ff7b57',
  'LCK': '#f5e6d3',
  'LCS': '#0a7cff',
  'LPL': '#de2910',
  'LCKCL': '#a855f7',
  'LCP': '#22c55e',
  'CBLOL': '#10b981',
  'LTAS': '#14b8a6',
  'LTAN': '#06b6d4',
}

export const useLeagueStore = create<LeagueState>((set, get) => ({
  leagues: [],
  isLoading: false,
  isLoaded: false,

  fetchLeagues: async () => {
    // Ne pas recharger si déjà chargé
    if (get().isLoaded || get().isLoading) return

    set({ isLoading: true })
    try {
      const res = await api.get<{ data: LeagueInfo[] }>('/lol/dashboard/leagues')
      set({ leagues: res.data || [], isLoaded: true })
    } catch (error) {
      logError('Failed to fetch leagues', error)
    } finally {
      set({ isLoading: false })
    }
  },

  getLeagueColor: (shortName: string) => {
    const normalizedName = shortName.toUpperCase()
    const league = get().leagues.find(l => l.shortName.toUpperCase() === normalizedName)

    // Priorité : couleur de la BDD > couleur par défaut > null
    if (league?.color) return league.color
    if (DEFAULT_COLORS[normalizedName]) return DEFAULT_COLORS[normalizedName]
    return null
  },
}))
