'use client'

import { useState, useRef, useEffect, useMemo, useCallback, ReactNode } from 'react'

export interface SearchDropdownItem {
  id: number | string
  name: string
  secondaryText?: string
  imageUrl?: string | null
  imageFallback?: string
  badge?: ReactNode
}

interface SearchDropdownProps<T extends SearchDropdownItem> {
  // Selected items
  selectedItems: T[]
  maxItems?: number

  // Callbacks
  onSelect: (item: T) => void
  onClear: () => void
  onToggleLock?: (itemId: number | string) => void
  onFetch: () => Promise<T[]>

  // Locked items
  lockedItemIds?: (number | string)[]

  // UI customization
  placeholder?: string
  addPlaceholder?: string
  emptyMessage?: string
  noResultsMessage?: string
  loadingMessage?: string

  // Item rendering
  renderItem?: (item: T, isSelected: boolean, selectionIndex: number) => ReactNode
  filterItems?: (items: T[], search: string) => T[]

  // Refresh trigger (change to refetch data)
  refreshKey?: string

  // History and favorites
  storageKey?: string // localStorage key for history/favorites (e.g., "teams" or "players")
}

// Helper functions for localStorage
const getStoredFavorites = (key: string): (number | string)[] => {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(`favorites_${key}`)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

const setStoredFavorites = (key: string, favorites: (number | string)[]) => {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`favorites_${key}`, JSON.stringify(favorites))
  } catch {
    // Ignore storage errors
  }
}

