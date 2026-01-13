import { create } from 'zustand'

export type ThemeKey = 'terminal' | 'emerald' | 'mint' | 'snow' | 'daylight'

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
    },
  },
  snow: {
    name: 'Snow',
    description: 'Thème clair, accent vert',
    vars: {
      '--bg-primary': '#ffffff',
      '--bg-secondary': '#f8fafc',
      '--bg-card': '#f1f5f9',
      '--bg-hover': '#e2e8f0',
      '--border': '#cbd5e1',
      '--text-primary': '#0f172a',
      '--text-secondary': '#475569',
      '--text-muted': '#94a3b8',
      '--accent': '#10b981',
      '--accent-hover': '#059669',
      '--positive': '#10b981',
      '--negative': '#ef4444',
      '--warning': '#d97706',
      '--text-on-accent': '#ffffff',
    },
  },
  daylight: {
    name: 'Daylight',
    description: 'Thème clair, tons chauds',
    vars: {
      '--bg-primary': '#fffbf5',
      '--bg-secondary': '#fef7ed',
      '--bg-card': '#fef3e2',
      '--bg-hover': '#fde9d0',
      '--border': '#f5d0a9',
      '--text-primary': '#1c1917',
      '--text-secondary': '#57534e',
      '--text-muted': '#a8a29e',
      '--accent': '#f59e0b',
      '--accent-hover': '#d97706',
      '--positive': '#22c55e',
      '--negative': '#ef4444',
      '--warning': '#b45309',
      '--text-on-accent': '#ffffff',
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
