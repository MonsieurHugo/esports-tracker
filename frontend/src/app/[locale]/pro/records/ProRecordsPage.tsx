'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import PasswordGate from '../stats/PasswordGate'
import GlobalFilterBar from '../stats/components/GlobalFilterBar'
import { useProStatsFilters } from '../stats/hooks/useProStatsFilters'
import RecordsSection from '../stats/sections/RecordsSection'

export default function ProRecordsPage() {
  const [isUnlocked, setIsUnlocked] = useState<boolean | null>(null)
  const filters = useProStatsFilters(new Set([2026]))

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
            <div className="flex items-center gap-3 mb-1">
              <Link
                href="/pro"
                className="text-(--text-muted) hover:text-(--text-primary) transition-colors text-sm"
              >
                &larr; Pro
              </Link>
            </div>
            <h1 className="text-xl font-bold text-(--text-primary)">Records</h1>
            <p className="text-sm text-(--text-muted) mt-1">
              Records des ligues LoL professionnelles
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

      {/* Global Filter Bar */}
      <GlobalFilterBar filters={filters} />

      {/* Content */}
      <RecordsSection filters={filters} />
    </div>
  )
}
