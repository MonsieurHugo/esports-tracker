'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminApi } from '../useAdminApi'
import AddPlayerModal from '../components/AddPlayerModal'
import EditPlayerModal from '../components/EditPlayerModal'
import AddAccountModal from '../components/AddAccountModal'
import type { AdminPlayer, AdminTeam, AdminPlayersResponse, CreateFullPlayerPayload, UpdatePlayerPayload } from '@/lib/types'

interface Props {
  password: string
}

export default function PlayersTab({ password }: Props) {
  const api = useAdminApi(password)
  const [players, setPlayers] = useState<AdminPlayer[]>([])
  const [teams, setTeams] = useState<AdminTeam[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [meta, setMeta] = useState({ total: 0, perPage: 20, currentPage: 1, lastPage: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingPlayer, setEditingPlayer] = useState<AdminPlayer | null>(null)
  const [addAccountPlayer, setAddAccountPlayer] = useState<AdminPlayer | null>(null)

  const fetchPlayers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<AdminPlayersResponse>('/players', {
        params: { search: search || undefined, page, perPage: 20 },
      })
      setPlayers(Array.isArray(res.data) ? res.data : [])
      setTeams(Array.isArray(res.teams) ? res.teams : [])
      if (res.meta) setMeta(res.meta)
    } catch {
      setError('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }, [api, search, page])

  useEffect(() => {
    const timer = setTimeout(fetchPlayers, 300)
    return () => clearTimeout(timer)
  }, [fetchPlayers])

  // Reset page when search changes
  useEffect(() => { setPage(1) }, [search])

  const handleCreateFull = async (payload: CreateFullPlayerPayload) => {
    await api.post('/players/full', payload)
    fetchPlayers()
  }

  const handleUpdatePlayer = async (id: number, data: UpdatePlayerPayload) => {
    await api.patch(`/players/${id}`, data)
    fetchPlayers()
  }

  const handleUpsertContract = async (playerId: number, data: { teamId: number; role?: string; isStarter: boolean }) => {
    await api.post(`/players/${playerId}/contract`, data)
    fetchPlayers()
  }

  const handleEndContract = async (playerId: number) => {
    await api.post(`/players/${playerId}/contract/end`)
    fetchPlayers()
  }

  const handleAddAccount = async (playerId: number, data: { gameName: string; tagLine: string; region: string; isPrimary: boolean }) => {
    await api.post(`/players/${playerId}/accounts`, data)
    fetchPlayers()
  }

  const handleDeleteAccount = async (playerId: number, accountId: number) => {
    await api.del(`/players/${playerId}/accounts/${accountId}`)
    fetchPlayers()
  }

  const handleDeletePlayer = async (player: AdminPlayer) => {
    if (!confirm(`Supprimer le joueur "${player.currentPseudo}" et tous ses comptes/contrats ?`)) return
    try {
      await api.del(`/players/${player.playerId}`)
      fetchPlayers()
    } catch {
      alert('Erreur lors de la suppression')
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un joueur..."
          className="flex-1 max-w-xs px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
        >
          + Ajouter un joueur
        </button>
      </div>

      {error && <p className="text-sm text-[var(--negative)] mb-4">{error}</p>}

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Pseudo</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Equipe / Role</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Comptes</th>
              <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">Chargement...</td></tr>
            ) : players.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--text-muted)]">Aucun joueur trouve</td></tr>
            ) : (
              players.map((player) => (
                <tr key={player.playerId} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-[var(--text-primary)] font-medium">{player.currentPseudo}</div>
                    <div className="text-xs text-[var(--text-muted)] font-mono">{player.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    {player.contract ? (
                      <div>
                        <span className="text-[var(--text-secondary)]">{player.contract.teamShortName}</span>
                        {player.contract.role && <span className="text-[var(--text-muted)] ml-1">- {player.contract.role}</span>}
                      </div>
                    ) : (
                      <span className="text-[var(--text-muted)] text-xs">Sans equipe</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {player.accounts.length === 0 ? (
                      <span className="text-[var(--text-muted)] text-xs">Aucun</span>
                    ) : (
                      <div className="space-y-0.5">
                        {player.accounts.map((acc) => (
                          <div key={acc.accountId} className="text-xs">
                            <span className="text-[var(--text-secondary)]">{acc.gameName}#{acc.tagLine}</span>
                            <span className="text-[var(--text-muted)] ml-1">{acc.region}</span>
                            {!acc.puuid && <span className="text-[var(--warning)] ml-1" title="PUUID en attente de validation">*</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setEditingPlayer(player)} className="text-[var(--text-muted)] hover:text-[var(--accent)] text-xs mr-2">Modifier</button>
                    <button onClick={() => setAddAccountPlayer(player)} className="text-[var(--text-muted)] hover:text-[var(--accent)] text-xs mr-2">+Compte</button>
                    <button onClick={() => handleDeletePlayer(player)} className="text-[var(--text-muted)] hover:text-[var(--negative)] text-xs">Supprimer</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta.lastPage > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-[var(--text-muted)]">{meta.total} joueurs</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Precedent
            </button>
            <span className="px-3 py-1.5 text-sm text-[var(--text-muted)]">
              {meta.currentPage} / {meta.lastPage}
            </span>
            <button
              onClick={() => setPage(p => Math.min(meta.lastPage, p + 1))}
              disabled={page >= meta.lastPage}
              className="px-3 py-1.5 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddModal && (
        <AddPlayerModal teams={teams} onSave={handleCreateFull} onClose={() => setShowAddModal(false)} />
      )}
      {editingPlayer && (
        <EditPlayerModal
          player={editingPlayer}
          teams={teams}
          onUpdatePlayer={handleUpdatePlayer}
          onUpsertContract={handleUpsertContract}
          onEndContract={handleEndContract}
          onDeleteAccount={handleDeleteAccount}
          onClose={() => setEditingPlayer(null)}
        />
      )}
      {addAccountPlayer && (
        <AddAccountModal
          playerId={addAccountPlayer.playerId}
          playerName={addAccountPlayer.currentPseudo}
          onSave={(data) => handleAddAccount(addAccountPlayer.playerId, data)}
          onClose={() => setAddAccountPlayer(null)}
        />
      )}
    </div>
  )
}
