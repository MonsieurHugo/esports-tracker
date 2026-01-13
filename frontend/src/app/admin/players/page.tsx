'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import type { AdminPlayer, AdminTeam, UpdatePlayerPayload, UpsertContractPayload } from '@/lib/types'
import { PlayerFilters } from '@/components/admin/PlayerFilters'
import { PlayerEditRow } from '@/components/admin/PlayerEditRow'

interface AdminPlayersResponse {
  data: AdminPlayer[]
  teams: AdminTeam[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
  }
}

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<AdminPlayer[]>([])
  const [teams, setTeams] = useState<AdminTeam[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)

  // Pagination (server-side)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalPlayers, setTotalPlayers] = useState(0)
  const itemsPerPage = 25

  // Fetch data from new admin/players endpoint
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', currentPage.toString())
      params.set('perPage', itemsPerPage.toString())
      if (searchQuery) params.set('search', searchQuery)
      if (selectedTeamId !== null) params.set('teamId', selectedTeamId.toString())

      const res = await api.get<AdminPlayersResponse>(`/admin/players?${params.toString()}`)

      setPlayers(res.data)
      setTeams(res.teams)
      setTotalPages(res.meta.lastPage)
      setTotalPlayers(res.meta.total)
    } catch {
      setError('Erreur lors du chargement des données')
    } finally {
      setIsLoading(false)
    }
  }, [currentPage, searchQuery, selectedTeamId, itemsPerPage])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedTeamId])

  // Save handlers
  const handleSavePlayer = useCallback(
    async (playerId: number, data: UpdatePlayerPayload) => {
      await api.patch(`/admin/players/${playerId}`, data)
      // Refresh data after save
      await fetchData()
    },
    [fetchData]
  )

  const handleSaveContract = useCallback(
    async (playerId: number, data: UpsertContractPayload) => {
      await api.post(`/admin/players/${playerId}/contract`, data)
      // Refresh data after save
      await fetchData()
    },
    [fetchData]
  )

  const handleRemoveContract = useCallback(
    async (playerId: number) => {
      await api.delete(`/admin/players/${playerId}/contract`)
      // Refresh data after save
      await fetchData()
    },
    [fetchData]
  )

  return (
    <main className="p-5 max-w-[1800px] mx-auto">
      <header className="mb-5">
        <h1 className="text-xl font-bold mb-2">Gestion des joueurs</h1>
        <div className="flex gap-4 text-sm text-(--text-muted)">
          <span>{totalPlayers} joueurs</span>
          <span>{teams.length} équipes</span>
        </div>
      </header>

      <PlayerFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedTeamId={selectedTeamId}
        onTeamChange={setSelectedTeamId}
        teams={teams}
      />

      {error && (
        <div className="mb-4 px-4 py-3 bg-(--bg-card) border border-(--negative)/30 rounded-lg text-sm text-(--negative)">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-(--text-muted)">Chargement...</div>
      ) : (
        <>
          <div className="bg-(--bg-card) border border-(--border) rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-(--bg-secondary) border-b border-(--border)">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-(--text-muted)">Pseudo</th>
                    <th className="px-4 py-3 text-left font-medium text-(--text-muted)">Prénom</th>
                    <th className="px-4 py-3 text-left font-medium text-(--text-muted)">Nom</th>
                    <th className="px-4 py-3 text-left font-medium text-(--text-muted)">
                      Nationalité
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-(--text-muted)">
                      Équipe / Rôle
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-(--text-muted)">Comptes</th>
                    <th className="px-4 py-3 text-left font-medium text-(--text-muted)">Twitter</th>
                    <th className="px-4 py-3 text-left font-medium text-(--text-muted)">Twitch</th>
                    <th className="px-4 py-3 text-left font-medium text-(--text-muted)">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <PlayerEditRow
                      key={player.playerId}
                      player={player}
                      teams={teams}
                      onSavePlayer={handleSavePlayer}
                      onSaveContract={handleSaveContract}
                      onRemoveContract={handleRemoveContract}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-(--text-muted)">
                {totalPlayers} joueurs - Page {currentPage} sur {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-(--bg-card) border border-(--border) rounded-md hover:bg-(--bg-hover) disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Précédent
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-(--bg-card) border border-(--border) rounded-md hover:bg-(--bg-hover) disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
