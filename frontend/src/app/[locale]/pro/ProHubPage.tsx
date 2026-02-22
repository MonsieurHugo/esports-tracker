'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PasswordGate from './stats/PasswordGate'

const pages = [
  { href: '/pro/records', label: 'Records', description: 'Records des ligues professionnelles' },
  { href: '/pro/players', label: 'Players', description: 'Leaderboards des joueurs' },
  { href: '/pro/teams', label: 'Teams', description: 'Leaderboards des equipes' },
  { href: '/pro/champions', label: 'Champions', description: 'Meta et statistiques des champions' },
  { href: '/pro/leagues', label: 'Leagues', description: 'Statistiques par ligue' },
]

export default function ProHubPage() {
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
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-(--text-primary)">Pro Stats</h1>
            <p className="text-sm text-(--text-muted) mt-1">
              Records et leaderboards des ligues LoL professionnelles
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

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pages.map((page) => (
          <Link
            key={page.href}
            href={page.href}
            className="block p-5 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] transition-colors border border-[var(--border-primary)]"
          >
            <h2 className="text-base font-semibold text-(--text-primary) mb-1">{page.label}</h2>
            <p className="text-sm text-(--text-muted)">{page.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
