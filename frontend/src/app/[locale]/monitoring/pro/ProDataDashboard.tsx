'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { logError } from '@/lib/logger'
import { Skeleton } from '@/components/ui/Skeleton'
import TournamentList from './components/TournamentList'
import MatchList from './components/MatchList'
import GameDetails from './components/GameDetails'
import SyncButton from './components/SyncButton'
import LeagueManager from './components/LeagueManager'
import TeamAnalyticsTab from './components/teams/TeamAnalyticsTab'
import PlayerAnalyticsTab from './components/players/PlayerAnalyticsTab'
import ChampionAnalyticsTab from './components/champions/ChampionAnalyticsTab'
import MappingManager from './components/MappingManager'
import type { ProMonitoringStats } from '@/lib/types'

type TabType = 'tournaments' | 'matches' | 'leagues' | 'mappings' | 'teams' | 'players' | 'champions'

export default function ProDataDashboard() {
  const [stats, setStats] = useState<ProMonitoringStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabType>('matches')
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null)
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.get<ProMonitoringStats>('/pro/monitoring/stats')
      setStats(data)
      setLastUpdate(new Date())
    } catch (error) {
      logError('Failed to fetch pro stats', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [fetchStats, autoRefresh])

  const handleTournamentSelect = (tournamentId: number) => {
    setSelectedTournamentId(tournamentId)
    setActiveTab('matches')
  }

  const handleGameSelect = (gameId: number) => {
    setSelectedGameId(gameId)
  }

  const handleCloseGameDetails = () => {
    setSelectedGameId(null)
  }

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'Just now'
  }

  const tabs: { key: TabType; label: string; accent?: boolean }[] = [
    { key: 'tournaments', label: 'Tournaments' },
    { key: 'matches', label: 'Matches' },
    { key: 'leagues', label: 'Leagues' },
    { key: 'mappings', label: 'Mappings' },
    { key: 'teams', label: 'Teams', accent: true },
    { key: 'players', label: 'Players', accent: true },
    { key: 'champions', label: 'Champions', accent: true },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-(--text-primary)">Pro Data Explorer</h1>
            <p className="text-sm text-(--text-muted) mt-1">
              Donnees et analytics esports professionnelles
            </p>
          </div>
          <div className="flex items-center gap-4">
            <SyncButton onSyncComplete={fetchStats} />
            <label className="flex items-center gap-2 text-xs text-(--text-muted) cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-[var(--border)]"
              />
              Auto-refresh
            </label>
            {lastUpdate && (
              <span className="text-xs text-(--text-muted)">
                {lastUpdate.toLocaleTimeString('fr-FR')}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatsCard label="Tournaments" value={stats?.tournaments ?? 0} isLoading={isLoading} />
        <StatsCard label="Matches" value={stats?.matches ?? 0} isLoading={isLoading} />
        <StatsCard label="Games" value={stats?.games ?? 0} isLoading={isLoading} />
        <StatsCard
          label="Last Sync"
          value={formatLastSync(stats?.lastSyncAt ?? null)}
          isLoading={isLoading}
          isText
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Data Management Tabs */}
        <div className="flex gap-2">
          {tabs.slice(0, 4).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
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

        <div className="w-px bg-[var(--border)] mx-2" />

        {/* Analytics Tabs */}
        <div className="flex gap-2">
          {tabs.slice(4).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-[var(--lol)] text-black'
                  : 'bg-[var(--bg-card)] text-(--text-secondary) hover:bg-[var(--bg-hover)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={selectedGameId ? 'lg:col-span-2' : 'lg:col-span-3'}>
          {activeTab === 'tournaments' && (
            <TournamentList onSelect={handleTournamentSelect} />
          )}
          {activeTab === 'matches' && (
            <MatchList
              tournamentId={selectedTournamentId}
              onSelectMatch={() => {}}
              onSelectGame={handleGameSelect}
            />
          )}
          {activeTab === 'leagues' && <LeagueManager />}
          {activeTab === 'mappings' && <MappingManager />}
          {activeTab === 'teams' && <TeamAnalyticsTab />}
          {activeTab === 'players' && <PlayerAnalyticsTab />}
          {activeTab === 'champions' && <ChampionAnalyticsTab />}
        </div>

        {selectedGameId && (
          <div className="lg:col-span-1">
            <GameDetails gameId={selectedGameId} onClose={handleCloseGameDetails} />
          </div>
        )}
      </div>
    </div>
  )
}

function StatsCard({
  label,
  value,
  isLoading,
  isText,
}: {
  label: string
  value: number | string
  isLoading: boolean
  isText?: boolean
}) {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-xs text-(--text-muted) mb-1">{label}</div>
      {isLoading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <div className={`font-mono ${isText ? 'text-lg' : 'text-2xl'} font-bold text-(--text-primary)`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
      )}
    </div>
  )
}
