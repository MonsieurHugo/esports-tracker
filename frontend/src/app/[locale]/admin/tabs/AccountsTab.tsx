'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAdminApi } from '../useAdminApi'
import type { AdminPlayer, AdminPlayersResponse, AdminLolAccount } from '@/lib/types'

interface AccountWithPlayer extends AdminLolAccount {
  playerPseudo: string
  playerId: number
}

interface Props {
  password: string
}

export default function AccountsTab({ password }: Props) {
  const api = useAdminApi(password)
  const [players, setPlayers] = useState<AdminPlayer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Quick add state
  const [showAdd, setShowAdd] = useState(false)
  const [addPlayerId, setAddPlayerId] = useState('')
  const [addGameName, setAddGameName] = useState('')
  const [addTagLine, setAddTagLine] = useState('')
  const [addRegion, setAddRegion] = useState('EUW')
  const [addSaving, setAddSaving] = useState(false)

  const fetchPlayers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch all players with a high perPage to get all accounts
      const res = await api.get<AdminPlayersResponse>('/players', {
        params: { perPage: 500 },
      })
      setPlayers(Array.isArray(res.data) ? res.data : [])
    } catch {
      setError('Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    fetchPlayers()
  }, [fetchPlayers])

  // Flatten all accounts with their player info
  const allAccounts = useMemo(() => {
    const accounts: AccountWithPlayer[] = []
    for (const player of players) {
      for (const acc of player.accounts) {
        accounts.push({ ...acc, playerPseudo: player.currentPseudo, playerId: player.playerId })
      }
    }
    return accounts
  }, [players])

  // Filter by search
  const filtered = useMemo(() => {
    if (!search.trim()) return allAccounts
    const q = search.toLowerCase()
    return allAccounts.filter(
      (a) =>
        a.gameName?.toLowerCase().includes(q) ||
        a.tagLine?.toLowerCase().includes(q) ||
        a.playerPseudo.toLowerCase().includes(q)
    )
  }, [allAccounts, search])

  const handleAddAccount = async () => {
    if (!addPlayerId || !addGameName.trim() || !addTagLine.trim()) return
    setAddSaving(true)
    try {
      await api.post(`/players/${addPlayerId}/accounts`, {
        gameName: addGameName.trim(),
        tagLine: addTagLine.trim(),
        region: addRegion,
      })
      setShowAdd(false)
      setAddPlayerId('')
      setAddGameName('')
      setAddTagLine('')
      setAddRegion('EUW')
      fetchPlayers()
    } catch {
      alert('Erreur lors de l\'ajout')
    } finally {
      setAddSaving(false)
    }
  }

  const handleDelete = async (acc: AccountWithPlayer) => {
    if (!confirm(`Supprimer le compte ${acc.gameName}#${acc.tagLine} ?`)) return
    try {
      await api.del(`/players/${acc.playerId}/accounts/${acc.accountId}`)
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
          placeholder="Rechercher un compte..."
          className="flex-1 max-w-xs px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
        >
          + Ajout rapide
        </button>
        <span className="text-sm text-[var(--text-muted)]">{filtered.length} comptes</span>
      </div>

      {/* Quick add form */}
      {showAdd && (
        <div className="mb-4 p-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="min-w-[180px]">
              <label className="block text-xs text-[var(--text-muted)] mb-1">Joueur</label>
              <select
                value={addPlayerId}
                onChange={(e) => setAddPlayerId(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">Selectionnez...</option>
                {players.map((p) => (
                  <option key={p.playerId} value={p.playerId}>{p.currentPseudo}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">Game Name</label>
              <input value={addGameName} onChange={(e) => setAddGameName(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]" />
            </div>
            <div className="w-20">
              <label className="block text-xs text-[var(--text-muted)] mb-1">Tag</label>
              <input value={addTagLine} onChange={(e) => setAddTagLine(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]" />
            </div>
            <div className="w-20">
              <label className="block text-xs text-[var(--text-muted)] mb-1">Region</label>
              <select value={addRegion} onChange={(e) => setAddRegion(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]">
                <option value="EUW">EUW</option>
                <option value="EUNE">EUNE</option>
                <option value="NA">NA</option>
                <option value="KR">KR</option>
              </select>
            </div>
            <button onClick={handleAddAccount} disabled={addSaving || !addPlayerId || !addGameName.trim() || !addTagLine.trim()}
              className="px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
              {addSaving ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-[var(--negative)] mb-4">{error}</p>}

      {/* Table */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Joueur</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Game Name</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Tag</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Region</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">PUUID</th>
              <th className="text-center px-4 py-3 text-[var(--text-muted)] font-medium">Principal</th>
              <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">Chargement...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">Aucun compte</td></tr>
            ) : (
              filtered.map((acc) => (
                <tr key={acc.accountId} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors">
                  <td className="px-4 py-3 text-[var(--text-primary)] font-medium">{acc.playerPseudo}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{acc.gameName}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{acc.tagLine}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{acc.region}</td>
                  <td className="px-4 py-3">
                    {acc.puuid ? (
                      <span className="text-xs text-[var(--text-muted)] font-mono">{acc.puuid.slice(0, 8)}...</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--warning)]/10 text-[var(--warning)]">
                        En attente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {acc.isPrimary && <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)]" />}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(acc)} className="text-[var(--text-muted)] hover:text-[var(--negative)] text-xs">
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
