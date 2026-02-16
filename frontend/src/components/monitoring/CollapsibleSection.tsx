'use client'

import { useState, useEffect, type ReactNode } from 'react'

interface CollapsibleSectionProps {
  id: string
  title: string
  subtitle?: string
  statusIndicator?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

export default function CollapsibleSection({
  id,
  title,
  subtitle,
  statusIndicator,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const storageKey = `monitoring-section-${id}`
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [hasMounted, setHasMounted] = useState(false)

  // Restore state from localStorage after mount
  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored !== null) {
      setIsOpen(stored === 'true')
    }
    setHasMounted(true)
  }, [storageKey])

  // Persist state to localStorage
  const toggle = () => {
    const next = !isOpen
    setIsOpen(next)
    localStorage.setItem(storageKey, String(next))
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--bg-hover)] transition-colors"
      >
        <div className="flex items-center gap-3">
          {statusIndicator}
          <div className="text-left">
            <h2 className="text-base font-semibold text-(--text-primary)">{title}</h2>
            {subtitle && (
              <p className="text-xs text-(--text-muted) mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-(--text-muted) transition-transform duration-200 ${
            hasMounted && isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Content */}
      {hasMounted && isOpen && (
        <div className="px-5 pb-5 pt-1 border-t border-[var(--border)]">
          {children}
        </div>
      )}
    </div>
  )
}
