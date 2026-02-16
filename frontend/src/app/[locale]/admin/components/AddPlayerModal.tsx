'use client'

import { useState } from 'react'
import ContractForm from './ContractForm'
import type { AdminTeam, CreateFullPlayerPayload } from '@/lib/types'

interface AccountEntry {
  gameName: string
  tagLine: string
  region: string
}

interface Props {
  teams: AdminTeam[]
  onSave: (payload: CreateFullPlayerPayload) => Promise<void>
  onClose: () => void
}

export default function AddPlayerModal({ teams, onSave, onClose }: Props) {
  // Player info
  const [pseudo, setPseudo] = useState('')
  const [slug, setSlug] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [nationality, setNationality] = useState('')

  // Contract (optional section)
  const [includeContract, setIncludeContract] = useState(false)
  const [contract, setContract] = useState({ teamId: '', role: '', isStarter: true })

  // Accounts (optional section)
  const [accounts, setAccounts] = useState<AccountEntry[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addAccount = () => {
    setAccounts([...accounts, { gameName: '', tagLine: '', region: 'EUW' }])
  }

  const updateAccount = (index: number, field: keyof AccountEntry, value: string) => {
    setAccounts(accounts.map((a, i) => (i === index ? { ...a, [field]: value } : a)))
  }

  const removeAccount = (index: number) => {
    setAccounts(accounts.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!pseudo.trim()) return
    setSaving(true)
    setError(null)

    const payload: CreateFullPlayerPayload = {
      player: {
        currentPseudo: pseudo.trim(),
        ...(slug.trim() && { slug: slug.trim() }),
        ...(firstName.trim() && { firstName: firstName.trim() }),
        ...(lastName.trim() && { lastName: lastName.trim() }),
        ...(nationality.trim() && { nationality: nationality.trim() }),
      },
    }

    if (includeContract && contract.teamId) {
      payload.contract = {
        teamId: Number(contract.teamId),
        ...(contract.role && { role: contract.role }),
        isStarter: contract.isStarter,
      }
    }

    const validAccounts = accounts.filter((a) => a.gameName.trim() && a.tagLine.trim())
    if (validAccounts.length > 0) {
      payload.accounts = validAccounts.map((a) => ({
        gameName: a.gameName.trim(),
        tagLine: a.tagLine.trim(),
        region: a.region || 'EUW',
      }))
    }

    try {
      await onSave(payload)
      onClose()
    } catch {
      setError('Erreur lors de la creation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Nouveau joueur</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="px-6 py-4 space-y-6 overflow-y-auto flex-1">
          {/* Section 1: Player Info */}
          <div>
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
              Informations joueur
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Pseudo *</label>
                <input
                  value={pseudo}
                  onChange={(e) => setPseudo(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Prenom</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Nom</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Nationalite</label>
                  <input
                    value={nationality}
                    onChange={(e) => setNationality(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Slug (auto)</label>
                  <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder={
                      pseudo.trim()
                        ? pseudo
                            .trim()
                            .toLowerCase()
                            .replace(/\s+/g, '-')
                            .replace(/[^a-z0-9-]/g, '')
                        : ''
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Contract (optional) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="includeContract"
                checked={includeContract}
                onChange={(e) => setIncludeContract(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="includeContract" className="text-sm font-medium text-[var(--text-secondary)]">
                Ajouter un contrat
              </label>
            </div>
            {includeContract && <ContractForm value={contract} onChange={setContract} teams={teams} />}
          </div>

          {/* Section 3: Accounts (optional) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[var(--text-secondary)]">Comptes LoL</h3>
              <button
                onClick={addAccount}
                className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)]"
              >
                + Ajouter un compte
              </button>
            </div>
            {accounts.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Aucun compte. Cliquez sur &quot;Ajouter un compte&quot; pour en ajouter.
              </p>
            ) : (
              <div className="space-y-3">
                {accounts.map((account, index) => (
                  <div key={index} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs text-[var(--text-muted)] mb-1">Game Name</label>
                      <input
                        value={account.gameName}
                        onChange={(e) => updateAccount(index, 'gameName', e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-xs text-[var(--text-muted)] mb-1">Tag</label>
                      <input
                        value={account.tagLine}
                        onChange={(e) => updateAccount(index, 'tagLine', e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-xs text-[var(--text-muted)] mb-1">Region</label>
                      <select
                        value={account.region}
                        onChange={(e) => updateAccount(index, 'region', e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent)]"
                      >
                        <option value="EUW">EUW</option>
                        <option value="EUNE">EUNE</option>
                        <option value="NA">NA</option>
                        <option value="KR">KR</option>
                      </select>
                    </div>
                    <button
                      onClick={() => removeAccount(index)}
                      className="pb-2 text-[var(--text-muted)] hover:text-[var(--negative)]"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-[var(--negative)]">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--border)] shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !pseudo.trim()}
            className="px-4 py-2 bg-[var(--accent)] text-black text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
          >
            {saving ? 'Creation...' : 'Creer le joueur'}
          </button>
        </div>
      </div>
    </div>
  )
}
