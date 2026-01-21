'use client'

import { useLayoutEffect, type ReactNode } from 'react'
import { useThemeStore, themes, type ThemeKey } from '@/stores/themeStore'

// Safe localStorage helpers
const getStoredTheme = (): ThemeKey | null => {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem('theme')
    return stored && themes[stored as ThemeKey] ? (stored as ThemeKey) : null
  } catch {
    return null
  }
}

const setStoredTheme = (theme: ThemeKey): void => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('theme', theme)
  } catch {
    // Ignore storage errors (private mode, quota exceeded, etc.)
  }
}

interface ThemeProviderProps {
  children: ReactNode
}

/**
 * ThemeProvider - Global component that applies theme CSS variables
 *
 * This component must be mounted in the root layout to ensure themes work
 * across all pages. It:
 * - Loads saved theme from localStorage on mount
 * - Applies CSS variables to document.documentElement
 * - Persists theme changes to localStorage
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  // Subscribe to theme changes
  const currentTheme = useThemeStore((state) => state.currentTheme)

  // Load saved theme on mount only
  useLayoutEffect(() => {
    const savedTheme = getStoredTheme()
    if (savedTheme && savedTheme !== useThemeStore.getState().currentTheme) {
      useThemeStore.getState().setTheme(savedTheme)
    }
  }, [])

  // Apply CSS variables when theme changes
  useLayoutEffect(() => {
    const themeVars = themes[currentTheme].vars
    Object.entries(themeVars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value)
    })
    setStoredTheme(currentTheme)
  }, [currentTheme])

  return <>{children}</>
}
