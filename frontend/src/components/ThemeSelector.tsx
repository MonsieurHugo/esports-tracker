'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
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

export default function ThemeSelector() {
  const { currentTheme, setTheme } = useThemeStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentThemeData = themes[currentTheme]

  // Load saved theme on mount and apply CSS variables
  useLayoutEffect(() => {
    // Load saved theme on mount
    const savedTheme = getStoredTheme()
    if (savedTheme && savedTheme !== currentTheme) {
      setTheme(savedTheme)
      return // Will re-run with new theme
    }

    // Apply CSS variables
    const themeVars = themes[currentTheme].vars
    Object.entries(themeVars).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value)
    })
    setStoredTheme(currentTheme)
  }, [currentTheme, setTheme])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-(--bg-card) border border-(--border) rounded-lg hover:border-(--text-muted) transition-colors"
      >
        {/* Palette icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          className="text-(--text-muted)"
        >
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"
            fill="currentColor"
          />
        </svg>
        {/* Color dot */}
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: currentThemeData.vars['--accent'] }}
        />
        <span className="text-xs text-(--text-secondary)">{currentThemeData.name}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          className={`text-(--text-muted) transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-(--bg-card) border border-(--border) rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-(--border)">
            <span className="text-[10px] font-semibold text-(--text-muted) uppercase tracking-wide">
              Thème
            </span>
          </div>
          <div className="py-1">
            {(['terminal', 'emerald', 'mint'] as ThemeKey[]).map((key) => {
              const theme = themes[key]
              const isSelected = key === currentTheme
              return (
                <button
                  key={key}
                  onClick={() => {
                    setTheme(key)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? 'bg-(--bg-hover)'
                      : 'hover:bg-(--bg-hover)'
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: theme.vars['--accent'] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium ${isSelected ? 'text-(--accent)' : 'text-(--text-primary)'}`}>
                      {theme.name}
                    </div>
                    <div className="text-[10px] text-(--text-muted) truncate">
                      {theme.description}
                    </div>
                  </div>
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-(--accent) shrink-0">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )
            })}

          </div>
        </div>
      )}
    </div>
  )
}
