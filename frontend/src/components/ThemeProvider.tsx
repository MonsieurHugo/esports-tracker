'use client'

import { useEffect } from 'react'
import { useThemeStore, themes } from '@/stores/themeStore'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { currentTheme } = useThemeStore()

  useEffect(() => {
    const theme = themes[currentTheme]
    if (!theme) return

    const root = document.documentElement
    Object.entries(theme.vars).forEach(([key, value]) => {
      root.style.setProperty(key, value)
    })
  }, [currentTheme])

  return <>{children}</>
}
