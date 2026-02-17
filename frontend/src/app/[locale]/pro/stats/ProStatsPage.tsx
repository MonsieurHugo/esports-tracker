'use client'

import { useState, useEffect, useCallback } from 'react'
import PasswordGate from './PasswordGate'
import GlobalFilterBar from './components/GlobalFilterBar'
import { useProStatsFilters } from './hooks/useProStatsFilters'
import RecordsSection from './sections/RecordsSection'
import PlayerLeaderboardSection from './sections/PlayerLeaderboardSection'
import TeamLeaderboardSection from './sections/TeamLeaderboardSection'
import ChampionMetaSection from './sections/ChampionMetaSection'
import LeagueStatsSection from './sections/LeagueStatsSection'
type TabType = 'records' | 'players' | 'teams' | 'champions' | 'leagues'

const VALID_TABS: TabType[] = ['records', 'players', 'teams', 'champions', 'leagues']

function getTabFromHash(): TabType {
  if (typeof window === 'undefined') return 'records'
  const hash = window.location.hash.slice(1) as TabType
  return VALID_TABS.includes(hash) ? hash : 'records'
}

export default function ProStatsPage() {
  const [isUnlocked, setIsUnlocked] = useState<boolean | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>(getTabFromHash)
  const filters = useProStatsFilters(new Set([2026]))

  const handleSetActiveTab = useCallback((tab: TabType) => {
    setActiveTab(tab)
    window.history.replaceState(null, '', `#${tab}`)
  }, [])

  useEffect(() => {
    setIsUnlocked(localStorage.getItem('proStatsUnlocked') === 'true')
  }, [])

  useEffect(() => {
    const onHashChange = () => setActiveTab(getTabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Still loading localStorage check
  if (isUnlocked === null) return null

  if (!isUnlocked) {
    return <PasswordGate onSuccess={() => setIsUnlocked(true)} />
  }

  const tabs: { key: TabType; label: string }[] = [
    { key: 'records', label: 'Records' },
    { key: 'players', label: 'Players' },
    { key: 'teams', label: 'Teams' },
    { key: 'champions', label: 'Champions' },
    { key: 'leagues', label: 'Leagues' },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-(--text-primary)">Pro Stats All-Time</h1>
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

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleSetActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[var(--accent)] text-black'
                : 'bg-[var(--bg-card)] text-(--text-secondary) hover:bg-[var(--bg-hover)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Global Filter Bar */}
      <GlobalFilterBar filters={filters} />

      {/* Content */}
      {activeTab === 'records' && <RecordsSection filters={filters} />}
      {activeTab === 'players' && <PlayerLeaderboardSection filters={filters} />}
      {activeTab === 'teams' && <TeamLeaderboardSection filters={filters} />}
      {activeTab === 'champions' && <ChampionMetaSection filters={filters} />}
      {activeTab === 'leagues' && <LeagueStatsSection filters={filters} />}
    </div>
  )
}
