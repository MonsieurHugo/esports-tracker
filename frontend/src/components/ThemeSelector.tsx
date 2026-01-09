'use client'

import { useState, useRef, useEffect } from 'react'
import { useThemeStore, themes, type ThemeKey } from '@/stores/themeStore'

export default function ThemeSelector() {
  const { currentTheme, setTheme } = useThemeStore()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentThemeData = themes[currentTheme]

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
        className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg hover:border-[var(--text-muted)] transition-colors"
      >
        {/* Color dot */}
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: currentThemeData.vars['--accent'] }}
        />
        <span className="text-xs text-[var(--text-secondary)]">{currentThemeData.name}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          className={`text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--border)]">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
              Theme
            </span>
          </div>
          <div className="py-1">
            {(Object.keys(themes) as ThemeKey[]).map((key) => {
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
                      ? 'bg-[var(--bg-hover)]'
                      : 'hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: theme.vars['--accent'] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                      {theme.name}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] truncate">
                      {theme.description}
                    </div>
                  </div>
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[var(--accent)] flex-shrink-0">
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
