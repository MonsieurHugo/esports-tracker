'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PasswordGate from '../stats/PasswordGate'
import PlayerLeaderboardSection from '../stats/sections/PlayerLeaderboardSection'

export default function ProPlayersPage() {
  const [isUnlocked, setIsUnlocked] = useState<boolean | null>(null)

  useEffect(() => {
    setIsUnlocked(localStorage.getItem('proStatsUnlocked') === 'true')
  }, [])

  if (isUnlocked === null) return null

  if (!isUnlocked) {
    return <PasswordGate onSuccess={() => setIsUnlocked(true)} />
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <header className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link
                href="/pro"
                className="text-(--text-muted) hover:text-(--text-primary) transition-colors text-sm"
              >
                &larr; Pro
              </Link>
            </div>
            <h1 className="text-xl font-bold text-(--text-primary)">Players</h1>
            <p className="text-sm text-(--text-muted) mt-1">
              Leaderboards des joueurs professionnels
            </p>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('proStatsUnlocked')
              setIsUnlocked(false)
            }}
            className="px-3 py-2 text-xs text-(--text-muted) hover:text-(--text-secondary) transition-colors"
          >
            Verrouiller
          </button>
        </div>
      </header>

      <PlayerLeaderboardSection />
    </div>
  )
}
