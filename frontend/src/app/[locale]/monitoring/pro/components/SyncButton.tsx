'use client'

import { useState } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'

interface SyncButtonProps {
  onSyncComplete?: () => void
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

// Worker API URL (pro worker runs on port 8000)
const WORKER_API_URL = process.env.NEXT_PUBLIC_WORKER_API_URL || 'http://localhost:8000'

export default function SyncButton({ onSyncComplete }: SyncButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [tournamentId, setTournamentId] = useState('')
  const [matchId, setMatchId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncingMatch, setIsSyncingMatch] = useState(false)
  const [isSyncingTracked, setIsSyncingTracked] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Fetch tournaments state
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR)
  const [isFetchingTournaments, setIsFetchingTournaments] = useState(false)
  const [fetchResult, setFetchResult] = useState<{ count: number } | null>(null)

  const handleAddTournament = async () => {
    if (!tournamentId.trim()) return

    setIsLoading(true)
    setMessage(null)

    try {
      await api.post('/pro/monitoring/sync', {
        requestType: 'tournament_sync',
        targetId: tournamentId.trim(),
      })
      setMessage({ type: 'success', text: 'Tournament added to sync queue' })
      setTournamentId('')
      onSyncComplete?.()

      // Close after delay
      setTimeout(() => {
        setIsOpen(false)
        setMessage(null)
      }, 2000)
    } catch (error) {
      logError('Failed to add tournament', error)
      setMessage({ type: 'error', text: 'Failed to add tournament' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleFetchTournaments = async () => {
    setIsFetchingTournaments(true)
    setFetchResult(null)
    setMessage(null)

    try {
      const response = await fetch(
        `${WORKER_API_URL}/api/tournaments/fetch?year=${selectedYear}`
      )
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch tournaments')
      }

      setFetchResult({ count: data.count })
      setMessage({ type: 'success', text: `${data.count} tournaments fetched` })
      onSyncComplete?.()
    } catch (error) {
      logError('Failed to fetch tournaments from GRID', error)
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to fetch tournaments',
      })
    } finally {
      setIsFetchingTournaments(false)
    }
  }

  const handleSyncMatch = async () => {
    if (!matchId.trim()) return

    setIsSyncingMatch(true)
    setMessage(null)

    try {
      await api.post('/pro/monitoring/sync', {
        requestType: 'match_sync',
        targetId: matchId.trim(),
      })
      setMessage({ type: 'success', text: 'Match added to sync queue' })
      setMatchId('')
      onSyncComplete?.()
    } catch (error) {
      logError('Failed to sync match', error)
      setMessage({ type: 'error', text: 'Failed to sync match' })
    } finally {
      setIsSyncingMatch(false)
    }
  }

  const handleSyncTracked = async () => {
    setIsSyncingTracked(true)
    setMessage(null)

    try {
      const response = await fetch(`${WORKER_API_URL}/api/sync/tracked`, {
        method: 'POST',
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to trigger sync')
      }

      setMessage({ type: 'success', text: 'Sync triggered' })
      onSyncComplete?.()
    } catch (error) {
      logError('Failed to trigger tracked sync', error)
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to trigger sync',
      })
    } finally {
      setIsSyncingTracked(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)]"
      >
        + Add Tournament
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 p-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg z-10 min-w-[320px]">
          {/* Fetch Tournaments Section */}
          <div className="mb-4 pb-4 border-b border-[var(--border)]">
            <div className="text-sm text-(--text-primary) font-medium mb-3">
              Fetch Tournaments from GRID
            </div>

            <div className="flex items-center gap-2 mb-2">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="flex-1 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-(--text-primary)"
              >
                {YEARS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              <button
                onClick={handleFetchTournaments}
                disabled={isFetchingTournaments}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isFetchingTournaments ? 'Fetching...' : 'Fetch'}
              </button>
            </div>

            {fetchResult && (
              <div className="text-xs text-[var(--positive)]">
                {fetchResult.count} tournaments imported
              </div>
            )}

            <div className="text-xs text-(--text-muted) mt-2">
              Fetches all LoL tournaments for the selected year directly from GRID API.
            </div>
          </div>

          {/* Re-sync Tracked Tournaments */}
          <div className="mb-4 pb-4 border-b border-[var(--border)]">
            <div className="text-sm text-(--text-primary) font-medium mb-3">
              Re-sync Tracked Tournaments
            </div>
            <button
              onClick={handleSyncTracked}
              disabled={isSyncingTracked}
              className="w-full px-3 py-2 text-sm font-medium rounded-lg bg-[var(--accent)] text-black hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSyncingTracked ? 'Syncing...' : 'Sync Now'}
            </button>
            <div className="text-xs text-(--text-muted) mt-2">
              Triggers immediate sync of all tracked tournaments.
            </div>
          </div>

          {/* Sync Match by ID */}
          <div className="mb-4 pb-4 border-b border-[var(--border)]">
            <div className="text-sm text-(--text-primary) font-medium mb-3">
              Sync Match by ID
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
                placeholder="Match ID (e.g., 2877325)"
                className="flex-1 px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-(--text-primary) placeholder:text-(--text-muted)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSyncMatch()
                }}
              />
              <button
                onClick={handleSyncMatch}
                disabled={isSyncingMatch || !matchId.trim()}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-[var(--bg-secondary)] text-(--text-primary) hover:bg-[var(--bg-hover)] border border-[var(--border)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncingMatch ? '...' : 'Sync'}
              </button>
            </div>
            <div className="text-xs text-(--text-muted) mt-2">
              Re-sync a specific match/series.
            </div>
          </div>

          {/* Add Tournament by ID Section */}
          <div>
            <div className="text-sm text-(--text-primary) font-medium mb-3">
              Add Tournament by ID
            </div>

            <input
              type="text"
              value={tournamentId}
              onChange={(e) => setTournamentId(e.target.value)}
              placeholder="GRID Tournament ID (e.g., 827699)"
              className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-(--text-primary) placeholder:text-(--text-muted) mb-3"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddTournament()
              }}
            />

            <div className="flex gap-2">
              <button
                onClick={handleAddTournament}
                disabled={isLoading || !tournamentId.trim()}
                className="flex-1 px-3 py-2 text-sm font-medium rounded-lg bg-[var(--bg-secondary)] text-(--text-primary) hover:bg-[var(--bg-hover)] border border-[var(--border)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Adding...' : 'Add & Sync'}
              </button>
              <button
                onClick={() => {
                  setIsOpen(false)
                  setMessage(null)
                  setFetchResult(null)
                }}
                className="px-3 py-2 text-sm rounded-lg bg-[var(--bg-secondary)] text-(--text-secondary) hover:bg-[var(--bg-hover)]"
              >
                Close
              </button>
            </div>

            <div className="mt-3 text-xs text-(--text-muted)">
              Adds a specific tournament and syncs all its matches.
            </div>
          </div>

          {message && (
            <div
              className={`mt-3 pt-3 border-t border-[var(--border)] text-xs ${
                message.type === 'success' ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
