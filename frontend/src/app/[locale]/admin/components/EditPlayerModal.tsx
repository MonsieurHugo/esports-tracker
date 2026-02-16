'use client'

import { useState } from 'react'
import ContractForm from './ContractForm'
import type { AdminPlayer, AdminTeam, UpdatePlayerPayload } from '@/lib/types'

interface Props {
  player: AdminPlayer
  teams: AdminTeam[]
  onUpdatePlayer: (id: number, data: UpdatePlayerPayload) => Promise<void>
  onUpsertContract: (playerId: number, data: { teamId: number; role?: string; isStarter: boolean }) => Promise<void>
  onEndContract: (playerId: number) => Promise<void>
  onDeleteAccount: (playerId: number, accountId: number) => Promise<void>
  onClose: () => void
}

export default function EditPlayerModal({
  player, teams, onUpdatePlayer, onUpsertContract, onEndContract, onDeleteAccount, onClose,
}: Props) {
  // Player info
  const [pseudo, setPseudo] = useState(player.currentPseudo)
  const [firstName, setFirstName] = useState(player.firstName || '')
  const [lastName, setLastName] = useState(player.lastName || '')
  const [nationality, setNationality] = useState(player.nationality || '')
  const [saving, setSaving] = useState(false)

  // Contract
  const [contract, setContract] = useState({
    teamId: player.contract ? String(player.contract.teamId) : '',
    role: player.contract?.role || '',
    isStarter: player.contract?.isStarter ?? true,
  })
  const [contractSaving, setContractSaving] = useState(false)

  const handleSavePlayer = async () => {
    if (!pseudo.trim()) return
    setSaving(true)
    try {
      await onUpdatePlayer(player.playerId, {
        currentPseudo: pseudo.trim(),
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        nationality: nationality.trim() || null,
      })
      onClose()
    } catch {
      alert('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveContract = async () => {
    if (!contract.teamId) return
    setContractSaving(true)
    try {
      await onUpsertContract(player.playerId, {
        teamId: Number(contract.teamId),
        ...(contract.role && { role: contract.role }),
        isStarter: contract.isStarter,
      })
      onClose()
    } catch {
      alert('Erreur lors de la sauvegarde du contrat')
    } finally {
      setContractSaving(false)
    }
  }

  const handleEndContract = async () => {
    if (!confirm('Terminer le contrat actif ?')) return
    setContractSaving(true)
    try {
      await onEndContract(player.playerId)
      onClose()
    } catch {
      alert('Erreur lors de la terminaison du contrat')
    } finally {
      setContractSaving(false)
    }
  }

  const handleDeleteAccount = async (accountId: number) => {
    if (!confirm('Supprimer ce compte ?')) return
    try {
      await onDeleteAccount(player.playerId, accountId)
      onClose()
    } catch {
      alert('Erreur lors de la suppression')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Modifier : {player.currentPseudo}</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-6 overflow-y-auto flex-1">
          {/* Section 1: Player Info */}
          <div>
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Informations</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Pseudo *</label>
                <input value={pseudo} onChange={(e) => setPseudo(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Prénom</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]" />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Nom</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Nationalité</label>
                <input value={nationality} onChange={(e) => setNationality(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]" />
              </div>
              <button onClick={handleSavePlayer} disabled={saving || !pseudo.trim()}
                className="px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
                {saving ? 'Sauvegarde...' : 'Sauvegarder les infos'}
              </button>
            </div>
          </div>

          {/* Section 2: Contract */}
          <div>
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Contrat</h3>
            {player.contract && (
              <div className="mb-3 p-3 bg-[var(--bg-secondary)] rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-[var(--text-primary)] font-medium">{player.contract.teamName}</span>
                    <span className="text-xs text-[var(--text-muted)] ml-2">{player.contract.role || 'N/A'}</span>
                    {player.contract.isStarter && <span className="text-xs text-[var(--accent)] ml-2">Titulaire</span>}
                  </div>
                  <button onClick={handleEndContract} disabled={contractSaving}
                    className="text-xs text-[var(--negative)] hover:underline disabled:opacity-50">
                    Terminer
                  </button>
                </div>
              </div>
            )}
            <ContractForm value={contract} onChange={setContract} teams={teams} disabled={contractSaving} />
            <button onClick={handleSaveContract} disabled={contractSaving || !contract.teamId}
              className="mt-3 px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
              {contractSaving ? 'Sauvegarde...' : player.contract ? 'Changer de contrat' : 'Assigner un contrat'}
            </button>
          </div>

          {/* Section 3: Accounts */}
          <div>
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Comptes LoL</h3>
            {player.accounts.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">Aucun compte lié</p>
            ) : (
              <div className="space-y-2">
                {player.accounts.map((acc) => (
                  <div key={acc.accountId} className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg">
                    <div>
                      <span className="text-sm text-[var(--text-primary)] font-medium">{acc.gameName}#{acc.tagLine}</span>
                      <span className="text-xs text-[var(--text-muted)] ml-2">{acc.region}</span>
                      {acc.isPrimary && <span className="text-xs text-[var(--accent)] ml-2">Principal</span>}
                      {!acc.puuid && <span className="text-xs text-[var(--warning)] ml-2">PUUID en attente</span>}
                    </div>
                    <button onClick={() => handleDeleteAccount(acc.accountId)}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--negative)]">
                      Supprimer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-[var(--border)] shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
