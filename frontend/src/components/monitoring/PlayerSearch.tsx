'use client'

import { memo, useState, useCallback } from 'react'
import api from '@/lib/api'
import type { PlayerSearchResult } from '@/lib/types'

const REGION_NAMES: Record<string, string> = {
  euw1: 'EUW',
  eun1: 'EUNE',
  na1: 'NA',
  kr: 'KR',
  br1: 'BR',
  jp1: 'JP',
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Jamais'

  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffMin < 1) return 'A l\'instant'
  if (diffMin < 60) return `${diffMin}m`
  if (diffHour < 24) return `${diffHour}h`
  return `${diffDay}j`
}

function getStatusColor(lastFetched: string | null): string {
  if (!lastFetched) return 'bg-gray-500'

  const diffMs = Date.now() - new Date(lastFetched).getTime()
  const diffMin = diffMs / 60000

  if (diffMin < 10) return 'bg-green-500' // Fresh
  if (diffMin < 60) return 'bg-yellow-500' // Recent
  return 'bg-orange-500' // Stale
}

function PlayerSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSearchResult | null>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const data = await api.get<{ players: PlayerSearchResult[] }>('/worker/players/search', {
        params: { q },
      })
      setResults(data.players)
    } catch (error) {
      console.error('Search failed:', error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    setSelectedPlayer(null)

    // Debounce search
    const timeoutId = setTimeout(() => search(value), 300)
    return () => clearTimeout(timeoutId)
  }

  const selectPlayer = (player: PlayerSearchResult) => {
    setSelectedPlayer(player)
    setResults([])
    setQuery(player.pseudo)
  }

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Rechercher un joueur</h3>

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Nom du joueur..."
          className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded text-sm focus:outline-none focus:border-[var(--lol)]"
        />

        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-[var(--lol)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Dropdown results */}
        {results.length > 0 && !selectedPlayer && (
          <div className="absolute z-10 w-full mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded shadow-lg max-h-60 overflow-auto">
            {results.map((player) => (
              <button
                key={player.player_id}
                onClick={() => selectPlayer(player)}
                className="w-full px-3 py-2 text-left hover:bg-[var(--bg)] flex items-center justify-between"
              >
                <div>
                  <span className="font-medium">{player.pseudo}</span>
                  {player.team_name && (
                    <span className="text-xs text-[var(--text-muted)] ml-2">
                      {player.team_name}
                    </span>
                  )}
                </div>
                <span className="text-xs text-[var(--text-muted)]">
                  {player.accounts.length} compte{player.accounts.length !== 1 ? 's' : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected player details */}
      {selectedPlayer && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span className="font-bold text-lg">{selectedPlayer.pseudo}</span>
              {selectedPlayer.team_name && (
                <span className="text-sm text-[var(--text-muted)] ml-2">
                  {selectedPlayer.team_name}
                  {selectedPlayer.team_region && (
                    <span className="text-[var(--lol)]"> ({selectedPlayer.team_region})</span>
                  )}
                </span>
              )}
            </div>
            <button
              onClick={() => {
                setSelectedPlayer(null)
                setQuery('')
              }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Fermer
            </button>
          </div>

          {/* Accounts list */}
          <div className="space-y-2">
            {selectedPlayer.accounts.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Aucun compte LoL</p>
            ) : (
              selectedPlayer.accounts.map((account) => (
                <div
                  key={account.puuid}
                  className="flex items-center justify-between p-2 bg-[var(--bg)] rounded border border-[var(--border)]"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(account.last_fetched)}`} />
                    <div>
                      <span className="font-medium">{account.game_name}</span>
                      <span className="text-[var(--text-muted)]">#{account.tag_line}</span>
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">
                      {REGION_NAMES[account.region] || account.region?.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-[var(--text-muted)]">
                      Fetch: <span className="font-mono">{formatTimeAgo(account.last_fetched)}</span>
                    </div>
                    {account.last_match_at && (
                      <div className="text-[var(--text-muted)]">
                        Match: <span className="font-mono">{formatTimeAgo(account.last_match_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Legend */}
          <div className="mt-3 pt-3 border-t border-[var(--border)] flex gap-4 text-xs text-[var(--text-muted)]">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>&lt; 10min</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span>&lt; 1h</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <span>&gt; 1h</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(PlayerSearch)