const getStoredHistory = (key: string): (number | string)[] => {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(`history_${key}`)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

const addToHistory = (key: string, itemId: number | string) => {
  if (typeof window === 'undefined') return
  try {
    const history = getStoredHistory(key)
    // Remove if already exists, add to front, keep max 5
    const newHistory = [itemId, ...history.filter((id) => id !== itemId)].slice(0, 5)
    localStorage.setItem(`history_${key}`, JSON.stringify(newHistory))
  } catch {
    // Ignore storage errors
  }
}

export default function SearchDropdown<T extends SearchDropdownItem>({
  selectedItems,
  maxItems = 2,
  onSelect,
  onClear,
  onToggleLock,
  onFetch,
  lockedItemIds = [],
  placeholder = 'Rechercher...',
  addPlaceholder = '+ item',
  emptyMessage = 'Aucun item disponible',
  noResultsMessage = 'Aucun resultat',
  loadingMessage = 'Chargement...',
  renderItem,
  filterItems,
  refreshKey,
  storageKey,
}: SearchDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [favorites, setFavorites] = useState<(number | string)[]>([])
  const [history, setHistory] = useState<(number | string)[]>([])
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load favorites and history from localStorage
  useEffect(() => {
    if (storageKey) {
      setFavorites(getStoredFavorites(storageKey))
      setHistory(getStoredHistory(storageKey))
    }
  }, [storageKey])

  const toggleFavorite = useCallback((itemId: number | string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!storageKey) return

    setFavorites((prev) => {
      const newFavorites = prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
      setStoredFavorites(storageKey, newFavorites)
      return newFavorites
    })
  }, [storageKey])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus input when opening dropdown
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Fetch items when opening dropdown
  const fetchItems = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await onFetch()
      setItems(result)
    } catch {
      // Silent fail - dropdown will show empty state
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [onFetch])

  useEffect(() => {
    if (isOpen && items.length === 0) {
      fetchItems()
    }
  }, [isOpen, items.length, fetchItems])

  // Reset items when refresh key changes
  useEffect(() => {
    setItems([])
  }, [refreshKey])

  // Filter and sort items based on search, favorites, and history
  const filteredItems = useMemo(() => {
    let result = items

    // Apply search filter
    if (search.trim()) {
      if (filterItems) {
        result = filterItems(items, search)
      } else {
        const searchLower = search.toLowerCase()
        result = items.filter((item) =>
          item.name.toLowerCase().includes(searchLower) ||
          item.secondaryText?.toLowerCase().includes(searchLower)
        )
      }
    }

    // Sort: favorites first, then recent history, then alphabetically
    if (storageKey && !search.trim()) {
      result = [...result].sort((a, b) => {
        const aId = getItemId(a)
        const bId = getItemId(b)
        const aFav = favorites.includes(aId)
        const bFav = favorites.includes(bId)
        const aHistIdx = history.indexOf(aId)
        const bHistIdx = history.indexOf(bId)

        // Favorites first
        if (aFav && !bFav) return -1
        if (!aFav && bFav) return 1

        // Then recent history
        if (aHistIdx !== -1 && bHistIdx === -1) return -1
        if (aHistIdx === -1 && bHistIdx !== -1) return 1
        if (aHistIdx !== -1 && bHistIdx !== -1) return aHistIdx - bHistIdx

        return 0
      })
    }

    return result
  }, [items, search, filterItems, storageKey, favorites, history])

  const handleSelect = (item: T) => {
    // Add to history
    if (storageKey) {
      addToHistory(storageKey, getItemId(item))
      setHistory(getStoredHistory(storageKey))
    }
    onSelect(item)
    setIsOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClear()
    setSearch('')
  }

  const getItemId = (item: T): number | string => item.id

  return (
    <div ref={dropdownRef} className="relative flex-1 min-w-[200px]">
      {/* Trigger */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 bg-(--bg-card) border rounded-md px-3 h-[34px] cursor-pointer transition-colors duration-200
          ${isOpen ? 'border-(--accent) ring-1 ring-(--accent)/20' : 'border-(--border) hover:border-(--text-muted)'}
        `}
      >
        {selectedItems.length > 0 ? (
          <>
            <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
              {selectedItems.map((item, index) => {
                const isLocked = lockedItemIds.includes(getItemId(item))
                return (
                  <div key={getItemId(item)} className="flex items-center gap-1 min-w-0">
                    {index > 0 && <span className="text-(--text-muted) text-[10px] font-medium">vs</span>}
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: index === 0 ? 'var(--accent)' : 'var(--lol)' }}
                    />
                    <span className="text-[11px] font-medium truncate">
                      {item.name}
                    </span>
                    {onToggleLock && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleLock(getItemId(item))
                        }}
                        className={`p-0.5 rounded transition-colors shrink-0 ${
                          isLocked
                            ? 'text-(--accent)'
                            : 'text-(--text-muted) hover:text-(--text-secondary)'
                        }`}
                        title={isLocked ? 'Desepingler' : 'Epingler en haut'}
                      >
                        {isLocked ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {selectedItems.length < maxItems && (
              <span className="text-[10px] text-(--text-muted) shrink-0 border border-dashed border-(--border) rounded-sm px-1.5 py-0.5">
                {addPlaceholder}
              </span>
            )}
            <button
              onClick={handleClear}
              className="text-(--text-muted) hover:text-(--text-primary) transition-colors shrink-0"
              title="Tout deselectionner"
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-(--text-muted)">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
              <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span className="text-[11px] text-(--text-muted) flex-1">{placeholder}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`text-(--text-muted) transition-transform ${isOpen ? 'rotate-180' : ''}`}>
              <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-(--bg-card) border border-(--border) rounded-md shadow-lg z-50 overflow-hidden">
          {/* Search Input */}
          <div className="p-2 border-b border-(--border)">
            <div className="flex items-center gap-2 bg-(--bg-secondary) rounded-sm px-2 py-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-(--text-muted)">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
                <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="flex-1 bg-transparent text-[11px] outline-hidden placeholder:text-(--text-muted)"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="text-(--text-muted) hover:text-(--text-primary)"
                >
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="max-h-[240px] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-(--text-muted) text-[11px]">
                {loadingMessage}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-4 text-center text-(--text-muted) text-[11px]">
                {search ? noResultsMessage : emptyMessage}
              </div>
            ) : (
              filteredItems.map((item) => {
                const itemId = getItemId(item)
                const selectionIndex = selectedItems.findIndex((s) => getItemId(s) === itemId)
                const isSelected = selectionIndex !== -1
                const isBlocked = selectedItems.length >= maxItems && !isSelected
                const isFavorite = storageKey && favorites.includes(itemId)
                const isRecent = storageKey && history.includes(itemId) && !isFavorite

                if (renderItem) {
                  return (
                    <div
                      key={itemId}
                      onClick={() => !isBlocked && handleSelect(item)}
                      className={`cursor-pointer ${isBlocked ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      {renderItem(item, isSelected, selectionIndex)}
                    </div>
                  )
                }

                return (
                  <div
                    key={itemId}
                    onClick={() => !isBlocked && handleSelect(item)}
                    className={`
                      flex items-center gap-2 px-3 py-2 transition-colors
                      ${isBlocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                      ${selectionIndex === 0 ? 'bg-(--accent)/10 border-l-2 border-l-(--accent)' : ''}
                      ${selectionIndex === 1 ? 'bg-(--lol)/10 border-l-2 border-l-(--lol)' : ''}
                      ${!isSelected && !isBlocked ? 'hover:bg-(--bg-hover)' : ''}
                    `}
                  >
                    {/* Favorite star */}
                    {storageKey && (
                      <button
                        onClick={(e) => toggleFavorite(itemId, e)}
                        className={`shrink-0 transition-colors ${
                          isFavorite ? 'text-(--favorite)' : 'text-(--text-muted) hover:text-(--favorite)'
                        }`}
                        title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    )}
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-5 h-5 object-contain"
                      />
                    ) : item.imageFallback ? (
                      <div className="w-5 h-5 bg-(--bg-secondary) rounded-sm flex items-center justify-center text-[8px] font-bold text-(--text-muted)">
                        {item.imageFallback}
                      </div>
                    ) : (
                      <div className="w-5 h-5" />
                    )}
                    <span className="text-[11px] font-medium truncate flex-1">{item.name}</span>
                    {item.badge}
                    {isRecent && !isSelected && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-(--bg-secondary) text-(--text-muted)">
                        Récent
                      </span>
                    )}
                    {isSelected && (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: selectionIndex === 0 ? 'var(--accent)' : 'var(--lol)' }}
                      />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
