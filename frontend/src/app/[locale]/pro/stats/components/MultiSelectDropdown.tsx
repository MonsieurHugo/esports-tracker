'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

interface MultiSelectDropdownProps<T, ID extends number | string = number> {
  label: string
  items: T[]
  selected: Set<ID>
  onChange: (selected: Set<ID>) => void
  getId: (item: T) => ID
  getLabel: (item: T) => string
  getSecondary?: (item: T) => string | null
  searchable?: boolean
  isLoading?: boolean
}

export default function MultiSelectDropdown<T, ID extends number | string = number>({
  label,
  items,
  selected,
  onChange,
  getId,
  getLabel,
  getSecondary,
  searchable = false,
  isLoading = false,
}: MultiSelectDropdownProps<T, ID>) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchable) {
      searchRef.current?.focus()
    }
  }, [isOpen, searchable])

  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter((item) => {
      const l = getLabel(item).toLowerCase()
      const s = getSecondary?.(item)?.toLowerCase() ?? ''
      return l.includes(q) || s.includes(q)
    })
  }, [items, search, getLabel, getSecondary])

  const toggleAll = useCallback(() => {
    if (selected.size === 0) {
      // Select all visible items
      onChange(new Set(filtered.map(getId)) as Set<ID>)
    } else {
      onChange(new Set() as Set<ID>)
    }
  }, [selected.size, filtered, getId, onChange])

  const toggleItem = useCallback((id: ID) => {
    const next = new Set(selected)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onChange(next)
  }, [selected, onChange])

  // Trigger label
  let triggerText: string
  if (selected.size === 0) {
    triggerText = `${label}: toutes`
  } else if (selected.size === 1) {
    const id = [...selected][0]
    const item = items.find((i) => getId(i) === id)
    triggerText = `${label}: ${item ? getLabel(item) : id}`
  } else {
    triggerText = `${label}: ${selected.size}`
  }

  const isActive = selected.size > 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen((p) => !p)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
          isLoading ? 'opacity-60' : ''
        } ${
          isActive
            ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/40'
            : 'bg-[var(--bg-card)] text-(--text-secondary) border border-[var(--border)] hover:bg-[var(--bg-hover)] hover:border-[var(--accent)]/30'
        }`}
      >
        {triggerText}
        {isLoading ? (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="animate-spin">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
          </svg>
        ) : (
        <svg
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] max-h-[300px] overflow-y-auto bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-xl scrollbar-thin">
          {searchable && (
            <div className="sticky top-0 z-10 p-2 bg-[var(--bg-card)] border-b border-[var(--border)]">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:border-[var(--accent)]/50"
              />
            </div>
          )}

          {/* Select all / clear */}
          <button
            onClick={toggleAll}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border)]/50"
          >
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
              selected.size === 0
                ? 'border-[var(--accent)] bg-[var(--accent)]/15'
                : 'border-[var(--border)]'
            }`}>
              {selected.size === 0 && (
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8L6.5 11.5L13 4.5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="font-medium text-(--text-secondary)">Tout</span>
          </button>

          {/* Items */}
          {filtered.map((item) => {
            const id = getId(item)
            const checked = selected.has(id)
            return (
              <button
                key={id}
                onClick={() => toggleItem(id)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-[var(--bg-hover)] transition-colors"
              >
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                  checked
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15'
                    : 'border-[var(--border)]'
                }`}>
                  {checked && (
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8L6.5 11.5L13 4.5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={`truncate ${checked ? 'text-(--text-primary)' : 'text-(--text-secondary)'}`}>
                  {getLabel(item)}
                </span>
                {getSecondary && (
                  <span className="text-(--text-muted) ml-auto flex-shrink-0">{getSecondary(item)}</span>
                )}
              </button>
            )
          })}

          {filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-(--text-muted) text-center">Aucun résultat</div>
          )}
        </div>
      )}
    </div>
  )
}
