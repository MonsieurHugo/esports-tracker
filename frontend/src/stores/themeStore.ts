import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeKey = 'terminal' | 'emerald' | 'mint' | 'obsidian' | 'arctic' | 'amber'

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
    },
  },
  obsidian: {
    name: 'Obsidian',
    description: 'Jade discret, luxe',
    vars: {
      '--bg-primary': '#09090b',
      '--bg-secondary': '#0e0e11',
      '--bg-card': '#131316',
      '--bg-hover': '#19191d',
      '--border': '#222226',
      '--text-primary': '#ededef',
      '--text-secondary': '#b0b0b8',
      '--text-muted': '#909098',
      '--accent': '#3ecf8e',
      '--accent-hover': '#2eb67d',
      '--positive': '#3ecf8e',
      '--negative': '#e5484d',
    },
  },
  arctic: {
    name: 'Arctic',
    description: 'Tons froids glacials',
    vars: {
      '--bg-primary': '#06080a',
      '--bg-secondary': '#0a0d10',
      '--bg-card': '#0f1318',
      '--bg-hover': '#151a20',
      '--border': '#1e252d',
      '--text-primary': '#f1f5f9',
      '--text-secondary': '#abbcc8',
      '--text-muted': '#8b9aaa',
      '--accent': '#06d6a0',
      '--accent-hover': '#05b88a',
      '--positive': '#06d6a0',
      '--negative': '#ff6b6b',
    },
  },
  amber: {
    name: 'Amber',
    description: 'Jaune ambre chaleureux',
    vars: {
      '--bg-primary': '#0a0908',
      '--bg-secondary': '#100f0c',
      '--bg-card': '#161412',
      '--bg-hover': '#1c1a16',
      '--border': '#2a2620',
      '--text-primary': '#faf8f5',
      '--text-secondary': '#c5c0b0',
      '--text-muted': '#a09c90',
      '--accent': '#f59e0b',
      '--accent-hover': '#d97706',
      '--positive': '#84cc16',
      '--negative': '#ef4444',
    },
  },
}

interface ThemeState {
  currentTheme: ThemeKey
  setTheme: (theme: ThemeKey) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      currentTheme: 'terminal',
      setTheme: (theme) => set({ currentTheme: theme }),
    }),
    {
      name: 'theme-storage',
    }
  )
)
