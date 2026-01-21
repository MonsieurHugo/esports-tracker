import { create } from 'zustand'

export type ThemeKey = 'terminal' | 'emerald' | 'mint'

export interface ThemeVars {
  '--bg-primary': string
  '--bg-secondary': string
  '--bg-card': string
  '--bg-hover': string
  '--border': string
  '--text-primary': string
  '--text-secondary': string
  '--text-muted': string
  '--accent': string
  '--accent-hover': string
  '--positive': string
  '--negative': string
  '--warning': string
  '--text-on-accent': string
  // Couleur secondaire pour les graphiques (accessible daltoniens)
  '--chart-compare': string
}

export interface Theme {
  name: string
  description: string
  vars: ThemeVars
}

export const themes: Record<ThemeKey, Theme> = {
  terminal: {
    name: 'Terminal',
    description: 'Vert terminal vif',
    vars: {
      '--bg-primary': '#07070a',
      '--bg-secondary': '#0c0c0f',
      '--bg-card': '#101014',
      '--bg-hover': '#16161c',
      '--border': '#1e1e24',
      '--text-primary': '#f0f0f0',
      '--text-secondary': '#b0b0b8',
      '--text-muted': '#8a8a94',
      '--accent': '#00dc82',
      '--accent-hover': '#00c974',
      '--positive': '#00dc82',
      '--negative': '#ff4757',
      '--warning': '#f59e0b',
      '--text-on-accent': '#0f172a',
      '--chart-compare': '#3B82F6', // Bleu - contraste avec vert
    },
  },
  emerald: {
    name: 'Emerald',
    description: 'Vert émeraude élégant',
    vars: {
      '--bg-primary': '#0a0a0b',
      '--bg-secondary': '#0f0f10',
      '--bg-card': '#141415',
      '--bg-hover': '#1a1a1c',
      '--border': '#252528',
      '--text-primary': '#fafafa',
      '--text-secondary': '#c0c0c5',
      '--text-muted': '#9a9aa2',
      '--accent': '#10b981',
      '--accent-hover': '#059669',
      '--positive': '#10b981',
      '--negative': '#f43f5e',
      '--warning': '#f59e0b',
      '--text-on-accent': '#0f172a',
      '--chart-compare': '#3B82F6', // Bleu - contraste avec vert
    },
  },
  mint: {
    name: 'Mint',
    description: 'Cyan-vert frais',
    vars: {
      '--bg-primary': '#08090a',
      '--bg-secondary': '#0d0e10',
      '--bg-card': '#121316',
      '--bg-hover': '#181a1e',
      '--border': '#23262b',
      '--text-primary': '#f4f4f5',
      '--text-secondary': '#b8b8c0',
      '--text-muted': '#909098',
      '--accent': '#2dd4bf',
      '--accent-hover': '#14b8a6',
      '--positive': '#2dd4bf',
      '--negative': '#fb7185',
      '--warning': '#f59e0b',
      '--text-on-accent': '#0f172a',
      '--chart-compare': '#F59E0B', // Orange - contraste avec cyan
    },
  },
}

interface ThemeState {
  currentTheme: ThemeKey
  setTheme: (theme: ThemeKey) => void
}

export const useThemeStore = create<ThemeState>()((set) => ({
  currentTheme: 'terminal',
  setTheme: (theme) => set({ currentTheme: theme }),
}))

/**
 * Hook pour récupérer les couleurs de graphiques du thème actif
 * Team 1 = accent du thème, Team 2 = couleur de comparaison accessible daltoniens
 */
export function useChartColors() {
  const currentTheme = useThemeStore((state) => state.currentTheme)
  const themeVars = themes[currentTheme].vars

  return {
    team1: themeVars['--accent'],
    team2: themeVars['--chart-compare'],
    colors: [themeVars['--accent'], themeVars['--chart-compare']] as const,
  }
}
