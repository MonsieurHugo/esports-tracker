'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { ALL_LEAGUES } from '@/lib/constants'

interface Account {
  puuid: string
  gameName: string
  tagLine: string
  region: string
}

interface Player {
  playerId: number
  slug: string
  name: string
  role: string
  accounts: Account[]
}

interface Team {
  teamId: number
  slug: string
  name: string
  region: string
  league: string | null
  players: Player[]
}

export default function AdminPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedLeague, setSelectedLeague] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedTeams, setExpandedTeams] = useState<Set<number>>(new Set())

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const params: Record<string, string> = {}
        if (selectedLeague) {
          params.league = selectedLeague
        }
        const res = await api.get<{ data: Team[] }>('/admin/teams-accounts', { params })
        setTeams(res.data || [])
      } catch (error) {
        console.error('Failed to fetch teams:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [selectedLeague])

  const toggleTeam = (teamId: number) => {
    setExpandedTeams(prev => {
      const next = new Set(prev)
      if (next.has(teamId)) {
        next.delete(teamId)
      } else {
        next.add(teamId)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedTeams(new Set(filteredTeams.map(t => t.teamId)))
  }

  const collapseAll = () => {
    setExpandedTeams(new Set())
  }

  // Filtrer par recherche
  const filteredTeams = teams.filter(team => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    if (team.name.toLowerCase().includes(query)) return true
    if (team.players.some(p => p.name.toLowerCase().includes(query))) return true
    if (team.players.some(p => p.accounts.some(a =>
      a.gameName.toLowerCase().includes(query) ||
      `${a.gameName}#${a.tagLine}`.toLowerCase().includes(query)
    ))) return true
    return false
  })

  // Stats
  const totalPlayers = teams.reduce((acc, t) => acc + t.players.length, 0)
  const totalAccounts = teams.reduce((acc, t) =>
    acc + t.players.reduce((pacc, p) => pacc + p.accounts.length, 0), 0)
  const playersWithoutAccounts = teams.reduce((acc, t) =>
    acc + t.players.filter(p => p.accounts.length === 0).length, 0)

  return (
    <main className="p-5 max-w-[1400px] mx-auto">
      <header className="mb-5">
        <h1 className="text-lg font-semibold mb-2">Admin - Équipes & Comptes</h1>
        <div className="flex gap-4 text-sm text-[var(--text-muted)]">
          <span>{teams.length} équipes</span>
          <span>{totalPlayers} joueurs</span>
          <span>{totalAccounts} comptes</span>
          <span className="text-[var(--negative)]">{playersWithoutAccounts} sans compte</span>
        </div>
      </header>

      {/* Filtres */}
      <div className="flex gap-3 mb-5">
        <select
          value={selectedLeague}
          onChange={(e) => setSelectedLeague(e.target.value)}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md px-3 py-2 text-sm"
        >
          <option value="">Toutes les ligues</option>
          {ALL_LEAGUES.map(league => (
            <option key={league} value={league}>{league}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Rechercher équipe, joueur ou compte..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-md px-3 py-2 text-sm"
        />

        <button
          onClick={expandAll}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
        >
          Tout déplier
        </button>
        <button
          onClick={collapseAll}
          className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
        >
          Tout replier
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-[var(--text-muted)]">Chargement...</div>
      ) : (
        <div className="space-y-2">
          {filteredTeams.map(team => (
            <div key={team.teamId} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
              {/* Header équipe */}
              <div
                onClick={() => toggleTeam(team.teamId)}
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--bg-hover)]"
              >
                <div className="flex items-center gap-3">
                  <svg
                    className={`w-4 h-4 transition-transform ${expandedTeams.has(team.teamId) ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-medium">{team.name}</span>
                  {team.league && (
                    <span className="text-xs px-2 py-0.5 bg-[var(--bg-secondary)] rounded text-[var(--text-muted)]">
                      {team.league}
                    </span>
                  )}
                  <span className="text-xs text-[var(--text-muted)]">{team.region}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                  <span>{team.players.length} joueurs</span>
                  <span>{team.players.reduce((acc, p) => acc + p.accounts.length, 0)} comptes</span>
                  {team.players.some(p => p.accounts.length === 0) && (
                    <span className="text-[var(--negative)]">
                      {team.players.filter(p => p.accounts.length === 0).length} sans compte
                    </span>
                  )}
                </div>
              </div>

              {/* Joueurs */}
              {expandedTeams.has(team.teamId) && (
                <div className="border-t border-[var(--border)]">
                  {team.players.map(player => (
                    <div
                      key={player.playerId}
                      className="flex items-start gap-4 px-4 py-3 border-b border-[var(--border)] last:border-b-0 bg-[var(--bg-secondary)]"
                    >
                      {/* Info joueur */}
                      <div className="w-32 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-1.5 py-0.5 bg-[var(--bg-card)] rounded font-mono">
                            {player.role}
                          </span>
                          <span className="font-medium text-sm">{player.name}</span>
                        </div>
                      </div>

                      {/* Comptes */}
                      <div className="flex-1">
                        {player.accounts.length === 0 ? (
                          <span className="text-xs text-[var(--negative)]">Aucun compte</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {player.accounts.map(account => (
                              <div
                                key={account.puuid}
                                className="text-xs px-2 py-1 bg-[var(--bg-card)] rounded border border-[var(--border)]"
                              >
                                <span className="text-[var(--text-primary)]">{account.gameName}</span>
                                <span className="text-[var(--text-muted)]">#{account.tagLine}</span>
                                <span className="text-[var(--text-muted)] ml-1">({account.region})</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
